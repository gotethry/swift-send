import { useCallback, useDeferredValue, useState, useMemo, useEffect } from 'react';
import { ChevronDown, Search, Filter, Calendar, Banknote, TrendingUp, Clock, ArrowLeft, Download, FileText, FileSpreadsheet, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { exportToCSV, exportToPDF } from '@/lib/export';
import { TransactionItem } from '@/components/TransactionItem';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BottomNav } from '@/components/BottomNav';
import { useNavigate } from 'react-router-dom';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { getPurposeByCode, TRANSFER_PURPOSES } from '@/data/transferPurposes';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactions, searchTransactions } from '@/lib/activity';
import type { Transaction } from '@/types';

const PAGE_SIZE = 20;
const EMPTY_TRANSACTIONS: Transaction[] = [];

const History: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [purposeFilter, setPurposeFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm.trim());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const handleGoBack = useCallback(() => {
    navigate(-1); // Go back to previous page
  }, [navigate]);

  const statusParam =
    statusFilter === 'pending' || statusFilter === 'completed' || statusFilter === 'failed'
      ? statusFilter
      : undefined;

  const summaryQuery = useQuery({
    queryKey: ['activity', 'history-summary'],
    queryFn: () => fetchTransactions(100),
  });

  const transactionsQuery = useQuery({
    queryKey: ['activity', 'transactions-search', deferredSearchTerm, statusParam, visibleCount],
    queryFn: () =>
      searchTransactions({
        q: deferredSearchTerm || undefined,
        status: statusParam,
        limit: visibleCount,
        offset: 0,
      }),
  });

  const summaryTransactions = summaryQuery.data || EMPTY_TRANSACTIONS;
  const serverTransactions = transactionsQuery.data?.items || EMPTY_TRANSACTIONS;

  // Calculate summary statistics
  const summary = useMemo(() => {
    const sentTransactions = summaryTransactions.filter(t => t.type === 'send') || [];
    const totalSent = sentTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalFees = sentTransactions.reduce((sum, t) => sum + t.fee, 0);
    const pendingTransactions = summaryTransactions.filter(t => t.status === 'pending').length || 0;
    const thisMonth = summaryTransactions.filter(t => {
      const transactionDate = new Date(t.timestamp);
      const now = new Date();
      return transactionDate.getMonth() === now.getMonth() && 
             transactionDate.getFullYear() === now.getFullYear();
    }).length || 0;

    return { totalSent, totalFees, pendingTransactions, thisMonth };
  }, [summaryTransactions]);

  // Filter transactions based on search and filters
  const filteredTransactions = useMemo(() => {
    return serverTransactions.filter(transaction => {
      const matchesType = typeFilter === 'all' || transaction.type === typeFilter;
      const matchesPurpose = purposeFilter === 'all' || transaction.purposeCode === purposeFilter;
      
      return matchesType && matchesPurpose;
    });
  }, [serverTransactions, typeFilter, purposeFilter]);

  const monthlyTransferData = useMemo(() => {
    const monthlyMap = new Map<string, { month: string; sent: number; received: number }>();
    summaryTransactions.forEach((transaction) => {
      const date = new Date(transaction.timestamp);
      const month = date.toLocaleString('en-US', { month: 'short' });
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { month, sent: 0, received: 0 });
      }
      const monthData = monthlyMap.get(month);
      if (!monthData) return;
      if (transaction.type === 'send') monthData.sent += transaction.amount;
      if (transaction.type === 'receive') monthData.received += transaction.amount;
    });

    return Array.from(monthlyMap.values()).slice(-6);
  }, [summaryTransactions]);

  const categoryData = useMemo(() => {
    const categoryMap = new Map<string, number>();
    summaryTransactions
      .filter((transaction) => transaction.type === 'send')
      .forEach((transaction) => {
        const purpose = transaction.purposeCode ? getPurposeByCode(transaction.purposeCode) : null;
        const category = purpose?.label || (transaction.destinationCurrency ? `${transaction.destinationCurrency} transfer` : 'General transfers');
        categoryMap.set(category, (categoryMap.get(category) ?? 0) + transaction.amount);
      });

    return Array.from(categoryMap.entries()).map(([category, value]) => ({ category, value }));
  }, [summaryTransactions]);

  const handleTransactionClick = useCallback((transactionId: string) => {
    setExpandedTransactionId((currentId) => (currentId === transactionId ? null : transactionId));
  }, []);

  // Reset pagination whenever filters change so users always see fresh results from the top
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredSearchTerm, statusFilter, typeFilter, purposeFilter]);

  const totalMatchingTransactions = transactionsQuery.data?.total ?? filteredTransactions.length;
  const hasMore = visibleCount < totalMatchingTransactions;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
    setPurposeFilter('all');
  }, []);

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' }
  ];

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'send', label: 'Sent' },
    { value: 'receive', label: 'Received' }
  ];

  return (
    <div className="mx-auto w-full max-w-3xl bg-background min-h-screen px-3 sm:px-5 lg:px-6 pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border/50">
        <div className="py-6 pb-4">
          {/* Header with back button */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleGoBack}
                className="p-2 h-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" aria-hidden="true" />
              </Button>
              <h1 className="text-2xl font-bold text-foreground">Transaction History</h1>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportToCSV(filteredTransactions)} className="cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" aria-hidden="true" />
                  <span>Export as CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportToPDF(filteredTransactions)} className="cursor-pointer">
                  <FileText className="w-4 h-4 mr-2 text-red-500" aria-hidden="true" />
                  <span>Export as PDF</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Banknote className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Total Sent</span>
                </div>
                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">${summary.totalSent.toFixed(2)}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">Fees Paid</span>
                </div>
                <p className="text-lg font-bold text-green-900 dark:text-green-100">${summary.totalFees.toFixed(2)}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Pending</span>
                </div>
                <p className="text-lg font-bold text-orange-900 dark:text-orange-100">{summary.pendingTransactions}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-medium text-purple-700 dark:text-purple-300">This Month</span>
                </div>
                <p className="text-lg font-bold text-purple-900 dark:text-purple-100">{summary.thisMonth}</p>
              </CardContent>
            </Card>
          </div>

          {/* Analytics Charts */}
          <div className="grid gap-3 mb-4 lg:grid-cols-2">
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Monthly Transfers</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ChartContainer
                  className="h-56 w-full"
                  config={{
                    sent: { label: 'Sent', color: '#f97316' },
                    received: { label: 'Received', color: '#16a34a' },
                  }}
                >
                  <BarChart data={monthlyTransferData}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="sent" fill="var(--color-sent)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="received" fill="var(--color-received)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Spending by Category</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ChartContainer
                  className="h-56 w-full"
                  config={{
                    value: { label: 'Amount', color: '#6366f1' },
                  }}
                >
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, _name, item) => (
                            <div className="flex w-full items-center justify-between gap-2">
                              <span>{(item.payload as { category: string }).category}</span>
                              <span className="font-semibold">${Number(value).toFixed(2)}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Pie data={categoryData} dataKey="value" nameKey="category" outerRadius={80}>
                      {categoryData.map((entry, index) => (
                        <Cell key={`${entry.category}-${index}`} fill={['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'][index % 6]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search recipients, phone, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-card border-border/50"
              aria-label="Search transactions"
            />
          </div>

          {/* Filters */}
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                  {(statusFilter !== 'all' || typeFilter !== 'all' || purposeFilter !== 'all') && (
                    <Badge variant="secondary" className="text-xs">
                      {[statusFilter, typeFilter, purposeFilter].filter(f => f !== 'all').length}
                    </Badge>
                  )}
                </div>
                <ChevronDown className={cn('w-4 h-4 transition-transform', showFilters && 'rotate-180')} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 mt-3">
              <div className="flex gap-2 flex-wrap">
                {statusOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={statusFilter === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter(option.value)}
                    className="text-xs"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                {typeOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={typeFilter === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTypeFilter(option.value)}
                    className="text-xs"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  key="all-purposes"
                  variant={purposeFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPurposeFilter('all')}
                  className="text-xs"
                >
                  All Purposes
                </Button>
                {TRANSFER_PURPOSES.map((purpose) => (
                  <Button
                    key={purpose.code}
                    variant={purposeFilter === purpose.code ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPurposeFilter(purpose.code)}
                    className="text-xs"
                  >
                    <Tag className="w-3 h-3 mr-1" />
                    {purpose.label}
                  </Button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <div className="p-6 pt-2">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-12">
            {transactionsQuery.isLoading ? (
              <div className="space-y-3">
                <Search className="mx-auto h-8 w-8 animate-pulse text-muted-foreground" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-foreground">Searching transactions</h3>
              </div>
            ) : searchTerm || statusFilter !== 'all' || typeFilter !== 'all' || purposeFilter !== 'all' ? (
              <div className="space-y-3">
                <Search className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-foreground">No transactions found</h3>
                <p className="text-muted-foreground text-sm">
                  Try adjusting your search or filter criteria
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">No transactions yet</h3>
                <p className="text-muted-foreground text-sm">
                  Your transaction history will appear here once you send or receive money
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Results header */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {filteredTransactions.length} of {totalMatchingTransactions} transaction{totalMatchingTransactions !== 1 ? 's' : ''}
              </p>
              {(searchTerm || statusFilter !== 'all' || typeFilter !== 'all' || purposeFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-xs"
                >
                  Clear all
                </Button>
              )}
            </div>

            {transactionsQuery.data?.benchmark?.indexUsed && (
              <p className="text-xs text-muted-foreground">
                Indexed search scanned {transactionsQuery.data.benchmark.scanned} records in {transactionsQuery.data.benchmark.elapsedMs}ms.
              </p>
            )}

            {filteredTransactions.map((transaction, index) => (
              <div key={transaction.id} className="animate-slide-up" style={{ animationDelay: `${Math.min(index, 10) * 50}ms` }}>
                <TransactionItem
                  transaction={transaction}
                  showDetailedView={expandedTransactionId === transaction.id}
                  onClick={() => handleTransactionClick(transaction.id)}
                />
              </div>
            ))}

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" size="sm" onClick={loadMore}>
                  Load more ({totalMatchingTransactions - visibleCount} remaining)
                </Button>
              </div>
            )}

            {transactionsQuery.isError && (
              <p className="text-sm text-destructive">
                We couldn&apos;t search transactions right now.
              </p>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default History;

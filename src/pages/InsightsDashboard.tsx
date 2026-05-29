import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonInsightsGrid, SkeletonBarChart } from '@/components/SkeletonLoaders';
import { ComparativeInsights } from '@/components/ComparativeInsights';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { fetchSpendingInsights } from '@/lib/activity';
import { useNavigate } from 'react-router-dom';
import type { SpendingInsights } from '@/types/activity';
import { getPurposeByCode } from '@/data/transferPurposes';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  DollarSign,
  List,
  Tag,
  TrendingUp,
  XCircle,
  Users,
} from 'lucide-react';

const CATEGORY_COLORS = [
  'hsl(var(--primary))',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
];

export default function InsightsDashboard() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery<SpendingInsights>({
    queryKey: ['spending-insights'],
    queryFn: fetchSpendingInsights,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-6 pb-4 border-b border-border/40">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Financial Insights</h1>
          </div>
          <p className="text-sm text-muted-foreground">Your spending patterns and trends</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 pt-6 space-y-6">
        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-5 text-sm text-destructive">
            Could not load insights. Please try again later.
          </div>
        ) : (
          <>
            <SummaryCards summary={data?.summary} isLoading={isLoading} />
            <WeeklyTrendsChart data={data?.weeklyTransferData} isLoading={isLoading} />
            <HeatmapCard />
            <MonthlyTrendsChart data={data?.monthlyTransferData} isLoading={isLoading} />
            <ComparativeInsights data={data?.monthlyTransferData} isLoading={isLoading} />
            <RecipientTrendsList recipients={data?.recipientTrends} isLoading={isLoading} />
            <CategoryBreakdownChart data={data?.categoryData} isLoading={isLoading} />
            <PurposeBreakdownChart topExpenses={data?.topExpenses} />
            <TopExpensesList expenses={data?.topExpenses} isLoading={isLoading} />
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function WeeklyTrendsChart({
  data,
  isLoading,
}: {
  data?: SpendingInsights['weeklyTransferData'];
  isLoading: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="w-4 h-4 text-primary" />
          Weekly Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <SkeletonBarChart bars={6} />
        ) : !data || data.length === 0 ? (
          <EmptyState message="No weekly data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
              />
              <Bar dataKey="sent" name="Sent" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="successful" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function RecipientTrendsList({
  recipients,
  isLoading,
}: {
  recipients?: SpendingInsights['recipientTrends'];
  isLoading: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4 text-primary" />
          Recipient Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : !recipients || recipients.length === 0 ? (
          <EmptyState message="No recipient data yet." />
        ) : (
          <div className="space-y-2">
            {recipients.map((recipient) => (
              <div
                key={recipient.recipientName}
                className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {recipient.recipientName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recipient.count} transfer{recipient.count === 1 ? '' : 's'} • last sent{' '}
                      {recipient.lastTransferAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      ${recipient.amount.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Avg ${recipient.averageAmount.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCards({
  summary,
  isLoading,
}: {
  summary?: SpendingInsights['summary'];
  isLoading: boolean;
}) {
  const tiles = summary
    ? [
        {
          icon: DollarSign,
          label: 'Total Sent',
          value: `$${summary.totalSent.toFixed(2)}`,
          helper: `$${summary.totalFees.toFixed(2)} in fees`,
        },
        {
          icon: TrendingUp,
          label: 'This Month',
          value: `$${summary.thisMonthSent.toFixed(2)}`,
          helper: `${summary.thisMonthCount} transfer${summary.thisMonthCount === 1 ? '' : 's'}`,
        },
        {
          icon: CheckCircle2,
          label: 'Completed',
          value: String(summary.completedTransfers),
          helper: `avg $${summary.averageTransfer.toFixed(2)}`,
        },
        {
          icon: XCircle,
          label: 'Failed',
          value: String(summary.failedTransfers),
          helper: `${summary.flaggedTransfers} flagged`,
        },
      ]
    : [];

  if (isLoading) {
    return <SkeletonInsightsGrid cells={4} />;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map(({ icon: Icon, label, value, helper }) => (
        <Card key={label} className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-primary" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
            </div>
            <p className="text-xl font-semibold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{helper}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function HeatmapCard() {
  const navigate = useNavigate();
  return (
    <Card
      className="border-border/60 cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => navigate('/activity-heatmap')}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Activity Heatmap</p>
              <p className="text-sm text-muted-foreground">
                Visualize spending patterns by time and day
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0">
            View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyTrendsChart({
  data,
  isLoading,
}: {
  data?: SpendingInsights['monthlyTransferData'];
  isLoading: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="w-4 h-4 text-primary" />
          Monthly Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <SkeletonBarChart bars={6} />
        ) : !data || data.length === 0 ? (
          <EmptyState message="No monthly data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
              />
              <Bar dataKey="sent" name="Sent" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="successful" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryBreakdownChart({
  data,
  isLoading,
}: {
  data?: SpendingInsights['categoryData'];
  isLoading: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="w-4 h-4 text-primary" />
          Category Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : !data || data.length === 0 ? (
          <EmptyState message="No category data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ category, percent }) =>
                  `${category} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                  />
                ))}
              </Pie>
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                    {value}
                  </span>
                )}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
                formatter={(value: number, name) => [`$${value.toFixed(2)}`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function TopExpensesList({
  expenses,
  isLoading,
}: {
  expenses?: SpendingInsights['topExpenses'];
  isLoading: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="w-4 h-4 text-primary" />
          Top Expenses
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : !expenses || expenses.length === 0 ? (
          <EmptyState message="No expense data yet." />
        ) : (
          <ul className="space-y-2">
            {expenses.map((expense) => (
              <li
                key={expense.id}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {expense.recipientName}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      {expense.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(expense.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground ml-4">
                  ${expense.amount.toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PurposeBreakdownChart({
  topExpenses,
}: {
  topExpenses?: SpendingInsights['topExpenses'];
}) {
  const purposeData = useMemo(() => {
    if (!topExpenses || topExpenses.length === 0) return [];
    const map = new Map<string, number>();
    for (const expense of topExpenses) {
      const purpose = expense.category ? getPurposeByCode(expense.category) : null;
      const label = purpose?.label || expense.category || 'Other';
      map.set(label, (map.get(label) ?? 0) + expense.amount);
    }
    return Array.from(map.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [topExpenses]);

  if (purposeData.length === 0) return null;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <List className="w-4 h-4 text-primary" />
          Transfers by Purpose
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {purposeData.map((item) => {
            const total = purposeData.reduce((sum, d) => sum + d.value, 0);
            const percentage = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.category} className="flex items-center gap-3">
                <span className="text-sm text-foreground w-32 truncate">{item.category}</span>
                <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-20 text-right">
                  ${item.value.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground text-center">
      {message}
    </div>
  );
}

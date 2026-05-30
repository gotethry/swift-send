import { useCallback, useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight, Calendar } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface CashFlowSummary {
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  inflowCount: number;
  outflowCount: number;
  averageInflow: number;
  averageOutflow: number;
  projectedInflow: number;
  projectedOutflow: number;
}

interface MonthlyCashFlow {
  month: string;
  year: number;
  monthLabel: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  transactionCount: number;
}

interface CashFlowTrend {
  daily: Array<{
    date: string;
    inflow: number;
    outflow: number;
    netFlow: number;
    transactionCount: number;
  }>;
  weekly: Array<{
    weekStart: string;
    weekEnd: string;
    inflow: number;
    outflow: number;
    netFlow: number;
    transactionCount: number;
  }>;
  monthly: MonthlyCashFlow[];
}

interface TopRecipient {
  recipientId: string;
  recipientName: string;
  totalSent: number;
  transactionCount: number;
  averageAmount: number;
}

interface TopSource {
  source: string;
  totalReceived: number;
  transactionCount: number;
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

export default function CashFlowAnalytics() {
  const [summary, setSummary] = useState<CashFlowSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyCashFlow[]>([]);
  const [trend, setTrend] = useState<CashFlowTrend | null>(null);
  const [topRecipients, setTopRecipients] = useState<TopRecipient[]>([]);
  const [topSources, setTopSources] = useState<TopSource[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, monthlyRes, trendRes, recipientsRes, sourcesRes] = await Promise.all([
        apiFetch('/analytics/cash-flow/summary'),
        apiFetch('/analytics/cash-flow/monthly?months=6'),
        apiFetch('/analytics/cash-flow/trend?days=90'),
        apiFetch('/analytics/cash-flow/top-recipients?limit=5'),
        apiFetch('/analytics/cash-flow/top-sources?limit=5'),
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (monthlyRes.ok) setMonthly(await monthlyRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
      if (recipientsRes.ok) setTopRecipients(await recipientsRes.json());
      if (sourcesRes.ok) setTopSources(await sourcesRes.json());
    } catch (error) {
      console.error('Failed to load cash flow analytics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <DollarSign className="h-8 w-8" />
          Cash Flow Analytics
        </h1>
        <p className="text-muted-foreground mt-2">
          Incoming vs outgoing transfers, trends, and monthly summaries
        </p>
      </div>

      {loading && !summary ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-32" /></CardContent>
            </Card>
          ))}
        </div>
      ) : summary && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Total Inflow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{formatCurrency(summary.totalInflow)}</div>
                <p className="text-xs text-muted-foreground">{summary.inflowCount} transactions</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  Total Outflow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{formatCurrency(summary.totalOutflow)}</div>
                <p className="text-xs text-muted-foreground">{summary.outflowCount} transactions</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Net Flow</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${summary.netFlow >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(summary.netFlow)}
                </div>
                <p className="text-xs text-muted-foreground">Lifetime net</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Projected (90d)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500">{formatCurrency(summary.projectedInflow)}</div>
                <p className="text-xs text-muted-foreground">Inflow · {formatCurrency(summary.projectedOutflow)} outflow</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Monthly Cash Flow
                </CardTitle>
                <CardDescription>Incoming vs outgoing by month</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="monthLabel"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [formatCurrency(value)]}
                    />
                    <Legend />
                    <Bar dataKey="inflow" name="Inflow" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outflow" name="Outflow" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Net Flow Trend
                </CardTitle>
                <CardDescription>90-day net cash flow trend</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={trend?.daily?.slice(-30) || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [formatCurrency(value)]}
                    />
                    <Area
                      type="monotone"
                      dataKey="netFlow"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpRight className="h-5 w-5 text-green-500" />
                  Top Sources
                </CardTitle>
                <CardDescription>Largest funding sources by volume</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={topSources}
                      dataKey="totalReceived"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`}
                      labelLine={true}
                    >
                      {topSources.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [formatCurrency(value)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {topSources.map((source, index) => (
                    <div key={source.source} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-muted-foreground">{source.source}</span>
                      <span className="font-medium ml-auto">{formatCurrency(source.totalReceived)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownRight className="h-5 w-5 text-red-500" />
                  Top Recipients
                </CardTitle>
                <CardDescription>Largest recipients by volume</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topRecipients.map((recipient) => (
                    <div key={recipient.recipientId} className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">{recipient.recipientName}</p>
                        <p className="text-xs text-muted-foreground">
                          {recipient.transactionCount} transfers · avg {formatCurrency(recipient.averageAmount)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatCurrency(recipient.totalSent)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {monthly.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Monthly Summaries
                </CardTitle>
                <CardDescription>Detailed monthly breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {monthly.map((m) => (
                    <div key={m.monthLabel} className="flex items-center justify-between p-4 rounded-xl border border-border/60">
                      <div>
                        <p className="font-semibold">{m.monthLabel}</p>
                        <p className="text-xs text-muted-foreground">{m.transactionCount} transactions</p>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-green-500 font-medium">+{formatCurrency(m.inflow)}</p>
                          <p className="text-xs text-muted-foreground">Inflow</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-red-500 font-medium">-{formatCurrency(m.outflow)}</p>
                          <p className="text-xs text-muted-foreground">Outflow</p>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <p className={`text-sm font-bold ${m.netFlow >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {m.netFlow >= 0 ? '+' : ''}{formatCurrency(m.netFlow)}
                          </p>
                          <p className="text-xs text-muted-foreground">Net</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

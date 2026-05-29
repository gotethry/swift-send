import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Gauge, ShieldAlert, Clock3, Route, Users } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ApiUsageResponse {
  requestTracking: {
    totalRequests: number;
    averagePerMinute: number;
    currentThroughput: number;
    recentSamples: Array<{
      timestamp: string;
      count: number;
      periodSeconds: number;
    }>;
  };
  latency: {
    current: number;
    average: number;
    p95: number;
    p99: number;
    samples: Array<{
      timestamp: string;
      route: string;
      latencyMs: number;
      statusCode: number;
    }>;
  };
  rateLimits: {
    login: RateLimitSnapshot;
    verify: RateLimitSnapshot;
    resend: RateLimitSnapshot;
    recovery: RateLimitSnapshot;
  };
  routeStats: Array<{
    route: string;
    count: number;
    averageLatencyMs: number;
    errorCount: number;
  }>;
}

interface RateLimitSnapshot {
  totalKeys: number;
  lockedKeys: number;
  totalAttempts: number;
  maxAttempts: number;
  windowMs: number;
  lockoutDurationMs: number;
}

export default function AdminApiUsage() {
  const [usage, setUsage] = useState<ApiUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/admin/api-usage');
      if (response.ok) {
        setUsage(await response.json());
      }
    } catch (error) {
      console.error('Failed to load API usage:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsage();
    const interval = setInterval(fetchUsage, 15_000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8" />
            API Rate Usage
          </h1>
          <p className="text-muted-foreground mt-2">
            Request tracking, usage charts, and rate-limit visibility
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {loading ? 'Refreshing…' : 'Auto-refreshing'}
        </Badge>
      </div>

      {usage ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Requests"
              value={usage.requestTracking.totalRequests.toLocaleString()}
              helper={`${usage.requestTracking.averagePerMinute}/min average`}
              icon={Route}
            />
            <MetricCard
              title="Current Throughput"
              value={`${usage.requestTracking.currentThroughput}/min`}
              helper="Most recent bucket"
              icon={Gauge}
            />
            <MetricCard
              title="Average Latency"
              value={`${usage.latency.average}ms`}
              helper={`P95 ${usage.latency.p95}ms · P99 ${usage.latency.p99}ms`}
              icon={Clock3}
            />
            <MetricCard
              title="Locked Sessions"
              value={`${usage.rateLimits.login.lockedKeys + usage.rateLimits.verify.lockedKeys + usage.rateLimits.resend.lockedKeys + usage.rateLimits.recovery.lockedKeys}`}
              helper="Across auth rate limiters"
              icon={ShieldAlert}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Request Volume
                </CardTitle>
                <CardDescription>Per-minute request tracking over the last few buckets</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={usage.requestTracking.recentSamples}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                      formatter={(value: number) => [value, 'Requests']}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" />
                  Rate Limits
                </CardTitle>
                <CardDescription>Visibility into lockouts and limiter thresholds</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[240px] pr-3">
                  <div className="space-y-3">
                    {Object.entries(usage.rateLimits).map(([name, limiter]) => (
                      <div key={name} className="rounded-xl border border-border/60 bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-sm font-medium capitalize">{name} limiter</p>
                          <Badge variant={limiter.lockedKeys > 0 ? 'destructive' : 'secondary'}>
                            {limiter.lockedKeys > 0 ? 'Locked' : 'Healthy'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <span>Keys: {limiter.totalKeys}</span>
                          <span>Attempts: {limiter.totalAttempts}</span>
                          <span>Max attempts: {limiter.maxAttempts}</span>
                          <span>Window: {Math.round(limiter.windowMs / 60000)} min</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Lockout duration: {Math.round(limiter.lockoutDurationMs / 60000)} min
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Route Usage
              </CardTitle>
              <CardDescription>Top endpoints by request volume and average latency</CardDescription>
            </CardHeader>
            <CardContent>
              {usage.routeStats.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No route data yet.</p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={usage.routeStats.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="route"
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
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <ScrollArea className="h-[260px] pr-3">
                    <div className="space-y-2">
                      {usage.routeStats.slice(0, 8).map((route) => (
                        <div key={route.route} className="rounded-xl border border-border/60 bg-muted/30 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{route.route}</p>
                              <p className="text-xs text-muted-foreground">
                                {route.count} requests · {route.errorCount} errors
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-foreground">{route.averageLatencyMs}ms</p>
                              <p className="text-xs text-muted-foreground">avg latency</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading API usage…
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

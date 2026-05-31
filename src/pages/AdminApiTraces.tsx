import { useCallback, useEffect, useState } from 'react';
import { Activity, Search, Filter, ChevronDown, ChevronRight, Clock, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface RequestTrace {
  id: string;
  correlationId: string;
  method: string;
  path: string;
  statusCode: number;
  status: string;
  durationMs: number;
  userId?: string;
  errorMessage?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}

interface TraceStats {
  total: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
  averageDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  errorRate: number;
  lastMinuteCount: number;
}

export default function AdminApiTraces() {
  const [traces, setTraces] = useState<RequestTrace[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<TraceStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchCorrelationId, setSearchCorrelationId] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<string>('');

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchCorrelationId) params.set('correlationId', searchCorrelationId);
      if (filterStatus) params.set('status', filterStatus);
      if (filterMethod) params.set('method', filterMethod);
      params.set('limit', '100');

      const response = await apiFetch(`/admin/traces?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setTraces(data.traces);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to load traces:', error);
    } finally {
      setLoading(false);
    }
  }, [searchCorrelationId, filterStatus, filterMethod]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await apiFetch('/admin/traces/stats');
      if (response.ok) {
        setStats(await response.json());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchTraces();
    void fetchStats();
    const interval = setInterval(fetchTraces, 10_000);
    return () => clearInterval(interval);
  }, [fetchTraces, fetchStats]);

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case 'success': return 'default';
      case 'redirect': return 'secondary';
      case 'client_error': return 'warning';
      case 'server_error': return 'destructive';
      default: return 'outline';
    }
  };

  const methodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'text-green-500';
      case 'POST': return 'text-blue-500';
      case 'PUT': return 'text-orange-500';
      case 'PATCH': return 'text-purple-500';
      case 'DELETE': return 'text-red-500';
      default: return '';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="h-8 w-8" />
          API Request Trace Viewer
        </h1>
        <p className="text-muted-foreground mt-2">
          Inspect API requests with correlation IDs, timing, and error tracking
        </p>
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Traces</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">{stats.lastMinuteCount} in last minute</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.averageDurationMs}ms</div>
              <p className="text-xs text-muted-foreground">P95 {stats.p95DurationMs}ms</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{stats.errorRate}%</div>
              <p className="text-xs text-muted-foreground">
                {stats.byStatus.client_error + stats.byStatus.server_error} errors
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">GET</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byMethod.GET}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">POST</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byMethod.POST}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Trace Explorer
          </CardTitle>
          <CardDescription>
            Showing {traces.length} of {total} traces
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search correlation ID..."
                value={searchCorrelationId}
                onChange={(e) => setSearchCorrelationId(e.target.value)}
                className="w-64"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="redirect">Redirect</SelectItem>
                <SelectItem value="client_error">Client Error</SelectItem>
                <SelectItem value="server_error">Server Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="All methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All methods</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchTraces}>
              <Filter className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Correlation ID</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && traces.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading traces...
                    </TableCell>
                  </TableRow>
                ) : traces.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No traces found
                    </TableCell>
                  </TableRow>
                ) : (
                  traces.map((trace) => (
                    <>
                      <TableRow
                        key={trace.id}
                        className="cursor-pointer"
                        onClick={() => setExpandedId(expandedId === trace.id ? null : trace.id)}
                      >
                        <TableCell>
                          {expandedId === trace.id
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {trace.correlationId}
                          </code>
                        </TableCell>
                        <TableCell>
                          <span className={`font-mono text-sm font-semibold ${methodColor(trace.method)}`}>
                            {trace.method}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate font-mono text-xs">
                          {trace.path}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(trace.status)}>
                            {trace.statusCode}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{trace.durationMs}ms</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(trace.timestamp).toLocaleTimeString()}
                        </TableCell>
                      </TableRow>
                      {expandedId === trace.id && (
                        <TableRow key={`${trace.id}-detail`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                                  <Activity className="h-4 w-4" />
                                  Request Details
                                </h4>
                                <div className="space-y-1 text-xs">
                                  <p><span className="text-muted-foreground">URL:</span> {trace.path}</p>
                                  <p><span className="text-muted-foreground">Method:</span> {trace.method}</p>
                                  {trace.userId && (
                                    <p><span className="text-muted-foreground">User ID:</span> {trace.userId}</p>
                                  )}
                                  {trace.ip && (
                                    <p><span className="text-muted-foreground">IP:</span> {trace.ip}</p>
                                  )}
                                  {trace.userAgent && (
                                    <p><span className="text-muted-foreground">User Agent:</span> {trace.userAgent}</p>
                                  )}
                                </div>
                                {trace.errorMessage && (
                                  <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
                                    <div className="flex items-center gap-1 mb-1">
                                      <AlertCircle className="h-3 w-3" />
                                      <span className="font-semibold">Error</span>
                                    </div>
                                    {trace.errorMessage}
                                  </div>
                                )}
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                                  <Clock className="h-4 w-4" />
                                  Timing & Status
                                </h4>
                                <div className="space-y-1 text-xs">
                                  <p><span className="text-muted-foreground">Duration:</span> {trace.durationMs}ms</p>
                                  <p><span className="text-muted-foreground">Status:</span> {trace.statusCode} ({trace.status})</p>
                                  <p><span className="text-muted-foreground">Timestamp:</span> {new Date(trace.timestamp).toLocaleString()}</p>
                                  <p><span className="text-muted-foreground">Correlation ID:</span> {trace.correlationId}</p>
                                </div>
                                <div className="mt-3 flex gap-2">
                                  <Badge variant={trace.statusCode < 400 ? 'default' : 'destructive'} className="text-xs">
                                    {trace.statusCode < 300 ? (
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                    ) : (
                                      <XCircle className="h-3 w-3 mr-1" />
                                    )}
                                    {trace.durationMs < 1000 ? 'Fast' : 'Slow'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

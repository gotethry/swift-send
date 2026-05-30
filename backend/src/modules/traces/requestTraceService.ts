import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';

export type TraceMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type TraceStatus = 'success' | 'redirect' | 'client_error' | 'server_error';

export interface RequestTrace {
  id: string;
  correlationId: string;
  method: TraceMethod;
  path: string;
  statusCode: number;
  status: TraceStatus;
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

export interface TraceFilter {
  correlationId?: string;
  method?: TraceMethod;
  status?: TraceStatus;
  statusCode?: number;
  userId?: string;
  path?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface TraceStats {
  total: number;
  byMethod: Record<TraceMethod, number>;
  byStatus: Record<TraceStatus, number>;
  byPath: Record<string, number>;
  averageDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  errorRate: number;
  lastMinuteCount: number;
}

export class RequestTraceService {
  private traces: RequestTrace[] = [];
  private maxTraces = 10000;

  recordTrace(input: {
    correlationId: string;
    method: TraceMethod;
    path: string;
    statusCode: number;
    durationMs: number;
    userId?: string;
    errorMessage?: string;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: string;
    responseBody?: string;
    ip?: string;
    userAgent?: string;
  }): RequestTrace {
    const trace: RequestTrace = {
      id: `trace_${uuidv4().slice(0, 8)}`,
      correlationId: input.correlationId,
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      status: this.categorizeStatus(input.statusCode),
      durationMs: input.durationMs,
      userId: input.userId,
      errorMessage: input.errorMessage,
      requestHeaders: input.requestHeaders,
      responseHeaders: input.responseHeaders,
      requestBody: input.requestBody,
      responseBody: input.responseBody,
      ip: input.ip,
      userAgent: input.userAgent,
      timestamp: new Date().toISOString(),
    };

    this.traces.push(trace);
    if (this.traces.length > this.maxTraces) {
      this.traces = this.traces.slice(-this.maxTraces);
    }

    logger.debug({ traceId: trace.id, correlationId: trace.correlationId, path: trace.path, durationMs: trace.durationMs }, 'Request trace recorded');

    return trace;
  }

  getTraces(filters?: TraceFilter): { traces: RequestTrace[]; total: number } {
    let filtered = [...this.traces];

    if (filters?.correlationId) {
      filtered = filtered.filter((t) =>
        t.correlationId.toLowerCase().includes(filters.correlationId!.toLowerCase()),
      );
    }
    if (filters?.method) {
      filtered = filtered.filter((t) => t.method === filters.method);
    }
    if (filters?.status) {
      filtered = filtered.filter((t) => t.status === filters.status);
    }
    if (filters?.statusCode) {
      filtered = filtered.filter((t) => t.statusCode === filters.statusCode);
    }
    if (filters?.userId) {
      filtered = filtered.filter((t) => t.userId === filters.userId);
    }
    if (filters?.path) {
      filtered = filtered.filter((t) =>
        t.path.toLowerCase().includes(filters.path!.toLowerCase()),
      );
    }
    if (filters?.startDate) {
      const start = new Date(filters.startDate).getTime();
      filtered = filtered.filter((t) => new Date(t.timestamp).getTime() >= start);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate).getTime();
      filtered = filtered.filter((t) => new Date(t.timestamp).getTime() <= end);
    }

    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = filtered.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    const traces = filtered.slice(offset, offset + limit);

    return { traces, total };
  }

  getTraceById(traceId: string): RequestTrace | undefined {
    return this.traces.find((t) => t.id === traceId);
  }

  getStats(): TraceStats {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;

    const byMethod: Record<TraceMethod, number> = {
      GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0,
    };
    const byStatus: Record<TraceStatus, number> = {
      success: 0, redirect: 0, client_error: 0, server_error: 0,
    };
    const byPath: Record<string, number> = {};
    let totalDuration = 0;
    let lastMinuteCount = 0;
    const durations: number[] = [];

    for (const trace of this.traces) {
      byMethod[trace.method]++;
      byStatus[trace.status]++;
      byPath[trace.path] = (byPath[trace.path] || 0) + 1;
      totalDuration += trace.durationMs;
      durations.push(trace.durationMs);

      if (new Date(trace.timestamp).getTime() > oneMinuteAgo) {
        lastMinuteCount++;
      }
    }

    durations.sort((a, b) => a - b);

    const averageDurationMs = this.traces.length > 0
      ? Math.round(totalDuration / this.traces.length)
      : 0;
    const p95DurationMs = durations.length > 0
      ? durations[Math.ceil(durations.length * 0.95) - 1] || 0
      : 0;
    const p99DurationMs = durations.length > 0
      ? durations[Math.ceil(durations.length * 0.99) - 1] || 0
      : 0;
    const errorCount = byStatus.client_error + byStatus.server_error;
    const errorRate = this.traces.length > 0
      ? Math.round((errorCount / this.traces.length) * 10000) / 100
      : 0;

    return {
      total: this.traces.length,
      byMethod,
      byStatus,
      byPath,
      averageDurationMs,
      p95DurationMs,
      p99DurationMs,
      errorRate,
      lastMinuteCount,
    };
  }

  private categorizeStatus(statusCode: number): TraceStatus {
    if (statusCode < 300) return 'success';
    if (statusCode < 400) return 'redirect';
    if (statusCode < 500) return 'client_error';
    return 'server_error';
  }
}

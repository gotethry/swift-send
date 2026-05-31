import { setTimeout as delay } from 'timers/promises';
import { createLogger } from '../logger';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs?: number; // per-attempt timeout
  jitterFactor?: number; // 0..1
  metricName?: string;
}

const logger = createLogger({ component: 'retry' });

function randomJitter(base: number, jitterFactor = 0.5) {
  const jitter = Math.random() * base * jitterFactor;
  return Math.floor(jitter - base * jitterFactor / 2);
}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return fn();
  return await Promise.race([
    fn(),
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('operation timeout')), timeoutMs)),
  ]);
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  publishEvent?: (evt: { type: string; payload?: Record<string, unknown> }) => void,
): Promise<T> {
  const maxRetries = Math.max(0, options.maxRetries);
  const base = Math.max(10, options.baseDelayMs);
  const maxDelay = Math.max(base, options.maxDelayMs);
  const jitterFactor = options.jitterFactor ?? 0.5;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= maxRetries) {
    try {
      if (publishEvent) publishEvent({ type: 'retry.attempt', payload: { attempt, metricName: options.metricName } });
      const result = await withTimeout(operation, options.timeoutMs);
      if (publishEvent) publishEvent({ type: 'retry.succeeded', payload: { attempt, metricName: options.metricName } });
      return result;
    } catch (err: unknown) {
      lastError = err;
      const isLast = attempt === maxRetries;
      if (publishEvent) {
        publishEvent({ type: isLast ? 'retry.exhausted' : 'retry.failed', payload: { attempt, error: String(err), metricName: options.metricName } });
      }

      if (isLast) break;

      const expBackoff = Math.min(base * Math.pow(2, attempt), maxDelay);
      const jitter = randomJitter(expBackoff, jitterFactor);
      const waitMs = Math.max(0, Math.min(maxDelay, Math.floor(expBackoff + jitter)));
      logger.debug({ attempt, waitMs, expBackoff }, 'retry backing off');
      // backoff sleep
      await delay(waitMs);
      attempt += 1;
      continue;
    }
  }

  logger.error({ attempts: attempt, error: lastError }, 'operation failed after retries');
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

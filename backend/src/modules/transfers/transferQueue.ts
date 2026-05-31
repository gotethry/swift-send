import { createLogger } from '../../logger';
import { EventBus } from '../../core/eventBus';
import { TransferLifecycle } from './transferLifecycle';
import { CreateTransferCommand } from './domain';
import { TransferEventType } from './events';
import { DeadLetterQueue } from './deadLetterQueue';

export interface QueuedTransferJob {
  id: string;
  command: CreateTransferCommand;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  retries: number;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  queueLength: number;
  totalTracked: number;
}

export class TransferQueue {
  private static readonly MAX_STORED_RESULTS = 200;
  private static readonly FINISHED_JOB_TTL_MS = 15 * 60 * 1000;
  private static readonly MAX_JOB_RETRIES = 2;
  private static readonly RETRY_DELAY_MS = 1000;
  private queue: QueuedTransferJob[] = [];
  private processing = false;
  private results = new Map<string, QueuedTransferJob>();

  constructor(
    private readonly transfers: TransferLifecycle,
    private readonly eventBus: EventBus,
    private readonly deadLetterQueue?: DeadLetterQueue,
  ) {}

  /**
   * Enqueue a transfer for serial processing.
   * Returns the queued job ID that can be polled for status.
   */
  enqueue(command: CreateTransferCommand): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const logger = this.getLogger({ jobId, transferId: command.idempotencyKey, userId: command.userId });
    const job: QueuedTransferJob = {
      id: jobId,
      command,
      createdAt: new Date().toISOString(),
      status: 'pending',
      retries: 0,
    };

    this.queue.push(job);
    logger.debug({ queueLength: this.queue.length }, 'transfer queued');

    this.results.set(jobId, job);
    this.cleanupResults();

    void this.processQueue();
    return jobId;
  }

  /**
   * Poll the status of a queued job.
   */
  getJobStatus(jobId: string): QueuedTransferJob | null {
    return this.results.get(jobId) || null;
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue[0];
        job.startedAt = new Date().toISOString();
        job.status = 'processing';
        const logger = this.getLogger({
          jobId: job.id,
          transferId: job.command.idempotencyKey,
          userId: job.command.userId,
        });

        logger.debug('processing transfer from queue');

        try {
          await this.transfers.createTransfer(job.command);

          job.status = 'completed';
          job.completedAt = new Date().toISOString();

          logger.info('transfer processed successfully');

          await this.eventBus.publish({
            type: TransferEventType.QueueCompleted,
            timestamp: new Date().toISOString(),
            payload: {
              jobId: job.id,
              transferId: job.command.idempotencyKey,
            },
          });
        } catch (error: unknown) {
          job.error = error instanceof Error ? error.message : 'Unknown error';

          if (job.retries < TransferQueue.MAX_JOB_RETRIES) {
            // Use exponential backoff + jitter retry wrapper to attempt recovery without immediate re-enqueue
            job.retries += 1;
            logger.warn({ retries: job.retries, error: job.error }, 'transfer job will be retried with backoff');

            try {
              const { retryWithBackoff } = await import('../../utils/retry');
              await retryWithBackoff(
                () => this.transfers.createTransfer(job.command),
                {
                  maxRetries: TransferQueue.MAX_JOB_RETRIES - job.retries,
                  baseDelayMs: TransferQueue.RETRY_DELAY_MS,
                  maxDelayMs: TransferQueue.RETRY_DELAY_MS * 16,
                  timeoutMs: 20_000,
                },
                (evt) => {
                  // publish metrics/events
                  void this.eventBus.publish({ type: 'transfer.retry_event', timestamp: new Date().toISOString(), payload: { jobId: job.id, event: evt.type, data: evt.payload } });
                },
              );

              job.status = 'completed';
              job.completedAt = new Date().toISOString();
              logger.info({ jobId: job.id }, 'transfer job succeeded during backoff retry');
            } catch (retryErr) {
              job.status = 'failed';
              job.completedAt = new Date().toISOString();
              job.error = retryErr instanceof Error ? retryErr.message : String(retryErr);
              logger.error({ jobId: job.id, retries: job.retries, error: job.error }, 'transfer job failed after backoff');

              if (this.deadLetterQueue) {
                this.deadLetterQueue.addEntry(
                  { ...job },
                  job.error || 'Unknown error',
                  job.retries,
                );
              }

              await this.eventBus.publish({
                type: TransferEventType.QueueFailed,
                timestamp: new Date().toISOString(),
                payload: {
                  jobId: job.id,
                  transferId: job.command.idempotencyKey,
                  error: job.error,
                },
              });
            }
          } else {
            job.status = 'failed';
            job.completedAt = new Date().toISOString();

            logger.error({ retries: job.retries, error: job.error }, 'transfer processing failed after retries');

            if (this.deadLetterQueue) {
              this.deadLetterQueue.addEntry(
                { ...job },
                job.error || 'Unknown error',
                job.retries,
              );
            }

            await this.eventBus.publish({
              type: TransferEventType.QueueFailed,
              timestamp: new Date().toISOString(),
              payload: {
                jobId: job.id,
                transferId: job.command.idempotencyKey,
                error: job.error,
              },
            });
          }
        }

        this.queue.shift();
        this.cleanupResults();
      }
    } finally {
      this.processing = false;
    }
  }

  getQueueStats(): QueueStats {
    const jobs = Array.from(this.results.values());
    return {
      pending: jobs.filter((j) => j.status === 'pending').length,
      processing: jobs.filter((j) => j.status === 'processing').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      queueLength: this.queue.length,
      totalTracked: jobs.length,
    };
  }

  private cleanupResults() {
    const now = Date.now();

    for (const [jobId, job] of this.results.entries()) {
      const finishedAt = job.completedAt ? new Date(job.completedAt).getTime() : 0;
      if (
        job.status !== 'pending' &&
        job.status !== 'processing' &&
        finishedAt > 0 &&
        now - finishedAt > TransferQueue.FINISHED_JOB_TTL_MS
      ) {
        this.results.delete(jobId);
      }
    }

    while (this.results.size > TransferQueue.MAX_STORED_RESULTS) {
      const oldestKey = this.results.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.results.delete(oldestKey);
    }
  }

  private getLogger(context: Record<string, unknown>) {
    return createLogger({ component: 'transferQueue', ...context });
  }
}

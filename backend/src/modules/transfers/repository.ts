import { TransferRecord } from './domain';
import type { TransferState } from './domain';

export interface TransferSearchParams {
  q?: string;
  status?: 'pending' | 'completed' | 'failed';
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  limit?: number;
  offset?: number;
}

export interface TransferSearchResult {
  records: TransferRecord[];
  total: number;
  benchmark: {
    scanned: number;
    matched: number;
    elapsedMs: number;
    indexUsed: boolean;
  };
}

export interface TransferRepository {
  findById(id: string): Promise<TransferRecord | null>;
  findByClientReference(reference: string): Promise<TransferRecord | null>;
  save(record: TransferRecord): Promise<TransferRecord>;
  update(record: TransferRecord): Promise<TransferRecord>;
  listPending(): Promise<TransferRecord[]>;
  listAll(): Promise<TransferRecord[]>;
  listByUserId(userId: string): Promise<TransferRecord[]>;
  listRecentByUserId(userId: string, limit?: number): Promise<TransferRecord[]>;
  searchByUserId(userId: string, params: TransferSearchParams): Promise<TransferSearchResult>;
}

export function statusToTransferStates(status: TransferSearchParams['status']): TransferState[] | undefined {
  if (status === 'completed') return ['settled'];
  if (status === 'failed') return ['failed'];
  if (status === 'pending') return ['created', 'awaiting_multisig', 'validated', 'review_pending', 'held', 'submitted'];
  return undefined;
}

import { TransferRecord } from './domain';
import {
  statusToTransferStates,
  TransferRepository,
  type TransferSearchParams,
} from './repository';

interface SearchIndexEntry {
  id: string;
  userId: string;
  searchText: string;
  createdAtMs: number;
  amount: number;
  state: TransferRecord['state'];
}

export class InMemoryTransferRepository implements TransferRepository {
  private readonly store = new Map<string, TransferRecord>();
  private readonly userIndex = new Map<string, Set<string>>();
  private readonly searchIndex = new Map<string, SearchIndexEntry>();

  constructor(initialRecords: TransferRecord[] = []) {
    initialRecords.forEach((record) => {
      const cloned = this.clone(record)!;
      this.store.set(cloned.id, cloned);
      this.indexRecord(cloned);
    });
  }

  async findById(id: string) {
    return this.clone(this.store.get(id));
  }

  async findByClientReference(reference: string) {
    return this.clone(this.store.get(reference));
  }

  async save(record: TransferRecord) {
    this.store.set(record.id, this.clone(record));
    this.indexRecord(record);
    return record;
  }

  async update(record: TransferRecord) {
    if (!this.store.has(record.id)) {
      throw new Error('transfer not found');
    }
    this.store.set(record.id, this.clone(record));
    this.indexRecord(record);
    return record;
  }

  async listPending() {
    return Array.from(this.store.values())
      .filter((record) => ['held', 'submitted'].includes(record.state))
      .map((record) => this.clone(record));
  }

  async listAll() {
    return Array.from(this.store.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((record) => this.clone(record));
  }

  async listByUserId(userId: string) {
    return this.getIndexedRecords(userId);
  }

  async listRecentByUserId(userId: string, limit = 10) {
    return this.getIndexedRecords(userId).slice(0, Math.max(0, limit));
  }

  async searchByUserId(userId: string, params: TransferSearchParams) {
    const startedAt = Date.now();
    const ids = Array.from(this.userIndex.get(userId) || []);
    const queryTokens = normalizeSearch(params.q)
      .split(' ')
      .filter(Boolean);
    const states = statusToTransferStates(params.status);
    const fromMs = params.dateFrom ? new Date(params.dateFrom).getTime() : undefined;
    const toMs = params.dateTo ? new Date(params.dateTo).getTime() : undefined;
    const min = Number.isFinite(params.amountMin) ? params.amountMin : undefined;
    const max = Number.isFinite(params.amountMax) ? params.amountMax : undefined;

    const matchedIds: string[] = [];
    for (const id of ids) {
      const entry = this.searchIndex.get(id);
      if (!entry) continue;
      if (states && !states.includes(entry.state)) continue;
      if (fromMs !== undefined && Number.isFinite(fromMs) && entry.createdAtMs < fromMs) continue;
      if (toMs !== undefined && Number.isFinite(toMs) && entry.createdAtMs > toMs) continue;
      if (min !== undefined && entry.amount < min) continue;
      if (max !== undefined && entry.amount > max) continue;
      if (queryTokens.length > 0 && !queryTokens.every((token) => entry.searchText.includes(token))) continue;
      matchedIds.push(id);
    }

    const total = matchedIds.length;
    const offset = Math.max(0, params.offset ?? 0);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const records = matchedIds
      .map((id) => this.store.get(id))
      .filter((record): record is TransferRecord => Boolean(record))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit)
      .map((record) => this.clone(record)!);

    return {
      records,
      total,
      benchmark: {
        scanned: ids.length,
        matched: total,
        elapsedMs: Date.now() - startedAt,
        indexUsed: true,
      },
    };
  }

  private getIndexedRecords(userId: string) {
    const ids = Array.from(this.userIndex.get(userId) || []);
    return ids
      .map((id) => this.store.get(id))
      .filter((record): record is TransferRecord => Boolean(record))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((record) => this.clone(record));
  }

  private indexRecord(record: TransferRecord) {
    const ids = this.userIndex.get(record.userId) || new Set<string>();
    ids.add(record.id);
    this.userIndex.set(record.userId, ids);
    this.searchIndex.set(record.id, buildSearchIndexEntry(record));
  }

  private clone(record?: TransferRecord | null) {
    return record ? JSON.parse(JSON.stringify(record)) : null;
  }
}

function buildSearchIndexEntry(record: TransferRecord): SearchIndexEntry {
  const recipientMetadata = record.recipient.metadata || {};
  const searchText = normalizeSearch([
    record.id,
    record.clientReference,
    record.currency,
    record.recipient.country,
    record.recipient.type,
    record.recipient.walletPublicKey,
    record.recipient.partnerCode,
    recipientMetadata.identifier,
    recipientMetadata.name,
    recipientMetadata.destination_currency,
    record.transactionHash,
    record.lastError,
  ].filter(Boolean).join(' '));

  return {
    id: record.id,
    userId: record.userId,
    searchText,
    createdAtMs: new Date(record.createdAt).getTime(),
    amount: record.amount,
    state: record.state,
  };
}

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+@.]+/g, ' ')
    .trim();
}

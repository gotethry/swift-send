import { createHash, randomBytes } from 'crypto';
import { createLogger } from '../../logger';
import type { EventBus } from '../../core/eventBus';
import type { ComplianceLog } from './complianceLogService';

export interface AuditRecord {
  id: string;
  logId: string;
  userId: string;
  transferId?: string;
  checkType: string;
  status: string;
  riskScore: number;
  flags: string[];
  metadata: Record<string, unknown>;
  checkedAt: string;
  checkedBy: string;
  previousHash: string;
  hash: string;
  nonce: string;
  storedAt: string;
}

export interface IntegrityVerificationResult {
  recordId: string;
  hashValid: boolean;
  chainValid: boolean;
  tampered: boolean;
  details: string[];
}

export class AuditStorageService {
  private readonly store = new Map<string, AuditRecord>();
  private readonly logger;
  private genesisHash: string;

  constructor(private readonly eventBus: EventBus) {
    this.logger = createLogger({ component: 'auditStorageService' });
    this.genesisHash = this.computeHash('genesis', '', randomBytes(16).toString('hex'));
  }

  async storeAuditRecord(log: ComplianceLog): Promise<AuditRecord> {
    const previousRecord = this.getLatestRecord();

    const previousHash = previousRecord ? previousRecord.hash : this.genesisHash;
    const nonce = randomBytes(8).toString('hex');
    const hashInput = this.buildHashInput({
      logId: log.id,
      userId: log.userId,
      transferId: log.transferId,
      checkType: log.checkType,
      status: log.status,
      riskScore: log.riskScore,
      flags: log.flags,
      metadata: log.metadata,
      checkedAt: log.checkedAt,
      checkedBy: log.checkedBy,
      previousHash,
      nonce,
    });

    const hash = this.computeHash(hashInput, previousHash, nonce);

    const record: AuditRecord = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      logId: log.id,
      userId: log.userId,
      transferId: log.transferId,
      checkType: log.checkType,
      status: log.status,
      riskScore: log.riskScore,
      flags: log.flags,
      metadata: log.metadata,
      checkedAt: log.checkedAt,
      checkedBy: log.checkedBy,
      previousHash,
      hash,
      nonce,
      storedAt: new Date().toISOString(),
    };

    this.store.set(record.id, record);

    this.eventBus.publish({
      type: 'compliance.audit_stored',
      timestamp: record.storedAt,
      payload: {
        auditId: record.id,
        logId: record.logId,
        hash: record.hash,
      },
    });

    this.logger.info({ auditId: record.id, logId: record.logId }, 'audit record stored');
    return record;
  }

  async getAuditRecord(id: string): Promise<AuditRecord | null> {
    return this.store.get(id) ?? null;
  }

  async getAllAuditRecords(limit = 100): Promise<AuditRecord[]> {
    return Array.from(this.store.values())
      .sort((a, b) => new Date(b.storedAt).getTime() - new Date(a.storedAt).getTime())
      .slice(0, limit);
  }

  async getAuditRecordsByLogId(logId: string): Promise<AuditRecord[]> {
    return Array.from(this.store.values())
      .filter((r) => r.logId === logId)
      .sort((a, b) => new Date(b.storedAt).getTime() - new Date(a.storedAt).getTime());
  }

  async getAuditRecordsByUserId(userId: string, limit = 50): Promise<AuditRecord[]> {
    return Array.from(this.store.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => new Date(b.storedAt).getTime() - new Date(a.storedAt).getTime())
      .slice(0, limit);
  }

  async verifyIntegrity(): Promise<IntegrityVerificationResult[]> {
    const results: IntegrityVerificationResult[] = [];
    const allRecords = Array.from(this.store.values()).sort(
      (a, b) => new Date(a.storedAt).getTime() - new Date(b.storedAt).getTime(),
    );

    let expectedPreviousHash = this.genesisHash;

    for (const record of allRecords) {
      const details: string[] = [];
      let hashValid = false;
      let chainValid = false;

      const reHashInput = this.buildHashInput({
        logId: record.logId,
        userId: record.userId,
        transferId: record.transferId,
        checkType: record.checkType,
        status: record.status,
        riskScore: record.riskScore,
        flags: record.flags,
        metadata: record.metadata,
        checkedAt: record.checkedAt,
        checkedBy: record.checkedBy,
        previousHash: expectedPreviousHash,
        nonce: record.nonce,
      });

      const expectedHash = this.computeHash(reHashInput, expectedPreviousHash, record.nonce);
      hashValid = expectedHash === record.hash;
      if (!hashValid) {
        details.push('Hash mismatch: record content has been modified');
      }

      chainValid = record.previousHash === expectedPreviousHash;
      if (!chainValid) {
        details.push('Chain broken: previous hash does not match');
      }

      if (hashValid && chainValid) {
        expectedPreviousHash = record.hash;
      }

      results.push({
        recordId: record.id,
        hashValid,
        chainValid,
        tampered: !hashValid || !chainValid,
        details,
      });
    }

    return results;
  }

  async getComplianceReport(filters?: {
    userId?: string;
    checkType?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{
    totalRecords: number;
    tamperedRecords: number;
    integrityPassRate: number;
    records: AuditRecord[];
  }> {
    const allRecords = await this.getAllAuditRecords(1000);
    const integrityResult = await this.verifyIntegrity();
    const tamperedCount = integrityResult.filter((r) => r.tampered).length;

    let filtered = allRecords;
    if (filters?.userId) {
      filtered = filtered.filter((r) => r.userId === filters.userId);
    }
    if (filters?.checkType) {
      filtered = filtered.filter((r) => r.checkType === filters.checkType);
    }
    if (filters?.status) {
      filtered = filtered.filter((r) => r.status === filters.status);
    }
    if (filters?.fromDate) {
      const from = new Date(filters.fromDate).getTime();
      filtered = filtered.filter((r) => new Date(r.storedAt).getTime() >= from);
    }
    if (filters?.toDate) {
      const to = new Date(filters.toDate).getTime();
      filtered = filtered.filter((r) => new Date(r.storedAt).getTime() <= to);
    }

    return {
      totalRecords: allRecords.length,
      tamperedRecords: tamperedCount,
      integrityPassRate: allRecords.length > 0
        ? Math.round(((allRecords.length - tamperedCount) / allRecords.length) * 10000) / 100
        : 100,
      records: filtered.slice(0, 100),
    };
  }

  private buildHashInput(fields: {
    logId: string;
    userId: string;
    transferId?: string;
    checkType: string;
    status: string;
    riskScore: number;
    flags: string[];
    metadata: Record<string, unknown>;
    checkedAt: string;
    checkedBy: string;
    previousHash: string;
    nonce: string;
  }): string {
    return JSON.stringify({
      logId: fields.logId,
      userId: fields.userId,
      transferId: fields.transferId,
      checkType: fields.checkType,
      status: fields.status,
      riskScore: fields.riskScore,
      flags: [...fields.flags].sort(),
      metadata: fields.metadata,
      checkedAt: fields.checkedAt,
      checkedBy: fields.checkedBy,
      previousHash: fields.previousHash,
      nonce: fields.nonce,
    });
  }

  private computeHash(input: string, previousHash: string, nonce: string): string {
    return createHash('sha256')
      .update(input + previousHash + nonce)
      .digest('hex');
  }

  private getLatestRecord(): AuditRecord | undefined {
    const records = Array.from(this.store.values());
    if (records.length === 0) return undefined;
    return records[records.length - 1];
  }
}

import { createLogger } from '../../logger';
import type { DomainEvent, EventBus } from '../../core/eventBus';
import type { ContractEvent } from '../../services/contractService';
import type { AdminAlertService, AlertSeverity } from '../system/adminAlertService';
import type { ComplianceCheckStatus, ComplianceLogService } from './complianceLogService';

export type ComplianceViolationSource = 'contract_event' | 'compliance_log';

export interface ComplianceViolationRecord {
  id: string;
  source: ComplianceViolationSource;
  severity: AlertSeverity;
  title: string;
  description: string;
  userId?: string;
  transferId?: string;
  contractId?: string;
  contractMethod?: string;
  sourceEventId?: string;
  complianceLogId?: string;
  status?: ComplianceCheckStatus;
  riskScore?: number;
  flags: string[];
  metadata: Record<string, unknown>;
  detectedAt: string;
  alertId?: string;
}

export interface ComplianceViolationReport {
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    bySource: Record<ComplianceViolationSource, number>;
    unresolved: number;
  };
  violations: ComplianceViolationRecord[];
}

export class ComplianceViolationAlertService {
  private readonly logger = createLogger({ component: 'complianceViolationAlertService' });
  private readonly violations: ComplianceViolationRecord[] = [];
  private readonly seenSources = new Set<string>();

  constructor(
    private readonly eventBus: EventBus,
    private readonly complianceLogs: ComplianceLogService,
    private readonly adminAlerts: AdminAlertService,
    private readonly complianceContractId?: string,
  ) {
    this.subscribeToEvents();
  }

  getViolations(filters?: {
    severity?: AlertSeverity;
    source?: ComplianceViolationSource;
    userId?: string;
    transferId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): ComplianceViolationRecord[] {
    let filtered = [...this.violations];

    if (filters?.severity) {
      filtered = filtered.filter((violation) => violation.severity === filters.severity);
    }
    if (filters?.source) {
      filtered = filtered.filter((violation) => violation.source === filters.source);
    }
    if (filters?.userId) {
      filtered = filtered.filter((violation) => violation.userId === filters.userId);
    }
    if (filters?.transferId) {
      filtered = filtered.filter((violation) => violation.transferId === filters.transferId);
    }
    if (filters?.fromDate) {
      const from = new Date(filters.fromDate).getTime();
      if (Number.isFinite(from)) {
        filtered = filtered.filter((violation) => new Date(violation.detectedAt).getTime() >= from);
      }
    }
    if (filters?.toDate) {
      const to = new Date(filters.toDate).getTime();
      if (Number.isFinite(to)) {
        filtered = filtered.filter((violation) => new Date(violation.detectedAt).getTime() <= to);
      }
    }

    return filtered.slice(0, filters?.limit ?? 100);
  }

  generateReport(filters?: Parameters<ComplianceViolationAlertService['getViolations']>[0]): ComplianceViolationReport {
    const violations = this.getViolations(filters);
    return {
      summary: {
        total: violations.length,
        critical: violations.filter((violation) => violation.severity === 'critical').length,
        high: violations.filter((violation) => violation.severity === 'high').length,
        medium: violations.filter((violation) => violation.severity === 'medium').length,
        low: violations.filter((violation) => violation.severity === 'low').length,
        bySource: {
          contract_event: violations.filter((violation) => violation.source === 'contract_event').length,
          compliance_log: violations.filter((violation) => violation.source === 'compliance_log').length,
        },
        unresolved: violations.filter((violation) => !violation.alertId).length,
      },
      violations,
    };
  }

  private subscribeToEvents(): void {
    this.eventBus.subscribe<{
      logId: string;
      userId: string;
      checkType: string;
      status: ComplianceCheckStatus;
      riskScore: number;
    }>('compliance.log_created', async (event) => {
      this.handleComplianceLogEvent(event);
    });

    this.eventBus.subscribe<ContractEvent>('contract.event_recorded', async (event) => {
      this.handleContractEvent(event);
    });
  }

  private handleComplianceLogEvent(event: DomainEvent<{
    logId: string;
    userId: string;
    checkType: string;
    status: ComplianceCheckStatus;
    riskScore: number;
  }>): void {
    if (!['flagged', 'blocked', 'manual_review'].includes(event.payload.status)) {
      return;
    }

    const sourceKey = `log:${event.payload.logId}`;
    if (this.seenSources.has(sourceKey)) {
      return;
    }

    const log = this.complianceLogs.getLogById(event.payload.logId);
    const severity = this.getSeverity(event.payload.status, event.payload.riskScore);
    const flags = log?.flags ?? [];

    this.recordViolation({
      sourceKey,
      source: 'compliance_log',
      severity,
      title: 'Compliance Violation Detected',
      description: `${event.payload.checkType.toUpperCase()} check ${event.payload.status.replace('_', ' ')} with risk score ${event.payload.riskScore}.`,
      userId: event.payload.userId,
      transferId: log?.transferId,
      complianceLogId: event.payload.logId,
      status: event.payload.status,
      riskScore: event.payload.riskScore,
      flags,
      metadata: {
        checkType: event.payload.checkType,
        ...(log?.metadata ?? {}),
      },
    });
  }

  private handleContractEvent(event: DomainEvent<ContractEvent>): void {
    if (!this.isComplianceContractEvent(event.payload)) {
      return;
    }

    const detected = this.extractContractViolation(event.payload);
    if (!detected) {
      return;
    }

    const sourceKey = `contract:${event.payload.id}`;
    if (this.seenSources.has(sourceKey)) {
      return;
    }

    this.recordViolation({
      sourceKey,
      source: 'contract_event',
      severity: detected.severity,
      title: 'Compliance Contract Violation',
      description: detected.description,
      userId: detected.userId,
      transferId: detected.transferId,
      contractId: event.payload.contractId,
      contractMethod: event.payload.method,
      sourceEventId: event.payload.id,
      status: detected.status,
      riskScore: detected.riskScore,
      flags: detected.flags,
      metadata: {
        contractArgs: event.payload.args ?? [],
        contractResult: event.payload.result,
      },
    });
  }

  private recordViolation(input: Omit<ComplianceViolationRecord, 'id' | 'detectedAt' | 'alertId'> & { sourceKey: string }): ComplianceViolationRecord {
    this.seenSources.add(input.sourceKey);

    const violation: ComplianceViolationRecord = {
      id: `viol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: input.source,
      severity: input.severity,
      title: input.title,
      description: input.description,
      userId: input.userId,
      transferId: input.transferId,
      contractId: input.contractId,
      contractMethod: input.contractMethod,
      sourceEventId: input.sourceEventId,
      complianceLogId: input.complianceLogId,
      status: input.status,
      riskScore: input.riskScore,
      flags: input.flags,
      metadata: input.metadata,
      detectedAt: new Date().toISOString(),
    };

    const alert = this.adminAlerts.createAlert({
      type: 'compliance_violation',
      severity: violation.severity,
      title: violation.title,
      message: violation.description,
      transferId: violation.transferId,
      userId: violation.userId,
      metadata: {
        violationId: violation.id,
        source: violation.source,
        flags: violation.flags,
        riskScore: violation.riskScore,
        complianceLogId: violation.complianceLogId,
        contractEventId: violation.sourceEventId,
      },
    });

    violation.alertId = alert.id;
    this.violations.unshift(violation);
    if (this.violations.length > 500) {
      this.violations.splice(500);
    }

    this.logger.warn(
      { violationId: violation.id, alertId: alert.id, source: violation.source, severity: violation.severity },
      'compliance violation alert created',
    );

    void this.eventBus.publish({
      type: 'compliance.violation_detected',
      timestamp: violation.detectedAt,
      payload: {
        violationId: violation.id,
        alertId: alert.id,
        source: violation.source,
        severity: violation.severity,
      },
    });

    return violation;
  }

  private isComplianceContractEvent(event: ContractEvent): boolean {
    if (this.complianceContractId && event.contractId === this.complianceContractId) {
      return true;
    }
    return ['inspect', 'record', 'record_violation', 'violation', 'limit_exceeded'].includes(event.method);
  }

  private extractContractViolation(event: ContractEvent): {
    severity: AlertSeverity;
    description: string;
    userId?: string;
    transferId?: string;
    status?: ComplianceCheckStatus;
    riskScore?: number;
    flags: string[];
  } | null {
    const result = this.asRecord(event.result);
    const args = Array.isArray(event.args) ? event.args : [];
    const methodLooksLikeViolation = /violation|blocked|denied|limit_exceeded/.test(event.method);
    const allowed = this.getBoolean(result, ['allowed', 'canProceed', 'passed', 'success']);
    const status = this.getString(result, ['status', 'decision']);
    const violation = this.getBoolean(result, ['violation', 'violated', 'limitExceeded', 'blocked']);
    const flags = this.getStringArray(result, 'flags');
    const riskScore = this.getNumber(result, ['riskScore', 'risk_score']);
    const isViolation =
      methodLooksLikeViolation ||
      violation === true ||
      allowed === false ||
      status === 'blocked' ||
      status === 'flagged' ||
      status === 'manual_review' ||
      flags.length > 0;

    if (!isViolation) {
      return null;
    }

    const normalizedStatus = this.normalizeStatus(status, allowed, violation);
    const severity = this.getSeverity(normalizedStatus, riskScore ?? (flags.length > 0 ? 40 : 0));
    const userId = this.getString(result, ['userId', 'user_id']) ?? (typeof args[0] === 'string' ? args[0] : undefined);
    const transferId = this.getString(result, ['transferId', 'transfer_id']);

    return {
      severity,
      description: `Compliance contract ${event.method} reported ${normalizedStatus.replace('_', ' ')}${riskScore !== undefined ? ` with risk score ${riskScore}` : ''}.`,
      userId,
      transferId,
      status: normalizedStatus,
      riskScore,
      flags,
    };
  }

  private getSeverity(status: ComplianceCheckStatus, riskScore = 0): AlertSeverity {
    if (status === 'blocked' || riskScore >= 80) return 'critical';
    if (status === 'manual_review' || riskScore >= 60) return 'high';
    if (status === 'flagged' || riskScore >= 30) return 'medium';
    return 'low';
  }

  private normalizeStatus(status: string | undefined, allowed?: boolean, violation?: boolean): ComplianceCheckStatus {
    if (status === 'blocked' || status === 'flagged' || status === 'manual_review' || status === 'passed') {
      return status;
    }
    if (allowed === false || violation === true) {
      return 'blocked';
    }
    return 'flagged';
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private getBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
    for (const key of keys) {
      if (typeof record[key] === 'boolean') return record[key] as boolean;
    }
    return undefined;
  }

  private getNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
    return undefined;
  }

  private getString(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      if (typeof record[key] === 'string') return record[key] as string;
    }
    return undefined;
  }

  private getStringArray(record: Record<string, unknown>, key: string): string[] {
    const value = record[key];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }
}

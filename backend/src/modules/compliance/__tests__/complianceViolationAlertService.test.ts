import { EventBus } from '../../../core/eventBus';
import { AdminAlertService } from '../../system/adminAlertService';
import { ComplianceLogService } from '../complianceLogService';
import { ComplianceViolationAlertService } from '../complianceViolationAlertService';
import type { ContractEvent } from '../../../services/contractService';

describe('ComplianceViolationAlertService', () => {
  let eventBus: EventBus;
  let complianceLogs: ComplianceLogService;
  let adminAlerts: AdminAlertService;
  let service: ComplianceViolationAlertService;

  beforeEach(() => {
    eventBus = new EventBus();
    complianceLogs = new ComplianceLogService(eventBus);
    adminAlerts = new AdminAlertService(eventBus);
    service = new ComplianceViolationAlertService(
      eventBus,
      complianceLogs,
      adminAlerts,
      'compliance_contract',
    );
  });

  it('creates an admin alert when a compliance log is blocked', async () => {
    const log = complianceLogs.createLog({
      userId: 'user_123',
      transferId: 'transfer_123',
      checkType: 'aml',
      status: 'blocked',
      riskScore: 85,
      flags: ['high_risk_country', 'very_large_amount'],
      metadata: { amount: 15000 },
      checkedBy: 'system',
    });

    await new Promise(process.nextTick);

    const violations = service.getViolations();
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual(
      expect.objectContaining({
        source: 'compliance_log',
        severity: 'critical',
        userId: 'user_123',
        transferId: 'transfer_123',
        complianceLogId: log.id,
      }),
    );

    const alerts = adminAlerts.getAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual(
      expect.objectContaining({
        type: 'compliance_violation',
        severity: 'critical',
        transferId: 'transfer_123',
        userId: 'user_123',
      }),
    );
  });

  it('ignores passing compliance logs', async () => {
    complianceLogs.createLog({
      userId: 'user_123',
      checkType: 'aml',
      status: 'passed',
      riskScore: 5,
      flags: [],
      metadata: {},
      checkedBy: 'system',
    });

    await new Promise(process.nextTick);

    expect(service.getViolations()).toHaveLength(0);
    expect(adminAlerts.getAlerts()).toHaveLength(0);
  });

  it('detects compliance contract events that deny a transfer', async () => {
    const contractEvent: ContractEvent = {
      id: 'evt_blocked',
      contractId: 'compliance_contract',
      method: 'inspect',
      args: ['user_abc', 12000],
      result: {
        allowed: false,
        status: 'blocked',
        riskScore: 90,
        flags: ['daily_limit_exceeded'],
        transferId: 'transfer_abc',
      },
      timestamp: new Date().toISOString(),
    };

    await eventBus.publish({
      type: 'contract.event_recorded',
      timestamp: contractEvent.timestamp,
      payload: contractEvent,
    });

    const violations = service.getViolations({ source: 'contract_event' });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual(
      expect.objectContaining({
        severity: 'critical',
        userId: 'user_abc',
        transferId: 'transfer_abc',
        sourceEventId: 'evt_blocked',
      }),
    );
    expect(adminAlerts.getAlerts()[0].type).toBe('compliance_violation');
  });

  it('deduplicates repeated source events', async () => {
    const contractEvent: ContractEvent = {
      id: 'evt_duplicate',
      contractId: 'compliance_contract',
      method: 'limit_exceeded',
      args: ['user_dup', 9000],
      result: { violation: true, flags: ['monthly_limit_exceeded'] },
      timestamp: new Date().toISOString(),
    };

    await eventBus.publish({
      type: 'contract.event_recorded',
      timestamp: contractEvent.timestamp,
      payload: contractEvent,
    });
    await eventBus.publish({
      type: 'contract.event_recorded',
      timestamp: contractEvent.timestamp,
      payload: contractEvent,
    });

    expect(service.getViolations()).toHaveLength(1);
    expect(adminAlerts.getAlerts()).toHaveLength(1);
  });

  it('generates a compliance violation report', async () => {
    complianceLogs.createLog({
      userId: 'user_report',
      checkType: 'sanctions',
      status: 'flagged',
      riskScore: 55,
      flags: ['sanctions_review'],
      metadata: {},
      checkedBy: 'system',
    });

    await new Promise(process.nextTick);

    const report = service.generateReport({ userId: 'user_report' });
    expect(report.summary).toEqual(
      expect.objectContaining({
        total: 1,
        medium: 1,
        unresolved: 0,
      }),
    );
    expect(report.summary.bySource.compliance_log).toBe(1);
    expect(report.violations[0].userId).toBe('user_report');
  });
});

import { TransactionApprovalService } from '../approvalService';

describe('TransactionApprovalService', () => {
  let service: TransactionApprovalService;

  beforeEach(() => {
    service = new TransactionApprovalService();
  });

  it('should have demo approvals seeded', () => {
    const all = service.listAll();
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it('should list pending approvals', () => {
    const pending = service.listPending();
    expect(pending.every((r) => r.status === 'pending')).toBe(true);
  });

  it('should create a new approval request', () => {
    const req = service.requestApproval({
      transferId: 'transfer_new_1',
      userId: 'user_new_1',
      amount: 10000,
      currency: 'USDC',
      reason: 'large_value',
    });
    expect(req.status).toBe('pending');
    expect(req.transferId).toBe('transfer_new_1');
    expect(req.amount).toBe(10000);
  });

  it('should return existing pending request for same transfer', () => {
    const req1 = service.requestApproval({
      transferId: 'transfer_dup',
      userId: 'user_dup',
      amount: 10000,
      currency: 'USDC',
      reason: 'large_value',
    });
    const req2 = service.requestApproval({
      transferId: 'transfer_dup',
      userId: 'user_dup',
      amount: 10000,
      currency: 'USDC',
      reason: 'large_value',
    });
    expect(req2.id).toBe(req1.id);
  });

  it('should approve a pending request', () => {
    const req = service.requestApproval({
      transferId: 'transfer_approve',
      userId: 'user_approve',
      amount: 10000,
      currency: 'USDC',
      reason: 'large_value',
    });
    const approved = service.approveRequest(req.id, 'admin_1');
    expect(approved.status).toBe('approved');
    expect(approved.reviewedBy).toBe('admin_1');
    expect(approved.reviewedAt).toBeDefined();
  });

  it('should reject a pending request', () => {
    const req = service.requestApproval({
      transferId: 'transfer_reject',
      userId: 'user_reject',
      amount: 10000,
      currency: 'USDC',
      reason: 'large_value',
    });
    const rejected = service.rejectRequest(req.id, 'admin_1', 'Insufficient documentation');
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason).toBe('Insufficient documentation');
  });

  it('should throw when approving a non-existent request', () => {
    expect(() => service.approveRequest('nonexistent', 'admin_1')).toThrow();
  });

  it('should throw when approving an already processed request', () => {
    const req = service.requestApproval({
      transferId: 'transfer_finalized',
      userId: 'user_finalized',
      amount: 10000,
      currency: 'USDC',
      reason: 'large_value',
    });
    service.approveRequest(req.id, 'admin_1');
    expect(() => service.approveRequest(req.id, 'admin_2')).toThrow();
  });

  it('should get request by transfer ID', () => {
    service.requestApproval({
      transferId: 'transfer_lookup',
      userId: 'user_lookup',
      amount: 10000,
      currency: 'USDC',
      reason: 'large_value',
    });
    const found = service.getByTransferId('transfer_lookup');
    expect(found).toBeDefined();
    expect(found!.transferId).toBe('transfer_lookup');
  });

  it('should return stats', () => {
    const stats = service.getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.pending + stats.approved + stats.rejected).toBe(stats.total);
  });

  it('should detect if transfer requires approval', () => {
    expect(service.requiresApproval(1000)).toBeNull();
    expect(service.requiresApproval(5000)).toBe('large_value');
    expect(service.requiresApproval(10000)).toBe('large_value');
  });

  it('should detect high risk destination', () => {
    expect(service.requiresApproval(100, 'US')).toBeNull();
    expect(service.requiresApproval(100, 'KP')).toBe('high_risk_destination');
  });
});

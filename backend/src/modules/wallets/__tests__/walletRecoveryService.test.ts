import { WalletRecoveryService } from '../walletRecoveryService';

describe('WalletRecoveryService', () => {
  it('creates, approves, completes, and audits a guardian recovery request', () => {
    const service = new WalletRecoveryService();

    const request = service.createRequest({
      userId: 'user-1',
      userIdentifier: 'user@example.com',
      guardianIdentifier: 'guardian@example.com',
      currentWalletId: 'wallet-1',
      recoveryWallet: {
        publicKey: 'GRECOVERYWALLET00000000000000000000000000000000000000000000',
        provider: 'guardian-recovery',
        label: 'Recovered wallet',
      },
      reason: 'Lost device',
    });

    expect(request.status).toBe('pending_guardian');
    expect(request.approvalCode).toHaveLength(8);

    const approved = service.approveRequest(request.id, {
      guardianIdentifier: 'guardian@example.com',
      approvalCode: request.approvalCode,
      note: 'Approved by guardian',
    });

    expect(approved.status).toBe('approved');
    expect(approved.approvals).toHaveLength(1);

    const completed = service.completeRequest(request.id, 'user@example.com');

    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeDefined();

    const auditLogs = service.listAuditLogs('user-1');
    expect(auditLogs.map((entry) => entry.action)).toEqual(['completed', 'approved', 'requested']);
  });
});

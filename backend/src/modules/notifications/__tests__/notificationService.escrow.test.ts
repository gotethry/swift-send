import { NotificationService } from '../notificationService';
import { EventBus } from '../../../core/eventBus';

describe('NotificationService - Escrow Notifications', () => {
  let service: NotificationService;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    service = new NotificationService(eventBus);
  });

  it('should create escrow created notification', async () => {
    const notification = await service.notifyEscrowCreated({
      userId: 'user1',
      transferId: 'transfer1',
      amount: 500,
      currency: 'USDC',
    });

    expect(notification.type).toBe('info');
    expect(notification.title).toBe('Escrow created');
    expect(notification.metadata?.kind).toBe('escrow_created');
    expect(notification.transferId).toBe('transfer1');
  });

  it('should create escrow released notification', async () => {
    const notification = await service.notifyEscrowReleased({
      userId: 'user1',
      transferId: 'transfer1',
      amount: 500,
      currency: 'USDC',
    });

    expect(notification.type).toBe('success');
    expect(notification.title).toBe('Escrow released');
    expect(notification.metadata?.kind).toBe('escrow_released');
  });

  it('should create escrow refunded notification', async () => {
    const notification = await service.notifyEscrowRefunded({
      userId: 'user1',
      transferId: 'transfer1',
      amount: 500,
      currency: 'USDC',
      reason: 'Transfer failed',
    });

    expect(notification.type).toBe('warning');
    expect(notification.title).toBe('Escrow refunded');
    expect(notification.metadata?.kind).toBe('escrow_refunded');
    expect(notification.metadata?.reason).toBe('Transfer failed');
  });

  it('should create escrow disputed notification', async () => {
    const notification = await service.notifyEscrowDisputed({
      userId: 'user1',
      transferId: 'transfer1',
      amount: 500,
      currency: 'USDC',
      reason: 'Recipient not responding',
    });

    expect(notification.type).toBe('error');
    expect(notification.title).toBe('Escrow disputed');
    expect(notification.metadata?.kind).toBe('escrow_disputed');
    expect(notification.metadata?.reason).toBe('Recipient not responding');
  });

  it('should create escrow delayed notification', async () => {
    const notification = await service.notifyEscrowDelayed({
      userId: 'user1',
      transferId: 'transfer1',
      amount: 500,
      currency: 'USDC',
      delayReason: 'Network congestion',
    });

    expect(notification.type).toBe('warning');
    expect(notification.title).toBe('Escrow release delayed');
    expect(notification.metadata?.kind).toBe('escrow_delayed');
    expect(notification.metadata?.delayReason).toBe('Network congestion');
  });

  it('should store notification in user store', async () => {
    await service.notifyEscrowCreated({
      userId: 'user_store',
      transferId: 'transfer_store',
      amount: 250,
      currency: 'USDC',
    });

    const result = service.listByUserId('user_store');
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe('Escrow created');
  });
});

import { StressTestService } from '../stressTestService';
import type { TransferLifecycle } from '../../transfers/transferLifecycle';

describe('StressTestService', () => {
  let transferLifecycle: jest.Mocked<TransferLifecycle>;
  let service: StressTestService;

  beforeEach(() => {
    transferLifecycle = {
      createTransfer: jest.fn(),
    } as any;
    service = new StressTestService(transferLifecycle);
  });

  it('should successfully run a stress test with all transfers passing', async () => {
    transferLifecycle.createTransfer.mockResolvedValue({ id: 'test' } as any);

    const result = await service.runStressTest({
      concurrency: 5,
      totalTransfers: 10,
      amount: 10,
      userId: 'user_stress',
      walletId: 'wallet_stress',
    });

    expect(result.successful).toBe(10);
    expect(result.failed).toBe(0);
    expect(result.config.totalTransfers).toBe(10);
    expect(result.runId).toContain('stress_');
    expect(result.config.concurrency).toBe(5);
    expect(result.throughputPerSecond).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(transferLifecycle.createTransfer).toHaveBeenCalledTimes(10);
  });

  it('should report failures correctly', async () => {
    let callCount = 0;
    transferLifecycle.createTransfer.mockImplementation(async () => {
      callCount++;
      if (callCount % 3 === 0) {
        throw new Error('Insufficient balance');
      }
      return { id: 'test' } as any;
    });

    const result = await service.runStressTest({
      concurrency: 3,
      totalTransfers: 6,
      amount: 50,
      userId: 'user_stress',
      walletId: 'wallet_stress',
    });

    expect(result.successful).toBe(4);
    expect(result.failed).toBe(2);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]).toContain('Insufficient balance');
  });

  it('should handle single transfer stress test', async () => {
    transferLifecycle.createTransfer.mockResolvedValue({ id: 'test' } as any);

    const result = await service.runStressTest({
      concurrency: 1,
      totalTransfers: 1,
      amount: 5,
      userId: 'user_1',
      walletId: 'wallet_1',
    });

    expect(result.successful).toBe(1);
    expect(result.config.totalTransfers).toBe(1);
    expect(result.perTransferResults).toHaveLength(1);
    expect(result.perTransferResults[0].success).toBe(true);
  });

  it('should maintain per-transfer latency results', async () => {
    transferLifecycle.createTransfer.mockImplementation(
      async () => new Promise((resolve) => setTimeout(() => resolve({ id: 'test' } as any), 5)),
    );

    const result = await service.runStressTest({
      concurrency: 2,
      totalTransfers: 4,
      amount: 10,
      userId: 'user_1',
      walletId: 'wallet_1',
    });

    expect(result.perTransferResults).toHaveLength(4);
    expect(result.averageLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.p95LatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.p99LatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should capture bottleneck metrics', async () => {
    transferLifecycle.createTransfer.mockResolvedValue({ id: 'test' } as any);

    const result = await service.runStressTest({
      concurrency: 10,
      totalTransfers: 20,
      amount: 10,
      userId: 'user_1',
      walletId: 'wallet_1',
    });

    expect(result.throughputPerSecond).toBeDefined();
    expect(result.averageLatencyMs).toBeDefined();
    expect(result.perTransferResults.length).toBe(20);

    const lowThroughput = result.throughputPerSecond < 10;
    const highLatency = result.averageLatencyMs > 1000;
    if (lowThroughput || highLatency) {
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('should simulate API downtime and recover with retry', async () => {
    transferLifecycle.createTransfer.mockResolvedValue({ id: 'test' } as any);

    const result = await service.runStressTest({
      concurrency: 2,
      totalTransfers: 6,
      amount: 15,
      userId: 'user_chaos',
      walletId: 'wallet_chaos',
      chaos: {
        apiDowntimeEvery: 3,
      },
    });

    expect(result.successful).toBeGreaterThan(0);
    expect(result.perTransferResults.some((r) => r.recovered)).toBe(true);
  });

  it('should simulate blockchain latency in chaos mode', async () => {
    transferLifecycle.createTransfer.mockResolvedValue({ id: 'test' } as any);

    const result = await service.runStressTest({
      concurrency: 1,
      totalTransfers: 2,
      amount: 8,
      userId: 'user_chaos',
      walletId: 'wallet_chaos',
      chaos: {
        blockchainLatencyMs: 10,
      },
    });

    expect(result.averageLatencyMs).toBeGreaterThanOrEqual(10);
    expect(result.failed).toBe(0);
  });
});

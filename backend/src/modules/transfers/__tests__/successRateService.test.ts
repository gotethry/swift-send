import { SuccessRateService } from '../successRateService';

describe('SuccessRateService', () => {
  let service: SuccessRateService;

  beforeEach(() => {
    service = new SuccessRateService();
  });

  it('should have demo data seeded', () => {
    const metrics = service.getMetrics(30);
    expect(metrics.overall.total).toBeGreaterThan(0);
    expect(metrics.overall.successRate).toBeGreaterThan(0);
  });

  it('should return metrics with all required fields', () => {
    const metrics = service.getMetrics(30);
    expect(metrics).toHaveProperty('overall');
    expect(metrics).toHaveProperty('daily');
    expect(metrics).toHaveProperty('byCurrency');
    expect(metrics).toHaveProperty('byAmountRange');
    expect(metrics).toHaveProperty('recentFailures');
    expect(metrics.overall).toHaveProperty('total');
    expect(metrics.overall).toHaveProperty('successful');
    expect(metrics.overall).toHaveProperty('failed');
    expect(metrics.overall).toHaveProperty('successRate');
  });

  it('should compute success rate correctly', () => {
    const metrics = service.getMetrics(30);
    const { total, successful, failed } = metrics.overall;
    expect(successful + failed).toBe(total);
    const expectedRate = total > 0 ? Math.round((successful / total) * 10000) / 100 : 0;
    expect(metrics.overall.successRate).toBe(expectedRate);
  });

  it('should return daily metrics sorted by date', () => {
    const metrics = service.getMetrics(30);
    for (let i = 1; i < metrics.daily.length; i++) {
      expect(metrics.daily[i].date >= metrics.daily[i - 1].date).toBe(true);
    }
  });

  it('should return currency breakdown', () => {
    const metrics = service.getMetrics(30);
    expect(metrics.byCurrency.length).toBeGreaterThan(0);
    metrics.byCurrency.forEach((c) => {
      expect(c).toHaveProperty('currency');
      expect(c).toHaveProperty('successRate');
      expect(c.successful + c.failed).toBe(c.total);
    });
  });

  it('should return amount range breakdown', () => {
    const metrics = service.getMetrics(30);
    expect(metrics.byAmountRange.length).toBe(5);
    metrics.byAmountRange.forEach((r) => {
      expect(r).toHaveProperty('range');
      expect(r).toHaveProperty('successRate');
      expect(r.successful + r.failed).toBe(r.total);
    });
  });

  it('should record a new transfer', () => {
    const before = service.getMetrics(30).overall.total;
    service.recordTransfer({
      transferId: 'test_new_1',
      userId: 'test_user',
      amount: 100,
      currency: 'USDC',
      success: true,
      timestamp: new Date().toISOString(),
      processingTimeMs: 1000,
    });
    const after = service.getMetrics(30).overall.total;
    expect(after).toBe(before + 1);
  });

  it('should return daily report', () => {
    const metrics = service.getMetrics(30);
    if (metrics.daily.length > 0) {
      const date = metrics.daily[0].date;
      const report = service.getDailyReport(date);
      expect(report.date).toBe(date);
      expect(report.metrics).toBeDefined();
      expect(report.currencyBreakdown).toBeDefined();
      expect(report.topFailures).toBeDefined();
      expect(report.generatedAt).toBeDefined();
    }
  });
});

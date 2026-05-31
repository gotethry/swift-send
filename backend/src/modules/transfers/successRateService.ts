export interface TransferResult {
  transferId: string;
  userId: string;
  amount: number;
  currency: string;
  success: boolean;
  error?: string;
  timestamp: string;
  processingTimeMs?: number;
}

export interface SuccessRateMetrics {
  overall: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  };
  daily: DayMetrics[];
  byCurrency: CurrencyMetrics[];
  byAmountRange: RangeMetrics[];
  recentFailures: TransferResult[];
}

export interface DayMetrics {
  date: string;
  total: number;
  successful: number;
  failed: number;
  successRate: number;
}

export interface CurrencyMetrics {
  currency: string;
  total: number;
  successful: number;
  failed: number;
  successRate: number;
}

export interface RangeMetrics {
  range: string;
  min: number;
  max: number;
  total: number;
  successful: number;
  failed: number;
  successRate: number;
}

export interface DailyReport {
  date: string;
  metrics: DayMetrics;
  currencyBreakdown: CurrencyMetrics[];
  topFailures: TransferResult[];
  generatedAt: string;
}

const AMOUNT_RANGES = [
  { label: '0 - 100', min: 0, max: 100 },
  { label: '100 - 500', min: 100, max: 500 },
  { label: '500 - 1000', min: 500, max: 1000 },
  { label: '1000 - 5000', min: 1000, max: 5000 },
  { label: '5000+', min: 5000, max: Infinity },
];

export class SuccessRateService {
  private transfers: TransferResult[] = [];

  constructor() {
    this.seedDemoData();
  }

  private seedDemoData() {
    const now = Date.now();
    const demoTransfers: TransferResult[] = [];
    const currencies = ['USDC', 'XLM'];
    const failureReasons = [
      'Insufficient balance',
      'Network timeout',
      'Invalid recipient address',
      'Compliance check failed',
      'Rate limit exceeded',
    ];

    for (let i = 0; i < 150; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const timestamp = new Date(now - daysAgo * 86400000 - Math.random() * 86400000).toISOString();
      const isSuccess = Math.random() < 0.85;
      const currency = currencies[i % currencies.length];
      const amount = Math.round(Math.random() * 10000 * 100) / 100;

      demoTransfers.push({
        transferId: `success_rate_demo_${i}`,
        userId: `user_demo_${i % 5}`,
        amount,
        currency,
        success: isSuccess,
        error: isSuccess ? undefined : failureReasons[i % failureReasons.length],
        timestamp,
        processingTimeMs: Math.round(Math.random() * 5000 + 500),
      });
    }
    this.transfers = demoTransfers;
  }

  recordTransfer(result: TransferResult): void {
    this.transfers.push(result);
    if (this.transfers.length > 10000) {
      this.transfers = this.transfers.slice(-5000);
    }
  }

  getMetrics(days = 30): SuccessRateMetrics {
    const cutoff = Date.now() - days * 86400000;
    const relevant = this.transfers.filter(
      (t) => new Date(t.timestamp).getTime() >= cutoff,
    );

    const successful = relevant.filter((t) => t.success);
    const failed = relevant.filter((t) => !t.success);
    const total = relevant.length;

    const daily = this.computeDailyMetrics(relevant);
    const byCurrency = this.computeCurrencyMetrics(relevant);
    const byAmountRange = this.computeRangeMetrics(relevant);

    const recentFailures = failed
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    return {
      overall: {
        total,
        successful: successful.length,
        failed: failed.length,
        successRate: total > 0 ? Math.round((successful.length / total) * 10000) / 100 : 0,
      },
      daily,
      byCurrency,
      byAmountRange,
      recentFailures,
    };
  }

  getDailyReport(date?: string): DailyReport {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const dayTransfers = this.transfers.filter((t) =>
      t.timestamp.startsWith(targetDate),
    );

    const successful = dayTransfers.filter((t) => t.success);
    const failed = dayTransfers.filter((t) => !t.success);
    const total = dayTransfers.length;

    const currencyMap = new Map<string, { total: number; successful: number; failed: number }>();
    for (const t of dayTransfers) {
      const entry = currencyMap.get(t.currency) || { total: 0, successful: 0, failed: 0 };
      entry.total++;
      if (t.success) entry.successful++;
      else entry.failed++;
      currencyMap.set(t.currency, entry);
    }

    const currencyBreakdown: CurrencyMetrics[] = Array.from(currencyMap.entries()).map(
      ([currency, data]) => ({
        currency,
        ...data,
        successRate: data.total > 0 ? Math.round((data.successful / data.total) * 10000) / 100 : 0,
      }),
    );

    return {
      date: targetDate,
      metrics: {
        date: targetDate,
        total,
        successful: successful.length,
        failed: failed.length,
        successRate: total > 0 ? Math.round((successful.length / total) * 10000) / 100 : 0,
      },
      currencyBreakdown,
      topFailures: failed.slice(0, 5),
      generatedAt: new Date().toISOString(),
    };
  }

  private computeDailyMetrics(transfers: TransferResult[]): DayMetrics[] {
    const dayMap = new Map<string, { total: number; successful: number; failed: number }>();

    for (const t of transfers) {
      const day = t.timestamp.slice(0, 10);
      const entry = dayMap.get(day) || { total: 0, successful: 0, failed: 0 };
      entry.total++;
      if (t.success) entry.successful++;
      else entry.failed++;
      dayMap.set(day, entry);
    }

    return Array.from(dayMap.entries())
      .map(([date, data]) => ({
        date,
        ...data,
        successRate: data.total > 0 ? Math.round((data.successful / data.total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private computeCurrencyMetrics(transfers: TransferResult[]): CurrencyMetrics[] {
    const currencyMap = new Map<string, { total: number; successful: number; failed: number }>();

    for (const t of transfers) {
      const entry = currencyMap.get(t.currency) || { total: 0, successful: 0, failed: 0 };
      entry.total++;
      if (t.success) entry.successful++;
      else entry.failed++;
      currencyMap.set(t.currency, entry);
    }

    return Array.from(currencyMap.entries()).map(([currency, data]) => ({
      currency,
      ...data,
      successRate: data.total > 0 ? Math.round((data.successful / data.total) * 10000) / 100 : 0,
    }));
  }

  private computeRangeMetrics(transfers: TransferResult[]): RangeMetrics[] {
    return AMOUNT_RANGES.map((range) => {
      const inRange = transfers.filter(
        (t) => t.amount >= range.min && t.amount < range.max,
      );
      const successful = inRange.filter((t) => t.success);
      const failed = inRange.filter((t) => !t.success);
      const total = inRange.length;

      return {
        range: range.label,
        min: range.min,
        max: range.max === Infinity ? Infinity : range.max,
        total,
        successful: successful.length,
        failed: failed.length,
        successRate: total > 0 ? Math.round((successful.length / total) * 10000) / 100 : 0,
      };
    });
  }
}

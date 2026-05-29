import { config } from '../../config';
import type { NotificationService } from '../notifications/notificationService';
import type { TransferRecord } from '../transfers/domain';
import type { TransferRepository } from '../transfers/repository';
import {
  deleteCachedKeys,
  getCachedJson,
  setCachedJson,
} from '../../utils/redisCache';
import { ExportService } from './exportService';

export interface ActivityTransactionDto {
  id: string;
  type: 'send';
  amount: number;
  fee: number;
  recipientAmount: number;
  recipientName: string;
  recipientPhone: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
  exchangeRate?: number;
  destinationCurrency?: string;
  category?: string;
  notes?: string;
  txHash?: string;
  explorerUrl?: string;
  risk?: {
    score: number;
    level: 'low' | 'medium' | 'high';
    flags: Array<{ code: string; label: string; severity: 'low' | 'medium' | 'high' }>;
    requiresReview: boolean;
    loggedAt?: string;
  };
}

export interface TransactionSearchParams {
  q?: string;
  status?: 'pending' | 'completed' | 'failed';
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  limit?: number;
  offset?: number;
}

export interface TransactionSearchBenchmarkDto {
  scanned: number;
  matched: number;
  elapsedMs: number;
  indexUsed: boolean;
}

export interface SpendingInsightsDto {
  summary: {
    totalSent: number;
    totalFees: number;
    completedTransfers: number;
    pendingTransfers: number;
    failedTransfers: number;
    flaggedTransfers: number;
    thisMonthCount: number;
    thisMonthSent: number;
    averageTransfer: number;
    topCategory?: string;
  };
  monthlyTransferData: Array<{
    month: string;
    sent: number;
    successful: number;
    failed: number;
    count: number;
  }>;
  categoryData: Array<{
    category: string;
    value: number;
    count: number;
  }>;
  topExpenses: Array<{
    id: string;
    recipientName: string;
    amount: number;
    category: string;
    timestamp: string;
    status: 'pending' | 'completed' | 'failed';
  }>;
}

export interface AdminFeeAnalyticsDto {
  summary: {
    totalTransfers: number;
    settledTransfers: number;
    pendingTransfers: number;
    failedTransfers: number;
    totalVolume: number;
    totalFees: number;
    totalServiceFees: number;
    totalNetworkFees: number;
    averageFeeRate: number;
    thisMonthFees: number;
    thisMonthVolume: number;
  };
  monthlyFees: Array<{
    month: string;
    volume: number;
    fees: number;
    transfers: number;
  }>;
  growth: {
    feesGrowthPct: number;
    volumeGrowthPct: number;
    transfersGrowthPct: number;
    windowDays: number;
  };
  forecast: Array<{
    month: string;
    projectedVolume: number;
    projectedFees: number;
    projectedTransfers: number;
  }>;
  historicalComparison: {
    trailing30Days: { volume: number; fees: number; transfers: number };
    previous30Days: { volume: number; fees: number; transfers: number };
  };
  corridorFees: Array<{
    corridor: string;
    transfers: number;
    volume: number;
    fees: number;
  }>;
  recentTransfers: Array<{
    id: string;
    userId: string;
    state: TransferRecord['state'];
    amount: number;
    fees: number;
    serviceFee: number;
    networkFee: number;
    country?: string;
    createdAt: string;
  }>;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class ActivityService {
  private readonly transactionCache = new Map<string, CacheEntry<ActivityTransactionDto[]>>();
  private readonly insightsCache = new Map<string, CacheEntry<SpendingInsightsDto>>();

  constructor(
    private readonly repository: TransferRepository,
    private readonly notifications: NotificationService,
    private readonly exporter: ExportService,
  ) {}

  async getActivityHeatmap(
    userId: string,
    months = 3,
  ): Promise<{
    daily: Array<{ date: string; dayOfWeek: number; hour: number; count: number; total: number }>;
    monthly: Array<{ month: string; total: number; count: number; avgPerDay: number }>;
    summary: { totalTransactions: number; mostActiveDay: string; mostActiveHour: number; busiestDay: string };
  }> {
    const records = await this.repository.listByUserId(userId);
    const transactions = records.map((record) => this.toTransactionDto(record));

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const filtered = transactions.filter((t) => new Date(t.timestamp) >= cutoff);

    const dayHourMap = new Map<string, { date: string; dayOfWeek: number; hour: number; count: number; total: number }>();

    for (const tx of filtered) {
      const d = new Date(tx.timestamp);
      const dateStr = d.toISOString().slice(0, 10);
      const dayOfWeek = d.getUTCDay();
      const hour = d.getUTCHours();
      const key = `${dateStr}_${hour}`;

      const existing = dayHourMap.get(key) || { date: dateStr, dayOfWeek, hour, count: 0, total: 0 };
      existing.count += 1;
      existing.total += tx.amount;
      dayHourMap.set(key, existing);
    }

    const daily = Array.from(dayHourMap.values()).sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      return dateCmp !== 0 ? dateCmp : a.hour - b.hour;
    });

    const monthlyMap = new Map<string, { total: number; count: number }>();
    for (const tx of filtered) {
      const d = new Date(tx.timestamp);
      const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const existing = monthlyMap.get(monthKey) || { total: 0, count: 0 };
      existing.total += tx.amount;
      existing.count += 1;
      monthlyMap.set(monthKey, existing);
    }

    const monthly = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, data]) => {
        const [y, m] = monthKey.split('-');
        const daysInMonth = new Date(Number(y), Number(m), 0).getDate();
        return {
          month: monthKey,
          total: round2(data.total),
          count: data.count,
          avgPerDay: round2(data.count / daysInMonth),
        };
      });

    let mostActiveDay = '';
    let maxDayCount = 0;
    const dayCounts = new Map<string, number>();
    for (const entry of daily) {
      const c = (dayCounts.get(entry.date) || 0) + entry.count;
      dayCounts.set(entry.date, c);
      if (c > maxDayCount) {
        maxDayCount = c;
        mostActiveDay = entry.date;
      }
    }

    const hourCounts = new Array(24).fill(0);
    for (const entry of daily) {
      hourCounts[entry.hour] += entry.count;
    }
    const mostActiveHour = hourCounts.indexOf(Math.max(...hourCounts));

    const dayOfWeekNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowCounts = new Array(7).fill(0);
    for (const entry of daily) {
      dowCounts[entry.dayOfWeek] += entry.count;
    }
    const busiestDay = dayOfWeekNames[dowCounts.indexOf(Math.max(...dowCounts))];

    return {
      daily,
      monthly,
      summary: {
        totalTransactions: filtered.length,
        mostActiveDay,
        mostActiveHour,
        busiestDay,
      },
    };
  }

  async listTransactions(userId: string, limit = 50): Promise<ActivityTransactionDto[]> {
    const cacheKey = `activity:transactions:${userId}:${limit}`;
    const cached = await getCachedJson<ActivityTransactionDto[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const records = await this.repository.listRecentByUserId(userId, limit);
    const transactions = records.map((record) => this.toTransactionDto(record));
    this.transactionCache.set(cacheKey, {
      expiresAt: Date.now() + config.performance.activityCacheTtlMs,
      value: transactions,
    });
    await setCachedJson(cacheKey, transactions, config.cache.activityCacheTtlSeconds);
    return transactions;
  }

  async exportTransactionsToExcel(userId: string): Promise<Buffer> {
    const records = await this.repository.listByUserId(userId);
    const transactions = records.map((record) => this.toTransactionDto(record));
    return this.exporter.generateTransactionExcel(transactions);
  }

  async getSpendingInsights(userId: string): Promise<SpendingInsightsDto> {
    const cached = this.insightsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const records = await this.repository.listByUserId(userId);
    const transactions = records.map((record) => this.toTransactionDto(record));
    const successfulOrPending = transactions.filter((transaction) => transaction.status !== 'failed');
    const successfulOnly = transactions.filter((transaction) => transaction.status === 'completed');
    const now = new Date();

    const summary = {
      totalSent: round2(successfulOrPending.reduce((sum, transaction) => sum + transaction.amount, 0)),
      totalFees: round2(successfulOrPending.reduce((sum, transaction) => sum + transaction.fee, 0)),
      completedTransfers: transactions.filter((transaction) => transaction.status === 'completed').length,
      pendingTransfers: transactions.filter((transaction) => transaction.status === 'pending').length,
      failedTransfers: transactions.filter((transaction) => transaction.status === 'failed').length,
      flaggedTransfers: transactions.filter(
        (transaction) => transaction.risk && (transaction.risk.requiresReview || transaction.risk.level !== 'low'),
      ).length,
      thisMonthCount: successfulOrPending.filter((transaction) => {
        const transactionDate = new Date(transaction.timestamp);
        return (
          transactionDate.getUTCFullYear() === now.getUTCFullYear() &&
          transactionDate.getUTCMonth() === now.getUTCMonth()
        );
      }).length,
      thisMonthSent: round2(
        successfulOrPending
          .filter((transaction) => {
            const transactionDate = new Date(transaction.timestamp);
            return (
              transactionDate.getUTCFullYear() === now.getUTCFullYear() &&
              transactionDate.getUTCMonth() === now.getUTCMonth()
            );
          })
          .reduce((sum, transaction) => sum + transaction.amount, 0),
      ),
      averageTransfer: round2(
        successfulOnly.length
          ? successfulOnly.reduce((sum, transaction) => sum + transaction.amount, 0) / successfulOnly.length
          : 0,
      ),
      topCategory: undefined as string | undefined,
    };

    const monthlyMap = new Map<string, { month: string; sent: number; successful: number; failed: number; count: number }>();
    transactions.forEach((transaction) => {
      const date = new Date(transaction.timestamp);
      const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const existing = monthlyMap.get(monthKey) || {
        month: date.toLocaleString('en-US', { month: 'short' }),
        sent: 0,
        successful: 0,
        failed: 0,
        count: 0,
      };

      if (transaction.status !== 'failed') {
        existing.sent += transaction.amount;
      }
      if (transaction.status === 'completed') {
        existing.successful += transaction.amount;
      }
      if (transaction.status === 'failed') {
        existing.failed += transaction.amount;
      }
      existing.count += 1;
      monthlyMap.set(monthKey, existing);
    });

    const categoryMap = new Map<string, { category: string; value: number; count: number }>();
    successfulOrPending.forEach((transaction) => {
      const category = transaction.category || 'General transfers';
      const existing = categoryMap.get(category) || { category, value: 0, count: 0 };
      existing.value += transaction.amount;
      existing.count += 1;
      categoryMap.set(category, existing);
    });

    const categoryData = Array.from(categoryMap.values())
      .sort((a, b) => b.value - a.value)
      .map((entry) => ({
        ...entry,
        value: round2(entry.value),
      }));

    summary.topCategory = categoryData[0]?.category;

    const insights: SpendingInsightsDto = {
      summary,
      monthlyTransferData: Array.from(monthlyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([, value]) => ({
          ...value,
          sent: round2(value.sent),
          successful: round2(value.successful),
          failed: round2(value.failed),
        })),
      categoryData,
      topExpenses: successfulOnly
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3)
        .map((transaction) => ({
          id: transaction.id,
          recipientName: transaction.recipientName,
          amount: transaction.amount,
          category: transaction.category || 'General transfers',
          timestamp: transaction.timestamp,
          status: transaction.status,
        })),
    };

    this.insightsCache.set(userId, {
      expiresAt: Date.now() + config.performance.activityCacheTtlMs,
      value: insights,
    });
    await setCachedJson(`activity:insights:${userId}`, insights, config.cache.activityCacheTtlSeconds);

    return insights;
  }

  async getAdminFeeAnalytics(): Promise<AdminFeeAnalyticsDto> {
    const records = await this.repository.listAll();
    const now = new Date();
    const monthlyMap = new Map<string, { month: string; volume: number; fees: number; transfers: number }>();
    const corridorMap = new Map<string, { corridor: string; volume: number; fees: number; transfers: number }>();

    let totalVolume = 0;
    let totalFees = 0;
    let totalServiceFees = 0;
    let totalNetworkFees = 0;
    let settledTransfers = 0;
    let pendingTransfers = 0;
    let failedTransfers = 0;
    let thisMonthFees = 0;
    let thisMonthVolume = 0;
    let trailing30Fees = 0;
    let trailing30Volume = 0;
    let trailing30Transfers = 0;
    let previous30Fees = 0;
    let previous30Volume = 0;
    let previous30Transfers = 0;
    const trailing30Cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const previous30Cutoff = now.getTime() - 60 * 24 * 60 * 60 * 1000;

    records.forEach((record) => {
      const fees = getFees(record.metadata);
      const recordDate = new Date(record.createdAt);
      totalVolume += record.amount;
      totalFees += fees.totalFee;
      totalServiceFees += fees.serviceFee;
      totalNetworkFees += fees.networkFee;

      if (record.state === 'settled') {
        settledTransfers += 1;
      } else if (record.state === 'failed') {
        failedTransfers += 1;
      } else {
        pendingTransfers += 1;
      }

      if (
        recordDate.getUTCFullYear() === now.getUTCFullYear() &&
        recordDate.getUTCMonth() === now.getUTCMonth()
      ) {
        thisMonthFees += fees.totalFee;
        thisMonthVolume += record.amount;
      }

      const ts = recordDate.getTime();
      if (ts >= trailing30Cutoff) {
        trailing30Fees += fees.totalFee;
        trailing30Volume += record.amount;
        trailing30Transfers += 1;
      } else if (ts >= previous30Cutoff) {
        previous30Fees += fees.totalFee;
        previous30Volume += record.amount;
        previous30Transfers += 1;
      }

      const monthKey = `${recordDate.getUTCFullYear()}-${String(recordDate.getUTCMonth() + 1).padStart(2, '0')}`;
      const monthEntry = monthlyMap.get(monthKey) || {
        month: recordDate.toLocaleString('en-US', { month: 'short' }),
        volume: 0,
        fees: 0,
        transfers: 0,
      };
      monthEntry.volume += record.amount;
      monthEntry.fees += fees.totalFee;
      monthEntry.transfers += 1;
      monthlyMap.set(monthKey, monthEntry);

      const corridorKey = record.recipient.country || 'Unknown';
      const corridorEntry = corridorMap.get(corridorKey) || {
        corridor: corridorKey,
        volume: 0,
        fees: 0,
        transfers: 0,
      };
      corridorEntry.volume += record.amount;
      corridorEntry.fees += fees.totalFee;
      corridorEntry.transfers += 1;
      corridorMap.set(corridorKey, corridorEntry);
    });

    const monthlySeries = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([, entry]) => ({
        month: entry.month,
        volume: round2(entry.volume),
        fees: round2(entry.fees),
        transfers: entry.transfers,
      }));

    const feesGrowthPct =
      previous30Fees > 0 ? round2(((trailing30Fees - previous30Fees) / previous30Fees) * 100) : 0;
    const volumeGrowthPct =
      previous30Volume > 0
        ? round2(((trailing30Volume - previous30Volume) / previous30Volume) * 100)
        : 0;
    const transfersGrowthPct =
      previous30Transfers > 0
        ? round2(((trailing30Transfers - previous30Transfers) / previous30Transfers) * 100)
        : 0;

    const forecast = this.buildForecast(monthlySeries, 3);

    return {
      summary: {
        totalTransfers: records.length,
        settledTransfers,
        pendingTransfers,
        failedTransfers,
        totalVolume: round2(totalVolume),
        totalFees: round2(totalFees),
        totalServiceFees: round2(totalServiceFees),
        totalNetworkFees: round2(totalNetworkFees),
        averageFeeRate: totalVolume > 0 ? round2((totalFees / totalVolume) * 100) : 0,
        thisMonthFees: round2(thisMonthFees),
        thisMonthVolume: round2(thisMonthVolume),
      },
      monthlyFees: monthlySeries,
      growth: {
        feesGrowthPct,
        volumeGrowthPct,
        transfersGrowthPct,
        windowDays: 30,
      },
      forecast,
      historicalComparison: {
        trailing30Days: {
          volume: round2(trailing30Volume),
          fees: round2(trailing30Fees),
          transfers: trailing30Transfers,
        },
        previous30Days: {
          volume: round2(previous30Volume),
          fees: round2(previous30Fees),
          transfers: previous30Transfers,
        },
      },
      corridorFees: Array.from(corridorMap.values())
        .sort((a, b) => b.fees - a.fees)
        .slice(0, 6)
        .map((entry) => ({
          corridor: entry.corridor,
          volume: round2(entry.volume),
          fees: round2(entry.fees),
          transfers: entry.transfers,
        })),
      recentTransfers: records.slice(0, 8).map((record) => {
        const fees = getFees(record.metadata);
        return {
          id: record.id,
          userId: record.userId,
          state: record.state,
          amount: round2(record.amount),
          fees: fees.totalFee,
          serviceFee: fees.serviceFee,
          networkFee: fees.networkFee,
          country: record.recipient.country,
          createdAt: record.createdAt,
        };
      }),
    };
  }

  private buildForecast(
    monthlyFees: Array<{ month: string; volume: number; fees: number; transfers: number }>,
    months: number,
  ) {
    if (monthlyFees.length === 0) {
      return [];
    }

    const recent = monthlyFees.slice(-Math.min(6, monthlyFees.length));
    const feeDelta = this.averageDelta(recent.map((m) => m.fees));
    const volumeDelta = this.averageDelta(recent.map((m) => m.volume));
    const transferDelta = this.averageDelta(recent.map((m) => m.transfers));

    const last = recent[recent.length - 1];
    const start = new Date();
    const output: Array<{
      month: string;
      projectedVolume: number;
      projectedFees: number;
      projectedTransfers: number;
    }> = [];

    for (let i = 1; i <= months; i += 1) {
      const monthDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      output.push({
        month: monthDate.toLocaleString('en-US', { month: 'short' }),
        projectedFees: round2(Math.max(0, last.fees + feeDelta * i)),
        projectedVolume: round2(Math.max(0, last.volume + volumeDelta * i)),
        projectedTransfers: Math.max(0, Math.round(last.transfers + transferDelta * i)),
      });
    }

    return output;
  }

  private averageDelta(values: number[]) {
    if (values.length < 2) {
      return 0;
    }
    let total = 0;
    for (let i = 1; i < values.length; i += 1) {
      total += values[i] - values[i - 1];
    }
    return total / (values.length - 1);
  }

  async searchTransactions(
    userId: string,
    params: TransactionSearchParams,
  ): Promise<{ items: ActivityTransactionDto[]; total: number; benchmark: TransactionSearchBenchmarkDto }> {
    const result = await this.repository.searchByUserId(userId, params);
    return {
      items: result.records.map((record) => this.toTransactionDto(record)),
      total: result.total,
      benchmark: result.benchmark,
    };
  }

  listNotifications(userId: string, limit = 5) {
    return this.notifications.listByUserId(userId, limit);
  }

  async invalidateUser(userId: string) {
    this.insightsCache.delete(userId);
    Array.from(this.transactionCache.keys())
      .filter((key) => key.startsWith(`activity:transactions:${userId}:`))
      .forEach((key) => this.transactionCache.delete(key));
    await deleteCachedKeys(`activity:transactions:${userId}:*`);
    await deleteCachedKeys(`activity:insights:${userId}`);
  }

  private toTransactionDto(record: TransferRecord): ActivityTransactionDto {
    const status =
      record.state === 'settled'
        ? 'completed'
        : record.state === 'failed'
          ? 'failed'
          : 'pending';
    const fees = getFees(record.metadata);
    const identifier = String(record.recipient.metadata?.identifier || '');
    const recipientName = String(record.recipient.metadata?.name || identifier || 'Recipient');
    const destinationCurrency = getDestinationCurrency(record);
    return {
      id: record.id,
      type: 'send',
      amount: round2(record.amount),
      fee: fees.totalFee,
      recipientAmount: round2(Math.max(0, record.amount - fees.totalFee)),
      recipientName,
      recipientPhone: identifier,
      status,
      timestamp: record.createdAt,
      exchangeRate: typeof record.metadata?.exchange_rate === 'number' ? Number(record.metadata.exchange_rate) : undefined,
      destinationCurrency,
      category: getCategory(record, destinationCurrency),
      notes: record.lastError || record.statusHistory[record.statusHistory.length - 1]?.notes,
      txHash: record.transactionHash,
      explorerUrl: record.transactionHash
        ? `https://stellar.expert/explorer/public/tx/${record.transactionHash}`
        : undefined,
      risk: record.fraud
        ? {
            score: record.fraud.score,
            level: record.fraud.level,
            flags: record.fraud.flags,
            requiresReview: record.fraud.requiresReview,
            loggedAt: record.fraud.loggedAt,
          }
        : undefined,
    };
  }
}

function getFees(metadata?: Record<string, unknown>) {
  const networkFee = numberFromUnknown(metadata?.network_fee);
  const serviceFee = numberFromUnknown(metadata?.service_fee);
  return {
    networkFee,
    serviceFee,
    totalFee: round2(networkFee + serviceFee),
  };
}

function getDestinationCurrency(record: TransferRecord) {
  const explicitCurrency = typeof record.recipient.metadata?.destination_currency === 'string'
    ? record.recipient.metadata.destination_currency
    : undefined;

  if (explicitCurrency) {
    return explicitCurrency;
  }

  const country = record.recipient.country?.toUpperCase();
  const byCountry: Record<string, string> = {
    MX: 'MXN',
    PH: 'PHP',
    GT: 'GTQ',
    SV: 'USD',
    US: 'USD',
  };

  return country ? byCountry[country] : undefined;
}

function getCategory(record: TransferRecord, destinationCurrency?: string) {
  if (record.recipient.type === 'cash_pickup') {
    return `${destinationCurrency || record.recipient.country || 'Cash'} cash pickup`;
  }
  if (record.recipient.type === 'bank') {
    return `${destinationCurrency || record.recipient.country || 'Bank'} bank transfer`;
  }
  return `${destinationCurrency || 'Wallet'} wallet transfer`;
}

function numberFromUnknown(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

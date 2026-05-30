import { logger } from '../../logger';

export interface CashFlowSummary {
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  inflowCount: number;
  outflowCount: number;
  averageInflow: number;
  averageOutflow: number;
  projectedInflow: number;
  projectedOutflow: number;
}

export interface MonthlyCashFlow {
  month: string;
  year: number;
  monthLabel: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  transactionCount: number;
}

export interface CashFlowTrend {
  daily: DailyCashFlow[];
  weekly: WeeklyCashFlow[];
  monthly: MonthlyCashFlow[];
}

export interface DailyCashFlow {
  date: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  transactionCount: number;
}

export interface WeeklyCashFlow {
  weekStart: string;
  weekEnd: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  transactionCount: number;
}

export interface TopRecipient {
  recipientId: string;
  recipientName: string;
  totalSent: number;
  transactionCount: number;
  averageAmount: number;
}

export interface TopSource {
  source: string;
  totalReceived: number;
  transactionCount: number;
}

export class CashFlowAnalyticsService {
  private dailyData: DailyCashFlow[] = [];
  private monthlyData: MonthlyCashFlow[] = [];

  constructor() {
    this.seedDemoData();
  }

  private seedDemoData() {
    const now = new Date();
    const daily: DailyCashFlow[] = [];
    const monthly: MonthlyCashFlow[] = [];

    for (let d = 89; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const dayStr = date.toISOString().slice(0, 10);

      const inflow = Math.round(Math.random() * 8000 + 500);
      const outflow = Math.round(Math.random() * 6000 + 200);
      daily.push({
        date: dayStr,
        inflow,
        outflow,
        netFlow: inflow - outflow,
        transactionCount: Math.floor(Math.random() * 30 + 5),
      });
    }

    for (let m = 5; m >= 0; m--) {
      const date = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const inflow = Math.round(Math.random() * 150000 + 30000);
      const outflow = Math.round(Math.random() * 100000 + 20000);
      monthly.push({
        month: String(month).padStart(2, '0'),
        year,
        monthLabel: label,
        inflow,
        outflow,
        netFlow: inflow - outflow,
        transactionCount: Math.floor(Math.random() * 500 + 100),
      });
    }

    this.dailyData = daily;
    this.monthlyData = monthly;
  }

  getSummary(): CashFlowSummary {
    const totalInflow = this.dailyData.reduce((sum, d) => sum + d.inflow, 0);
    const totalOutflow = this.dailyData.reduce((sum, d) => sum + d.outflow, 0);
    const inflowCount = this.dailyData.reduce((sum, d) => sum + d.transactionCount, 0);

    const avgInflow = this.dailyData.length > 0
      ? Math.round(totalInflow / this.dailyData.length)
      : 0;
    const avgOutflow = this.dailyData.length > 0
      ? Math.round(totalOutflow / this.dailyData.length)
      : 0;

    const last30Inflow = this.dailyData.slice(-30).reduce((sum, d) => sum + d.inflow, 0);
    const last30Outflow = this.dailyData.slice(-30).reduce((sum, d) => sum + d.outflow, 0);

    return {
      totalInflow,
      totalOutflow,
      netFlow: totalInflow - totalOutflow,
      inflowCount,
      outflowCount: inflowCount,
      averageInflow: avgInflow,
      averageOutflow: avgOutflow,
      projectedInflow: Math.round(last30Inflow * 3),
      projectedOutflow: Math.round(last30Outflow * 3),
    };
  }

  getMonthlyData(months = 6): MonthlyCashFlow[] {
    return this.monthlyData.slice(-months);
  }

  getTrend(days = 90): CashFlowTrend {
    const daily = this.dailyData.slice(-days);
    const weekly: WeeklyCashFlow[] = [];

    for (let i = 0; i < daily.length; i += 7) {
      const week = daily.slice(i, i + 7);
      if (week.length === 0) continue;
      weekly.push({
        weekStart: week[0].date,
        weekEnd: week[week.length - 1].date,
        inflow: week.reduce((s, d) => s + d.inflow, 0),
        outflow: week.reduce((s, d) => s + d.outflow, 0),
        netFlow: week.reduce((s, d) => s + d.netFlow, 0),
        transactionCount: week.reduce((s, d) => s + d.transactionCount, 0),
      });
    }

    return { daily, weekly, monthly: this.monthlyData };
  }

  getTopRecipients(limit = 10): TopRecipient[] {
    return [
      { recipientId: 'recipient_demo_1', recipientName: 'Maria Garcia', totalSent: 45000, transactionCount: 24, averageAmount: 1875 },
      { recipientId: 'recipient_demo_2', recipientName: 'John Okafor', totalSent: 120000, transactionCount: 12, averageAmount: 10000 },
      { recipientId: 'recipient_demo_3', recipientName: 'Aisha Patel', totalSent: 28000, transactionCount: 8, averageAmount: 3500 },
      { recipientId: 'recipient_demo_4', recipientName: 'Carlos Mendez', totalSent: 15000, transactionCount: 6, averageAmount: 2500 },
      { recipientId: 'recipient_demo_5', recipientName: 'Yuki Tanaka', totalSent: 9500, transactionCount: 5, averageAmount: 1900 },
    ].slice(0, limit);
  }

  getTopSources(limit = 10): TopSource[] {
    return [
      { source: 'Bank Transfer', totalReceived: 180000, transactionCount: 45 },
      { source: 'Card Payment', totalReceived: 95000, transactionCount: 120 },
      { source: 'Crypto Deposit', totalReceived: 50000, transactionCount: 18 },
      { source: 'Mobile Money', totalReceived: 35000, transactionCount: 60 },
      { source: 'Wire Transfer', totalReceived: 12000, transactionCount: 8 },
    ].slice(0, limit);
  }
}

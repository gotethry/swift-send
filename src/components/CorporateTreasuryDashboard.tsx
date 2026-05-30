import { Building2, Wallet, TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WalletAllocation {
  name: string;
  balance: number;
  currency: string;
  percentage: number;
}

interface CorporateTreasuryDashboardProps {
  orgName?: string;
  totalBalance?: number;
  wallets?: WalletAllocation[];
  balanceTrend?: number; // % change
}

const DEFAULT_WALLETS: WalletAllocation[] = [
  { name: 'Operations', balance: 42500, currency: 'USDC', percentage: 55 },
  { name: 'Payroll',    balance: 18300, currency: 'USDC', percentage: 24 },
  { name: 'Reserve',   balance: 16200, currency: 'USDC', percentage: 21 },
];

export function CorporateTreasuryDashboard({
  orgName = 'My Organization',
  totalBalance = 77000,
  wallets = DEFAULT_WALLETS,
  balanceTrend = 4.2,
}: CorporateTreasuryDashboardProps) {
  const isUp = balanceTrend >= 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold">{orgName} — Treasury</h2>
      </div>

      {/* Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Treasury Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold">${totalBalance.toLocaleString()} USDC</span>
            <span className={`flex items-center gap-1 text-sm font-medium ${isUp ? 'text-green-600' : 'text-red-500'}`}>
              {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {isUp ? '+' : ''}{balanceTrend}% this month
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Wallet allocation breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Wallet Allocation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {wallets.map((w) => (
            <div key={w.name} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  <Wallet className="h-3 w-3 text-muted-foreground" />
                  {w.name}
                </span>
                <span className="font-medium">${w.balance.toLocaleString()} {w.currency}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${w.percentage}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{w.percentage}% of total</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quick action */}
      <button className="flex items-center gap-2 text-sm text-primary hover:underline">
        <ArrowUpRight className="h-4 w-4" /> View full treasury report
      </button>
    </div>
  );
}

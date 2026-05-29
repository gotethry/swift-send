import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, RefreshCw, Send, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/types';

interface QuickActionsWidgetProps {
  transactions: Transaction[];
  onRefreshBalance: () => Promise<unknown>;
}

interface RecentRecipient {
  name: string;
  phone: string;
  transferCount: number;
  lastAmount: number;
}

export function QuickActionsWidget({ transactions, onRefreshBalance }: QuickActionsWidgetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const recentRecipients = useMemo(() => {
    const recipients = new Map<string, RecentRecipient>();

    transactions
      .filter((transaction) => transaction.type === 'send')
      .forEach((transaction) => {
        const key = transaction.recipientPhone || transaction.recipientName;
        const existing = recipients.get(key);
        recipients.set(key, {
          name: transaction.recipientName,
          phone: transaction.recipientPhone,
          transferCount: (existing?.transferCount || 0) + 1,
          lastAmount: transaction.amount,
        });
      });

    return Array.from(recipients.values()).slice(0, 3);
  }, [transactions]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        onRefreshBalance(),
        queryClient.invalidateQueries({ queryKey: ['activity'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
      toast.success('Balance and activity refreshed');
    } catch {
      toast.error('Could not refresh balance right now');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh balance and activity"
            className="h-9 w-9 p-0"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Button
            className="h-12 justify-start gap-2"
            onClick={() => navigate('/send')}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Quick send
          </Button>
          <Button
            variant="outline"
            className="h-12 justify-start gap-2"
            onClick={() => navigate('/add-funds')}
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            Add funds
          </Button>
        </div>

        {recentRecipients.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Recent recipients</p>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => navigate('/send')}>
                See all
              </Button>
            </div>
            <div className="space-y-2">
              {recentRecipients.map((recipient) => (
                <button
                  key={recipient.phone || recipient.name}
                  type="button"
                  onClick={() =>
                    navigate('/send', {
                      state: {
                        recipientName: recipient.name,
                        recipientPhone: recipient.phone,
                      },
                    })
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Quick send to ${recipient.name}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{recipient.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{recipient.phone}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    ${recipient.lastAmount.toFixed(0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

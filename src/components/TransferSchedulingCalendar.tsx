import { CalendarDays, Clock, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ScheduledTransfer {
  id: string;
  recipientName: string;
  amount: number;
  currency: string;
  scheduledDate: string; // ISO date string
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
}

interface TransferSchedulingCalendarProps {
  transfers?: ScheduledTransfer[];
  onEdit?: (id: string) => void;
  onCancel?: (id: string) => void;
}

const STATUS_STYLES: Record<ScheduledTransfer['status'], string> = {
  pending:    'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  completed:  'bg-green-100 text-green-700',
  cancelled:  'bg-gray-100 text-gray-500',
};

const DEFAULT_TRANSFERS: ScheduledTransfer[] = [
  { id: '1', recipientName: 'Maria Garcia',  amount: 500,  currency: 'USDC', scheduledDate: '2026-06-02', status: 'pending'    },
  { id: '2', recipientName: 'John Doe',      amount: 1200, currency: 'USDC', scheduledDate: '2026-06-05', status: 'pending'    },
  { id: '3', recipientName: 'Acme Corp',     amount: 3000, currency: 'USDC', scheduledDate: '2026-06-10', status: 'processing' },
  { id: '4', recipientName: 'Sara Ahmed',    amount: 250,  currency: 'USDC', scheduledDate: '2026-05-28', status: 'completed'  },
];

function groupByDate(transfers: ScheduledTransfer[]): Map<string, ScheduledTransfer[]> {
  const map = new Map<string, ScheduledTransfer[]>();
  for (const t of transfers) {
    const key = t.scheduledDate;
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return new Map([...map.entries()].sort());
}

export function TransferSchedulingCalendar({
  transfers = DEFAULT_TRANSFERS,
  onEdit,
  onCancel,
}: TransferSchedulingCalendarProps) {
  const grouped = groupByDate(transfers);
  const upcoming = transfers.filter((t) => t.status === 'pending' || t.status === 'processing');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <CalendarDays className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold">Scheduled Transfers</h2>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <Clock className="inline h-4 w-4 mr-1" />
            {upcoming.length} upcoming transfer{upcoming.length !== 1 ? 's' : ''}
          </p>
        </CardContent>
      </Card>

      {[...grouped.entries()].map(([date, items]) => (
        <div key={date}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <div className="space-y-2">
            {items.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-1 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{t.recipientName}</CardTitle>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[t.status]}`}>
                      {t.status}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex items-center justify-between">
                  <span className="text-base font-bold">{t.amount.toLocaleString()} {t.currency}</span>
                  {(t.status === 'pending') && (
                    <div className="flex items-center gap-2">
                      {onEdit && (
                        <button onClick={() => onEdit(t.id)} className="text-muted-foreground hover:text-primary transition-colors" aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {onCancel && (
                        <button onClick={() => onCancel(t.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Cancel">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

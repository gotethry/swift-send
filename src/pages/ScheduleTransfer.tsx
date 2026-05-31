import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BottomNav } from '@/components/BottomNav';
import { ArrowLeft, Clock, Calendar, CheckCircle2, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useScheduledTransfer, type ScheduledTransfer } from '@/hooks/useScheduledTransfer';

const STATUS_META: Record<
  ScheduledTransfer['status'],
  { label: string; icon: React.ReactNode; color: string }
> = {
  pending: { label: 'Pending', icon: <Clock className="w-4 h-4" />, color: 'text-yellow-600 bg-yellow-50' },
  processing: { label: 'Processing', icon: <Loader2 className="w-4 h-4 animate-spin" />, color: 'text-blue-600 bg-blue-50' },
  completed: { label: 'Completed', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-green-600 bg-green-50' },
  failed: { label: 'Failed', icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-600 bg-red-50' },
  cancelled: { label: 'Cancelled', icon: <XCircle className="w-4 h-4" />, color: 'text-gray-500 bg-gray-100' },
};

function minDatetimeLocal(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

export default function ScheduleTransfer() {
  const navigate = useNavigate();
  const { scheduled, pending, schedule, cancel } = useScheduledTransfer();

  const [tab, setTab] = useState<'new' | 'list'>('new');
  const [form, setForm] = useState({
    recipientIdentifier: '',
    recipientName: '',
    amount: '',
    currency: 'USDC',
    scheduledAt: '',
    notes: '',
    notifyBeforeMs: 3600000,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.recipientIdentifier.trim()) {
      toast.error('Recipient is required');
      return;
    }
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!form.scheduledAt) {
      toast.error('Select a date and time');
      return;
    }
    if (new Date(form.scheduledAt).getTime() <= Date.now()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    setSubmitting(true);
    try {
      schedule({
        recipientIdentifier: form.recipientIdentifier.trim(),
        recipientName: form.recipientName.trim() || undefined,
        amount: amt,
        currency: form.currency,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        notes: form.notes.trim() || undefined,
        notifyBeforeMs: form.notifyBeforeMs,
      });
      toast.success('Transfer scheduled');
      setForm({ recipientIdentifier: '', recipientName: '', amount: '', currency: 'USDC', scheduledAt: '', notes: '', notifyBeforeMs: 3600000 });
      setTab('list');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule transfer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Schedule Transfer</h1>
      </div>

      <div className="flex border-b bg-white">
        {(['new', 'list'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
            }`}
          >
            {t === 'new' ? 'New Schedule' : `Scheduled (${pending.length})`}
          </button>
        ))}
      </div>

      {tab === 'new' ? (
        <div className="px-4 py-6 space-y-4">
          <div>
            <Label htmlFor="recipient">Recipient (email / phone / wallet) *</Label>
            <Input
              id="recipient"
              value={form.recipientIdentifier}
              onChange={(e) => setForm({ ...form, recipientIdentifier: e.target.value })}
              placeholder="john@example.com"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="recipientName">Recipient Name (optional)</Label>
            <Input
              id="recipientName"
              value={form.recipientName}
              onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
              placeholder="John Doe"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="USDC">USDC</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="scheduledAt">Send Date & Time *</Label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                id="scheduledAt"
                type="datetime-local"
                min={minDatetimeLocal()}
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notifyBefore">Notify me before</Label>
            <select
              id="notifyBefore"
              value={form.notifyBeforeMs}
              onChange={(e) => setForm({ ...form, notifyBeforeMs: Number(e.target.value) })}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value={900000}>15 minutes</option>
              <option value={1800000}>30 minutes</option>
              <option value={3600000}>1 hour</option>
              <option value={86400000}>24 hours</option>
            </select>
          </div>

          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Rent payment, invoice #123…"
              className="mt-1"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-2"
          >
            {submitting ? 'Scheduling…' : 'Schedule Transfer'}
          </Button>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-3">
          {scheduled.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-gray-400">
              <Clock className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No scheduled transfers</p>
              <Button variant="outline" onClick={() => setTab('new')} className="mt-4 text-sm">
                Schedule one now
              </Button>
            </div>
          ) : (
            scheduled.map((t) => {
              const meta = STATUS_META[t.status];
              return (
                <div key={t.id} className="bg-white rounded-xl shadow-sm border px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {t.recipientName || t.recipientIdentifier}
                      </p>
                      {t.recipientName && (
                        <p className="text-xs text-gray-400 truncate">{t.recipientIdentifier}</p>
                      )}
                      <p className="text-sm font-semibold text-blue-700 mt-1">
                        {t.amount.toFixed(2)} {t.currency}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(t.scheduledAt).toLocaleString()}
                      </p>
                      {t.notes && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{t.notes}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                      {t.status === 'pending' && (
                        <button
                          onClick={() => cancel(t.id)}
                          className="text-xs text-red-500 hover:text-red-600 font-medium"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
}

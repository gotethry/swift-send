import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, History, KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useWallet } from '@/contexts/WalletContext';
import {
  approveWalletRecoveryRequest,
  completeWalletRecoveryRequest,
  createWalletRecoveryRequest,
  fetchWalletRecoveryAuditLogs,
  fetchWalletRecoveryRequests,
  type WalletRecoveryRequest,
} from '@/services/walletRecovery';

const RECOVERY_QUERY_KEY = ['wallet-recovery'];

export function GuardianRecoveryWorkflow() {
  const queryClient = useQueryClient();
  const { connectionState } = useWallet();
  const activeWalletId = connectionState.activeWalletId;
  const activeWallet = connectionState.linkedWallets.find((wallet) => wallet.id === activeWalletId);
  const [guardianIdentifier, setGuardianIdentifier] = useState('');
  const [recoveryPublicKey, setRecoveryPublicKey] = useState('');
  const [reason, setReason] = useState('');
  const [approvalCode, setApprovalCode] = useState('');
  const [approvalNote, setApprovalNote] = useState('');

  const requestsQuery = useQuery({
    queryKey: [...RECOVERY_QUERY_KEY, 'requests'],
    queryFn: fetchWalletRecoveryRequests,
  });

  const auditQuery = useQuery({
    queryKey: [...RECOVERY_QUERY_KEY, 'audit'],
    queryFn: () => fetchWalletRecoveryAuditLogs(6),
  });

  const requests = requestsQuery.data?.items || [];
  const latestRequest = requests[0];
  const pendingApprovalRequest = requests.find((request) => request.status === 'pending_guardian');
  const approvedRequest = requests.find((request) => request.status === 'approved');

  const createMutation = useMutation({
    mutationFn: () =>
      createWalletRecoveryRequest({
        guardianIdentifier,
        currentWalletId: activeWallet?.id,
        recoveryWallet: {
          publicKey: recoveryPublicKey,
          provider: 'guardian-recovery',
          label: 'Recovered wallet',
        },
        reason,
      }),
    onSuccess: (result) => {
      setApprovalCode(result.request.approvalCode);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: RECOVERY_QUERY_KEY });
      toast.success('Recovery request created');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create recovery request');
    },
  });

  const approveMutation = useMutation({
    mutationFn: (request: WalletRecoveryRequest) =>
      approveWalletRecoveryRequest(request.id, {
        guardianIdentifier: guardianIdentifier || request.guardianIdentifier,
        approvalCode,
        note: approvalNote,
      }),
    onSuccess: () => {
      setApprovalNote('');
      void queryClient.invalidateQueries({ queryKey: RECOVERY_QUERY_KEY });
      toast.success('Guardian approval recorded');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not approve recovery request');
    },
  });

  const completeMutation = useMutation({
    mutationFn: (requestId: string) => completeWalletRecoveryRequest(requestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RECOVERY_QUERY_KEY });
      toast.success('Recovered wallet linked');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not complete recovery');
    },
  });

  const statusLabel = useMemo(() => {
    if (!latestRequest) return 'No active request';
    return latestRequest.status.replace('_', ' ');
  }, [latestRequest]);

  const canCreateRequest = guardianIdentifier.trim().length > 3 && recoveryPublicKey.trim().length > 12;

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Guardian Recovery
          </CardTitle>
          <Badge variant={latestRequest?.status === 'completed' ? 'default' : 'secondary'}>{statusLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="guardian-identifier">Guardian email or phone</Label>
            <Input
              id="guardian-identifier"
              value={guardianIdentifier}
              onChange={(event) => setGuardianIdentifier(event.target.value)}
              placeholder="guardian@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recovery-wallet">Recovery wallet public key</Label>
            <Input
              id="recovery-wallet"
              value={recoveryPublicKey}
              onChange={(event) => setRecoveryPublicKey(event.target.value)}
              placeholder="G..."
              className="font-mono"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recovery-reason">Recovery reason</Label>
            <Textarea
              id="recovery-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Lost device, wallet rotation, or compromised key"
            />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canCreateRequest || createMutation.isPending}
            className="w-full"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Request recovery
          </Button>
        </div>

        {pendingApprovalRequest && (
          <Alert>
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Guardian approval pending</AlertTitle>
            <AlertDescription>
              Approval code <span className="font-mono font-semibold">{pendingApprovalRequest.approvalCode}</span>
            </AlertDescription>
          </Alert>
        )}

        {pendingApprovalRequest && (
          <div className="space-y-3 rounded-lg border border-border/70 p-3">
            <div className="grid gap-2">
              <Label htmlFor="approval-code">Guardian approval code</Label>
              <Input
                id="approval-code"
                value={approvalCode}
                onChange={(event) => setApprovalCode(event.target.value)}
                placeholder="Enter approval code"
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="approval-note">Guardian note</Label>
              <Input
                id="approval-note"
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
                placeholder="Optional approval note"
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => approveMutation.mutate(pendingApprovalRequest)}
              disabled={!approvalCode || approveMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Record guardian approval
            </Button>
          </div>
        )}

        {approvedRequest && (
          <Button
            className="w-full"
            onClick={() => completeMutation.mutate(approvedRequest.id)}
            disabled={completeMutation.isPending}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Complete recovery
          </Button>
        )}

        {auditQuery.data?.items.length ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Recovery audit log
            </div>
            <div className="space-y-2">
              {auditQuery.data.items.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium capitalize text-foreground">{entry.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {entry.actor} - {entry.requestId}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

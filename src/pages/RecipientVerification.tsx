import { useCallback, useEffect, useState } from 'react';
import { Shield, CheckCircle2, XCircle, Clock, UserCheck, FileText } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BadgeList, type VerificationBadgeData } from '@/components/VerificationBadge';

interface RecipientVerificationData {
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  status: string;
  badges: VerificationBadgeData[];
  methods: string[];
  verifiedAt?: string;
  lastCheckedAt: string;
  trustScore: number;
  totalTransfers: number;
  totalVolume: number;
  flags?: string[];
}

interface VerificationRequestData {
  id: string;
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  requestedMethod: string;
  status: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export default function RecipientVerification() {
  const [verifications, setVerifications] = useState<RecipientVerificationData[]>([]);
  const [requests, setRequests] = useState<VerificationRequestData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [verResponse, reqResponse] = await Promise.all([
        apiFetch('/admin/verifications'),
        apiFetch('/admin/verifications/requests'),
      ]);
      if (verResponse.ok) setVerifications(await verResponse.json());
      if (reqResponse.ok) setRequests(await reqResponse.json());
    } catch (error) {
      console.error('Failed to load verifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleApprove = async (requestId: string) => {
    const response = await apiFetch(`/admin/verifications/requests/${requestId}/approve`, {
      method: 'POST',
    });
    if (response.ok) {
      void fetchData();
    }
  };

  const handleReject = async (requestId: string) => {
    const response = await apiFetch(`/admin/verifications/requests/${requestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Rejected by admin' }),
    });
    if (response.ok) {
      void fetchData();
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case 'verified': return 'default';
      case 'pending': return 'secondary';
      case 'unverified': return 'outline';
      case 'flagged': return 'destructive';
      default: return 'outline';
    }
  };

  const trustScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500';
    if (score >= 40) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <UserCheck className="h-8 w-8" />
          Recipient Verification
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage recipient verification, badges, and trust indicators
        </p>
      </div>

      <Tabs defaultValue="recipients">
        <TabsList>
          <TabsTrigger value="recipients" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Verified Recipients
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Verification Requests
            {requests.filter((r) => r.status === 'pending').length > 0 && (
              <Badge variant="destructive" className="ml-1">
                {requests.filter((r) => r.status === 'pending').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recipients" className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading...
              </CardContent>
            </Card>
          ) : verifications.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No recipient verifications found
              </CardContent>
            </Card>
          ) : (
            verifications.map((v) => (
              <Card key={v.recipientId}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{v.recipientName}</h3>
                        <Badge variant={statusVariant(v.status)} className="text-xs">
                          {v.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{v.recipientPhone}</p>
                      <div className="mt-2">
                        <BadgeList badges={v.badges} size="sm" />
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{v.totalTransfers} transfers</span>
                        <span>${v.totalVolume.toLocaleString()} volume</span>
                        {v.verifiedAt && (
                          <span>Verified {new Date(v.verifiedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${trustScoreColor(v.trustScore)}`}>
                        {v.trustScore}
                      </div>
                      <p className="text-xs text-muted-foreground">trust score</p>
                      {v.flags && v.flags.length > 0 && (
                        <div className="mt-2">
                          {v.flags.map((flag) => (
                            <Badge key={flag} variant="destructive" className="text-xs">
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading...
              </CardContent>
            </Card>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No verification requests found
              </CardContent>
            </Card>
          ) : (
            requests.map((req) => (
              <Card key={req.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{req.recipientName}</h3>
                        <Badge
                          variant={req.status === 'pending' ? 'secondary' : req.status === 'approved' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {req.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{req.recipientPhone}</p>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>Method: {req.requestedMethod}</p>
                        <p>Requested: {new Date(req.requestedAt).toLocaleString()}</p>
                        {req.reviewedBy && <p>Reviewed by: {req.reviewedBy}</p>}
                        {req.rejectionReason && (
                          <p className="text-red-500">Reason: {req.rejectionReason}</p>
                        )}
                      </div>
                    </div>
                    {req.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(req.id)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(req.id)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

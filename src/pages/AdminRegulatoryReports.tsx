import { useMemo, useState } from 'react';
import { Download, FileText, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiUrl } from '@/lib/api';

export default function AdminRegulatoryReports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const txCsvHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('format', 'csv');
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    return apiUrl(`/admin/reports/transactions/summary?${params.toString()}`);
  }, [from, to]);

  const complianceHref = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set('fromDate', new Date(from).toISOString());
    if (to) params.set('toDate', new Date(to).toISOString());
    return apiUrl(`/admin/reports/compliance/audit?${params.toString()}`);
  }, [from, to]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" />
          Regulatory Reporting
        </h1>
        <p className="text-muted-foreground mt-2">
          Generate compliance and transaction summary exports (admin only)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report window</CardTitle>
          <CardDescription>Optional date range filter for exports</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Transaction summary export (CSV)
            </CardTitle>
            <CardDescription>Export transfers with fraud/risk fields for regulatory review</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href={txCsvHref}>Download CSV</a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Compliance audit report (JSON)
            </CardTitle>
            <CardDescription>Compliance/audit chain report from the admin audit subsystem</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <a href={complianceHref} target="_blank" rel="noreferrer">
                Open report
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


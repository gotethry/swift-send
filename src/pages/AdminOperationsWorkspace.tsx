import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  Globe,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  FileText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ComplianceLog {
  id: string;
  userId: string;
  transferId?: string;
  checkType: string;
  status: string;
  riskScore: number;
  flags: string[];
  metadata: Record<string, unknown>;
  checkedAt: string;
  checkedBy: string;
  notes?: string;
}

interface EscrowEntry {
  id: string;
  transferId: string;
  userId?: string;
  amount: number;
  currency: string;
  status: "held" | "released" | "refunded" | "disputed" | "cancelled" | "expired";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  failureReason?: string;
}

interface CountryRiskSummary {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  exchangeRate: number | null;
  isRestricted: boolean;
  complianceRules: string[];
  cashOutMethods: Array<{ type: string; partnerName: string; deliveryMinMinutes: number; deliveryMaxMinutes: number }>;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
}

interface ResolutionDraft {
  state: string;
  notes: string;
}

const RESOLUTION_OPTIONS = ["open", "monitoring", "resolved", "escalated"];

export default function AdminOperationsWorkspace() {
  const [amlLogs, setAmlLogs] = useState<ComplianceLog[]>([]);
  const [expiringEscrows, setExpiringEscrows] = useState<EscrowEntry[]>([]);
  const [countryCode, setCountryCode] = useState("MX");
  const [countryRisk, setCountryRisk] = useState<CountryRiskSummary | null>(null);
  const [countryLoading, setCountryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [savingLogId, setSavingLogId] = useState<string | null>(null);
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, ResolutionDraft>>({});

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  const refreshWorkspace = async () => {
    setLoading(true);
    try {
      const [amlResponse, escrowResponse] = await Promise.all([
        apiFetch("/admin/compliance/flagged?limit=25"),
        apiFetch("/admin/escrow/expiring?hours=72"),
      ]);

      if (amlResponse.ok) {
        const data = (await amlResponse.json()) as ComplianceLog[];
        setAmlLogs(data);
        setResolutionDrafts((current) => {
          const nextDrafts = { ...current };
          for (const log of data) {
            if (!nextDrafts[log.id]) {
              nextDrafts[log.id] = parseResolutionDraft(log.notes);
            }
          }
          return nextDrafts;
        });
      }

      if (escrowResponse.ok) {
        const data = (await escrowResponse.json()) as EscrowEntry[];
        setExpiringEscrows(data);
      }
    } catch (error) {
      console.error("Failed to refresh operations workspace:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCountryRisk = async () => {
    const code = countryCode.trim().toUpperCase();
    if (!code) {
      return;
    }

    setCountryLoading(true);
    try {
      const response = await apiFetch(`/countries/${encodeURIComponent(code)}/transfer-info`);
      if (response.ok) {
        const data = (await response.json()) as CountryRiskSummary;
        setCountryRisk(data);
      }
    } catch (error) {
      console.error("Failed to load country risk:", error);
    } finally {
      setCountryLoading(false);
    }
  };

  const saveLogNotes = async (logId: string) => {
    const draft = resolutionDrafts[logId];
    if (!draft) {
      return;
    }

    setSavingLogId(logId);
    try {
      const notes = formatResolutionNotes(draft);
      const response = await apiFetch(`/admin/compliance/logs/${logId}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes }),
      });

      if (response.ok) {
        setAmlLogs((current) =>
          current.map((log) => (log.id === logId ? ({ ...log, notes } as ComplianceLog) : log)),
        );
      }
    } catch (error) {
      console.error("Failed to save AML notes:", error);
    } finally {
      setSavingLogId(null);
    }
  };

  const cleanupEscrows = async () => {
    setCleaningUp(true);
    try {
      const response = await apiFetch("/admin/escrow/cleanup-expired", {
        method: "POST",
      });
      if (response.ok) {
        await refreshWorkspace();
      }
    } catch (error) {
      console.error("Failed to clean up escrows:", error);
    } finally {
      setCleaningUp(false);
    }
  };

  const amlCount = amlLogs.length;
  const escrowCount = expiringEscrows.length;
  const riskSummary = countryRisk ? `${countryRisk.riskLevel.toUpperCase()} risk` : "No country analyzed";

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            Operations workspace
          </div>
          <h1 className="mt-2 text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Investigation and Risk Control
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Review flagged activity, manage escrow expirations, score destination countries, and keep push notifications pointed at the right screens.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refreshWorkspace()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={() => void loadCountryRisk()} disabled={countryLoading}>
            Analyze Country
            {countryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Flagged AML cases</p>
              <p className="text-2xl font-semibold">{amlCount}</p>
            </div>
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Expiring escrow items</p>
              <p className="text-2xl font-semibold">{escrowCount}</p>
            </div>
            <Clock3 className="h-6 w-6 text-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Country risk</p>
              <p className="text-2xl font-semibold">{riskSummary}</p>
            </div>
            <Globe className="h-6 w-6 text-emerald-500" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="aml" className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start gap-2">
          <TabsTrigger value="aml">AML investigation</TabsTrigger>
          <TabsTrigger value="escrow">Escrow expiration</TabsTrigger>
          <TabsTrigger value="risk">Country risk</TabsTrigger>
          <TabsTrigger value="routing">Push routing</TabsTrigger>
        </TabsList>

        <TabsContent value="aml" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Flagged transfer review</CardTitle>
              <CardDescription>
                Update investigation notes and resolution state for each flagged case.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {amlLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No flagged transfers are currently queued.</p>
              ) : (
                amlLogs.map((log) => {
                  const draft = resolutionDrafts[log.id] || parseResolutionDraft(log.notes);
                  return (
                    <div key={log.id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={statusBadgeVariant(log.status)}>{log.status}</Badge>
                            <Badge variant="outline">{log.checkType.toUpperCase()}</Badge>
                            <Badge variant="secondary">Risk {log.riskScore}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            User {log.userId}
                            {log.transferId ? ` • Transfer ${log.transferId}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Checked {formatDistanceToNow(new Date(log.checkedAt), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground lg:text-right">
                          <p>Checked by {log.checkedBy}</p>
                          <p>{formatResolutionLabel(draft.state)}</p>
                        </div>
                      </div>

                      {log.flags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {log.flags.map((flag) => (
                            <Badge key={flag} variant="outline">
                              {flag.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
                        <div>
                          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Resolution state
                          </label>
                          <select
                            value={draft.state}
                            onChange={(event) =>
                              setResolutionDrafts((current) => ({
                                ...current,
                                [log.id]: { ...draft, state: event.target.value },
                              }))
                            }
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            {RESOLUTION_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {formatResolutionLabel(option)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Notes
                          </label>
                          <Textarea
                            value={draft.notes}
                            onChange={(event) =>
                              setResolutionDrafts((current) => ({
                                ...current,
                                [log.id]: { ...draft, notes: event.target.value },
                              }))
                            }
                            rows={3}
                            placeholder="Summarize findings, next steps, or closure reason"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Stored notes are reused as the resolution record for this case.
                        </p>
                        <Button size="sm" onClick={() => void saveLogNotes(log.id)} disabled={savingLogId === log.id}>
                          {savingLogId === log.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          Save notes
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="escrow" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Escrow expiration queue</CardTitle>
                <CardDescription>
                  Escrows nearing their expiry window can be reviewed or cleaned up in one step.
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => void cleanupEscrows()} disabled={cleaningUp}>
                {cleaningUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Cleanup expired
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {expiringEscrows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No held escrows are approaching expiration.</p>
              ) : (
                expiringEscrows.map((escrow) => (
                  <div key={escrow.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={escrowBadgeVariant(escrow.status)}>{escrow.status}</Badge>
                          <Badge variant="outline">{escrow.currency}</Badge>
                          <Badge variant="secondary">{escrow.amount.toLocaleString()}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">Transfer {escrow.transferId}</p>
                        {escrow.userId && <p className="text-xs text-muted-foreground">User {escrow.userId}</p>}
                      </div>
                      <div className="text-sm text-muted-foreground lg:text-right">
                        <p>Expires {formatDistanceToNow(new Date(escrow.expiresAt), { addSuffix: true })}</p>
                        <p>Updated {formatDistanceToNow(new Date(escrow.updatedAt), { addSuffix: true })}</p>
                      </div>
                    </div>

                    {escrow.failureReason && (
                      <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                        {escrow.failureReason}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Country risk scoring</CardTitle>
              <CardDescription>
                Score jurisdictions using country metadata, compliance rules, and payment method coverage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={countryCode}
                  onChange={(event) => setCountryCode(event.target.value)}
                  placeholder="Enter ISO country code"
                  className="sm:max-w-[220px]"
                />
                <Button onClick={() => void loadCountryRisk()} disabled={countryLoading}>
                  {countryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  Analyze
                </Button>
              </div>

              {countryRisk ? (
                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={riskBadgeVariant(countryRisk.riskLevel)}>
                      {countryRisk.riskLevel} risk
                    </Badge>
                    <Badge variant="outline">Score {countryRisk.riskScore}</Badge>
                    <Badge variant="secondary">{countryRisk.countryCode}</Badge>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{countryRisk.countryName}</h3>
                    <p className="text-sm text-muted-foreground">
                      Currency {countryRisk.currencyCode} • Exchange rate {countryRisk.exchangeRate ?? "n/a"}
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium">Compliance rules</p>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {countryRisk.complianceRules.map((rule) => (
                          <li key={rule}>• {rule}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Cash-out methods</p>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {countryRisk.cashOutMethods.map((method) => (
                          <li key={`${method.type}-${method.partnerName}`}>
                            • {method.partnerName} ({method.type})
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {countryRisk.isRestricted && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      Restricted jurisdictions should be blocked or routed through enhanced review.
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Analyze a country to load its risk profile.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Push notification deep-link routing</CardTitle>
              <CardDescription>
                Notification clicks now prefer the explicit action URL, then fall back to a small set of route rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "Transfer settled or failed",
                  icon: Bell,
                  detail: "Opens the transfer history screen for the relevant transfer ID.",
                  route: "/history?transferId=:transferId",
                },
                {
                  title: "Escrow lifecycle events",
                  icon: Clock3,
                  detail: "Opens the operations workspace on the escrow tab for review and cleanup.",
                  route: "/admin/operations?tab=escrow&transferId=:transferId",
                },
                {
                  title: "AML review alerts",
                  icon: AlertTriangle,
                  detail: "Opens the operations workspace on the AML tab for investigation and notes.",
                  route: "/admin/operations?tab=aml&transferId=:transferId",
                },
                {
                  title: "Explicit action URL",
                  icon: ArrowRight,
                  detail: "Any notification can override the fallback with actionUrl for direct navigation.",
                  route: "notification.actionUrl",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <item.icon className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">{item.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
                  <p className="mt-3 text-xs font-mono text-muted-foreground break-all">{item.route}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function parseResolutionDraft(notes?: string): ResolutionDraft {
  const defaultDraft: ResolutionDraft = { state: "open", notes: notes || "" };
  if (!notes) {
    return defaultDraft;
  }

  const match = notes.match(/^Resolution:\s*([a-z]+)\s*\n([\s\S]*)$/i);
  if (!match) {
    return defaultDraft;
  }

  return {
    state: match[1].toLowerCase(),
    notes: match[2],
  };
}

function formatResolutionNotes(draft: ResolutionDraft) {
  const body = draft.notes.trim();
  return body ? `Resolution: ${draft.state}\n${body}` : `Resolution: ${draft.state}`;
}

function formatResolutionLabel(state: string) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "blocked":
      return "destructive" as const;
    case "flagged":
    case "manual_review":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function escrowBadgeVariant(status: EscrowEntry["status"]) {
  switch (status) {
    case "expired":
    case "disputed":
      return "destructive" as const;
    case "held":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function riskBadgeVariant(level: CountryRiskSummary["riskLevel"]) {
  switch (level) {
    case "high":
      return "destructive" as const;
    case "medium":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}
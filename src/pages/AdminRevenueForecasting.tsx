import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowUpRight, CalendarClock, DollarSign, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface FeeAnalyticsResponse {
  summary: {
    totalFees: number;
    totalVolume: number;
    totalTransfers: number;
  };
  monthlyFees: Array<{ month: string; volume: number; fees: number; transfers: number }>;
  growth?: {
    feesGrowthPct: number;
    volumeGrowthPct: number;
    transfersGrowthPct: number;
    windowDays: number;
  };
  forecast?: Array<{
    month: string;
    projectedVolume: number;
    projectedFees: number;
    projectedTransfers: number;
  }>;
  historicalComparison?: {
    trailing30Days: { volume: number; fees: number; transfers: number };
    previous30Days: { volume: number; fees: number; transfers: number };
  };
}

export default function AdminRevenueForecasting() {
  const [data, setData] = useState<FeeAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/admin/fees/analytics");
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const growth = data?.growth;
  const historical = data?.historicalComparison;
  const forecast = data?.forecast ?? [];
  const trend = data?.monthlyFees ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <TrendingUp className="h-8 w-8" />
          Revenue Forecasting Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Forecast fee trends, monitor transfer growth, and compare historical periods.
        </p>
      </div>

      {loading && !data ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading revenue analytics...
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Fees</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${data.summary.totalFees.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${data.summary.totalVolume.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Transfer Growth</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-1">
                  <ArrowUpRight className="h-4 w-4 text-green-500" />
                  {growth?.transfersGrowthPct ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Last {growth?.windowDays ?? 30} days vs previous window
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Transfers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.totalTransfers}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Revenue Trend and Forecast
                </CardTitle>
                <CardDescription>Historical monthly fees with next 3-month projection</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={[
                        ...trend.map((t) => ({ month: t.month, fees: t.fees, projectedFees: null })),
                        ...forecast.map((f) => ({
                          month: `${f.month} (F)`,
                          fees: null,
                          projectedFees: f.projectedFees,
                        })),
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="fees" stroke="hsl(var(--primary))" strokeWidth={2} />
                      <Line
                        type="monotone"
                        dataKey="projectedFees"
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="5 5"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Historical Comparison
                </CardTitle>
                <CardDescription>Trailing 30 days compared to prior 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          label: "Fees",
                          trailing: historical?.trailing30Days.fees ?? 0,
                          previous: historical?.previous30Days.fees ?? 0,
                        },
                        {
                          label: "Volume",
                          trailing: historical?.trailing30Days.volume ?? 0,
                          previous: historical?.previous30Days.volume ?? 0,
                        },
                        {
                          label: "Transfers",
                          trailing: historical?.trailing30Days.transfers ?? 0,
                          previous: historical?.previous30Days.transfers ?? 0,
                        },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="trailing" fill="hsl(var(--primary))" />
                      <Bar dataKey="previous" fill="hsl(var(--muted-foreground))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Growth Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Fee growth</p>
                <p className="text-2xl font-semibold">{growth?.feesGrowthPct ?? 0}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Volume growth</p>
                <p className="text-2xl font-semibold">{growth?.volumeGrowthPct ?? 0}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Transfer growth</p>
                <p className="text-2xl font-semibold">{growth?.transfersGrowthPct ?? 0}%</p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

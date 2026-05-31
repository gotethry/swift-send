import { TrendingUp, BarChart3, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ForecastPoint {
  label: string;
  actual?: number;
  forecast: number;
}

interface TransactionVolumeForecastingProps {
  data?: ForecastPoint[];
  currency?: string;
}

// Simple 7-day rolling average forecast from historical data
function computeForecast(history: number[]): number {
  if (history.length === 0) return 0;
  const window = history.slice(-7);
  return Math.round(window.reduce((a, b) => a + b, 0) / window.length);
}

const DEFAULT_DATA: ForecastPoint[] = [
  { label: 'Mon', actual: 12400, forecast: 11800 },
  { label: 'Tue', actual: 9800,  forecast: 10200 },
  { label: 'Wed', actual: 15600, forecast: 13000 },
  { label: 'Thu', actual: 11200, forecast: 12100 },
  { label: 'Fri', actual: 18900, forecast: 15400 },
  { label: 'Sat', forecast: 13200 },
  { label: 'Sun', forecast: 11900 },
];

export function TransactionVolumeForecasting({
  data = DEFAULT_DATA,
  currency = 'USDC',
}: TransactionVolumeForecastingProps) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.actual ?? 0, d.forecast)));
  const weeklyForecast = data.reduce((s, d) => s + (d.forecast ?? 0), 0);
  const historicalVals = data.filter((d) => d.actual !== undefined).map((d) => d.actual!);
  const dailyAvg = computeForecast(historicalVals);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold">Volume Forecasting</h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Weekly forecast
            </p>
            <p className="text-xl font-bold mt-1">${weeklyForecast.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{currency}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <BarChart3 className="h-3 w-3" /> Daily avg (7-day)
            </p>
            <p className="text-xl font-bold mt-1">${dailyAvg.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{currency}</p>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Daily Volume — Actual vs Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-32">
            {data.map((d) => (
              <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-0.5 justify-center h-24">
                  {d.actual !== undefined && (
                    <div
                      className="flex-1 rounded-t bg-primary"
                      style={{ height: `${(d.actual / maxVal) * 100}%` }}
                      title={`Actual: $${d.actual.toLocaleString()}`}
                    />
                  )}
                  <div
                    className="flex-1 rounded-t bg-primary/30 border border-primary/50"
                    style={{ height: `${(d.forecast / maxVal) * 100}%` }}
                    title={`Forecast: $${d.forecast.toLocaleString()}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-primary" /> Actual</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-primary/30 border border-primary/50" /> Forecast</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

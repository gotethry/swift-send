import { Shield, AlertTriangle, Activity, BarChart3, Server, FileWarning, Bell, Gauge, FileText, TrendingUp, Route, Search, UserCheck, DollarSign } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";

const adminCards = [
  {
    title: "Error Monitoring",
    description: "Track and monitor system errors across all services",
    icon: AlertTriangle,
    href: "/admin/errors",
    color: "text-red-500",
  },
  {
    title: "Compliance & AML",
    description: "Monitor AML checks and compliance logs",
    icon: Shield,
    href: "/admin/compliance",
    color: "text-blue-500",
  },
  {
    title: "Dead Letter Queue",
    description: "Manage failed transaction jobs requiring manual intervention",
    icon: FileWarning,
    href: "/admin/dlq",
    color: "text-orange-500",
  },
  {
    title: "Stellar Network Monitor",
    description: "Real-time Stellar network health and performance",
    icon: Server,
    href: "/admin/stellar",
    color: "text-purple-500",
  },
  {
    title: "Revenue Forecasting",
    description: "Forecast revenue trends and compare historical fee performance",
    icon: TrendingUp,
    href: "/admin/revenue-forecasting",
    color: "text-emerald-500",
  },
  {
    title: "Settlement Analytics",
    description: "Track settlement efficiency and failure rates",
    icon: BarChart3,
    href: "/admin/settlements",
    color: "text-green-500",
  },
  {
    title: "Failure Alerts",
    description: "Real-time transaction failure alerts and notifications",
    icon: Bell,
    href: "/admin/alerts",
    color: "text-red-500",
  },
  {
    title: "Operational Metrics",
    description: "Monitor API latency, throughput, and system uptime",
    icon: Gauge,
    href: "/admin/metrics",
    color: "text-blue-500",
  },
  {
    title: "API Rate Usage",
    description: "Track request volume and limiter lockouts across the platform",
    icon: Route,
    href: "/admin/api-usage",
    color: "text-indigo-500",
  },
  {
    title: "Regulatory Reports",
    description: "Generate compliance and transaction summary exports",
    icon: FileText,
    href: "/admin/reports",
    color: "text-green-500",
  },
  {
    title: "API Trace Viewer",
    description: "Inspect API request traces, correlation IDs, and errors",
    icon: Search,
    href: "/admin/traces",
    color: "text-cyan-500",
  },
  {
    title: "Recipient Verification",
    description: "Manage recipient badges, verification, and trust scores",
    icon: UserCheck,
    href: "/admin/verifications",
    color: "text-pink-500",
  },
  {
    title: "Threshold Rules",
    description: "Configure approval thresholds and rule management",
    icon: Shield,
    href: "/admin/thresholds",
    color: "text-amber-500",
  },
  {
    title: "Operations Workspace",
    description: "Review AML cases, escrow expiry, country risk, and notification routing",
    icon: FileText,
    href: "/admin/operations",
    color: "text-slate-600",
  },
];

export default function AdminDashboard() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="h-8 w-8" />
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          System administration and monitoring tools
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {adminCards.map((card) => (
          <Link key={card.href} to={card.href}>
            <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <card.icon className={`h-8 w-8 ${card.color}`} />
                </div>
                <CardTitle className="mt-2">{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

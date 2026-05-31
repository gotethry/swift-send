import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

function csvEscape(value: unknown) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

export default async function reportRoutes(fastify: FastifyInstance) {
  const adminGuards = { preHandler: [requireVerifiedSession, requireRole('admin')] };

  /**
   * Regulatory-style transaction summary export (MVP).
   * GET /admin/reports/transactions/summary?from=ISO&to=ISO&format=csv|json
   */
  fastify.get(
    '/admin/reports/transactions/summary',
    adminGuards,
    async (req, reply) => {
      const query = req.query as { from?: string; to?: string; format?: string };
      const fromMs = query.from ? new Date(query.from).getTime() : undefined;
      const toMs = query.to ? new Date(query.to).getTime() : undefined;
      const format = query.format === 'csv' ? 'csv' : 'json';

      const all = await fastify.container.services.transfers.listAll();
      const filtered = all.filter((t) => {
        const ts = new Date(t.createdAt).getTime();
        if (Number.isFinite(fromMs) && fromMs !== undefined && ts < fromMs) return false;
        if (Number.isFinite(toMs) && toMs !== undefined && ts > toMs) return false;
        return true;
      });

      const rows = filtered.map((t) => ({
        transfer_id: t.id,
        user_id: t.userId,
        state: t.state,
        amount: t.amount,
        currency: t.currency,
        recipient_type: t.recipient.type,
        recipient_country: t.recipient.country || '',
        created_at: t.createdAt,
        updated_at: t.updatedAt,
        fraud_level: t.fraud?.level || '',
        fraud_score: t.fraud?.score ?? '',
        requires_review: t.fraud?.requiresReview ?? '',
      }));

      const summary = {
        count: filtered.length,
        total_amount: filtered.reduce((sum, t) => sum + t.amount, 0),
        settled: filtered.filter((t) => t.state === 'settled').length,
        failed: filtered.filter((t) => t.state === 'failed').length,
        pending: filtered.filter((t) => !['settled', 'failed'].includes(t.state)).length,
        flagged: filtered.filter((t) => t.fraud?.requiresReview || (t.fraud?.level && t.fraud.level !== 'low')).length,
      };

      if (format === 'csv') {
        const csv = toCsv(rows);
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename=swiftsend_transaction_summary.csv');
        return reply.send(csv);
      }

      return { summary, items: rows };
    },
  );

  /**
   * Compliance reporting export (MVP).
   * GET /admin/reports/compliance/audit?fromDate&toDate&checkType&status
   */
  fastify.get(
    '/admin/reports/compliance/audit',
    adminGuards,
    async (req) => {
      const query = req.query as {
        userId?: string;
        checkType?: string;
        status?: string;
        fromDate?: string;
        toDate?: string;
      };
      return fastify.container.services.auditStorage.getComplianceReport({
        userId: query.userId,
        checkType: query.checkType,
        status: query.status,
        fromDate: query.fromDate,
        toDate: query.toDate,
      });
    },
  );

  /**
   * Compliance violation report.
   * GET /admin/reports/compliance/violations?fromDate&toDate&severity&source&userId&transferId
   */
  fastify.get(
    '/admin/reports/compliance/violations',
    adminGuards,
    async (req) => {
      const query = req.query as {
        severity?: 'critical' | 'high' | 'medium' | 'low';
        source?: 'contract_event' | 'compliance_log';
        userId?: string;
        transferId?: string;
        fromDate?: string;
        toDate?: string;
        limit?: string;
      };

      return fastify.container.services.complianceViolations.generateReport({
        severity: query.severity,
        source: query.source,
        userId: query.userId,
        transferId: query.transferId,
        fromDate: query.fromDate,
        toDate: query.toDate,
        limit: query.limit ? Number(query.limit) : 100,
      });
    },
  );
}

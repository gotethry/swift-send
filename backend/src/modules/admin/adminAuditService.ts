import { v4 as uuid } from 'uuid';
import { createLogger } from '../../logger';

// TODO: write synchronously to admin_audit_logs DB table when DB layer is wired.
// IMPORTANT: the DB user should have INSERT-only on admin_audit_logs (no UPDATE/DELETE).

export interface AdminAuditEntry {
  id: string;
  adminId: string;
  action: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAuditFilters {
  adminId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export class AdminAuditService {
  private readonly logs: AdminAuditEntry[] = [];
  private readonly logger = createLogger({ component: 'adminAuditService' });

  log(
    adminId: string,
    action: string,
    ipAddress?: string,
    metadata?: Record<string, unknown>,
  ): AdminAuditEntry {
    const entry: AdminAuditEntry = {
      id: uuid(),
      adminId,
      action,
      ipAddress,
      metadata,
      createdAt: new Date().toISOString(),
    };
    this.logs.unshift(entry);
    this.logger.info({ adminId, action, ipAddress }, 'admin action logged');
    return entry;
  }

  getLogs(filters: AdminAuditFilters = {}): AdminAuditEntry[] {
    const { adminId, action, limit = 50, offset = 0 } = filters;
    let results = this.logs;
    if (adminId) results = results.filter((e) => e.adminId === adminId);
    if (action) results = results.filter((e) => e.action === action);
    return results.slice(offset, offset + limit);
  }

  getLog(id: string): AdminAuditEntry | undefined {
    return this.logs.find((e) => e.id === id);
  }
}

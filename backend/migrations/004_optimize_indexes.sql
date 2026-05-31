-- Optimize transfers table: composite covers status-only queries via prefix scan
CREATE INDEX IF NOT EXISTS idx_transfers_status_created ON transfers(status, created_at DESC);

-- Partial index for active transfer monitoring (excludes settled/failed majority)
CREATE INDEX IF NOT EXISTS idx_transfers_wallet_active
  ON transfers(from_wallet_id)
  WHERE status IN ('created', 'held', 'submitted', 'validated', 'awaiting_multisig');

-- External ID for idempotency lookups
CREATE INDEX IF NOT EXISTS idx_transfers_external_id ON transfers(external_id);

-- Audit logs: entity and actor lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_action ON audit_logs(entity_type, action);

-- Users: unique constraints on identity fields (enforce uniqueness, not just speed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);

-- Ledger entries: idempotency key must be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_entries_idempotency_key
  ON ledger_entries(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

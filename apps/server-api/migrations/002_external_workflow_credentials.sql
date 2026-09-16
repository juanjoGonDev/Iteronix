CREATE TABLE IF NOT EXISTS external_workflow_credentials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  workflow_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  operations JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  generation INTEGER NOT NULL DEFAULT 1,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute BETWEEN 1 AND 600)
);
CREATE UNIQUE INDEX IF NOT EXISTS external_workflow_credentials_name_ci_idx
  ON external_workflow_credentials (lower(name));
CREATE TABLE IF NOT EXISTS external_workflow_credential_verifiers (
  credential_id TEXT PRIMARY KEY REFERENCES external_workflow_credentials(id) ON DELETE CASCADE,
  verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS external_workflow_credential_rate_windows (
  credential_id TEXT NOT NULL REFERENCES external_workflow_credentials(id) ON DELETE CASCADE,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY (credential_id, window_started_at)
);
CREATE TABLE IF NOT EXISTS external_workflow_credential_audits (
  id BIGSERIAL PRIMARY KEY,
  credential_id TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  operation TEXT,
  workflow_id TEXT,
  result TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS external_workflow_credential_audits_retention_idx ON external_workflow_credential_audits (occurred_at);

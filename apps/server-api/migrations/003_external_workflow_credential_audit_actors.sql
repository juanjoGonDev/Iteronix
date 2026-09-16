ALTER TABLE external_workflow_credential_audits
  ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'system';
ALTER TABLE external_workflow_credential_audits
  ADD COLUMN actor_id TEXT NOT NULL DEFAULT 'server-runtime';

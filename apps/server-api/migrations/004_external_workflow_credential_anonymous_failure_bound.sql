ALTER TABLE external_workflow_credential_audits
  ADD COLUMN IF NOT EXISTS failure_bucket TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS external_workflow_credential_audits_anonymous_failure_bucket_idx
  ON external_workflow_credential_audits (failure_bucket)
  WHERE actor_kind = 'anonymous' AND result = 'unauthorized';

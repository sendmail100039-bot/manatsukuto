-- §35 ログ保護: 監査ログは通常のユーザーから変更できない構造とし、原則として物理削除しない。
-- Application connections cannot UPDATE / DELETE audit rows. Retention purges (if ever
-- needed) must be performed by a DBA who explicitly disables the trigger.
CREATE OR REPLACE FUNCTION audit_logs_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% not allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable ON "audit_logs";
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

-- Attendance events are the raw punch evidence; they are also append-only.
DROP TRIGGER IF EXISTS attendance_events_immutable ON "attendance_events";
CREATE TRIGGER attendance_events_immutable
  BEFORE UPDATE OR DELETE ON "attendance_events"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

-- Only one open attendance record per employee at any time (§49 重複打刻防止).
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_one_open_idx
  ON "attendance_records" ("employee_id") WHERE "status" = 'open';

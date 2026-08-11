CREATE OR REPLACE FUNCTION fn_admin_operation_high_risk_alert()
RETURNS trigger AS $$
DECLARE
  v_action text := lower(coalesce(NEW."action", ''));
  v_module text := lower(coalesce(NEW."module", ''));
  v_level text := null;
  v_title text := null;
  v_reason text := null;
  v_region_id text := null;
  v_alert_id text := null;
BEGIN
  IF NEW."detail" IS NOT NULL AND jsonb_typeof(NEW."detail"::jsonb) = 'object' THEN
    v_region_id := nullif(NEW."detail"::jsonb ->> 'regionId', '');
  END IF;

  IF v_region_id IS NULL AND NEW."targetType" = 'region' THEN
    v_region_id := nullif(NEW."targetId", '');
  END IF;

  IF v_action ~ '(delete|soft_delete|dissolve|force_password_reset|refund|withdraw|pay|transfer)' THEN
    v_level := 'critical';
    v_title := '紧急高危操作待确认';
    v_reason := '删除、退款、提现、强制重置或解散类操作';
  ELSIF
    v_action ~ '(ban|unban|disable|close|audit|reject|review|batch|status|update_status|remove)' OR
    v_module ~ '(region|finance|withdraw|refund|admin|permission|role|circle|payment)'
  THEN
    v_level := 'high';
    v_title := '高危操作待确认';
    v_reason := '敏感模块或关键状态变更操作';
  END IF;

  IF v_level IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "system_alerts"
    WHERE "type" = 'operation' AND "businessId" = NEW."id"
  ) THEN
    RETURN NEW;
  END IF;

  v_alert_id := 'sa_' || substr(md5(random()::text || clock_timestamp()::text || NEW."id"), 1, 24);

  INSERT INTO "system_alerts" (
    "id",
    "type",
    "level",
    "title",
    "message",
    "regionId",
    "businessId",
    "status",
    "detail",
    "createdAt",
    "updatedAt"
  ) VALUES (
    v_alert_id,
    'operation',
    v_level,
    v_title,
    format('管理员执行了高风险操作：%s/%s，目标：%s', NEW."module", NEW."action", coalesce(NEW."targetId", '-')),
    v_region_id,
    NEW."id",
    'pending',
    jsonb_build_object(
      'operationLogId', NEW."id",
      'accountId', NEW."accountId",
      'module', NEW."module",
      'action', NEW."action",
      'targetType', NEW."targetType",
      'targetId', NEW."targetId",
      'ip', NEW."ip",
      'reason', v_reason,
      'detail', coalesce(NEW."detail"::jsonb, '{}'::jsonb)
    ),
    now(),
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_operation_high_risk_alert ON "admin_operation_logs";
CREATE TRIGGER trg_admin_operation_high_risk_alert
AFTER INSERT ON "admin_operation_logs"
FOR EACH ROW
EXECUTE FUNCTION fn_admin_operation_high_risk_alert();

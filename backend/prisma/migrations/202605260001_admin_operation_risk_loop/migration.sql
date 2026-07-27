CREATE OR REPLACE FUNCTION "fn_admin_operation_high_risk_alert"()
RETURNS trigger AS $$
DECLARE
  v_action text := lower(coalesce(NEW."action", ''));
  v_module text := lower(coalesce(NEW."module", ''));
  v_detail jsonb := coalesce(NEW."detail", '{}'::jsonb);
  v_region_id text := null;
  v_level text := null;
  v_reason text := null;
  v_alert_id text := null;
BEGIN
  IF v_detail ? 'regionId' THEN
    v_region_id := nullif(v_detail ->> 'regionId', '');
  END IF;

  IF v_region_id IS NULL AND NEW."targetType" = 'region' THEN
    v_region_id := nullif(NEW."targetId", '');
  END IF;

  IF v_action LIKE '%delete%'
    OR v_action LIKE '%soft_delete%'
    OR v_action LIKE '%dissolve%'
    OR v_action LIKE '%force_password_reset%'
    OR v_action LIKE '%refund%'
    OR v_action LIKE '%withdraw%'
    OR v_action LIKE '%transfer%'
    OR v_action LIKE '%pay%'
  THEN
    v_level := 'critical';
    v_reason := '删除、解散、退款、提现、打款或强制重置类操作';
  ELSIF v_action LIKE '%ban%'
    OR v_action LIKE '%unban%'
    OR v_action LIKE '%disable%'
    OR v_action LIKE '%close%'
    OR v_action LIKE '%status%'
    OR v_action LIKE '%audit%'
    OR v_action LIKE '%reject%'
    OR v_action LIKE '%review%'
    OR v_action LIKE '%batch%'
    OR v_action LIKE '%config%'
    OR v_module IN ('region', 'circle', 'finance', 'withdraw', 'refund', 'payment', 'admin', 'role', 'permission')
  THEN
    v_level := 'high';
    v_reason := '敏感模块或状态配置变更操作';
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

  v_alert_id := 'alert_' || substr(md5(random()::text || clock_timestamp()::text || NEW."id"), 1, 24);

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
    '后台高风险操作',
    '管理员执行了高风险操作：' || coalesce(NEW."module", '-') || '/' || coalesce(NEW."action", '-') || '，原因：' || v_reason,
    v_region_id,
    NEW."id",
    'pending',
    jsonb_build_object(
      'operationLogId', NEW."id",
      'accountId', NEW."accountId",
      'module', NEW."module",
      'action', NEW."action",
      'targetId', NEW."targetId",
      'targetType', NEW."targetType",
      'regionId', v_region_id,
      'reason', v_reason,
      'detail', v_detail
    ),
    now(),
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_admin_operation_high_risk_alert" ON "admin_operation_logs";

CREATE TRIGGER "trg_admin_operation_high_risk_alert"
AFTER INSERT ON "admin_operation_logs"
FOR EACH ROW
EXECUTE FUNCTION "fn_admin_operation_high_risk_alert"();

-- Keep QR-login diagnostics from breaking the login flow when browser or mini-program
-- user-agent strings and avatar URLs are longer than varchar-sized columns.

ALTER TABLE "admin_qr_login_sessions"
  ALTER COLUMN "avatar" TYPE TEXT,
  ALTER COLUMN "webUserAgent" TYPE TEXT,
  ALTER COLUMN "scanUserAgent" TYPE TEXT,
  ALTER COLUMN "rejectReason" TYPE TEXT;

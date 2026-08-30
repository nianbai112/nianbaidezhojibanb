CREATE INDEX IF NOT EXISTS "realtime_sessions_socketId_online_idx"
  ON "realtime_sessions"("socketId", "online");

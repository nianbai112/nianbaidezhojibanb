CREATE TABLE IF NOT EXISTS "welfare_share_links" (
  "token" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "welfare_share_links_pkey" PRIMARY KEY ("token"),
  CONSTRAINT "welfare_share_links_campaign_id_user_id_key" UNIQUE ("campaign_id", "user_id"),
  CONSTRAINT "welfare_share_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "welfare_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "welfare_share_visits" (
  "id" TEXT NOT NULL,
  "link_token" TEXT NOT NULL,
  "visitor_key" TEXT NOT NULL,
  "group_key" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "welfare_share_visits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "welfare_share_visits_link_token_visitor_key_group_key_key" UNIQUE ("link_token", "visitor_key", "group_key"),
  CONSTRAINT "welfare_share_visits_link_token_fkey" FOREIGN KEY ("link_token") REFERENCES "welfare_share_links"("token") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "welfare_share_visits_link_token_source_idx" ON "welfare_share_visits"("link_token", "source");

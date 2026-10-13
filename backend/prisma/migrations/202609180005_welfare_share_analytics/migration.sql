-- CreateTable
CREATE TABLE "welfare_share_links" (
    "token" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welfare_share_links_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "welfare_share_visits" (
    "id" TEXT NOT NULL,
    "link_token" TEXT NOT NULL,
    "visitor_key" TEXT NOT NULL,
    "group_key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welfare_share_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "welfare_share_links_campaign_id_user_id_key" ON "welfare_share_links"("campaign_id", "user_id");

-- CreateIndex
CREATE INDEX "welfare_share_visits_link_token_source_idx" ON "welfare_share_visits"("link_token", "source");

-- CreateIndex
CREATE UNIQUE INDEX "welfare_share_visits_link_token_visitor_key_group_key_key" ON "welfare_share_visits"("link_token", "visitor_key", "group_key");

-- AddForeignKey
ALTER TABLE "welfare_share_links" ADD CONSTRAINT "welfare_share_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "welfare_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welfare_share_visits" ADD CONSTRAINT "welfare_share_visits_link_token_fkey" FOREIGN KEY ("link_token") REFERENCES "welfare_share_links"("token") ON DELETE CASCADE ON UPDATE CASCADE;

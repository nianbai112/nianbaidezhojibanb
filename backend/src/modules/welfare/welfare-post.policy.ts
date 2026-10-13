import { ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

type PostCampaign = {
  requirePost?: boolean;
  regionId?: string | null;
  publishedAt?: Date | null;
};
type PostDB = Pick<Prisma.TransactionClient, "post">;

// Match the community's public feed rules, using server timestamps and ownership.
export function requiredPostWhere(campaign: PostCampaign, now = new Date()): Prisma.PostWhereInput {
  if (!campaign.publishedAt || !Number.isFinite(campaign.publishedAt.getTime()) || campaign.publishedAt > now)
    throw new ServiceUnavailableException({ code: "WELFARE_POST_UNAVAILABLE", message: "活动发帖起算时间暂无法核验，请联系管理员" });
  return {
    status: "PUBLISHED",
    auditStatus: "approved",
    deletedAt: null,
    createdAt: { gte: campaign.publishedAt, lte: now },
    ...(campaign.regionId ? { regionId: campaign.regionId } : {}),
  };
}

export async function postEligibility(db: PostDB, userId: string, campaign: PostCampaign, now = new Date()) {
  if (!campaign.requirePost) return { postCompleted: true, postPending: false };
  const where = { ...requiredPostWhere(campaign, now), userId };
  const approved = await db.post.findFirst({ where, select: { id: true } });
  if (approved) return { postCompleted: true, postPending: false };
  const pending = await db.post.findFirst({
    where: { ...where, status: { in: ["PENDING", "PUBLISHED"] }, auditStatus: "pending" },
    select: { id: true },
  });
  return { postCompleted: false, postPending: !!pending };
}

export async function qualifiedPostUsers(db: PostDB, campaign: PostCampaign, userIds: string[], now: Date) {
  const where = requiredPostWhere(campaign, now);
  const qualified = new Set<string>();
  for (let offset = 0; offset < userIds.length; offset += 500) {
    const rows = await db.post.groupBy({
      by: ["userId"],
      where: { ...where, userId: { in: userIds.slice(offset, offset + 500) } },
    });
    for (const row of rows) qualified.add(row.userId);
  }
  return qualified;
}

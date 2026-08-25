import { BadRequestException } from '@nestjs/common';
import { AuditService } from './audit.service';

const createService = () => new AuditService({} as any, {} as any, {} as any, {} as any);

describe('AuditService unified audit boundaries', () => {
  it.each(['merchant', 'withdraw', 'city_agent'])('rejects %s from the unified batch audit endpoint', async (type) => {
    await expect(createService().batchAudit({ type, ids: ['target-1'], action: 'approve' }, 'admin-1'))
      .rejects.toThrow(BadRequestException);
  });

  it.each(['merchant', 'withdraw', 'city_agent'])('does not expose %s in the unified pending list', async (targetType) => {
    await expect(createService().getPendingList({ targetType }))
      .rejects.toThrow(BadRequestException);
  });
});

describe('AuditService AI review content closure', () => {
  const createAiReviewService = (decision: 'approve' | 'reject' | 'manual') => {
    const prisma = {
      post: { findUnique: jest.fn().mockResolvedValue({ id: 'post-1', userId: 'user-1', regionId: 'region-1', title: 'title', content: 'content', media: [{ url: 'https://cdn.example.com/review.jpg' }] }) },
      comment: { findUnique: jest.fn() },
      auditRecord: { create: jest.fn().mockResolvedValue({}) },
      aiModerationRecord: { update: jest.fn().mockResolvedValue({}) },
    };
    const aiRuntime = {
      moderateContent: jest.fn().mockResolvedValue({ decision, reason: 'AI result', labels: [], score: 0 }),
      recordModeration: jest.fn().mockResolvedValue({ id: 'moderation-1', decision, labels: [], score: 0 }),
    };
    return { prisma, aiRuntime, service: new AuditService(prisma as any, { delPattern: jest.fn() } as any, aiRuntime as any, {} as any) };
  };

  it('uses the post closed-loop path for an approved AI review', async () => {
    const { service } = createAiReviewService('approve');
    const closedLoop = jest.spyOn(service as any, 'auditPostClosedLoop').mockResolvedValue(undefined);

    await service.aiReview({ type: 'post', id: 'post-1' }, 'admin-1');

    expect(closedLoop).toHaveBeenCalledWith('post-1', true, 'AI result');
  });

  it('keeps content unchanged when AI requests manual review', async () => {
    const { service, prisma } = createAiReviewService('manual');
    const closedLoop = jest.spyOn(service as any, 'auditPostClosedLoop').mockResolvedValue(undefined);

    await service.aiReview({ type: 'post', id: 'post-1' }, 'admin-1');

    expect(closedLoop).not.toHaveBeenCalled();
    expect(prisma.auditRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'pending' }) });
  });

  it('后台 AI 复审会读取帖子图片', async () => {
    const { service, aiRuntime } = createAiReviewService('reject');
    jest.spyOn(service as any, 'auditPostClosedLoop').mockResolvedValue(undefined);

    const result = await service.aiReview({ type: 'post', id: 'post-1' }, 'admin-1');

    expect(aiRuntime.moderateContent).toHaveBeenCalledWith(expect.objectContaining({
      imageUrls: ['https://cdn.example.com/review.jpg'],
    }));
    expect(result.reviewedImageCount).toBe(1);
  });
});

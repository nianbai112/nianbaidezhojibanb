import { BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';

const createService = () => {
  const service = Object.create(UserService.prototype) as any;
  service.interactionPermission = {
    normalizePermission: (value: any, fallback: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    permissionText: (value: any) => String(value),
  };
  return service;
};

describe('UserService notification preferences', () => {
  it('returns separate community modes while keeping important business notices enabled', () => {
    const service = createService();

    const result = service.formatPrivacySettings({
      notifyLike: true,
      notifyComment: true,
      notifyFollow: true,
      notifySquat: true,
      notifyLikeMode: 'reduced',
      notifyCommentMode: 'instant',
      notifyReplyMode: 'inbox',
      notifyMentionMode: 'off',
      notifyFollowMode: 'inbox',
      notifySquatMode: 'off',
      notifyOfficialAccount: false,
      notifyInteractionBadge: false,
      notifySystem: false,
      notifyOrder: false,
    });

    expect(result.notification_settings).toEqual(
      expect.objectContaining({
        like_mode: 'reduced',
        comment_mode: 'instant',
        reply_mode: 'inbox',
        mention_mode: 'off',
        follow_mode: 'inbox',
        squat_mode: 'off',
        official_account: false,
        interaction_badge: false,
        system: true,
        order: true,
      }),
    );
  });

  it('normalizes new modes and maps the legacy combined comment switch safely', () => {
    const service = createService();

    expect(
      service.normalizePrivacySettingsDto({
        notification_settings: {
          like_mode: 'inbox',
          reply_mode: 'reduced',
          official_account: false,
          interaction_badge: false,
        },
      }),
    ).toEqual(
      expect.objectContaining({
        notifyLikeMode: 'inbox',
        notifyLike: true,
        notifyReplyMode: 'reduced',
        notifyOfficialAccount: false,
        notifyInteractionBadge: false,
      }),
    );

    expect(
      service.normalizePrivacySettingsDto({
        notification_settings: { comment: false, system: false },
      }),
    ).toEqual(
      expect.objectContaining({
        notifyComment: false,
        notifyCommentMode: 'off',
        notifyReplyMode: 'off',
        notifyMentionMode: 'off',
        notifySystem: true,
        notifyOrder: true,
      }),
    );
  });

  it('rejects unknown notification modes instead of silently changing behavior', () => {
    const service = createService();

    expect(() =>
      service.normalizePrivacySettingsDto({
        notification_settings: { like_mode: 'sometimes' },
      }),
    ).toThrow(BadRequestException);
  });
});

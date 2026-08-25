import {
  OFFICIAL_ASSISTANT_OPENID,
  isOfficialAssistantUser,
  officialAssistantConversationScopeKey,
} from './official-assistant.util';

describe('official assistant identity', () => {
  it('prefers the stable system role and keeps the fixed openid as a migration fallback', () => {
    expect(isOfficialAssistantUser({ systemRole: 'OFFICIAL_ASSISTANT', openid: 'changed-openid' })).toBe(true);
    expect(isOfficialAssistantUser({ systemRole: null, openid: OFFICIAL_ASSISTANT_OPENID })).toBe(true);
    expect(isOfficialAssistantUser({ systemRole: null, openid: 'bot_campaign_1' })).toBe(false);
  });

  it('uses one region-scoped support key across every transport', () => {
    expect(officialAssistantConversationScopeKey('region-1', 'user-1')).toBe('support:region-1:user-1');
  });
});

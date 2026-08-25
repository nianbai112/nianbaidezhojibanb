export const OFFICIAL_ASSISTANT_OPENID = 'lingmeng_official_message_account';
export const OFFICIAL_ASSISTANT_SYSTEM_ROLE = 'OFFICIAL_ASSISTANT';

export type OfficialAssistantIdentity = {
  openid?: string | null;
  systemRole?: string | null;
};

export function isOfficialAssistantUser(user?: OfficialAssistantIdentity | null) {
  return user?.systemRole === OFFICIAL_ASSISTANT_SYSTEM_ROLE
    || user?.openid === OFFICIAL_ASSISTANT_OPENID;
}

export function officialAssistantUserWhere() {
  return {
    OR: [
      { systemRole: OFFICIAL_ASSISTANT_SYSTEM_ROLE },
      { openid: OFFICIAL_ASSISTANT_OPENID },
    ],
  };
}

export function officialAssistantConversationScopeKey(regionId: string, userId: string) {
  return `support:${String(regionId).trim()}:${String(userId).trim()}`;
}

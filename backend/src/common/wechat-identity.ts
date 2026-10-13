import { OFFICIAL_ASSISTANT_OPENID } from './utils/official-assistant.util';

export const isAppLoginOpenid = (value: unknown): boolean =>
  typeof value === 'string' && /^app_login_/i.test(value);

export const isPhoneLoginOpenid = (value: unknown): boolean =>
  typeof value === 'string' && /^phone_login_/i.test(value);

// User.openid retains the mini-program namespace. Other login channels use
// reserved placeholders until a server-verified mini-program identity is bound.
// This classifies stored identifiers; it does not verify a client-supplied ID.
export const isMiniappOpenid = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !/[\s\x00-\x1f\x7f]/.test(value) &&
  !isAppLoginOpenid(value) && !isPhoneLoginOpenid(value) &&
  !/^bot_/i.test(value) && value.toLowerCase() !== OFFICIAL_ASSISTANT_OPENID;

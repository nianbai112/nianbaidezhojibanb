// A visitor response is a separate DTO, including for caches written before this boundary.
// Never spread a User, nested Prisma relation, title, level or cached object into it.
const text = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const flag = (value: unknown): boolean => value === true || value === 1 || value === '1';
const record = (value: any): any => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const title = (raw: any) => {
 const item = record(raw); if (!item.id && !item.name) return null;
 return { id: text(item.id), name: text(item.name), icon: text(item.icon), image: text(item.image), image_url: text(item.image_url || item.image || item.icon), background_color: text(item.background_color || item.backgroundColor), text_color: text(item.text_color || item.textColor), border_color: text(item.border_color || item.borderColor) };
};
const level = (raw: any) => { const item = record(raw); if (!item.id && !item.levelName && !item.levelNumber) return null; return { id: text(item.id), levelNumber: count(item.levelNumber), levelName: text(item.levelName), levelIcon: text(item.levelIcon), levelBadgeImage: text(item.levelBadgeImage), minExp: count(item.minExp), maxExp: count(item.maxExp) }; };
export function publicProfile(input: any) {
 const row = record(input), privacy = record(row.privacy_settings), interactions = record(privacy.interaction_settings), follows = record(privacy.follow_settings);
 const currentTitle = title(row.current_title || row.currentTitle), currentLevel = level(row.user_level || row.userLevel), nextLevel = level(row.next_user_level || row.nextUserLevel);
 const sourceGrowth = record(row.growth_summary || row.growthSummary || row.user_growth || row.userGrowth);
 const growth = Object.keys(sourceGrowth).length ? { regionId: text(sourceGrowth.regionId || sourceGrowth.region_id), region_id: text(sourceGrowth.regionId || sourceGrowth.region_id), currentExp: count(sourceGrowth.currentExp), expToNextLevel: count(sourceGrowth.expToNextLevel), progress: count(sourceGrowth.progress), currentLevel: level(sourceGrowth.currentLevel), nextLevel: level(sourceGrowth.nextLevel) } : null;
 const circles = (Array.isArray(row.managed_circles) ? row.managed_circles : Array.isArray(row.managedCircles) ? row.managedCircles : []).filter((item: any) => item?.status === 'active' && (item.audit_status || item.auditStatus) === 'approved').map((item: any) => ({ id: text(item.id || item.circle_id), name: text(item.name), logo: text(item.logo || item.icon), icon: text(item.icon || item.logo), cover: text(item.cover), region_id: text(item.region_id || item.regionId), regionId: text(item.region_id || item.regionId), status: 'active', audit_status: 'approved', member_count: count(item.member_count ?? item.memberCount), post_count: count(item.post_count ?? item.postCount) }));
 const badgeSource = Array.isArray(row.badges) ? row.badges : Array.isArray(row.user_badges) ? row.user_badges : [];
 const badges = badgeSource.map((item: any) => title(item)).filter(Boolean);
 const result: any = {
  id: text(row.id), uid: text(row.public_uid || row.publicUid || row.uid), public_uid: text(row.public_uid || row.publicUid || row.uid), publicUid: text(row.public_uid || row.publicUid || row.uid),
  name: text(row.name || row.nickname), nickname: text(row.nickname), avatar: text(row.avatar), bio: text(row.bio), gender: count(row.gender), gender_text: text(row.gender_text), school: text(row.school), university: text(row.university), major: text(row.major), grade: text(row.grade),
  student_verified: flag(row.student_verified), is_member: flag(row.is_member ?? row.isMember), isMember: flag(row.is_member ?? row.isMember), member_badge: text(row.member_badge || row.memberBadge), memberBadge: text(row.member_badge || row.memberBadge), identity_level: text(row.identity_level || row.identityLevel), identityLevel: text(row.identity_level || row.identityLevel),
  current_title: currentTitle, currentTitle, title_image_url: text(row.title_image_url || row.titleImageUrl), titleImageUrl: text(row.title_image_url || row.titleImageUrl), badges, user_badges: badges,
  growth_summary: growth, growthSummary: growth, user_growth: growth, userGrowth: growth, user_level: currentLevel, userLevel: currentLevel, next_user_level: nextLevel, nextUserLevel: nextLevel,
  managed_circles: circles, managedCircles: circles, managed_circle_count: circles.length, managedCircleCount: circles.length, is_circle_owner: circles.length > 0, isCircleOwner: circles.length > 0,
  // Contact release is not a profile-read capability. Existing separate permission flows remain authoritative.
  phone: '', mobile: '', wechat: '', qq: '', email: '', latest_location: null, wechat_permission: 3, phone_permission: 3, is_self: false, isSelf: false,
 };
 const numeric = ['following_count', 'followingCount', 'follow_count', 'followCount', 'follower_count', 'followerCount', 'fans_count', 'fansCount', 'total_like_count', 'totalLikeCount', 'like_count', 'likeCount', 'level_number', 'levelNumber', 'current_exp', 'currentExp', 'exp_to_next_level', 'expToNextLevel', 'level_progress', 'levelProgress', 'member_level', 'memberLevel'];
 for (const name of numeric) result[name] = count(row[name]);
 for (const name of ['is_following', 'isFollowing', 'is_followed', 'followed', 'is_following_me', 'isFollowingMe', 'is_followed_by', 'is_mutual', 'isMutual']) result[name] = flag(row[name]);
 for (const name of ['level_name', 'levelName', 'level_icon', 'levelIcon', 'level_badge_image', 'levelBadgeImage']) result[name] = text(row[name]);
 const publicPrivacy = { allow_follow: flag(row.allow_follow ?? privacy.allow_follow), allow_comment: flag(row.allow_comment ?? privacy.allow_comment), allow_message: flag(row.allow_message ?? privacy.allow_message), message_permission: count(row.message_permission ?? interactions.message_permission), like_list_visible: flag(row.like_list_visible ?? interactions.like_list_visible) ? 1 : 0, following_list_visible: flag(row.following_list_visible ?? follows.following_list_visible) ? 1 : 0, followers_list_visible: flag(row.followers_list_visible ?? follows.followers_list_visible) ? 1 : 0, show_joined_circles: flag(row.show_joined_circles ?? interactions.show_joined_circles) ? 1 : 0 };
 Object.assign(result, publicPrivacy, { allowFollow: publicPrivacy.allow_follow, allowComment: publicPrivacy.allow_comment, allowMessage: publicPrivacy.allow_message, privacy_settings: { allow_follow: publicPrivacy.allow_follow, allow_comment: publicPrivacy.allow_comment, allow_message: publicPrivacy.allow_message, interaction_settings: { like_list_visible: publicPrivacy.like_list_visible, message_permission: publicPrivacy.message_permission, show_joined_circles: publicPrivacy.show_joined_circles }, follow_settings: { following_list_visible: publicPrivacy.following_list_visible, followers_list_visible: publicPrivacy.followers_list_visible }, contact_settings: { phone: { permission: 3, price: 0 }, wechat: { permission: 3, price: 0 } } } });
 return result;
}

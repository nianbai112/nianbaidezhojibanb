import { Prisma } from '@prisma/client';

type StoredTag = { name: string; color: string | null };
type TagDefinition = {
  id: string;
  regionId: string | null;
  tagName: string;
  tagColor: string | null;
  textColor: string | null;
  isActive: boolean;
};

export type UserGuidanceTagSelection = {
  selected_tags: string[];
  selection_unresolved: boolean;
};

// UserTag 历史表只存 name/color，不能把 UserTag.id 当成标签定义 ID。
// 即使校区定义与全局定义同名同色，也不能推断用户当初选的是哪一个。
export function resolveUserGuidanceTags(
  storedTags: StoredTag[],
  definitions: TagDefinition[],
  regionId?: string | null,
): UserGuidanceTagSelection {
  const scope = regionId?.trim() || null;
  const visible = definitions.filter((definition) => definition.isActive &&
    (definition.regionId === null || (!!scope && definition.regionId === scope)));
  const selected = new Set<string>();
  let unresolved = false;
  for (const stored of storedTags) {
    const matches = visible.filter((definition) => definition.tagName === stored.name &&
      (definition.tagColor || definition.textColor || null) === stored.color);
    if (matches.length === 1) selected.add(matches[0].id);
    else unresolved = true;
  }
  return { selected_tags: [...selected], selection_unresolved: unresolved };
}

export async function readUserGuidanceTags(
  client: Pick<Prisma.TransactionClient, 'userTag' | 'userTagDefinition'>,
  userId: string,
  regionId?: string | null,
): Promise<UserGuidanceTagSelection> {
  const stored = await client.userTag.findMany({
    where: { userId },
    select: { name: true, color: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (!stored.length) return { selected_tags: [], selection_unresolved: false };
  const scope = regionId?.trim() || null;
  const definitions = await client.userTagDefinition.findMany({
    where: { isActive: true, OR: scope ? [{ regionId: scope }, { regionId: null }] : [{ regionId: null }] },
    select: { id: true, regionId: true, tagName: true, tagColor: true, textColor: true, isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
  });
  return resolveUserGuidanceTags(stored, definitions, scope);
}

function payloadOf(response = {}) {
  return response?.data ?? response ?? {}
}

export function campusMapPublicationSnapshot(response = {}) {
  const payload = payloadOf(response)
  const workflow = payload?.workflow && typeof payload.workflow === 'object'
    ? payload.workflow
    : {}
  return {
    enabled: payload.enabled === true,
    regionId: String(payload.regionId || ''),
    activeVersion: Number(workflow.activeVersion || 0),
    activeVersionId: String(workflow.activeVersionId || ''),
    publicPlaceCount: Array.isArray(payload.publicPlaces) ? payload.publicPlaces.length : 0,
  }
}

export function verifyCampusMapPublication(beforeResponse = {}, publishedResponse = {}, liveResponse = {}) {
  const before = campusMapPublicationSnapshot(beforeResponse)
  const published = campusMapPublicationSnapshot(publishedResponse)
  const live = campusMapPublicationSnapshot(liveResponse)
  const issues = []

  if (!published.activeVersion || published.activeVersion <= before.activeVersion) {
    issues.push('正式版本号没有增长')
  }
  if (!live.enabled) issues.push('用户端地图未启用')
  if (!live.activeVersion || live.activeVersion !== published.activeVersion) {
    issues.push(`用户端版本 v${live.activeVersion || 0} 与刚发布的 v${published.activeVersion || 0} 不一致`)
  }
  if (published.activeVersionId && live.activeVersionId !== published.activeVersionId) {
    issues.push('用户端活动版本标识与刚发布版本不一致')
  }
  if (published.publicPlaceCount < 1) {
    issues.push('刚发布版本没有正式公开地点')
  } else if (live.publicPlaceCount !== published.publicPlaceCount) {
    issues.push(`用户端公开地点 ${live.publicPlaceCount} 个，刚发布版本应为 ${published.publicPlaceCount} 个`)
  }

  return { ok: issues.length === 0, issues, before, published, live }
}

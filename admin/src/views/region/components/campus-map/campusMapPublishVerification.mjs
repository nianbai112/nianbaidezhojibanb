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
  const publishedPayload = payloadOf(publishedResponse)
  const livePayload = payloadOf(liveResponse)

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
  if (published.regionId && live.regionId !== published.regionId) issues.push('用户端学校与刚发布学校不一致')
  if (published.publicPlaceCount < 1) {
    issues.push('刚发布版本没有正式公开地点')
  } else if (live.publicPlaceCount !== published.publicPlaceCount) {
    issues.push(`用户端公开地点 ${live.publicPlaceCount} 个，刚发布版本应为 ${published.publicPlaceCount} 个`)
  }

  if (livePayload.navigationUnavailableReason) {
    issues.push(`用户端导航不可用：${livePayload.navigationUnavailableReason}`)
  }
  const expectedPlaces = (publishedPayload.publicPlaces || []).filter((place) => place.navigable === true)
  const livePlaces = new Map((livePayload.publicPlaces || []).map((place) => [String(place.id), place]))
  const graph = livePayload.navigation?.graph
  const nodes = graph?.nodes || {}
  const edges = Array.isArray(graph?.edges) ? graph.edges : []
  const requiresNavigation = expectedPlaces.length > 0 || (publishedPayload.navigation?.graph?.edges?.length || 0) > 0
  if (requiresNavigation && (!edges.length || !Object.keys(nodes).length)) {
    issues.push('用户端缺少可用导航路网')
  }
  for (const expected of expectedPlaces) {
    const place = livePlaces.get(String(expected.id))
    const connected = place?.navigable === true && place.entranceNodeIds?.some((id) =>
      nodes[id] && edges.some((edge) => (edge.a === id || edge.b === id)
        && nodes[edge.a] && nodes[edge.b] && edge.public === true
        && edge.closed !== true && edge.construction !== true && edge.pedestrian !== false))
    if (!connected) issues.push(`地点“${expected.title || expected.officialName || expected.id}”没有可用导航入口`)
  }

  return { ok: issues.length === 0, issues, before, published, live }
}

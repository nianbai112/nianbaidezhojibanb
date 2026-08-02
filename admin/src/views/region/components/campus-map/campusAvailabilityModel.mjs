const SCHOOL_MESSAGE_LIMIT = 200
const BUILDING_MESSAGE_LIMIT = 120

function cleanMessage(value, limit) {
  return String(value || '').trim().slice(0, limit)
}

export function normalizeSchoolAvailability(value = {}) {
  const status = value?.status === 'unopened' ? 'unopened' : 'open'
  return {
    status,
    unavailableMessage: status === 'unopened'
      ? cleanMessage(value?.unavailableMessage, SCHOOL_MESSAGE_LIMIT)
      : '',
  }
}

export function normalizeBuildingAvailability(value = {}) {
  const serviceStatus = value?.serviceStatus === 'unopened' ? 'unopened' : 'open'
  return {
    serviceStatus,
    unavailableMessage: serviceStatus === 'unopened'
      ? cleanMessage(value?.unavailableMessage, BUILDING_MESSAGE_LIMIT)
      : '',
    searchable: serviceStatus === 'unopened' ? true : value?.searchable !== false,
    navigable: serviceStatus === 'unopened' ? false : value?.navigable !== false,
  }
}

export function mergeRegionCampusMapStatuses(regions = [], statuses = []) {
  const statusByRegionId = new Map(
    (Array.isArray(statuses) ? statuses : [])
      .filter((item) => item?.regionId)
      .map((item) => [String(item.regionId), item]),
  )

  return (Array.isArray(regions) ? regions : []).map((region) => {
    const status = statusByRegionId.get(String(region?.id || ''))
    const publishedStatus = status?.publishedStatus
    const campusMapStatus = status?.configured !== false
      && (publishedStatus === 'open' || publishedStatus === 'unopened')
      ? publishedStatus
      : 'unconfigured'

    return {
      ...region,
      campusMapStatus,
      campusMapPublishedStatus: publishedStatus,
      campusMapDraftStatus: status?.draftStatus,
      campusMapUnavailableMessage: String(status?.unavailableMessage || ''),
      campusMapDraftRevision: status?.draftRevision,
      campusMapActiveVersion: status?.activeVersion,
    }
  })
}

export function filterRegionsByCampusMapStatus(regions = [], status = 'all') {
  const rows = Array.isArray(regions) ? regions : []
  if (status === 'all') return rows
  return rows.filter((region) => region?.campusMapStatus === status)
}

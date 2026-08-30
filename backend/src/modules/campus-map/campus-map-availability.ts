export type CampusAvailabilityStatus = 'open' | 'unopened';

export type CampusAvailability = {
  status: CampusAvailabilityStatus;
  unavailableMessage: string;
};

const SCHOOL_MESSAGE_LIMIT = 200;
const BUILDING_MESSAGE_LIMIT = 120;

export function normalizeCampusAvailability(value: any): CampusAvailability {
  const status: CampusAvailabilityStatus = value?.status === 'unopened'
    ? 'unopened'
    : 'open';

  return {
    status,
    unavailableMessage: status === 'unopened'
      ? String(value?.unavailableMessage || '').trim().slice(0, SCHOOL_MESSAGE_LIMIT)
      : '',
  };
}

export function normalizeCampusFeatureProperties(value: any): Record<string, any> {
  const properties = value && typeof value === 'object' ? { ...value } : {};
  const isFuture = properties.constructionStatus === 'under_construction'
    || properties.constructionStatus === 'planned'
    || properties.visibilityScope === 'future_reference';
  const isActiveBuilding = properties.constructionStatus === 'built'
    || properties.constructionStatus === 'renovating'
    || properties.visibilityScope === 'phase1_active';
  const allowedServiceStatuses = new Set([
    'unknown', 'open', 'limited', 'unopened', 'temporarily_closed', 'closed',
  ]);

  if (isActiveBuilding || isFuture) {
    properties.serviceStatus = allowedServiceStatuses.has(properties.serviceStatus)
      ? properties.serviceStatus
      : 'open';
    properties.unavailableMessage = properties.serviceStatus !== 'open'
      ? String(properties.unavailableMessage || '').trim().slice(0, BUILDING_MESSAGE_LIMIT)
      : '';
  }

  if (isFuture) {
    properties.searchable = false;
    properties.navigable = false;
  } else if (isActiveBuilding && ['unopened', 'temporarily_closed', 'closed'].includes(properties.serviceStatus)) {
    properties.searchable = true;
    properties.navigable = false;
  }

  return properties;
}

export function validateCampusAvailabilityManifest(manifest: any): string[] {
  const errors: string[] = [];
  const availability = normalizeCampusAvailability(manifest?.availability);

  if (availability.status === 'unopened' && !availability.unavailableMessage) {
    errors.push('学校未开通时必须填写说明');
  }

  const layers = Array.isArray(manifest?.layers) ? manifest.layers : [];
  for (const layer of layers) {
    const features = Array.isArray(layer?.inlineData?.features)
      ? layer.inlineData.features
      : [];

    for (const feature of features) {
      const rawProperties = feature?.properties;
      if (!rawProperties || typeof rawProperties !== 'object') continue;

      const properties = normalizeCampusFeatureProperties(rawProperties);
      const title = String(
        properties.title
          || properties.officialName
          || properties.name
          || '',
      ).trim();

      if (properties.serviceStatus !== 'unopened' || !title) continue;

      if (!properties.unavailableMessage) {
        errors.push(`未开放建筑“${title}”必须填写说明`);
      }
      if (rawProperties.navigable === true) {
        errors.push(`未开放建筑“${title}”不能开启导航`);
      }
    }
  }

  return errors;
}

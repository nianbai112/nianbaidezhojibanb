export function hasDeliveryCoordinates(address: { latitude?: unknown; longitude?: unknown }): boolean {
  return typeof address.latitude === 'number' && Number.isFinite(address.latitude) && Math.abs(address.latitude) <= 90 &&
    typeof address.longitude === 'number' && Number.isFinite(address.longitude) && Math.abs(address.longitude) <= 180;
}

// Legacy specified-address trees repeated the same campus across all three levels.
export function joinAddressParts(parts: unknown[]): string {
  const fields = parts.filter((value): value is string => typeof value === 'string')
    .map(value => value.trim().replace(/\s+/g, ' ')).filter(Boolean);
  return fields.filter((part, index) => !fields.slice(0, index).some(value => value === part || value.endsWith(' ' + part)))
    .flatMap(value => value.split(' '))
    .reduce<string[]>((kept, part) => {
      if (part.length >= 6 && kept.some(value => value.includes(part))) return kept;
      return [...kept.filter(value => !(value.length >= 6 && part.includes(value))), part];
    }, []).join(' ');
}

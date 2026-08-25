type CorsInput = {
  nodeEnv?: string;
  setupWizard: boolean;
  corsOrigin?: string;
};

type ListenHostInput = {
  nodeEnv?: string;
  host?: string;
};

export function resolveCorsOrigin({ nodeEnv, setupWizard, corsOrigin }: CorsInput): true | string[] {
  const origins = String(corsOrigin || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const production = nodeEnv === 'production';

  if (!production) return origins.length ? origins : true;
  if (origins.length) return origins;
  if (setupWizard) return true;
  throw new Error('CORS_ORIGIN is required in production after setup is complete');
}

export function resolveListenHost({ nodeEnv, host }: ListenHostInput): string {
  const configured = String(host || '').trim();
  if (configured) return configured;
  return nodeEnv === 'production' ? '127.0.0.1' : '0.0.0.0';
}

import { IncomingMessage, ServerResponse } from 'node:http';

/** Preserve signed bytes before the explicitly installed JSON parser consumes them. */
export function preserveRiderAuthorizationBody(req: IncomingMessage, _res: ServerResponse, buffer: Buffer) {
  const pathname = String(req.url || '').split('?')[0];
  if (pathname.endsWith('/wxpay/rider-authorization-notify')) {
    (req as IncomingMessage & { rawBody: Buffer }).rawBody = Buffer.from(buffer);
  }
}

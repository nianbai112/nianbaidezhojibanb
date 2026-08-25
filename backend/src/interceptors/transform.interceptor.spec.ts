import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

const contextFor = (url: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ url }),
    }),
  }) as ExecutionContext;

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor();

  it.each([
    '/current/rider',
    '/rider/apply',
    '/riders/current',
    '/delivery-orders/distribution/list',
    '/return-to-pool/order-1',
    '/location',
    '/transfer/requests',
    '/region-riders',
  ])('keeps mini-program rider response raw for %s', async (url) => {
    const handler: CallHandler = { handle: () => of(null) };

    await expect(
      firstValueFrom(interceptor.intercept(contextFor(url), handler)),
    ).resolves.toBeNull();
  });

  it('continues wrapping admin responses', async () => {
    const handler: CallHandler = { handle: () => of({ id: 'rider-1' }) };

    await expect(
      firstValueFrom(
        interceptor.intercept(contextFor('/internal/report'), handler),
      ),
    ).resolves.toMatchObject({
      code: 0,
      message: 'success',
      data: { id: 'rider-1' },
    });
  });
});

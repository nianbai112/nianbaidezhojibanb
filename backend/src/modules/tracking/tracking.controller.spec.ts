import { PATH_METADATA } from '@nestjs/common/constants';
import { TrackingController } from './tracking.controller';

describe('TrackingController routes', () => {
  it('mounts mini-program event tracking under the normalized API path', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TrackingController.prototype.trackEvent))
      .toBe('tracking/events');
  });
});

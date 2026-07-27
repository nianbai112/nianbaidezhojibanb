import { RequestMethod } from '@nestjs/common';
import { NotifyController } from './notify.controller';
import { NotifyService } from './notify.service';

describe('NotifyController', () => {
  const notifyService = {
    reviewNotification: jest.fn(),
    getCenterList: jest.fn(),
  };
  let controller: NotifyController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new NotifyController(notifyService as unknown as NotifyService);
  });

  it('exposes the legacy mini-program review route', () => {
    const path = Reflect.getMetadata(
      'path',
      NotifyController.prototype.reviewNotificationLegacy,
    );
    const method = Reflect.getMetadata(
      'method',
      NotifyController.prototype.reviewNotificationLegacy,
    );

    expect(path).toBe('notifications/:id/review');
    expect(method).toBe(RequestMethod.POST);
  });

  it('passes the current user, notification id, and action to the service', async () => {
    notifyService.reviewNotification.mockResolvedValue({ success: true });

    await controller.reviewNotificationLegacy(
      'notice-1',
      'user-1',
      { action: 'approve' },
    );

    expect(notifyService.reviewNotification).toHaveBeenCalledWith(
      'user-1',
      'notice-1',
      'approve',
    );
  });

  it('passes interaction and unread filters through the legacy list route', async () => {
    notifyService.getCenterList.mockResolvedValue({ notifications: [] });

    await controller.getAllDetails('user-1', {
      type: 'interaction',
      unread_only: '1',
      region_id: 'region-1',
      page: '2',
      pageSize: '30',
    });

    expect(notifyService.getCenterList).toHaveBeenCalledWith('user-1', {
      type: 'interaction',
      unreadOnly: '1',
      regionId: 'region-1',
      page: 2,
      pageSize: 30,
    });
  });
});

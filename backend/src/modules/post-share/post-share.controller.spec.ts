import { PostShareController } from './post-share.controller';

describe('PostShareController', () => {
  it('uses the authenticated user and request metadata for a share link', async () => {
    const postShareService: any = {
      createLink: jest.fn().mockResolvedValue({ code: 'Ab3K9x' }),
      resolve: jest.fn().mockResolvedValue({ postId: 'post-1', code: 'Ab3K9x', regionId: 'region-1' }),
    };
    const controller = new PostShareController(postShareService);

    await expect(controller.create('user-1', { postId: 'post-1', channel: 'wx_friend' })).resolves.toEqual({ code: 'Ab3K9x' });
    expect(postShareService.createLink).toHaveBeenCalledWith('user-1', 'post-1', { channel: 'wx_friend' });

    await expect(controller.resolve('Ab3K9x', {
      headers: { 'x-device-id': 'device-a', 'user-agent': 'mini-program' },
      ip: '127.0.0.1',
    } as any, 'device-a')).resolves.toMatchObject({ postId: 'post-1' });
    expect(postShareService.resolve).toHaveBeenCalledWith('Ab3K9x', expect.objectContaining({
      visitorId: 'device-a',
      userAgent: 'mini-program',
    }));
  });
});

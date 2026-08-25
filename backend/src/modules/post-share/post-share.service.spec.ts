import { PostShareService } from './post-share.service';

describe('PostShareService', () => {
  const createService = () => {
    const prisma: any = {
      postShareLink: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({
          code: 'Ab3K9x',
          postId: 'post-1',
          regionId: 'region-1',
          ...data,
        })),
        updateMany: jest.fn(),
      },
      postShareVisit: { upsert: jest.fn() },
    };
    const postService: any = { detail: jest.fn() };
    const uploadService: any = { generateQrcode: jest.fn() };
    const contentExtService: any = { getPosterConfig: jest.fn() };
    const service = new PostShareService(prisma, postService, uploadService, contentExtService);
    return { service, prisma, postService, uploadService, contentExtService };
  };

  it('reuses a complete active link for the same sharer, post and template version', async () => {
    const { service, prisma, postService, uploadService, contentExtService } = createService();
    postService.detail.mockResolvedValue({ id: 'post-1', region_id: 'region-1' });
    contentExtService.getPosterConfig.mockResolvedValue({ version: 3 });
    prisma.postShareLink.findFirst.mockResolvedValue({
      code: 'Ab3K9x',
      postId: 'post-1',
      regionId: 'region-1',
      qrcodeUrl: 'https://cdn.example.com/qrcode.png',
    });

    await expect(service.createLink('user-1', 'post-1', { channel: 'wx_friend' })).resolves.toMatchObject({
      code: 'Ab3K9x',
      postId: 'post-1',
    });
    expect(prisma.postShareLink.create).not.toHaveBeenCalled();
    expect(uploadService.generateQrcode).not.toHaveBeenCalled();
  });

  it('repairs an active link whose qrcode generation previously failed', async () => {
    const { service, prisma, postService, uploadService, contentExtService } = createService();
    postService.detail.mockResolvedValue({ id: 'post-1', region_id: 'region-1' });
    contentExtService.getPosterConfig.mockResolvedValue({ version: 3 });
    prisma.postShareLink.findFirst.mockResolvedValue({
      id: 'link-1',
      code: 'Ab3K9x',
      postId: 'post-1',
      regionId: 'region-1',
      qrcodeUrl: '',
    });
    uploadService.generateQrcode.mockResolvedValue({ url: 'https://cdn.example.com/qrcode.png' });

    await expect(service.createLink('user-1', 'post-1')).resolves.toMatchObject({
      code: 'Ab3K9x',
      qrcodeUrl: 'https://cdn.example.com/qrcode.png',
    });
    expect(prisma.postShareLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { qrcodeUrl: 'https://cdn.example.com/qrcode.png' },
    });
    expect(prisma.postShareLink.create).not.toHaveBeenCalled();
  });

  it('creates a short code, generates its mini-program code, and records a visitor', async () => {
    const { service, prisma, postService, uploadService, contentExtService } = createService();
    postService.detail.mockResolvedValue({ id: 'post-1', region_id: 'region-1' });
    contentExtService.getPosterConfig.mockResolvedValue({ version: 3 });
    prisma.postShareLink.findFirst.mockResolvedValue(null);
    prisma.postShareLink.create.mockResolvedValue({
      id: 'link-1',
      code: 'Ab3K9x',
      postId: 'post-1',
      regionId: 'region-1',
      qrcodeUrl: 'https://cdn.example.com/qrcode.png',
    });
    uploadService.generateQrcode.mockResolvedValue({ url: 'https://cdn.example.com/qrcode.png' });
    prisma.postShareLink.findUnique.mockResolvedValue({
      id: 'link-1',
      code: 'Ab3K9x',
      postId: 'post-1',
      regionId: 'region-1',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.createLink('user-1', 'post-1', { channel: 'wx_friend' })).resolves.toMatchObject({
      postId: 'post-1',
      qrcodeUrl: 'https://cdn.example.com/qrcode.png',
    });
    expect(uploadService.generateQrcode).toHaveBeenCalledWith(expect.objectContaining({
      scene: expect.stringMatching(/^s=/),
      page: 'pagesB/post/post',
      width: 430,
      checkPath: true,
    }));
    expect(prisma.postShareLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        qrcodeUrl: 'https://cdn.example.com/qrcode.png',
      }),
    });

    await expect(service.resolve('Ab3K9x', { visitorId: 'device-a' })).resolves.toEqual({
      postId: 'post-1',
      code: 'Ab3K9x',
      regionId: 'region-1',
    });
    expect(prisma.postShareVisit.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { linkId_visitorId: { linkId: 'link-1', visitorId: 'device-a' } },
    }));
  });

  it('does not leave an active database record when qrcode generation fails', async () => {
    const { service, prisma, postService, uploadService, contentExtService } = createService();
    postService.detail.mockResolvedValue({ id: 'post-1', region_id: 'region-1' });
    contentExtService.getPosterConfig.mockResolvedValue({ version: 3 });
    prisma.postShareLink.findFirst.mockResolvedValue(null);
    uploadService.generateQrcode.mockRejectedValue(new Error('微信接口失败'));

    await expect(service.createLink('user-1', 'post-1')).rejects.toThrow('微信接口失败');
    expect(prisma.postShareLink.create).not.toHaveBeenCalled();
  });
});

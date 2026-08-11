import { ContentExtService } from './content-ext.service';

describe('ContentExtService poster template', () => {
  it('returns a complete poster template for an empty legacy config', async () => {
    const prisma: any = { config: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new ContentExtService(prisma);

    await expect(service.getPosterConfig()).resolves.toMatchObject({
      version: 1,
      ctaText: '扫码查看笔记',
      backgroundUrl: '',
      frameUrl: '',
      textPlaceholderUrl: '',
      qrcodeFrameUrl: '',
    });
  });
});

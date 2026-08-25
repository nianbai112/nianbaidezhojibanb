import { parseChatMessageContent } from './chat-message.util';

describe('chat message note payload', () => {
  it('keeps the complete note card data for admin and conversation consumers', () => {
    const parsed = parseChatMessageContent(
      'notes:校园新鲜事|正文内容|post-1|念白|https://example.com/avatar.jpg|https://example.com/cover.jpg|2',
      'TEXT',
    );

    expect(parsed).toMatchObject({
      renderType: 'note',
      messageType: 'TEXT',
      typeLabel: '笔记消息',
      previewText: '[笔记] 校园新鲜事',
      note: {
        title: '校园新鲜事',
        content: '正文内容',
        noteId: 'post-1',
        authorName: '念白',
        authorAvatar: 'https://example.com/avatar.jpg',
        coverImage: 'https://example.com/cover.jpg',
        type: 2,
      },
    });
  });

  it('uses the first content line when an old share has no title', () => {
    const parsed = parseChatMessageContent('notes:|你好啊\n第二行|post-2|念白|||0');

    expect(parsed.previewText).toBe('[笔记] 你好啊');
    expect(parsed.note).toMatchObject({ title: '你好啊', noteId: 'post-2', authorName: '念白' });
  });
});

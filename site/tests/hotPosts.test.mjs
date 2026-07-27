import assert from 'node:assert/strict'
import { test } from 'node:test'

import { listFrom, normalizeHotPost } from '../src/hotPosts.js'

test('listFrom reads common backend list shapes', () => {
  assert.deepEqual(listFrom({ data: { list: [{ id: 'a' }] } }), [{ id: 'a' }])
  assert.deepEqual(listFrom({ posts: [{ id: 'b' }] }), [{ id: 'b' }])
  assert.deepEqual(listFrom([{ id: 'c' }]), [{ id: 'c' }])
})

test('normalizeHotPost creates a gallery-ready card with cover and heat score', () => {
  const card = normalizeHotPost(
    {
      id: 'post-1',
      title: '操场夜跑搭子集合',
      content: '今晚八点一起夜跑，顺手拍到了超好看的晚霞。',
      user: { nickname: '小林', avatar: '/uploads/avatar.png' },
      circleName: '校园生活',
      cover_url: '/uploads/cover.jpg',
      like_count: 18,
      comment_count: 7,
      view_count: 320,
      created_at: '2026-06-27T08:00:00.000Z',
    },
    0,
  )

  assert.equal(card.id, 'post-1')
  assert.equal(card.title, '操场夜跑搭子集合')
  assert.equal(card.author, '小林')
  assert.equal(card.cover, '/uploads/cover.jpg')
  assert.equal(card.rank, 1)
  assert.equal(card.heat, 18 * 12 + 7 * 24 + 320)
  assert.equal(card.stats, '320 浏览 · 18 喜欢 · 7 评论')
})

test('normalizeHotPost falls back for text-only posts', () => {
  const card = normalizeHotPost({ id: 'post-2', content: '图书馆三楼靠窗的位置很安静。' }, 3)

  assert.equal(card.rank, 4)
  assert.equal(card.title, '图书馆三楼靠窗的位置很安静。')
  assert.equal(card.cover, '')
  assert.equal(card.author, '灵萌同学')
  assert.match(card.accent, /^linear-gradient/)
})

const assert = require('node:assert/strict');
const fs = require('node:fs');

const frontend = '/Users/nianbaidediannao/Desktop/前端文件';
const api = fs.readFileSync(`${frontend}/api/lmapi.js`, 'utf8');
const poster = fs.readFileSync(`${frontend}/pagesC/post/posterShare.js`, 'utf8');
const detail = fs.readFileSync(`${frontend}/pagesB/post/post.js`, 'utf8');

assert.match(api, /const createPostShare = \(postId, channel\)/);
assert.match(api, /const resolvePostShare = \(code\)/);
assert.doesNotMatch(poster, /\/upload\/unlimited-qrcode/);
assert.match(poster, /api_lmapi\.createPostShare\(postId\.value, "poster"\)/);
assert.match(detail, /api_lmapi\.resolvePostShare\(shareCode\)/);

console.log('post share frontend contract passed');

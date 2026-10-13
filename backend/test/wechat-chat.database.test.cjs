/* Uses only a disposable local PostgreSQL database. AI and WeChat are stubbed. */
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const url = process.env.WECHAT_CHAT_TEST_DATABASE_URL || '';
if (!/^postgresql:\/\/wechat_chat_test@127\.0\.0\.1:55487\/wechat_chat_review(?:\?|$)/.test(url)) throw new Error('Use the disposable wechat_chat_review database on 127.0.0.1:55487');
require('ts-node').register({ transpileOnly: true, project: require('node:path').join(__dirname, '../tsconfig.json') });
const { PrismaClient } = require('@prisma/client');
const { WechatChatService } = require('../src/modules/wechat-chat/wechat-chat.service');
const { WechatChatWorker } = require('../src/modules/wechat-chat/wechat-chat.worker');
const { WechatMomentsWebhookController } = require('../src/modules/wechat-moments/wechat-moments.webhook.controller');
const { WechatpadError } = require('../src/modules/wechat-moments/wechatpad.client');
const { hash, DEFAULT_SETTINGS } = require('../src/modules/wechat-chat/wechat-chat.policy');
const db = new PrismaClient({ datasources: { db: { url } } });
let delivered = [], aiInputs = [], online = true, aiHook = null, sendMode = 'success', sequence = 100, aiContent = '这是测试回复。';
const config = { enabled: false, webhookSecret: 'test-only-webhook', missing: [], wechatpad: { baseUrl: 'https://example.invalid', appKey: 'test', appSecret: 'test', deviceId: 'device-test', cdnBaseUrl: 'https://cdn.invalid' } };
const moments = { getConfig: async () => config, getState: async () => ({ online }), createClient: () => ({ sendText: async (to, text) => { delivered.push({ to, text }); if (sendMode === 'timeout') throw new WechatpadError('timeout', true); if (sendMode === 'unknown') return { messageId: null, confirmed: false }; return { messageId: '12345678901234567890', confirmed: true }; } }), handleWebhook: async (_raw, _sig, body) => { online = body.notify_type === 1003; return { ok: true }; } };
const ai = { getSafeConfig: async () => ({ hasApiKey: true, model: 'offline-model' }), callChatDetailed: async (messages, options) => { aiInputs.push({ messages, options }); if (aiHook) await aiHook(); return { content: aiContent, totalTokens: 25, callLogId: 'qa-call', finishReason: 'stop', outputTokens: 15, inputTokens: 10 }; } };
const service = new WechatChatService(db, moments, ai);
const worker = new WechatChatWorker(service, { withRenewingLock: async (_key, _ttl, run) => run() });
const webhook = new WechatMomentsWebhookController(moments, service);
const test = async (name, run) => { await run(); console.log('PASS', name); };
async function updateSettings(patch) { const s = await service.settings(); return service.saveSettings({ ...patch, revision: s.revision }); }
async function receive(from='wxid_alice', content='你好', extra={}) {
  const body = { device_id: config.wechatpad.deviceId, message: { new_msg_id: String(++sequence), msg_type: 1, from, to: 'wxid_self', content, ...extra } };
  const raw = Buffer.from(JSON.stringify(body));
  const signature = createHmac('sha256', config.webhookSecret).update(raw).digest('hex');
  await webhook.webhook({rawBody:raw},signature,body.device_id);
  const key=hash(JSON.stringify([body.device_id,'wxid_self',from,body.message.new_msg_id]));
  const message=await db.wechatChatMessage.findUnique({where:{eventKey:key},include:{reply:true}});
  if(message.reply) await db.wechatChatReply.update({where:{id:message.reply.id},data:{notBefore:new Date(0)}});
  await db.wechatChatConversation.update({where:{id:message.conversationId},data:{lastReplyAt:null}});
  return { body, raw, signature, message };
}
async function runMessage(from, content, extra) { const r=await receive(from,content,extra);await worker.processConversation(r.message.conversationId);return db.wechatChatReply.findUnique({where:{messageId:r.message.id}}); }
(async()=>{
  await db.wechatChatConversation.deleteMany(); await db.wechatChatQuota.deleteMany(); await db.wechatChatSettings.deleteMany(); await db.wechatChatSkill.deleteMany(); await db.wechatChatKnowledge.deleteMany();
  await test('default disabled, draft-only, builtins not published',async()=>{const s=await service.settings();assert.equal(s.config.enabled,false);assert.equal(s.config.dryRun,true);const skills=await service.skills();assert.deepEqual(skills.map(s=>s.id).sort(),['goutoujunshi','humanizer-zh']);assert(skills.every(s=>!s.enabled&&!s.publishedVersionId));});
  await updateSettings({enabled:true,selfWxid:'wxid_self',dryRun:false});
  await test('raw HMAC, device binding and uint64 message ID survive callback',async()=>{
    const raw=Buffer.from('{ "device_id":"device-test", "message":{"new_msg_id":18446744073709551615,"msg_type":1,"from":"wxid_big","to":"wxid_self","content":"编号: 18446744073709551614"}}');
    const sig=createHmac('sha256',config.webhookSecret).update(raw).digest('hex');
    await assert.rejects(()=>webhook.webhook({},sig,'device-test'));
    await assert.rejects(()=>webhook.webhook({rawBody:raw},'bad','device-test'));
    await assert.rejects(()=>webhook.webhook({rawBody:raw},sig,'wrong-device'));
    await webhook.webhook({rawBody:raw},sig,'device-test');
    const row=await db.wechatChatMessage.findFirst({where:{remoteId:'18446744073709551615'}});assert.equal(row.text,'编号: 18446744073709551614');
  });
  await test('repeated and concurrent callbacks create one inbox and outbox record',async()=>{const r=await receive();await Promise.all(Array.from({length:8},()=>webhook.webhook({rawBody:r.raw},r.signature,'device-test')));assert.equal(await db.wechatChatMessage.count({where:{eventKey:r.message.eventKey}}),1);assert.equal(await db.wechatChatReply.count({where:{messageId:r.message.id}}),1);});
  await test('own and unverified group messages never create reply jobs',async()=>{const self=await receive('wxid_self');assert.equal(self.message.reason,'self_message');assert.equal(self.message.reply,null);const group=await receive('group@chatroom','wxid_admin:\n/重置');assert.equal(group.message.reason,'group_sender_unverified');assert.equal(group.message.reply,null);});
  await test('concurrent consumers claim one conversation and send once',async()=>{const r=await receive('wxid_concurrent');const before=delivered.length;await Promise.all([worker.processConversation(r.message.conversationId),worker.processConversation(r.message.conversationId)]);assert.equal(delivered.length-before,1);const job=await db.wechatChatReply.findUnique({where:{messageId:r.message.id}});assert.equal(job.status,'sent');assert.equal(delivered.at(-1).to,'wxid_concurrent');assert.equal(aiInputs.at(-1).options.privateContent,true);});
  await test('pause during model generation cancels the pending send',async()=>{const before=delivered.length;aiHook=()=>updateSettings({enabled:false});const row=await runMessage('wxid_pause');aiHook=null;assert.equal(row.status,'cancelled');assert.equal(delivered.length,before);await updateSettings({enabled:true});});
  await test('manual takeover prevents generation and delivery',async()=>{const r=await receive('wxid_takeover');const c=await db.wechatChatConversation.findUnique({where:{id:r.message.conversationId}});await service.updateConversation(c.id,{revision:c.revision,takeover:true});const before=aiInputs.length;await worker.processConversation(c.id);assert.equal(aiInputs.length,before);assert.equal((await db.wechatChatReply.findUnique({where:{messageId:r.message.id}})).status,'cancelled');});
  await test('draft mode generates but never sends',async()=>{await updateSettings({dryRun:true});const before=delivered.length;const row=await runMessage('wxid_draft');assert.equal(row.status,'draft');assert.equal(delivered.length,before);await updateSettings({dryRun:false});});
  await test('ambiguous sends stay unknown and are never automatically retried',async()=>{sendMode='timeout';const before=delivered.length;const row=await runMessage('wxid_timeout');assert.equal(row.status,'unknown');await worker.processConversation(row.conversationId);assert.equal(delivered.length-before,1);await service.resolveUnknown(row.id,{resolution:'not_sent'});assert.equal((await db.wechatChatReply.findUnique({where:{id:row.id}})).status,'cancelled');sendMode='success';});
  await test('unrecognized receipt also stays unknown',async()=>{sendMode='unknown';const row=await runMessage('wxid_receipt');assert.equal(row.status,'unknown');sendMode='success';});
  await test('skill publication, ordinary chat versus advisor and rollback',async()=>{
    let skills=await service.skills();for(const s of skills) await service.publishSkill(s.id,{versionId:s.versions[0].id,enabled:true,scope:'all'});
    const r=await receive('wxid_skills');const cfg=(await service.settings()).config;
    const normal=await service.buildReply(r.message.conversationId,'今天吃什么',cfg);assert.deepEqual(normal.sourceVersions.skills.map(s=>s.id),['humanizer-zh']);
    const advisor=await service.buildReply(r.message.conversationId,'/军师 不知道怎么开口',cfg);assert(advisor.sourceVersions.skills.some(s=>s.id==='goutoujunshi'));
    const humanizer=skills.find(s=>s.id==='humanizer-zh');const old=humanizer.versions[0];await service.createSkillVersion(humanizer.id,{name:humanizer.name,content:'新版本测试规则',sourceUrl:old.sourceUrl,commit:old.commit,license:old.license},'test-admin');
    skills=await service.skills();const latest=skills.find(s=>s.id===humanizer.id).versions[0];await service.publishSkill(humanizer.id,{versionId:latest.id,enabled:true,scope:'all'});await service.publishSkill(humanizer.id,{versionId:old.id,enabled:true,scope:'all'});assert.equal((await db.wechatChatSkill.findUnique({where:{id:humanizer.id}})).publishedVersionId,old.id);
  });
  await test('private context and conversation-scoped knowledge do not cross contacts',async()=>{
    await runMessage('wxid_privateA','秘密口令苹果派');const b=await receive('wxid_privateB','苹果派');
    const a=await db.wechatChatConversation.findFirst({where:{wxid:'wxid_privateA'}});await service.saveKnowledge(undefined,{title:'苹果派内部资料',content:'只给 A 的内部资料',source:'测试资料',scope:'conversation',conversationId:a.id,enabled:true});
    const cfg=(await service.settings()).config;const result=await service.buildReply(b.message.conversationId,'苹果派',cfg);assert(!JSON.stringify(result).includes('秘密口令苹果派'));assert(!JSON.stringify(result).includes('只给 A 的内部资料'));
  });
  await test('group members have independent history and a persistent stop-banter preference',async()=>{
    await updateSettings({groupEnabled:true,groupContractConfirmed:true,groupSenderField:'sender_wxid',groupMentionsField:'at_wxids',groupTrigger:'prefix',defaultStyle:'banter'});
    await runMessage('friends@chatroom','/ai 甲的私密咨询',{sender_wxid:'wxid_A'});
    const b=await receive('friends@chatroom','/ai 你好',{sender_wxid:'wxid_B'});let cfg=(await service.settings()).config;
    const context=await service.buildReply(b.message.conversationId,'你好',cfg,undefined,'wxid_B');assert(!JSON.stringify(context).includes('甲的私密咨询'));
    await receive('friends@chatroom','/ai 别怼了',{sender_wxid:'wxid_B'});
    const muted=await service.buildReply(b.message.conversationId,'你好',cfg,undefined,'wxid_B');assert(muted.messages[0].content.includes('自然接话，通常一至三句'));
    const other=await service.buildReply(b.message.conversationId,'你好',cfg,undefined,'wxid_A');assert(other.messages[0].content.includes('轻松斗嘴语境'));
  });
  await test('automatic group detection works without manual fields and leaves safe evidence while disabled',async()=>{
    await updateSettings({groupEnabled:false,groupContractConfirmed:false,groupSenderField:'',groupMentionsField:'',groupTrigger:'mention'});
    const r=await receive('auto@chatroom','PRIVATE_DIAGNOSTIC_BODY',{sender_wxid:'wxid_auto_member',at_wxids:['wxid_self']});
    assert.equal(r.message.reason,'group_disabled');assert.equal(r.message.reply,null);
    let status=await service.status();assert.equal(status.detection.group.memberState,'recognized');assert.equal(status.detection.group.selfMentioned,true);assert(!JSON.stringify(status.detection).includes('PRIVATE_DIAGNOSTIC_BODY'));assert(!JSON.stringify(status.detection).includes('wxid_auto_member'));
    const key=service.observationKey('another-device',(await service.settings()).config,'group');assert.equal(await db.config.findUnique({where:{key}}),null);
    await updateSettings({groupEnabled:true});const sent=await runMessage('auto@chatroom','你好',{sender_wxid:'wxid_auto_member',at_wxids:['wxid_self']});
    assert.equal(sent.status,'sent');
  });
  await test('unsupported and conflicting group identity never generate a reply',async()=>{
    const before=aiInputs.length;
    for(const extra of [{nickname:'wxid_auto_member'}, {sender_wxid:'wxid_A',real_sender_wxid:'wxid_B'}]){
      const r=await receive('unknown@chatroom','@机器人 PRIVATE_DIAGNOSTIC_BODY',extra);assert.equal(r.message.reason,'group_sender_unverified');assert.equal(r.message.reply,null);await worker.processConversation(r.message.conversationId);
    }
    assert.equal(aiInputs.length,before);assert.equal((await service.status()).detection.group.memberState,'conflicting');
  });
  await test('atomic daily reservation permits only one concurrent call at the last slot',async()=>{await updateSettings({maxDailyCalls:1});await db.wechatChatQuota.deleteMany();const cfg=(await service.settings()).config;const before=aiInputs.length;const results=await Promise.allSettled([service.generate([{role:'user',content:'一'}],cfg),service.generate([{role:'user',content:'二'}],cfg)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(aiInputs.length-before,1);});
  await test('zero values survive save/load and do not replace unrelated settings',async()=>{
    await updateSettings({maxDailyCalls:0,maxDailyTokens:0,maxReplyChars:0,maxOutputTokens:0,contextMessages:0,emojiLevel:0});
    const cfg=(await service.settings()).config;for(const key of ['maxDailyCalls','maxDailyTokens','maxReplyChars','maxOutputTokens','contextMessages','emojiLevel']) assert.equal(cfg[key],0);
  });
  await test('zero daily limits continue recording usage after former thresholds',async()=>{
    const cfg=(await service.settings()).config;await db.wechatChatQuota.deleteMany();
    await service.generate([{role:'user',content:'测试'}],cfg);const row=await db.wechatChatQuota.findFirst();
    await db.wechatChatQuota.update({where:{id:row.id},data:{calls:20000,tokens:20000000}});
    await service.generate([{role:'user',content:'测试'}],cfg);const after=await db.wechatChatQuota.findUnique({where:{id:row.id}});
    assert.equal(after.calls,20001);assert.equal(after.tokens,20000025);assert.equal(aiInputs.at(-1).options.maxTokens,0);
  });
  await test('unlimited replies larger than MySQL TEXT are stored completely',async()=>{
    aiContent='好'.repeat(30000);const row=await runMessage('wxid_long_reply','长回复测试');
    assert.equal(row.status,'sent');assert.equal(row.text,aiContent);assert.equal(row.sourceVersions.generation.responseChars,30000);aiContent='这是测试回复。';
  });
  await test('overlong responses are truncated and sent with a distinct reason',async()=>{
    await updateSettings({maxReplyChars:30});aiContent='😀'.repeat(31);const row=await runMessage('wxid_truncate','截短测试');
    assert.equal(row.status,'sent');assert.equal(row.reason,'reply_truncated');assert.equal(row.text,'😀'.repeat(30));assert.equal(row.sourceVersions.generation.responseChars,31);aiContent='这是测试回复。';
  });
  await test('empty response is recorded with model diagnostics and is never sent',async()=>{
    const before=delivered.length;aiContent='';const row=await runMessage('wxid_empty','空回复测试');
    assert.equal(row.status,'failed');assert.equal(row.reason,'empty_reply');assert.equal(row.sourceVersions.generation.callLogId,'qa-call');assert.equal(delivered.length,before);aiContent='这是测试回复。';
  });
  await test('finite token budget cannot be simultaneously reserved by two uncapped outputs',async()=>{
    await db.wechatChatQuota.deleteMany();await updateSettings({maxDailyCalls:0,maxDailyTokens:100000,maxOutputTokens:0});
    aiHook=()=>new Promise(resolve=>setTimeout(resolve,100));const cfg=(await service.settings()).config;
    const results=await Promise.allSettled([service.generate([{role:'user',content:'一'}],cfg),service.generate([{role:'user',content:'二'}],cfg)]);aiHook=null;
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.wechatChatQuota.findFirst()).tokens,25);
  });
  await test('concurrent finite calls with unlimited tokens retain the atomic last-call limit',async()=>{
    await db.wechatChatQuota.deleteMany();await updateSettings({maxDailyCalls:1,maxDailyTokens:0});const cfg=(await service.settings()).config;
    const results=await Promise.allSettled([service.generate([{role:'user',content:'一'}],cfg),service.generate([{role:'user',content:'二'}],cfg)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.wechatChatQuota.findFirst()).calls,1);
  });
  await test('expired sending lease recovers as unknown without retransmission',async()=>{await updateSettings({enabled:false});const c=await db.wechatChatConversation.findFirst();const m=await db.wechatChatMessage.create({data:{conversationId:c.id,eventKey:'recovery-'+Date.now(),remoteId:'recovery',sender:c.wxid,text:'恢复测试',msgType:1,status:'accepted'}});const j=await db.wechatChatReply.create({data:{messageId:m.id,conversationId:c.id,deviceId:'device-test',recipient:c.wxid,status:'sending',leaseUntil:new Date(0),settingsRevision:1,conversationRevision:1}});const before=delivered.length;await worker.tick();assert.equal((await db.wechatChatReply.findUnique({where:{id:j.id}})).status,'unknown');assert.equal(delivered.length,before);});
  console.log('All 24 disposable PostgreSQL scenarios passed; no external AI or WeChat calls.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());

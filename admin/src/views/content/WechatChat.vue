<template>
  <div class="page-container wechat-chat">
    <PageHeader
      title="微信 AI 聊天"
      subtitle="私聊、群聊与 Skill 分别控制，先预览，再发送"
    >
      <template #actions
        ><el-button @click="$router.push('/content/wechat-moments')"
          >微信连接</el-button
        ><el-button @click="$router.push('/ai/config')">模型配置</el-button
        ><el-button :loading="loading" @click="refresh"
          >刷新</el-button
        ></template
      >
    </PageHeader>
    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      :closable="false"
      show-icon
    />
    <div class="summary-grid">
      <div class="glass-card metric">
        <span>回复状态</span
        ><strong>{{
          !form.enabled ? "已关闭" : form.dryRun ? "草稿观察中" : "自动回复中"
        }}</strong
        ><small>{{
          form.dryRun ? "只生成后台草稿" : "按规则发送到微信"
        }}</small>
      </div>
      <div class="glass-card metric">
        <span>微信连接</span
        ><strong>{{
          overview.connection?.online ? "已上线" : "等待上线回调"
        }}</strong
        ><small>{{
          overview.connection?.deviceId || "先完成共用微信连接"
        }}</small>
      </div>
      <div class="glass-card metric">
        <span>今日模型调用</span
        ><strong
          >{{ overview.quota?.calls || 0 }} /
          {{ limitLabel(form.maxDailyCalls) }}</strong
        ><small
          >Token：{{ overview.quota?.tokens || 0 }} /
          {{ limitLabel(form.maxDailyTokens) }}</small
        >
        <small>按 UTC 日期统计，预览也计入用量</small>
      </div>
      <div class="glass-card metric">
        <span>已收录会话</span><strong>{{ overview.conversations || 0 }}</strong
        ><small>私聊与群聊独立控制</small>
      </div>
    </div>
    <el-tabs v-model="tab" class="glass-card panel">
      <el-tab-pane label="回复规则" name="rules">
        <div class="section-heading">
          <div>
            <h3>先看草稿，再开启发送</h3>
            <p>
              排除名单、人工接管和会话设置优先生效。修改规则会取消尚未发送的旧任务。
            </p>
          </div>
          <el-button
            v-if="can('wechat:reply:edit')"
            type="primary"
            :loading="saving"
            @click="saveRules"
            >保存规则</el-button
          >
        </div>
        <el-form label-width="150px" :disabled="!can('wechat:reply:edit')">
          <div class="two-columns">
            <div>
              <el-form-item
                v-for="item in switches"
                :key="item.key"
                :label="item.label"
                ><el-switch v-model="form[item.key]" /><small class="hint">{{
                  item.hint
                }}</small></el-form-item
              >
              <el-form-item label="本号 wxid"
                ><el-input
                  v-model="form.selfWxid"
                  placeholder="运营微信号的真实 wxid"
              /></el-form-item>
              <el-form-item label="默认风格"
                ><el-select v-model="form.defaultStyle"
                  ><el-option
                    v-for="s in styles"
                    :key="s.value"
                    v-bind="s" /></el-select
              ></el-form-item>
              <el-form-item label="群聊触发"
                ><el-select v-model="form.groupTrigger"
                  ><el-option
                    v-for="s in triggers"
                    :key="s.value"
                    v-bind="s" /></el-select
              ></el-form-item>
              <el-form-item label="群聊前缀"
                ><el-input
                  v-model="form.groupPrefix"
                  placeholder="例如 /ai（末尾可有空格）"
              /></el-form-item>
            </div>
            <div>
              <el-form-item
                v-for="item in numbers"
                :key="item.key"
                :label="item.label"
                ><el-input-number
                  v-model="form[item.key]"
                  :min="item.min"
                  :max="item.max"
                  :precision="0"
                /><small v-if="item.hint" class="limit-hint">{{
                  item.hint
                }}</small></el-form-item
              >
            </div>
          </div>
          <div class="hint-box">
            四个上限填 0
            表示不限制，仍记录实际用量。回复超过非零字数上限时会截短后发送。
            单次输出 Token 填 0 时使用模型默认输出范围，仍受模型自身上限约束。
            每日 Token
            为实际用量限额；单次输出不限时，本次调用可跨过剩余额度，之后停止新调用。
            AI 运营中心的全局限额独立生效。
          </div>
          <div class="hint-box">
            只支持 /帮助、/技能列表、/军师 问题，以及私聊的 /重置。安装
            Skill、改密钥、全局启停只在后台操作。回怼用于朋友间斗嘴，严肃倾诉正常回应。
          </div>
          <el-form-item label="排除名单"
            ><el-input
              v-model="excludedText"
              type="textarea"
              :rows="3"
              placeholder="每行一个联系人或群 wxid"
          /></el-form-item>
          <el-form-item label="补充表达要求"
            ><el-input
              v-model="form.extraInstructions"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
              placeholder="例如少用表情、回答简短；这里不能赋予执行命令权限"
          /></el-form-item>
          <div class="group-detection">
            <div class="section-heading">
              <div>
                <h3>群聊接入检测</h3>
                <p class="muted">
                  系统自动识别发言者和 @ 信息，无需填写技术字段。
                </p>
              </div>
              <el-button :loading="checkingDetection" @click="refreshDetection"
                >检查接入状态</el-button
              >
            </div>
            <div class="detection-grid">
              <div>
                <span>群消息接收</span
                ><el-tag :type="groupProbe ? 'success' : 'info'">{{
                  groupProbe ? "已收到" : "等待测试消息"
                }}</el-tag>
              </div>
              <div>
                <span>发言者识别</span
                ><el-tag
                  :type="
                    groupProbe?.memberState === 'recognized'
                      ? 'success'
                      : 'info'
                  "
                  >{{ detectionLabel(groupProbe?.memberState) }}</el-tag
                >
              </div>
              <div>
                <span>@ 本号识别</span
                ><el-tag
                  :type="groupProbe?.selfMentioned ? 'success' : 'info'"
                  >{{
                    groupProbe?.selfMentioned
                      ? "已识别 @ 本号"
                      : groupProbe?.mentionState === "recognized"
                        ? "已识别，本条未 @ 本号"
                        : detectionLabel(groupProbe?.mentionState)
                  }}</el-tag
                >
              </div>
            </div>
            <p>{{ groupDetectionHint }}</p>
            <p v-if="groupProbe" class="muted">
              最近检测：{{ formatDate(groupProbe.receivedAt) }}
            </p>
            <p class="muted">
              检测按钮只读取状态，不调用
              AI，也不切换回复开关。未确认发言者的群消息不会自动回复。
            </p>
          </div>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="私聊与群聊" name="conversations">
        <p class="muted">
          收到验签通过的消息后会话会自动出现。暂停或人工接管会取消待发任务，已经交给微信发送的消息无法撤回。
        </p>
        <el-table :data="conversations" empty-text="等待接收微信消息"
          ><el-table-column
            prop="wxid"
            label="联系人／群"
            min-width="200"
            show-overflow-tooltip
          /><el-table-column label="类型" width="90"
            ><template #default="{ row }">{{
              row.kind === "group" ? "群聊" : "私聊"
            }}</template></el-table-column
          ><el-table-column label="状态" width="130"
            ><template #default="{ row }"
              ><el-tag>{{
                row.takeover ? "人工接管" : row.enabled ? "允许回复" : "已暂停"
              }}</el-tag></template
            ></el-table-column
          ><el-table-column label="风格" width="120"
            ><template #default="{ row }">{{
              styleLabel(row.style)
            }}</template></el-table-column
          ><el-table-column label="操作" width="210"
            ><template #default="{ row }"
              ><el-button
                v-if="can('wechat:reply:edit')"
                link
                type="primary"
                @click="editConversation(row)"
                >设置</el-button
              ><el-button
                v-if="can('wechat:content:view')"
                link
                type="primary"
                @click="showMessages(row)"
                >消息与草稿</el-button
              ></template
            ></el-table-column
          ></el-table
        >
        <el-pagination
          v-model:current-page="page"
          :total="total"
          :page-size="30"
          layout="prev, pager, next, total"
          @current-change="loadConversations"
        />
      </el-tab-pane>
      <el-tab-pane v-if="can('skill:view')" label="Skill 管理" name="skills">
        <div class="section-heading">
          <div>
            <h3>预置狗头军师、Humanizer-zh</h3>
            <p>
              审阅文字规则后发布启用。仓库脚本不执行，新增 Skill
              也须先保存草稿。
            </p>
          </div>
          <el-button v-if="can('skill:edit')" @click="editSkill()"
            >新增文字 Skill</el-button
          >
        </div>
        <div v-for="skill in skills" :key="skill.id" class="skill-card">
          <div class="section-heading">
            <h3>
              {{ skill.name }}
              <el-tag :type="skill.enabled ? 'success' : 'info'">{{
                skill.enabled ? "已启用" : "未启用"
              }}</el-tag>
            </h3>
            <el-button v-if="can('skill:edit')" @click="editSkill(skill)"
              >编辑新草稿</el-button
            >
          </div>
          <el-select v-model="selectedVersions[skill.id]" style="width: 100%"
            ><el-option
              v-for="v in skill.versions"
              :key="v.id"
              :value="v.id"
              :label="`${v.id === skill.publishedVersionId ? '已发布' : '草稿'} · ${formatDate(v.createdAt)} · ${v.hash.slice(0, 8)}`"
          /></el-select>
          <template v-if="selectedVersion(skill)"
            ><p class="muted">
              <a
                :href="safeSource(selectedVersion(skill).sourceUrl)"
                target="_blank"
                rel="noopener noreferrer"
                >{{ selectedVersion(skill).sourceUrl }}</a
              >
              · {{ selectedVersion(skill).license }}
            </p>
            <el-input
              :model-value="selectedVersion(skill).content"
              type="textarea"
              :rows="6"
              readonly
          /></template>
          <div v-if="can('skill:publish')" class="button-row">
            <el-select v-model="skill.scope" style="width: 150px"
              ><el-option label="私聊和群聊" value="all" /><el-option
                label="仅私聊"
                value="private" /><el-option
                label="仅群聊"
                value="group" /></el-select
            ><el-button type="primary" @click="publish(skill, true)"
              >发布此版本并启用</el-button
            ><el-button @click="publish(skill, false)">停用</el-button>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane
        v-if="can('wechat:knowledge:edit')"
        label="问答资料"
        name="knowledge"
        ><div class="section-heading">
          <p>只检索已启用且当前会话获准使用的资料。</p>
          <el-button type="primary" @click="editKnowledge()"
            >添加资料</el-button
          >
        </div>
        <el-table :data="knowledge"
          ><el-table-column prop="title" label="标题" /><el-table-column
            label="范围"
            ><template #default="{ row }">{{
              scopeLabel(row.scope)
            }}</template></el-table-column
          ><el-table-column label="状态"
            ><template #default="{ row }">{{
              row.enabled ? "已启用" : "未启用"
            }}</template></el-table-column
          ><el-table-column label="操作"
            ><template #default="{ row }"
              ><el-button link type="primary" @click="editKnowledge(row)"
                >编辑／撤回</el-button
              ></template
            ></el-table-column
          ></el-table
        ></el-tab-pane
      >
      <el-tab-pane v-if="canPreview" label="风格预览" name="preview"
        ><h3>看看它会怎么接话</h3>
        <p class="muted">
          调用真实模型并计入额度，结果不发送到微信。独立预览不使用会话历史和
          Skill。
        </p>
        <el-form label-width="110px"
          ><el-form-item label="会话范围"
            ><el-select
              v-model="preview.conversationId"
              clearable
              placeholder="独立预览"
              style="width: 100%"
              ><el-option
                v-for="c in conversations"
                :key="c.id"
                :label="c.wxid"
                :value="c.id" /></el-select></el-form-item
          ><el-form-item label="风格"
            ><el-radio-group v-model="preview.style"
              ><el-radio-button
                v-for="s in styles"
                :key="s.value"
                :value="s.value"
                >{{ s.label }}</el-radio-button
              ></el-radio-group
            ></el-form-item
          ><el-form-item label="对方的话"
            ><el-input
              v-model="preview.text"
              type="textarea"
              :rows="4"
              maxlength="6000" /></el-form-item
          ><el-form-item
            ><el-button type="primary" :loading="previewing" @click="runPreview"
              >生成预览</el-button
            ></el-form-item
          ></el-form
        >
        <div v-if="previewResult" class="reply-preview">
          <p v-if="previewReason" class="muted">
            {{ reasonLabel(previewReason) }}
          </p>
          {{ previewResult }}
        </div></el-tab-pane
      >
      <el-tab-pane v-if="can('wechat:log:view')" label="回复任务" name="jobs"
        ><p class="muted">
          结果未知不会自动重发，请在微信核对后标记。确认未发送的任务会取消。
        </p>
        <el-table :data="jobs"
          ><el-table-column
            prop="recipient"
            label="收件对象"
            min-width="180"
            show-overflow-tooltip
          /><el-table-column label="状态" width="110"
            ><template #default="{ row }"
              ><el-tag :type="row.status === 'unknown' ? 'warning' : 'info'">{{
                statusLabel(row.status)
              }}</el-tag></template
            ></el-table-column
          ><el-table-column label="说明" min-width="240"
            ><template #default="{ row }">
              <div>{{ reasonLabel(row.reason) }}</div>
              <small v-if="row.diagnostics" class="muted">{{
                diagnosticLabel(row.diagnostics)
              }}</small>
              <div v-if="row.diagnostics?.callLogId" class="muted">
                调用记录：{{ row.diagnostics.callLogId }}
              </div>
            </template></el-table-column
          ><el-table-column label="时间" width="180"
            ><template #default="{ row }">{{
              formatDate(row.createdAt)
            }}</template></el-table-column
          ><el-table-column
            v-if="can('wechat:reply:edit')"
            label="核查"
            width="170"
            ><template #default="{ row }"
              ><template v-if="row.status === 'unknown'"
                ><el-button
                  link
                  type="primary"
                  @click="resolveJob(row.id, 'sent')"
                  >已发出</el-button
                ><el-button link @click="resolveJob(row.id, 'not_sent')"
                  >未发出</el-button
                ></template
              ></template
            ></el-table-column
          ></el-table
        ></el-tab-pane
      >
      <el-tab-pane v-if="canPreview" label="技术诊断" name="diagnostics"
        ><p class="muted">
          日常接入请使用“回复规则”中的“群聊接入检测”。以下内容仅供技术人员排查，通常无需操作。
        </p>
        <el-collapse
          ><el-collapse-item title="开发者样例检查" name="sample"
            ><h3>消息和朋友圈共用回调</h3>
            <p>
              新路径：<code>/api/wechat-channel/webhook</code>；原朋友圈回调地址继续有效。
            </p>
            <p class="muted">
              粘贴脱敏 JSON 检查消息 ID、成员与收件对象。样例不入库、不调用
              AI、不发送消息；正式请求仍须验签。
            </p>
            <el-input
              v-model="sampleJson"
              type="textarea"
              :rows="8"
              maxlength="16000"
              placeholder="粘贴供应商回调 JSON 样例"
            /><el-button class="mt16" @click="inspectSample"
              >检查样例</el-button
            >
            <pre v-if="sampleResult" class="sample-result">{{
              sampleResult
            }}</pre>
          </el-collapse-item></el-collapse
        >
      </el-tab-pane>
    </el-tabs>
    <el-dialog v-model="conversationDialog" title="会话回复设置" width="580px"
      ><el-form label-width="110px"
        ><el-form-item label="联系人／群">{{
          conversationForm.wxid
        }}</el-form-item
        ><el-form-item label="允许回复"
          ><el-switch v-model="conversationForm.enabled" /></el-form-item
        ><el-form-item label="人工接管"
          ><el-switch v-model="conversationForm.takeover" /></el-form-item
        ><el-form-item label="风格"
          ><el-select v-model="conversationForm.style"
            ><el-option label="跟随全局" value="inherit" /><el-option
              v-for="s in styles"
              :key="s.value"
              v-bind="s" /></el-select></el-form-item
        ><el-form-item v-if="conversationForm.kind === 'group'" label="群触发"
          ><el-select v-model="conversationForm.groupTrigger"
            ><el-option label="跟随全局" value="inherit" /><el-option
              v-for="s in triggers"
              :key="s.value"
              v-bind="s" /></el-select></el-form-item
        ><el-form-item label="允许的 Skill"
          ><el-select
            v-model="conversationForm.allowedSkills"
            multiple
            style="width: 100%"
            ><el-option
              v-for="s in skills"
              :key="s.id"
              :value="s.id"
              :label="s.name" /></el-select></el-form-item
        ><el-form-item label="重置上下文"
          ><el-switch
            v-model="conversationForm.resetContext" /></el-form-item></el-form
      ><template #footer
        ><el-button @click="conversationDialog = false">取消</el-button
        ><el-button type="primary" @click="saveConversation"
          >保存</el-button
        ></template
      ></el-dialog
    >
    <el-drawer
      v-model="messagesDrawer"
      :title="`消息与草稿 · ${messageTitle}`"
      size="600px"
      ><el-empty v-if="!messages.length" description="暂无消息" />
      <div v-for="m in messages" :key="m.id" class="message-card">
        <p class="muted">
          {{ formatDate(m.createdAt) }} · {{ m.sender || "发送者待核对" }}
        </p>
        <div class="message-text">{{ m.text }}</div>
        <p class="muted">{{ reasonLabel(m.reason) }}</p>
        <div v-if="m.reply" class="reply-preview">
          <el-tag>{{ statusLabel(m.reply.status) }}</el-tag>
          <p v-if="m.reply.reason" class="muted">
            {{ reasonLabel(m.reply.reason) }}
          </p>
          <p>{{ m.reply.text }}</p>
        </div>
      </div></el-drawer
    >
    <el-dialog v-model="skillDialog" title="编辑 Skill 草稿" width="720px"
      ><el-form label-width="110px"
        ><el-form-item label="标识"
          ><el-input
            v-model="skillForm.id"
            :disabled="editingSkill" /></el-form-item
        ><el-form-item v-for="f in skillFields" :key="f.key" :label="f.label"
          ><el-input v-model="skillForm[f.key]" /></el-form-item
        ><el-form-item label="已审阅文字规则"
          ><el-input
            v-model="skillForm.content"
            type="textarea"
            :rows="10"
            maxlength="12000"
            show-word-limit /></el-form-item></el-form
      ><template #footer
        ><el-button @click="skillDialog = false">取消</el-button
        ><el-button type="primary" @click="saveSkill"
          >保存新草稿</el-button
        ></template
      ></el-dialog
    >
    <el-dialog v-model="knowledgeDialog" title="问答资料" width="680px"
      ><el-form label-width="100px"
        ><el-form-item label="标题"
          ><el-input v-model="knowledgeForm.title" /></el-form-item
        ><el-form-item label="来源说明"
          ><el-input v-model="knowledgeForm.source" /></el-form-item
        ><el-form-item label="可见范围"
          ><el-select v-model="knowledgeForm.scope"
            ><el-option
              v-for="s in ['private', 'group', 'all', 'conversation']"
              :key="s"
              :label="scopeLabel(s)"
              :value="s" /></el-select></el-form-item
        ><el-form-item
          v-if="knowledgeForm.scope === 'conversation'"
          label="指定会话"
          ><el-select v-model="knowledgeForm.conversationId"
            ><el-option
              v-for="c in conversations"
              :key="c.id"
              :label="c.wxid"
              :value="c.id" /></el-select></el-form-item
        ><el-form-item label="允许检索"
          ><el-switch v-model="knowledgeForm.enabled" /></el-form-item
        ><el-form-item label="资料正文"
          ><el-input
            v-model="knowledgeForm.content"
            type="textarea"
            :rows="10"
            maxlength="12000"
            show-word-limit /></el-form-item></el-form
      ><template #footer
        ><el-button @click="knowledgeDialog = false">取消</el-button
        ><el-button type="primary" @click="saveKnowledge"
          >保存</el-button
        ></template
      ></el-dialog
    >
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { request } from "@/api/request";
import { useAuthStore } from "@/stores/auth";
const BASE = "/admin/wechat-chat",
  auth = useAuthStore();
const can = (p: string) =>
  ["super_admin", "SUPER_ADMIN", "超级管理员"].includes(auth.user.role) ||
  auth.permissions.includes(p);
const canPreview = computed(
  () => can("wechat:reply:edit") && can("wechat:content:view"),
);
const overview = ref<any>({}),
  form = reactive<any>({
    enabled: false,
    dryRun: true,
    privateEnabled: true,
    groupEnabled: false,
    selfWxid: "",
    defaultStyle: "daily",
    groupTrigger: "prefix",
    groupPrefix: "/ai ",
    groupSenderField: "",
    groupMentionsField: "",
    groupContractConfirmed: false,
    maxReplyChars: 500,
    maxOutputTokens: 500,
    maxDailyCalls: 200,
    maxDailyTokens: 500000,
    cooldownSeconds: 8,
    contextMessages: 8,
    emojiLevel: 1,
    extraInstructions: "",
    commandsEnabled: true,
    excludedWxids: [],
  });
const styles = [
    { label: "日常", value: "daily" },
    { label: "幽默", value: "humorous" },
    { label: "回怼／损友", value: "banter" },
  ],
  triggers = [
    { label: "指定前缀（推荐）", value: "prefix" },
    { label: "明确 @ 本号", value: "mention" },
    { label: "每条文本", value: "all" },
  ];
const switches = [
  { key: "enabled", label: "聊天处理总开关", hint: "" },
  { key: "dryRun", label: "只生成草稿", hint: "关闭后才自动发送" },
  { key: "privateEnabled", label: "私聊回复", hint: "" },
  { key: "groupEnabled", label: "群聊回复", hint: "" },
  { key: "commandsEnabled", label: "固定聊天命令", hint: "" },
];
const numbers = [
  {
    key: "maxReplyChars",
    label: "回复字数上限",
    min: 0,
    max: 2000,
    hint: "0 = 不限制；非零为 30–2000 字，超出时截短",
  },
  { key: "cooldownSeconds", label: "会话冷却（秒）", min: 3, max: 3600 },
  { key: "contextMessages", label: "私聊上下文条数", min: 0, max: 20 },
  {
    key: "maxDailyCalls",
    label: "每日调用上限",
    min: 0,
    max: 10000,
    hint: "0 = 不限制；非零为 1–10000 次",
  },
  {
    key: "maxDailyTokens",
    label: "每日 Token 上限",
    min: 0,
    max: 10000000,
    hint: "0 = 不限制；非零为 1000–10000000 Token",
  },
  {
    key: "maxOutputTokens",
    label: "单次输出 Token",
    min: 0,
    max: 2000,
    hint: "0 = 不设单次上限；非零为 100–2000 Token",
  },
  { key: "emojiLevel", label: "表情程度", min: 0, max: 3 },
];
const skillFields = [
  { key: "name", label: "名称" },
  { key: "sourceUrl", label: "GitHub 来源" },
  { key: "commit", label: "40 位提交 SHA" },
  { key: "license", label: "许可证" },
];
const tab = ref("rules"),
  loading = ref(false),
  saving = ref(false),
  loadError = ref(""),
  excludedText = ref(""),
  page = ref(1),
  total = ref(0);
const conversations = ref<any[]>([]),
  skills = ref<any[]>([]),
  knowledge = ref<any[]>([]),
  jobs = ref<any[]>([]),
  selectedVersions = reactive<Record<string, string>>({});
const conversationDialog = ref(false),
  conversationForm = reactive<any>({}),
  messagesDrawer = ref(false),
  messages = ref<any[]>([]),
  messageTitle = ref("");
const skillDialog = ref(false),
  editingSkill = ref(false),
  skillForm = reactive<any>({}),
  knowledgeDialog = ref(false),
  knowledgeForm = reactive<any>({});
const preview = reactive({
    conversationId: "",
    style: "daily",
    text: "你怎么这么能说？",
  }),
  previewing = ref(false),
  previewResult = ref(""),
  previewReason = ref(""),
  sampleJson = ref(""),
  sampleResult = ref("");
const labels: Record<string, string> = {
  pending: "排队中",
  generating: "生成中",
  draft: "草稿",
  sending: "发送中",
  sent: "已发出",
  unknown: "结果未知",
  cancelled: "已取消",
  failed: "失败",
  inherit: "跟随全局",
  daily: "日常",
  humorous: "幽默",
  banter: "回怼／损友",
  private: "仅私聊",
  group: "仅群聊",
  all: "全部会话",
  conversation: "指定会话",
};
const reasons: Record<string, string> = {
  disabled: "聊天关闭",
  conversation_paused: "暂停或人工接管",
  excluded: "命中排除名单",
  private_disabled: "私聊关闭",
  group_disabled: "群聊关闭",
  self_message: "自身消息",
  non_text: "非文本消息",
  group_sender_unverified: "暂未识别群发言者",
  recipient_unverified: "收件对象待核对",
  self_wxid_missing: "本号 wxid 未配置",
  invalid_message_id: "消息 ID 无效",
  invalid_content: "内容为空或过长",
  not_mentioned: "未明确 @ 本号",
  prefix_missing: "未命中群前缀",
  system_account: "系统账号",
  device_binding_changed: "设备已变化，请重新保存配置",
  settings_changed: "规则已变化",
  conversation_changed: "会话设置已变化",
  skill_changed: "Skill 已变化",
  knowledge_changed: "资料已变化",
  policy_changed: "权限或规则已变化",
  policy_changed_before_send: "发送前规则复核未通过",
  expired: "任务超过十分钟",
  superseded: "合并到同一人的后续消息",
  no_reply: "无需回复或命令关闭",
  member_preference_changed: "成员已切换斗嘴偏好",
  generation_interrupted: "生成中断",
  send_lease_expired: "发送中断，需核查",
  unrecognized_delivery_receipt: "回执待确认，不自动重发",
  send_result_unknown: "发送结果未知",
  send_rejected: "协议拒绝发送",
  generation_failed_or_quota_exhausted: "历史生成失败（旧日志未区分具体原因）",
  wechat_daily_call_limit: "微信 AI 今日调用次数已达上限",
  wechat_daily_token_limit: "微信 AI 今日剩余 Token 不足，或有调用正在预占额度",
  daily_call_limit: "全局 AI 今日调用次数已达上限",
  daily_token_limit: "全局 AI 今日 Token 已达上限",
  daily_cost_limit: "全局 AI 今日成本已达上限",
  quota_busy: "额度正在结算，请稍后重试",
  quota_accounting_failed: "额度记录失败，请检查数据库",
  ai_disabled: "AI 运营未启用，请检查模型配置",
  ai_key_missing: "AI 密钥未配置",
  ai_model_missing: "AI 模型未配置",
  timeout: "模型响应超时",
  auth_error: "模型服务鉴权失败，请检查密钥和权限",
  rate_limited: "模型服务限流，请稍后重试",
  provider_payment_required: "模型服务要求检查余额或账单",
  provider_4xx: "模型服务拒绝请求，请检查模型和参数",
  provider_5xx: "模型服务暂时异常",
  provider_error: "模型连接或响应异常",
  empty_reply: "模型未返回可发送的回复正文",
  empty_reply_output_limit: "模型达到输出上限，未返回回复正文",
  generation_system_error: "本地处理异常，请查看诊断记录",
  reply_truncated: "回复已按字数上限截短",
  model_output_limit: "模型达到输出上限，仅返回已生成部分",
  operator_confirmed_sent: "人工确认已发出",
  operator_confirmed_not_sent: "确认未发出，已取消",
};
const statusLabel = (s: string) => labels[s] || s,
  styleLabel = statusLabel,
  scopeLabel = statusLabel,
  reasonLabel = (r: string) => reasons[r] || r || "—";
const limitLabel = (value: number) => (value === 0 ? "不限" : value);
const diagnosticLabel = (d: any) =>
  [
    d.responseChars != null ? `原回复 ${d.responseChars} 字` : "",
    d.sentChars != null ? `处理后 ${d.sentChars} 字` : "",
    d.outputTokens != null ? `输出 ${d.outputTokens} Token` : "",
    d.finishReason ? `结束原因：${d.finishReason}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
const formatDate = (v: string) =>
    v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "—",
  safeSource = (v: string) =>
    /^https:\/\/github\.com\//.test(v || "") ? v : undefined;
const selectedVersion = (s: any) =>
  s.versions?.find((v: any) => v.id === selectedVersions[s.id]);
const checkingDetection = ref(false);
const groupProbe = computed(() => overview.value.detection?.group || null);
const detectionLabel = (state?: string) =>
  ({
    recognized: "已识别",
    missing: "协议待适配",
    invalid: "格式待适配",
    conflicting: "身份信息有冲突",
    unconfirmed: "等待账号确认",
  })[state || ""] || "等待测试消息";
const groupDetectionHint = computed(() => {
  if (
    !overview.value.connection?.hasWebhookSecret ||
    overview.value.connection?.missing?.length
  )
    return "请先在「微信连接」完成设备和回调配置。";
  if (!groupProbe.value)
    return "用另一个微信，在运营微信已加入的测试群里发一句话，再点击「检查接入状态」；测试 @ 时，请通过微信的 @ 功能选择运营微信。";
  if (!groupProbe.value.recipientMatches)
    return "消息已到达，但接收账号与本号 wxid 不一致，请先核对本号账号。";
  if (groupProbe.value.memberState !== "recognized")
    return "群消息已到达，当前协议的成员信息还需技术适配。系统已保存脱敏检测信息，你不用查找或填写字段。";
  if (groupProbe.value.mentionState !== "recognized")
    return "发言者已识别。可以使用「指定前缀」触发；要使用 @ 触发，请再发一条 @ 运营微信的测试消息。";
  return "发言者和 @ 信息的格式已识别。回复是否开启，仍由上方总开关、草稿模式和群聊开关控制。";
});
async function refreshDetection() {
  checkingDetection.value = true;
  try {
    const status = await request.get<any, any>(`${BASE}/status`, {
      skipGetDeduplication: true,
    });
    overview.value.detection = status.detection;
    overview.value.connection = status.connection;
    ElMessage.success(
      groupProbe.value
        ? "检测结果已更新"
        : "尚未收到群消息，发出测试消息后再检查",
    );
  } finally {
    checkingDetection.value = false;
  }
}
async function loadStatus() {
  overview.value = await request.get<any, any>(`${BASE}/status`, {
    skipGetDeduplication: true,
  });
  Object.assign(form, overview.value.config);
  excludedText.value = form.excludedWxids.join("\n");
}
async function loadConversations() {
  const r: any = await request.get<any, any>(`${BASE}/conversations`, {
    params: { page: page.value },
    skipGetDeduplication: true,
  });
  conversations.value = r.list;
  total.value = r.total;
}
async function loadSkills() {
  if (!can("skill:view")) return;
  skills.value = await request.get<any, any>(`${BASE}/skills`, {
    skipGetDeduplication: true,
  });
  for (const s of skills.value)
    selectedVersions[s.id] = s.publishedVersionId || s.versions[0]?.id || "";
}
async function loadKnowledge() {
  if (can("wechat:knowledge:edit"))
    knowledge.value = await request.get<any, any>(`${BASE}/knowledge`, {
      skipGetDeduplication: true,
    });
}
async function loadJobs() {
  if (can("wechat:log:view"))
    jobs.value = await request.get<any, any>(`${BASE}/jobs`, {
      skipGetDeduplication: true,
    });
}
async function refresh() {
  loading.value = true;
  loadError.value = "";
  try {
    const r = await Promise.allSettled([
      loadStatus(),
      loadConversations(),
      loadSkills(),
      loadKnowledge(),
      loadJobs(),
    ]);
    if (r.some((v) => v.status === "rejected"))
      loadError.value =
        "部分数据未能加载，请确认数据库已迁移且账号具备相应权限。";
  } finally {
    loading.value = false;
  }
}
async function saveRules() {
  saving.value = true;
  try {
    const { boundDeviceId: _, ...config } = form;
    await request.put(`${BASE}/settings`, {
      ...config,
      excludedWxids: excludedText.value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      revision: overview.value.revision,
    });
    ElMessage.success("规则已保存，旧的待发任务已取消");
    await loadStatus();
  } finally {
    saving.value = false;
  }
}
function editConversation(row: any) {
  Object.assign(conversationForm, row, { resetContext: false });
  conversationDialog.value = true;
}
async function saveConversation() {
  const c = conversationForm;
  await request.put(`${BASE}/conversations/${c.id}`, {
    revision: c.revision,
    enabled: c.enabled,
    takeover: c.takeover,
    style: c.style,
    groupTrigger: c.groupTrigger,
    allowedSkills: c.allowedSkills,
    resetContext: c.resetContext,
  });
  conversationDialog.value = false;
  await loadConversations();
}
async function showMessages(row: any) {
  messageTitle.value = row.wxid;
  messages.value = await request.get<any, any>(
    `${BASE}/conversations/${row.id}/messages`,
    { skipGetDeduplication: true },
  );
  messagesDrawer.value = true;
}
function editSkill(s?: any) {
  editingSkill.value = !!s;
  const v = s ? selectedVersion(s) : null;
  Object.assign(skillForm, {
    id: s?.id || "",
    name: s?.name || "",
    content: v?.content || "",
    sourceUrl: v?.sourceUrl || "",
    commit: v?.commit || "",
    license: v?.license || "",
  });
  skillDialog.value = true;
}
async function saveSkill() {
  const { id, ...body } = skillForm;
  await request.post(`${BASE}/skills/${encodeURIComponent(id)}/versions`, body);
  skillDialog.value = false;
  ElMessage.success("草稿已保存，发布后才生效");
  await loadSkills();
}
async function publish(s: any, enabled: boolean) {
  await request.post(`${BASE}/skills/${s.id}/publish`, {
    versionId: selectedVersions[s.id],
    enabled,
    scope: s.scope,
  });
  ElMessage.success(enabled ? "所选版本已发布并启用" : "Skill 已停用");
  await Promise.all([loadSkills(), loadStatus()]);
}
function editKnowledge(r?: any) {
  Object.assign(knowledgeForm, {
    id: r?.id || "",
    title: r?.title || "",
    source: r?.source || "",
    content: r?.content || "",
    scope: r?.scope || "private",
    conversationId: r?.conversationId || "",
    enabled: r?.enabled || false,
  });
  knowledgeDialog.value = true;
}
async function saveKnowledge() {
  const { id, ...body } = knowledgeForm;
  if (id) await request.put(`${BASE}/knowledge/${id}`, body);
  else await request.post(`${BASE}/knowledge`, body);
  knowledgeDialog.value = false;
  await Promise.all([loadKnowledge(), loadStatus()]);
}
async function runPreview() {
  previewing.value = true;
  previewResult.value = "";
  previewReason.value = "";
  try {
    const r: any = await request.post(`${BASE}/preview`, preview, {
      timeout: 45000,
    });
    previewResult.value = r.text || "本次判断无需回复";
    previewReason.value = r.reason || "";
    await loadStatus();
  } finally {
    previewing.value = false;
  }
}
async function resolveJob(id: string, resolution: string) {
  await ElMessageBox.confirm(
    resolution === "sent"
      ? "已在微信核对这条消息确实发出？"
      : "确认没有发出？该任务将取消，不会自动重发。",
    "确认核查结果",
  );
  await request.post(`${BASE}/jobs/${id}/resolve`, { resolution });
  await loadJobs();
}
async function inspectSample() {
  const r: any = await request.post(`${BASE}/inspect-callback`, {
    rawJson: sampleJson.value,
  });
  sampleResult.value = JSON.stringify(r, null, 2);
}
onMounted(refresh);
</script>
<style scoped>
.limit-hint {
  display: block;
  width: 100%;
  line-height: 1.5;
  margin-top: 6px;
  color: var(--el-text-color-secondary);
}
.wechat-chat {
  max-width: 1500px;
  margin: 0 auto;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin: 20px 0;
}
.metric {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.metric span,
.metric small,
.muted,
.section-heading p {
  color: var(--el-text-color-secondary);
}
.metric strong {
  font-size: 23px;
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.metric small {
  overflow-wrap: anywhere;
}
.panel {
  margin-top: 20px;
  padding: 18px 24px 28px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}
h3 {
  margin: 8px 0 12px;
  font-size: 17px;
}
p {
  line-height: 1.65;
}
.group-detection {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 18px;
}
.detection-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin: 18px 0;
}
.detection-grid > div {
  display: flex;
  align-items: center;
  gap: 10px;
}
.two-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 30px;
}
.hint {
  margin-left: 10px;
  color: var(--el-text-color-secondary);
}
.hint-box {
  border-radius: 8px;
  background: var(--el-fill-color-light);
  padding: 14px;
  line-height: 1.8;
  margin-bottom: 20px;
}
.skill-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 18px;
}
.button-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
}
.reply-preview {
  border-left: 3px solid var(--el-color-primary);
  background: var(--el-fill-color-light);
  padding: 16px;
  white-space: pre-wrap;
  line-height: 1.8;
  border-radius: 0 8px 8px 0;
}
.message-card {
  margin-bottom: 22px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 18px;
}
.message-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.sample-result {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--el-fill-color-light);
  padding: 18px;
}
.mt16,
.el-pagination {
  margin-top: 16px;
}
a {
  color: var(--el-color-primary);
  overflow-wrap: anywhere;
}
@media (max-width: 1000px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .two-columns {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 700px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .panel {
    padding: 12px;
  }
}
</style>

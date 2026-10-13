<template>
  <div class="page-container wechat-broadcast">
    <PageHeader
      title="订单群播报"
      subtitle="跑腿与代买订单付款后自动发到校区微信群，接单或取消后再发一条更新"
    >
      <template #actions>
        <el-button @click="$router.push('/content/wechat-moments')">微信连接</el-button>
        <el-button :loading="loading" @click="refresh">刷新</el-button>
      </template>
    </PageHeader>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />

    <div class="summary-grid">
      <div class="glass-card metric">
        <span>播报状态</span>
        <strong>{{ !form.enabled ? "已关闭" : form.dryRun ? "试运行" : "正在发送" }}</strong>
        <small>{{ form.dryRun ? "只生成记录，不发到微信群" : "按校区发到绑定的群" }}</small>
      </div>
      <div class="glass-card metric">
        <span>微信连接</span>
        <strong>{{ overview.connection?.online ? "已上线" : "未上线" }}</strong>
        <small>{{
          overview.connection?.missing?.length
            ? `未完成：${overview.connection.missing.join("、")}`
            : overview.connection?.deviceId || "与 AI 聊天、朋友圈共用"
        }}</small>
      </div>
      <div class="glass-card metric">
        <span>已绑定校区</span>
        <strong>{{ boundCount }} / {{ regions.length }}</strong>
        <small>每个校区一个群</small>
      </div>
      <div class="glass-card metric">
        <span>今日消息</span>
        <strong>{{ overview.today?.sent || 0 }} 条已发送</strong>
        <small
          >草稿 {{ overview.today?.draft || 0 }} · 待核查
          {{ overview.today?.unknown || 0 }} · 失败 {{ overview.today?.failed || 0 }}</small
        >
      </div>
    </div>

    <el-tabs v-model="tab" class="glass-card panel">
      <el-tab-pane label="基本设置" name="settings">
        <div class="section-heading">
          <h3>先试运行，核对无误后再正式发送</h3>
          <p>
            开启后，只播报此后付款的订单。从试运行切到正式发送时会重新计时，试运行期间的订单不会补发。
          </p>
        </div>
        <el-form label-width="150px" class="settings-form" :disabled="!canEdit">
          <el-form-item label="订单群播报">
            <el-switch v-model="form.enabled" active-text="开启" />
          </el-form-item>
          <el-form-item label="试运行">
            <el-switch v-model="form.dryRun" active-text="只生成记录，不发送" />
          </el-form-item>
          <el-form-item label="接单后发更新">
            <el-switch v-model="form.notifyAccepted" />
            <span class="hint">再发一条完整消息，最后一行改为“✅ 已接单 · 张**”</span>
          </el-form-item>
          <el-form-item label="取消后发更新">
            <el-switch v-model="form.notifyCancelled" />
            <span class="hint">订单取消或退款时，最后一行改为“❌ 已取消”</span>
          </el-form-item>
          <el-form-item label="同群发送间隔（秒）">
            <el-input-number v-model="form.minIntervalSeconds" :min="3" :max="300" />
            <span class="hint">订单集中时排队发出，避免刷屏和微信风控</span>
          </el-form-item>
          <el-form-item label="最长等待（分钟）">
            <el-input-number v-model="form.maxDelayMinutes" :min="1" :max="120" />
            <span class="hint">微信掉线超过这个时间，排队的消息作废，不发过期订单</span>
          </el-form-item>
          <el-form-item v-if="canEdit">
            <el-button type="primary" :loading="saving" @click="saveSettings">保存设置</el-button>
          </el-form-item>
        </el-form>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="消息不会包含手机号、姓名、寝室号、取件码、备注和图片；宿舍男女按订单填写的入楼要求和收件人性别判断，两者不一致时会标注“待核实”。"
        />
      </el-tab-pane>

      <el-tab-pane label="校区绑定群" name="groups">
        <p class="muted">
          群 ID 以 @chatroom 结尾。让本微信号在目标群里收到任意一条消息后，群 ID 会出现在下拉列表里；如果这个群也开了
          AI 聊天，建议使用前缀触发，避免群友回复播报时触发 AI。
        </p>
        <el-table :data="groupRows">
          <el-table-column label="校区" min-width="140">
            <template #default="{ row }">
              {{ row.name }}
              <el-tag v-if="!row.isOpen" size="small" type="info">未开放</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="微信群 ID" min-width="260">
            <template #default="{ row }">
              <el-select
                v-model="row.form.groupWxid"
                filterable
                allow-create
                default-first-option
                clearable
                placeholder="选择或输入 xxx@chatroom"
                :disabled="!canEdit"
                style="width: 100%"
              >
                <el-option
                  v-for="g in overview.detectedGroups || []"
                  :key="g.wxid"
                  :label="g.wxid"
                  :value="g.wxid"
                >
                  <span>{{ g.wxid }}</span>
                  <span class="option-meta">最近 {{ formatDate(g.lastSeenAt) }}</span>
                </el-option>
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="群备注" min-width="160">
            <template #default="{ row }">
              <el-input
                v-model="row.form.groupName"
                maxlength="40"
                placeholder="例如：南校区跑腿接单群"
                :disabled="!canEdit"
              />
            </template>
          </el-table-column>
          <el-table-column label="启用" width="80">
            <template #default="{ row }">
              <el-switch v-model="row.form.enabled" :disabled="!canEdit" />
            </template>
          </el-table-column>
          <el-table-column v-if="canEdit" label="操作" width="230">
            <template #default="{ row }">
              <el-button link type="primary" :disabled="!row.form.groupWxid" @click="saveGroup(row)"
                >保存</el-button
              >
              <el-button link :disabled="!row.group" @click="testGroup(row)">发测试消息</el-button>
              <el-button link type="danger" :disabled="!row.group" @click="removeGroup(row)"
                >解除</el-button
              >
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="消息预览" name="preview">
        <p class="muted">输入任意跑腿或代买订单号，查看三种状态的消息内容。预览不会发送。</p>
        <div class="preview-bar">
          <el-input
            v-model="previewOrderNo"
            placeholder="订单号"
            clearable
            style="max-width: 320px"
            @keyup.enter="runPreview"
          />
          <el-button type="primary" :loading="previewing" @click="runPreview">生成预览</el-button>
        </div>
        <div v-if="preview" class="preview-grid">
          <div v-for="item in previewItems" :key="item.key" class="preview-card">
            <h4>{{ item.label }}</h4>
            <pre>{{ preview.messages[item.key] }}</pre>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="播报记录" name="records">
        <div class="filter-bar">
          <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 140px">
            <el-option v-for="(label, key) in STATUS" :key="key" :label="label" :value="key" />
          </el-select>
          <el-select v-model="filters.regionId" clearable placeholder="全部校区" style="width: 160px">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-input v-model="filters.orderNo" clearable placeholder="订单号" style="width: 240px" />
          <el-button @click="loadRecords(1)">查询</el-button>
        </div>
        <el-table :data="records.list" v-loading="recordsLoading">
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column prop="regionName" label="校区" width="120" />
          <el-table-column prop="orderNo" label="订单号" min-width="190" show-overflow-tooltip />
          <el-table-column label="消息" width="130">
            <template #default="{ row }"
              >{{ KIND[row.kind] || row.kind }}<span v-if="row.round > 1" class="muted">
                · 第{{ row.round }}轮</span
              ></template
            >
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)">{{ STATUS[row.status] || row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="说明" min-width="180">
            <template #default="{ row }">{{ REASON[row.reason] || row.reason || "" }}</template>
          </el-table-column>
          <el-table-column label="内容" width="90">
            <template #default="{ row }">
              <el-popover v-if="row.text" trigger="click" width="320">
                <template #reference><el-button link type="primary">查看</el-button></template>
                <pre class="popover-text">{{ row.text }}</pre>
              </el-popover>
            </template>
          </el-table-column>
          <el-table-column v-if="canEdit" label="核查" width="150">
            <template #default="{ row }">
              <template v-if="row.status === 'unknown'">
                <el-button link type="primary" @click="resolve(row.id, 'sent')">已发出</el-button>
                <el-button link @click="resolve(row.id, 'not_sent')">未发出</el-button>
              </template>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-if="records.total > records.pageSize"
          class="pager"
          layout="prev, pager, next, total"
          :total="records.total"
          :page-size="records.pageSize"
          :current-page="records.page"
          @current-change="loadRecords"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { request } from "@/api/request";
import { useAuthStore } from "@/stores/auth";

const BASE = "/admin/wechat-broadcast";
const auth = useAuthStore();
const can = (p: string) =>
  ["super_admin", "SUPER_ADMIN", "超级管理员"].includes(auth.user.role) ||
  auth.permissions.includes(p);
const canEdit = computed(() => can("wechat:broadcast:edit"));

const STATUS: Record<string, string> = {
  pending: "排队中",
  sending: "发送中",
  sent: "已发送",
  draft: "草稿",
  unknown: "结果未知",
  failed: "失败",
  skipped: "未发送",
  expired: "已过期",
};
const KIND: Record<string, string> = { new: "新单", accepted: "已接单", cancelled: "已取消" };
const REASON: Record<string, string> = {
  taken_before_send: "发出前已被接单",
  closed_before_send: "发出前已取消",
  not_announced: "原订单未播报",
  notify_disabled: "已关闭此类更新",
  expired: "等待超时（微信可能掉线）",
  settings_changed: "设置变更后作废",
  group_changed: "换群或停用后作废",
  group_removed: "解除绑定后作废",
  opening_was_draft: "原消息只是试运行草稿",
  send_lease_expired: "发送中断，请到群里核对",
  send_result_unknown: "网络异常，请到群里核对",
  unrecognized_delivery_receipt: "网关回执无法确认，请到群里核对",
  send_rejected_retry: "微信拒绝，稍后重试",
  send_rejected: "微信拒绝发送",
  prepare_failed_retry: "生成消息失败，稍后重试",
  prepare_failed: "生成消息失败",
  order_missing: "订单不存在",
  operator_confirmed_sent: "已人工确认发出",
  operator_confirmed_not_sent: "已人工确认未发出",
};
const previewItems = [
  { key: "new", label: "付款后" },
  { key: "accepted", label: "接单后（骑手名为示例）" },
  { key: "cancelled", label: "取消后" },
];

const tab = ref("settings");
const loading = ref(false);
const saving = ref(false);
const loadError = ref("");
const overview = ref<any>({});
const form = reactive<any>({
  enabled: false,
  dryRun: true,
  notifyAccepted: true,
  notifyCancelled: true,
  minIntervalSeconds: 5,
  maxDelayMinutes: 10,
});
const groupRows = ref<any[]>([]);
const regions = computed<any[]>(() => overview.value.regions || []);
const boundCount = computed(() => regions.value.filter((r) => r.group?.enabled).length);

const previewOrderNo = ref("");
const previewing = ref(false);
const preview = ref<any>(null);

const filters = reactive({ status: "", regionId: "", orderNo: "" });
const records = ref<any>({ list: [], total: 0, page: 1, pageSize: 30 });
const recordsLoading = ref(false);

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "";
}
function statusType(status: string) {
  if (status === "sent") return "success";
  if (status === "unknown" || status === "pending" || status === "sending") return "warning";
  if (status === "failed") return "danger";
  return "info";
}

function applyOverview(data: any) {
  overview.value = data || {};
  Object.assign(form, {
    enabled: data.settings.enabled,
    dryRun: data.settings.dryRun,
    notifyAccepted: data.settings.notifyAccepted,
    notifyCancelled: data.settings.notifyCancelled,
    minIntervalSeconds: data.settings.minIntervalSeconds,
    maxDelayMinutes: data.settings.maxDelayMinutes,
  });
  groupRows.value = (data.regions || []).map((r: any) => ({
    ...r,
    form: {
      groupWxid: r.group?.groupWxid || "",
      groupName: r.group?.groupName || "",
      enabled: r.group ? r.group.enabled : true,
    },
  }));
}

async function refresh() {
  loading.value = true;
  loadError.value = "";
  try {
    applyOverview(await request.get<any, any>(`${BASE}/status`));
    if (tab.value === "records") await loadRecords(records.value.page);
  } catch (e: any) {
    loadError.value = e?.message || "加载失败";
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  const previous = overview.value.settings || {};
  if (form.enabled && !form.dryRun && (previous.dryRun || !previous.enabled)) {
    await ElMessageBox.confirm(
      "正式发送后，此后付款的订单会自动发到已绑定的微信群。确定开启吗？",
      "开启正式发送",
      { type: "warning" },
    );
  }
  saving.value = true;
  try {
    applyOverview(await request.put<any, any>(`${BASE}/settings`, { ...form }));
    ElMessage.success("已保存");
  } finally {
    saving.value = false;
  }
}

async function saveGroup(row: any) {
  await request.put(`${BASE}/groups/${encodeURIComponent(row.id)}`, {
    groupWxid: String(row.form.groupWxid || "").trim(),
    groupName: row.form.groupName,
    enabled: row.form.enabled,
  });
  ElMessage.success(`${row.name} 已绑定`);
  await refresh();
}

async function testGroup(row: any) {
  await ElMessageBox.confirm(`将向 ${row.name} 绑定的群发送一条测试消息。`, "发送测试消息");
  const result = await request.post<any, any>(`${BASE}/groups/${encodeURIComponent(row.id)}/test`);
  ElMessage.success(result?.confirmed ? "已发送，请到群里查看" : "已提交，请到群里确认是否收到");
}

async function removeGroup(row: any) {
  await ElMessageBox.confirm(`解除 ${row.name} 的群绑定？排队中的消息会作废。`, "解除绑定", {
    type: "warning",
  });
  await request.delete(`${BASE}/groups/${encodeURIComponent(row.id)}`);
  ElMessage.success("已解除");
  await refresh();
}

async function runPreview() {
  if (!previewOrderNo.value.trim()) return;
  previewing.value = true;
  try {
    preview.value = await request.post<any, any>(`${BASE}/preview`, {
      orderNo: previewOrderNo.value.trim(),
    });
  } finally {
    previewing.value = false;
  }
}

async function loadRecords(page = 1) {
  recordsLoading.value = true;
  try {
    records.value = await request.get<any, any>(`${BASE}/records`, {
      params: { page, ...filters },
    });
  } finally {
    recordsLoading.value = false;
  }
}

async function resolve(id: string, resolution: "sent" | "not_sent") {
  await request.post(`${BASE}/records/${id}/resolve`, { resolution });
  ElMessage.success("已记录");
  await loadRecords(records.value.page);
}

watch(tab, (value) => {
  if (value === "records") loadRecords(1);
});
onMounted(refresh);
</script>

<style scoped>
.wechat-broadcast {
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
.hint,
.option-meta,
.section-heading p {
  color: var(--el-text-color-secondary);
}
.metric strong {
  font-size: 22px;
}
.panel {
  padding: 20px;
}
.section-heading h3 {
  margin: 0 0 6px;
}
.section-heading {
  margin-bottom: 16px;
}
.settings-form {
  max-width: 720px;
  margin-bottom: 16px;
}
.hint {
  margin-left: 12px;
  font-size: 13px;
}
.option-meta {
  float: right;
  font-size: 12px;
  margin-left: 16px;
}
.preview-bar,
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.preview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.preview-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px 16px;
}
.preview-card h4 {
  margin: 0 0 8px;
}
.preview-card pre,
.popover-text {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  line-height: 1.7;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
@media (max-width: 1100px) {
  .summary-grid,
  .preview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

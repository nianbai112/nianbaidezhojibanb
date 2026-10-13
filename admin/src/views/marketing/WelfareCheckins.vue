<template>
  <el-dialog
    :model-value="true"
    title="线下签到场次"
    width="min(1080px, 96vw)"
    @close="emit('close')"
  >
    <div class="checkin-toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索签到场次"
        clearable
        @keyup.enter="search"
      />
      <el-button @click="search">查询</el-button>
      <el-button v-if="canEdit" type="primary" @click="create"
        >新建签到场次</el-button
      >
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-table :data="rows" v-loading="loading" empty-text="还没有线下签到场次">
      <el-table-column label="场次 / 地点" min-width="170"
        ><template #default="{ row }"
          ><b>{{ row.title }}</b>
          <p>{{ row.location }}</p></template
        ></el-table-column
      >
      <el-table-column label="签到时间" min-width="170"
        ><template #default="{ row }"
          >{{ time(row.startAt) }}
          <p>至 {{ time(row.endAt) }}</p></template
        ></el-table-column
      >
      <el-table-column label="方式" min-width="145"
        ><template #default="{ row }"
          ><div v-if="row.allowStaffScan">工作人员扫码</div>
          <div v-if="row.allowSelfScan">学生扫动态码</div></template
        ></el-table-column
      >
      <el-table-column label="状态" width="90"
        ><template #default="{ row }">{{
          statusText(row)
        }}</template></el-table-column
      >
      <el-table-column label="已签到" prop="recordCount" width="80" />
      <el-table-column label="操作" min-width="210"
        ><template #default="{ row }">
          <el-button link type="primary" @click="edit(row.id)">配置</el-button>
          <el-button link type="primary" @click="showRecords(row)"
            >记录</el-button
          >
          <el-button
            v-if="canEdit && row.allowSelfScan"
            link
            type="primary"
            @click="showQr(row)"
            >现场动态码</el-button
          >
          <el-button v-if="canEdit" link @click="toggleStatus(row)">{{
            row.status === "paused" ? "恢复" : "暂停"
          }}</el-button>
        </template></el-table-column
      >
    </el-table>
    <el-pagination
      v-model:current-page="page"
      :total="total"
      :page-size="50"
      layout="total, prev, pager, next"
      @current-change="load"
    />
    <p class="checkin-hint">
      创建后，在抽奖活动的“线下签到条件”中关联场次。两种方式任意完成一次即可；已有签到或关联已发布抽奖后，场次配置锁定。
    </p>
  </el-dialog>
  <el-dialog
    v-model="editOpen"
    :title="form.id ? '签到场次配置' : '新建签到场次'"
    width="min(740px, 96vw)"
    append-to-body
    :close-on-click-modal="false"
  >
    <el-alert
      v-if="form.locked"
      title="该场次配置已锁定，仍可暂停或恢复签到。"
      type="info"
      :closable="false"
    />
    <el-form label-position="top" :disabled="!canEdit || form.locked || saving">
      <el-form-item label="签到名称"
        ><el-input
          v-model="form.title"
          maxlength="80"
          placeholder="例如：迎新晚会现场签到"
      /></el-form-item>
      <el-form-item label="校区"
        ><el-select
          v-model="form.regionId"
          :empty-values="[null, undefined]"
          style="width: 100%"
          ><el-option
            v-if="options.canGlobal"
            value=""
            label="全部校区" /><el-option
            v-for="r in options.regions"
            :key="r.id"
            :value="r.id"
            :label="r.name" /></el-select
      ></el-form-item>
      <el-form-item label="现场地点"
        ><el-input
          v-model="form.location"
          maxlength="180"
          placeholder="例如：学生活动中心一楼签到台"
      /></el-form-item>
      <div class="checkin-grid">
        <el-form-item label="签到开始"
          ><el-date-picker
            v-model="form.startAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item
        ><el-form-item label="签到结束"
          ><el-date-picker
            v-model="form.endAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
        /></el-form-item>
      </div>
      <el-form-item label="签到方式（至少开启一种）"
        ><el-checkbox v-model="form.allowStaffScan"
          >工作人员扫描学生个人码</el-checkbox
        ><el-checkbox v-model="form.allowSelfScan"
          >学生扫描现场动态码</el-checkbox
        ></el-form-item
      >
      <el-form-item v-if="form.allowStaffScan" label="指定工作人员（最多20人）">
        <el-select
          v-model="form.staffUserIds"
          multiple
          filterable
          remote
          :multiple-limit="20"
          :remote-method="searchStaff"
          :loading="staffLoading"
          @focus="searchStaff('')"
          placeholder="搜索小程序用户昵称或 UID"
          style="width: 100%"
        >
          <el-option
            v-for="u in staffOptions"
            :key="u.id"
            :value="u.id"
            :label="`${u.nickname || '未命名'} · UID ${u.uid || '—'}`"
          />
        </el-select>
        <p class="checkin-hint">
          工作人员登录小程序后，从个人菜单“扫一扫”扫描学生个人签到码，核对本人及
          UID 后确认。
        </p>
      </el-form-item>
      <el-alert
        v-if="form.allowSelfScan"
        title="公共签到码每60秒更新，请在现场屏幕展示。动态码仍能在有效期内被转发，不能单独证明本人到场。"
        type="info"
        :closable="false"
      />
    </el-form>
    <template #footer
      ><el-button @click="editOpen = false">关闭</el-button
      ><el-button
        v-if="canEdit && !form.locked"
        type="primary"
        :loading="saving"
        @click="save"
        >保存场次</el-button
      ></template
    >
  </el-dialog>
  <el-dialog
    v-model="qrOpen"
    :title="qrSession?.title || '现场签到码'"
    width="min(720px, 96vw)"
    append-to-body
    @closed="stopQr"
  >
    <div class="checkin-screen">
      <h2>现场签到</h2>
      <p>{{ qrSession?.location }}</p>
      <img
        v-if="qrImage && qrSeconds > 0 && !qrError"
        :src="qrImage"
        alt="现场动态签到二维码"
        class="checkin-qr"
      />
      <div v-else class="checkin-qr-placeholder">
        {{ qrError || "正在更新签到码…" }}
      </div>
      <p>请打开校小伴小程序，使用个人菜单中的“扫一扫”</p>
      <b v-if="qrSeconds > 0 && !qrError">{{ qrSeconds }} 秒后自动更新</b>
      <el-button v-if="qrError" :loading="qrBusy" @click="fetchQr"
        >重新获取</el-button
      >
      <p class="checkin-hint">
        无需保存或转发二维码；签到后返回抽奖活动即可核验资格。
      </p>
    </div>
  </el-dialog>
  <el-dialog
    v-model="recordsOpen"
    :title="`签到记录 · ${recordsSession?.title || ''}`"
    width="min(850px, 96vw)"
    append-to-body
  >
    <el-alert
      v-if="recordsError"
      :title="recordsError"
      type="error"
      :closable="false"
    />
    <el-table
      :data="records"
      v-loading="recordsLoading"
      empty-text="暂无签到记录"
    >
      <el-table-column label="用户" min-width="150"
        ><template #default="{ row }"
          >{{ row.user.nickname || "未命名" }} · UID
          {{ row.user.uid }}</template
        ></el-table-column
      >
      <el-table-column label="方式" width="150"
        ><template #default="{ row }">{{
          row.source === "staff" ? "工作人员扫码" : "学生扫动态码"
        }}</template></el-table-column
      >
      <el-table-column label="工作人员" min-width="140"
        ><template #default="{ row }">{{
          row.operator
            ? `${row.operator.nickname || "未命名"} · UID ${row.operator.uid}`
            : "—"
        }}</template></el-table-column
      >
      <el-table-column label="签到时间" min-width="175"
        ><template #default="{ row }">{{
          time(row.signedAt)
        }}</template></el-table-column
      >
    </el-table>
    <el-pagination
      v-model:current-page="recordsPage"
      :total="recordsTotal"
      :page-size="50"
      layout="total, prev, pager, next"
      @current-change="loadRecords"
    />
  </el-dialog>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { request } from "@/api/request";
const props = defineProps<{ canEdit: boolean; options: any }>();
const emit = defineEmits(["close", "changed"]);
const base = "/admin/welfare/checkins";
const rows = ref<any[]>([]),
  page = ref(1),
  total = ref(0),
  keyword = ref(""),
  loading = ref(false),
  error = ref("");
const editOpen = ref(false),
  form = ref<any>({}),
  saving = ref(false),
  staffOptions = ref<any[]>([]),
  staffLoading = ref(false);
const recordsOpen = ref(false),
  recordsSession = ref<any>(null),
  records = ref<any[]>([]),
  recordsPage = ref(1),
  recordsTotal = ref(0),
  recordsLoading = ref(false),
  recordsError = ref("");
const qrOpen = ref(false),
  qrSession = ref<any>(null),
  qrImage = ref(""),
  qrSeconds = ref(0),
  qrBusy = ref(false),
  qrError = ref("");
let qrTimer: ReturnType<typeof setInterval> | undefined,
  qrExpiry = 0,
  qrOffset = 0,
  qrGeneration = 0,
  listGeneration = 0,
  editGeneration = 0,
  recordsGeneration = 0,
  staffGeneration = 0,
  qrRetryAt = 0;
const time = (v: any) =>
  v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "—";
const statusText = (row: any) =>
  row.status === "paused"
    ? "已暂停"
    : Date.now() >= new Date(row.endAt).getTime()
      ? "已结束"
      : Date.now() < new Date(row.startAt).getTime()
        ? "未开始"
        : "进行中";
const message = (e: any) => {
  const m = e?.response?.data?.message || e?.message;
  return Array.isArray(m) ? m.join("；") : m || "操作失败，请重试";
};
async function load() {
  const generation = ++listGeneration;
  loading.value = true;
  error.value = "";
  try {
    const r: any = await request.get(base, {
      params: { page: page.value, keyword: keyword.value },
      skipGetDeduplication: true,
    });
    if (generation !== listGeneration) return;
    rows.value = r.list;
    total.value = r.total;
  } catch (e) {
    if (generation === listGeneration) error.value = message(e);
  } finally {
    if (generation === listGeneration) loading.value = false;
  }
}
function search() {
  page.value = 1;
  load();
}
function create() {
  editGeneration++;
  form.value = {
    title: "",
    regionId: props.options.canGlobal ? "" : props.options.regions[0]?.id || "",
    location: "",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 4 * 3600000).toISOString(),
    allowStaffScan: true,
    allowSelfScan: true,
    staffUserIds: [],
  };
  editOpen.value = true;
}
async function edit(id: string) {
  const generation = ++editGeneration;
  try {
    const row: any = await request.get(base + "/" + id, {
      skipGetDeduplication: true,
    });
    if (generation !== editGeneration) return;
    form.value = {
      ...row,
      regionId: row.regionId || "",
      staffUserIds: row.staff.map((s: any) => s.userId),
    };
    staffOptions.value = row.staff.map((s: any) => s.user);
    editOpen.value = true;
  } catch (e) {
    ElMessage.error(message(e));
  }
}
async function searchStaff(keyword: string) {
  const generation = ++staffGeneration;
  staffLoading.value = true;
  try {
    const r: any = await request.get("/admin/users", {
      skipGetDeduplication: true,
      params: {
        keyword,
        status: "active",
        userType: "normal",
        page: 1,
        pageSize: 30,
      },
    });
    if (generation !== staffGeneration) return;
    const merged = new Map(staffOptions.value.map((u) => [u.id, u]));
    for (const u of r.list || []) merged.set(u.id, u);
    staffOptions.value = [...merged.values()];
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    if (generation === staffGeneration) staffLoading.value = false;
  }
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const payload = {
      title: form.value.title,
      regionId: form.value.regionId,
      location: form.value.location,
      startAt: form.value.startAt,
      endAt: form.value.endAt,
      allowStaffScan: form.value.allowStaffScan,
      allowSelfScan: form.value.allowSelfScan,
      staffUserIds: form.value.staffUserIds,
    };
    if (form.value.id) await request.put(base + "/" + form.value.id, payload);
    else await request.post(base, payload);
    editOpen.value = false;
    ElMessage.success("签到场次已保存");
    emit("changed");
    await load();
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    saving.value = false;
  }
}
async function toggleStatus(row: any) {
  try {
    const status = row.status === "paused" ? "active" : "paused";
    await ElMessageBox.confirm(
      status === "paused"
        ? "暂停后停止新增签到，已完成记录保留。"
        : "确认恢复此场签到？",
      "签到状态",
    );
    await request.post(base + "/" + row.id + "/status", { status });
    emit("changed");
    await load();
  } catch (e) {
    if (e !== "cancel" && e !== "close") ElMessage.error(message(e));
  }
}
function stopQr() {
  qrGeneration++;
  if (qrTimer) clearInterval(qrTimer);
  qrTimer = undefined;
  qrImage.value = "";
  qrSeconds.value = 0;
  qrBusy.value = false;
}
function showQr(row: any) {
  stopQr();
  qrSession.value = row;
  qrOpen.value = true;
  qrError.value = "";
  qrExpiry = 0;
  qrRetryAt = 0;
  fetchQr();
  qrTimer = setInterval(tickQr, 1000);
}
function tickQr() {
  if (!qrOpen.value) return;
  qrSeconds.value = Math.max(
    0,
    Math.ceil((qrExpiry - Date.now() - qrOffset) / 1000),
  );
  if (qrSeconds.value === 0) {
    qrImage.value = "";
    if (!qrBusy.value && Date.now() >= qrRetryAt && !document.hidden) fetchQr();
  }
}
async function fetchQr() {
  if (qrBusy.value || !qrOpen.value) return;
  const generation = qrGeneration;
  qrBusy.value = true;
  try {
    const r: any = await request.post(
      base + "/" + qrSession.value.id + "/public-code",
    );
    if (generation !== qrGeneration || !qrOpen.value) return;
    qrOffset = new Date(r.serverTime).getTime() - Date.now();
    qrExpiry = new Date(r.expiresAt).getTime();
    qrImage.value = r.image;
    qrError.value = "";
    qrSeconds.value = Math.max(
      0,
      Math.ceil((qrExpiry - Date.now() - qrOffset) / 1000),
    );
  } catch (e) {
    if (generation === qrGeneration) {
      qrImage.value = "";
      qrError.value = message(e);
      qrRetryAt = Date.now() + 5000;
    }
  } finally {
    if (generation === qrGeneration) qrBusy.value = false;
  }
}
function showRecords(row: any) {
  recordsSession.value = row;
  recordsPage.value = 1;
  recordsOpen.value = true;
  records.value = [];
  loadRecords();
}
async function loadRecords() {
  const generation = ++recordsGeneration;
  recordsLoading.value = true;
  recordsError.value = "";
  try {
    const r: any = await request.get(
      base + "/" + recordsSession.value.id + "/records",
      { params: { page: recordsPage.value }, skipGetDeduplication: true },
    );
    if (generation !== recordsGeneration) return;
    records.value = r.list;
    recordsTotal.value = r.total;
  } catch (e) {
    if (generation === recordsGeneration) recordsError.value = message(e);
  } finally {
    if (generation === recordsGeneration) recordsLoading.value = false;
  }
}
onMounted(() => {
  load();
  document.addEventListener("visibilitychange", tickQr);
});
onBeforeUnmount(() => {
  stopQr();
  listGeneration++;
  editGeneration++;
  recordsGeneration++;
  staffGeneration++;
  document.removeEventListener("visibilitychange", tickQr);
});
</script>
<style scoped>
.checkin-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
}
.checkin-toolbar .el-input {
  max-width: 300px;
}
.checkin-hint {
  color: #7b827c;
  line-height: 1.7;
  font-size: 13px;
}
.checkin-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.checkin-grid :deep(.el-date-editor) {
  width: 100%;
}
.checkin-screen {
  text-align: center;
}
.checkin-qr {
  display: block;
  width: min(420px, 100%);
  margin: 15px auto;
}
.checkin-qr-placeholder {
  min-height: 300px;
  display: grid;
  place-items: center;
  color: #8b5546;
}
.checkin-screen h2 {
  font-size: 32px;
}
.el-pagination {
  margin-top: 18px;
}
@media (max-width: 600px) {
  .checkin-grid {
    grid-template-columns: 1fr;
  }
  .checkin-toolbar {
    flex-wrap: wrap;
  }
}
</style>

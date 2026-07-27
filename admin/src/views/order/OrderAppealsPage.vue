<template>
  <div class="page-shell">
    <PageHeader
      title="订单申诉"
      subtitle="核验履约证据后，在同一处理单内执行退款、补偿或骑手处罚。"
    />
    <div class="status-guide" aria-label="申诉状态分类">
      <el-button
        v-for="item in statusFilters"
        :key="item.value || 'all'"
        :type="filters.status === item.value ? item.type : 'info'"
        :plain="filters.status !== item.value"
        @click="filterStatus(item.value)"
        >{{ item.label }}</el-button
      >
    </div>
    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        clearable
        placeholder="申诉单号或订单号"
        style="width: 220px"
        @keyup.enter="load"
      />
      <el-select
        v-model="filters.status"
        clearable
        placeholder="处理状态"
        style="width: 140px"
        ><el-option
          v-for="item in statuses"
          :key="item.value"
          :label="item.label"
          :value="item.value"
      /></el-select>
      <el-select
        v-model="filters.regionId"
        clearable
        filterable
        placeholder="区域"
        style="width: 180px"
        ><el-option
          v-for="region in regions"
          :key="region.id"
          :label="region.name"
          :value="region.id"
      /></el-select>
      <el-button type="primary" @click="load">查询</el-button
      ><el-button @click="reset">重置</el-button>
    </div>
    <el-table :data="appeals" v-loading="loading" border stripe>
      <el-table-column
        prop="appealNo"
        label="申诉单号"
        width="190"
      /><el-table-column
        prop="orderNo"
        label="订单号"
        width="180"
      /><el-table-column prop="orderType" label="类型" width="90" />
      <el-table-column
        prop="appealType"
        label="问题类型"
        width="110"
      /><el-table-column prop="status" label="状态" width="110"
        ><template #default="{ row }"
          ><el-tag :type="tagType(row.status)">{{
            statusText(row.status)
          }}</el-tag></template
        ></el-table-column
      >
      <el-table-column
        prop="description"
        label="用户描述"
        min-width="220"
        show-overflow-tooltip
      /><el-table-column
        prop="latestReply"
        label="最近处理说明"
        min-width="200"
        show-overflow-tooltip
      /><el-table-column label="提交时间" width="180"
        ><template #default="{ row }">{{
          formatDate(row.createdAt)
        }}</template></el-table-column
      >
      <el-table-column label="操作" width="100" fixed="right"
        ><template #default="{ row }"
          ><el-button link type="primary" @click="openDetail(row)"
            >处理</el-button
          ></template
        ></el-table-column
      >
    </el-table>
    <div class="pager">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        layout="total, prev, pager, next"
        @current-change="load"
      />
    </div>
    <el-drawer v-model="drawer" title="处理订单申诉" size="620px"
      ><template v-if="current"
        ><el-descriptions :column="1" border
          ><el-descriptions-item label="申诉单号">{{
            current.appealNo
          }}</el-descriptions-item
          ><el-descriptions-item label="订单"
            >{{ current.orderNo }}（{{
              current.orderType
            }}）</el-descriptions-item
          ><el-descriptions-item label="问题">{{
            current.description
          }}</el-descriptions-item
          ><el-descriptions-item label="联系电话">{{
            current.contactPhone || "-"
          }}</el-descriptions-item></el-descriptions
        ><el-alert
          v-if="current.orderType === 'order'"
          class="refund-boundary"
          title="资金动作以支付渠道终态为准"
          description="请先核验订单与履约证据。退款提交后申诉保持处理中，支付渠道确认成功后才自动关闭。"
          type="warning"
          :closable="false"
          show-icon
        /><el-button
          v-if="current.orderId"
          class="evidence-link"
          type="primary"
          plain
          @click="viewOrderEvidence"
          >核验订单 / 发起退款</el-button
        >
        <div v-if="current.evidenceImages?.length" class="evidence">
          <el-image
            v-for="url in current.evidenceImages"
            :key="url"
            :src="url"
            :preview-src-list="current.evidenceImages"
            fit="cover"
          />
        </div>
        <el-form class="reply-form" label-position="top"
          ><el-form-item label="处理状态"
            ><el-select v-model="form.status"
              ><el-option
                v-for="item in statuses"
                :key="item.value"
                :label="item.label"
                :value="item.value" /></el-select></el-form-item
          ><el-form-item
            :label="
              form.status === 'processing'
                ? '处理进展（可选）'
                : '处理说明 / 解决方案'
            "
            :required="needsResolution(form.status)"
            ><el-input
              v-model="form.reply"
              type="textarea"
              :rows="4"
              maxlength="500"
              show-word-limit
              :placeholder="
                needsResolution(form.status)
                  ? '请明确说明处理结果、需补充材料或驳回原因；会发送给用户'
                  : '可填写当前处理进展，用户会收到通知'
              " /></el-form-item
          ><el-form-item v-if="form.status === 'resolved'" label="处置动作"
            ><el-select v-model="form.resolutionAction" style="width: 100%"
              ><el-option
                v-for="item in resolutionActions"
                :key="item.value"
                :label="item.label"
                :value="item.value" /></el-select></el-form-item
          ><el-form-item
            v-if="['partial_refund', 'compensate_user'].includes(form.resolutionAction)"
            :label="form.resolutionAction === 'partial_refund' ? '退款金额' : '补偿金额'"
            required
            ><el-input-number v-model="form.refundAmount" :min="0.01" :precision="2" :step="1" /></el-form-item
          ><el-form-item v-if="form.resolutionAction === 'penalize_rider'" label="骑手处罚金额" required
            ><el-input-number v-model="form.riderPenaltyAmount" :min="0.01" :precision="2" :step="1" /></el-form-item
        ></el-form>
        <div class="history">
          <strong>处理记录</strong>
          <div
            v-for="event in current.events || []"
            :key="event.id"
            class="event"
          >
            <span>{{ statusText(event.status || event.action) }}</span
            ><span>{{ event.content || "状态已更新" }}</span
            ><time>{{ formatDate(event.createdAt) }}</time>
          </div>
        </div></template
      ><template #footer
        ><el-button @click="drawer = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="save"
          >保存处理结果</el-button
        ></template
      ></el-drawer
    >
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { request } from "@/api/request";
import PageHeader from "@/components/common/PageHeader.vue";
const statuses = [
  { value: "pending", label: "待处理" },
  { value: "processing", label: "受理中" },
  { value: "waiting_user", label: "待补充" },
  { value: "resolved", label: "已解决" },
  { value: "rejected", label: "已驳回" },
];
const statusFilters = [
  { value: "", label: "全部", type: "info" },
  { value: "pending", label: "待处理", type: "warning" },
  { value: "processing", label: "受理中", type: "primary" },
  { value: "waiting_user", label: "待补充", type: "warning" },
  { value: "resolved", label: "已解决", type: "success" },
  { value: "rejected", label: "已驳回", type: "danger" },
];
const resolutionActions = [
  { value: "no_action", label: "仅关闭申诉，不发生资金动作" },
  { value: "full_refund", label: "按原支付渠道全额退款" },
  { value: "partial_refund", label: "按原支付渠道部分退款" },
  { value: "compensate_user", label: "平台余额补偿用户" },
  { value: "penalize_rider", label: "扣减骑手结算 / 生成负债" },
];
const loading = ref(false),
  saving = ref(false),
  drawer = ref(false),
  appeals = ref<any[]>([]),
  regions = ref<any[]>([]),
  current = ref<any>(null);
const route = useRoute(),
  router = useRouter();
const filters = reactive({
  keyword: "",
  status: String(route.query.status || ""),
  regionId: "",
});
const pagination = reactive({ page: 1, pageSize: 20, total: 0 });
const form = reactive({
  status: "pending",
  reply: "",
  resolutionAction: "no_action",
  refundAmount: undefined as number | undefined,
  riderPenaltyAmount: undefined as number | undefined,
});
const formatDate = (value: string) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
const statusText = (value: string) =>
  statuses.find((item) => item.value === value)?.label || value || "-";
const tagType = (value: string) =>
  value === "resolved"
    ? "success"
    : value === "rejected"
      ? "danger"
      : value === "processing"
        ? "primary"
        : value === "waiting_user"
          ? "warning"
          : "info";
async function load() {
  loading.value = true;
  try {
    const data: any = await request.get("/admin/order-appeals", {
      params: {
        ...filters,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    });
    appeals.value = data.list || [];
    pagination.total = Number(data.total || 0);
  } finally {
    loading.value = false;
  }
}
async function loadRegions() {
  try {
    const data: any = await request.get("/admin/regions");
    regions.value = Array.isArray(data) ? data : data.list || data.data || [];
  } catch {
    regions.value = [];
  }
}
function reset() {
  Object.assign(filters, { keyword: "", status: "", regionId: "" });
  pagination.page = 1;
  load();
}
function filterStatus(status: string) {
  filters.status = status;
  pagination.page = 1;
  load();
}
const needsResolution = (status: string) =>
  ["waiting_user", "resolved", "rejected"].includes(status);
function openDetail(row: any) {
  current.value = row;
  form.status = row.status;
  form.reply = "";
  form.resolutionAction = "no_action";
  form.refundAmount = undefined;
  form.riderPenaltyAmount = undefined;
  drawer.value = true;
}
function viewOrderEvidence() {
  router.push({
    path: "/order/center",
    query: {
      focusId: current.value.orderId,
      orderType: current.value.orderType,
    },
  });
}
async function save() {
  if (!form.reply.trim() && form.status === current.value.status)
    return ElMessage.warning("请填写回复或修改状态");
  if (
    form.status !== current.value.status &&
    needsResolution(form.status) &&
    !form.reply.trim()
  )
    return ElMessage.warning("请填写处理说明 / 解决方案");
  if (
    form.status === "resolved" &&
    ["partial_refund", "compensate_user"].includes(form.resolutionAction) &&
    !(Number(form.refundAmount) > 0)
  )
    return ElMessage.warning("请填写有效金额");
  if (
    form.status === "resolved" &&
    form.resolutionAction === "penalize_rider" &&
    !(Number(form.riderPenaltyAmount) > 0)
  )
    return ElMessage.warning("请填写有效的骑手处罚金额");
  saving.value = true;
  try {
    await request.patch(`/admin/order-appeals/${current.value.id}`, {
          status: form.status,
          reply: form.reply.trim() || undefined,
          resolutionAction:
            form.status === "resolved" ? form.resolutionAction : undefined,
          refundAmount:
            form.status === "resolved" &&
            ["partial_refund", "compensate_user"].includes(form.resolutionAction)
              ? form.refundAmount
              : undefined,
          riderPenaltyAmount:
            form.status === "resolved" && form.resolutionAction === "penalize_rider"
              ? form.riderPenaltyAmount
              : undefined,
    });
    ElMessage.success("已保存并通知用户");
    drawer.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}
watch(
  () => route.query.status,
  (status) => {
    const next = String(status || "");
    if (filters.status !== next) {
      filters.status = next;
      pagination.page = 1;
      load();
    }
  },
);
onMounted(() => {
  loadRegions();
  load();
});
</script>

<style scoped>
.status-guide {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0 0 18px;
  padding: 14px;
  border: 1px solid #dbe7f5;
  border-radius: 10px;
  background: #f8fbff;
}
.filter-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}
.refund-boundary {
  margin-top: 16px;
}
.evidence-link {
  margin-top: 16px;
}
.evidence {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 18px 0;
}
.evidence :deep(.el-image) {
  width: 88px;
  height: 88px;
  border-radius: 6px;
}
.reply-form {
  margin-top: 18px;
}
.event {
  display: grid;
  grid-template-columns: 100px 1fr 160px;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid #eee;
  font-size: 13px;
}
.event time {
  color: #94a3b8;
}
</style>

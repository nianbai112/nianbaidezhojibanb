<template>
  <div class="member-panel">
    <p class="member-intro">
      选择官方群和活动，查看群成员的报名与学生认证情况。
    </p>
    <el-form label-position="top" class="member-selectors">
      <el-form-item label="官方群">
        <el-select
          v-model="groupId"
          :disabled="syncing"
          placeholder="选择已导入的官方群"
          @change="changeGroup"
        >
          <el-option
            v-for="group in groups"
            :key="group.id"
            :label="group.name"
            :value="group.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="查看活动报名情况">
        <el-select
          v-model="campaignId"
          clearable
          filterable
          placeholder="选择使用本群的活动"
          :disabled="!groupId || loading || syncing"
          @change="changeCampaign"
        >
          <el-option
            v-for="campaign in campaigns"
            :key="campaign.id"
            :label="campaign.title"
            :value="campaign.id"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <div class="member-toolbar">
      <div class="member-sync-info">
        <span>最后同步：{{ time(data?.group?.rosterSyncedAt) }}</span>
        <el-tag v-if="data?.group?.isDismissed" type="info" size="small"
          >群已解散</el-tag
        >
        <el-tag v-else-if="data?.group?.needsSync" type="warning" size="small"
          >群成员有变化，等待同步</el-tag
        >
      </div>
      <div class="member-actions">
        <el-button
          :disabled="!groupId || syncing"
          :loading="loading"
          @click="load"
          >刷新列表</el-button
        >
        <el-button
          v-if="canEdit"
          type="primary"
          :disabled="!groupId || loading"
          :loading="syncing"
          @click="syncMembers"
          >同步群成员</el-button
        >
      </div>
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />
    <el-empty
      v-if="!groups.length"
      description="请先在“官方群管理”中导入客户群。"
      :image-size="70"
    />
    <template v-else>
      <p
        v-if="data && !data.group.rosterSyncedAt"
        class="member-note"
        role="status"
      >
        尚未同步成员明细。{{
          canEdit
            ? "点击“同步群成员”读取名单。"
            : "请让有编辑权限的管理员同步名单。"
        }}
      </p>
      <p v-if="data && !campaigns.length" class="member-note">
        暂时没有使用本群的活动。可先查看成员和认证情况，在活动中选定本群后即可查看报名情况。
      </p>
      <div v-if="data" class="member-totals" aria-label="当前群内客户统计">
        <span
          >群内客户 <b>{{ data.summary.currentCustomers }}</b> 人</span
        >
        <span
          >已关联账号 <b>{{ data.summary.linked }}</b> 人</span
        >
        <span
          >身份未关联 <b>{{ data.summary.unknown }}</b> 人</span
        >
        <span
          >认证通过 <b>{{ data.summary.studentApproved }}</b> 人</span
        >
        <template v-if="data.campaignId">
          <span
            >已报名 <b>{{ data.summary.registered }}</b> 人</span
          >
          <span
            >未报名 <b>{{ data.summary.unregistered }}</b> 人</span
          >
        </template>
      </div>
      <p class="member-note">
        统计为当前群内客户；身份未关联者的报名、认证均为“无法判断”，不计入未报名。历史从首次同步开始记录，退群时间为同步发现时间。
      </p>
      <el-form
        label-position="top"
        class="member-filters"
        @submit.prevent="applyFilters"
      >
        <el-form-item label="搜索成员" class="member-search">
          <el-input
            v-model="search"
            placeholder="群昵称、小程序昵称或用户编号"
            maxlength="60"
            clearable
            @clear="applyFilters"
          />
        </el-form-item>
        <el-form-item label="在群情况">
          <el-select v-model="presence" @change="applyFilters">
            <el-option label="当前在群" value="current" /><el-option
              label="包含退群历史"
              value="all"
            /><el-option label="已退群" value="left" />
          </el-select>
        </el-form-item>
        <el-form-item label="报名情况">
          <el-select
            v-model="participation"
            :disabled="!campaignId"
            @change="applyFilters"
          >
            <el-option label="全部报名状态" value="all" /><el-option
              label="已报名"
              value="registered"
            /><el-option label="未报名" value="unregistered" /><el-option
              label="无法判断"
              value="unknown"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="学生认证">
          <el-select v-model="studentStatus" @change="applyFilters">
            <el-option
              v-for="(label, value) in studentFilters"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="成员类型">
          <el-select v-model="memberType" @change="applyFilters">
            <el-option label="微信客户" value="customers" /><el-option
              label="全部成员"
              value="all"
            /><el-option label="企业工作人员" value="staff" />
          </el-select>
        </el-form-item>
        <el-form-item class="member-filter-button"
          ><el-button
            native-type="submit"
            :disabled="!groupId || syncing"
            :loading="loading"
            >筛选</el-button
          ></el-form-item
        >
      </el-form>
      <el-table
        :data="data?.list || []"
        v-loading="loading"
        :empty-text="
          error
            ? '名单未加载成功，请重试。'
            : '当前条件下没有成员，请调整筛选或同步群成员。'
        "
      >
        <el-table-column label="群成员" min-width="190">
          <template #default="{ row }">
            <b class="member-name">{{ row.nickname }}</b>
            <p v-if="row.memberType === 1" class="member-note">企业工作人员</p>
            <p v-else-if="row.identityStatus === 'linked'" class="member-note">
              {{ row.platformNickname || "未设置小程序昵称" }} · 用户
              {{ row.uid }}
            </p>
            <p v-else class="member-note">
              {{
                row.identityStatus === "ambiguous"
                  ? "身份关联冲突，待管理员核对"
                  : "尚未关联小程序账号，可稍后同步重试"
              }}
            </p>
          </template>
        </el-table-column>
        <el-table-column label="活动报名" min-width="160">
          <template #default="{ row }">
            <el-tag
              :type="row.participation === 'registered' ? 'success' : 'info'"
              >{{ participationLabel(row) }}</el-tag
            >
            <p v-if="row.outcome" class="member-note">
              {{ outcomeLabels[row.outcome] || "已有参与记录" }}
            </p>
            <p v-if="row.exclusionReason" class="member-note">
              {{ row.exclusionReason }}
            </p>
            <p v-if="row.registeredAt" class="member-note">
              {{ time(row.registeredAt) }}
            </p>
          </template>
        </el-table-column>
        <el-table-column label="学生认证" min-width="160">
          <template #default="{ row }">
            <el-tag
              :type="
                row.studentStatus === 'approved'
                  ? 'success'
                  : row.studentStatus === 'pending'
                    ? 'warning'
                    : 'info'
              "
              >{{ studentLabels[row.studentStatus] || "无法判断" }}</el-tag
            >
            <p v-if="row.schoolName" class="member-note">
              {{ row.schoolName }}
            </p>
          </template>
        </el-table-column>
        <el-table-column label="在群情况" min-width="170">
          <template #default="{ row }">
            <el-tag :type="row.presence === 'current' ? 'success' : 'info'">{{
              row.presence === "current" ? "在群" : "已退群"
            }}</el-tag>
            <p v-if="row.presence === 'left'" class="member-note">
              发现退群：{{ time(row.leftAt) }}
            </p>
            <p v-else-if="row.joinedAt" class="member-note">
              入群：{{ time(row.joinedAt) }}
            </p>
          </template>
        </el-table-column>
      </el-table>
      <div class="member-pagination">
        <span class="member-note" role="status"
          >符合筛选 {{ data?.total || 0 }} 人</span
        >
        <el-pagination
          :current-page="page"
          :page-size="25"
          :total="data?.total || 0"
          layout="prev, pager, next"
          :pager-count="5"
          :disabled="loading || syncing"
          @current-change="changePage"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { request } from "../../api/request";
const props = defineProps<{
  groups: any[];
  initialGroupId?: string;
  canEdit: boolean;
}>();
const emit = defineEmits<{ (e: "changed"): void }>();
const groupId = ref(props.initialGroupId || props.groups[0]?.id || ""),
  campaignId = ref("");
const data = ref<any>(null),
  campaigns = ref<any[]>([]),
  loading = ref(false),
  syncing = ref(false),
  error = ref("");
const search = ref(""),
  presence = ref("current"),
  participation = ref("all"),
  studentStatus = ref("all"),
  memberType = ref("customers"),
  page = ref(1);
const studentLabels: Record<string, string> = {
  approved: "已通过",
  none: "未提交",
  pending: "待审核",
  rejected: "已驳回",
  revoked: "已撤销／当前无效",
  unknown: "无法判断",
};
const studentFilters = { all: "全部认证状态", ...studentLabels };
const outcomeLabels: Record<string, string> = {
  waiting: "等待开奖",
  won: "已中奖",
  lost: "未中奖",
  excluded: "参与资格失效",
  cancelled: "活动或参与已取消",
};
const time = (value: any) =>
  value
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "尚未同步";
const message = (e: any) => {
  const value = e?.response?.data?.message || e?.message;
  return Array.isArray(value) ? value.join("；") : value || "读取失败，请重试";
};
const participationLabel = (row: any) =>
  row.memberType === 1
    ? "工作人员"
    : (
        {
          not_selected: "请先选择活动",
          registered: "已报名",
          unregistered: "未报名",
          unknown: "无法判断",
        } as Record<string, string>
      )[row.participation] || "无法判断";
let sequence = 0;
async function load() {
  const current = ++sequence;
  data.value = null;
  error.value = "";
  if (!groupId.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const result = await request.get<any, any>(
      `/admin/welfare/wecom/groups/${groupId.value}/members`,
      {
        params: {
          campaignId: campaignId.value,
          search: search.value,
          presence: presence.value,
          participation: participation.value,
          studentStatus: studentStatus.value,
          memberType: memberType.value,
          page: page.value,
          pageSize: 25,
        },
        skipGetDeduplication: true,
      },
    );
    if (current !== sequence) return;
    data.value = result;
    campaigns.value = result.campaigns;
  } catch (e) {
    if (current === sequence) error.value = message(e);
  } finally {
    if (current === sequence) loading.value = false;
  }
}
function applyFilters() {
  page.value = 1;
  void load();
}
function changeGroup() {
  campaignId.value = "";
  campaigns.value = [];
  search.value = "";
  presence.value = "current";
  participation.value = "all";
  studentStatus.value = "all";
  memberType.value = "customers";
  applyFilters();
}
function changeCampaign() {
  participation.value = "all";
  applyFilters();
}
function changePage(value: number) {
  page.value = value;
  void load();
}
async function syncMembers() {
  if (!groupId.value || syncing.value) return;
  syncing.value = true;
  let syncError = "";
  try {
    await request.post(
      `/admin/welfare/wecom/groups/${groupId.value}/sync`,
      {},
      { timeout: 60000 },
    );
    ElMessage.success("群成员已同步");
  } catch (e) {
    syncError = message(e);
  } finally {
    syncing.value = false;
    await load();
    if (syncError) error.value = syncError;
    emit("changed");
  }
}
watch(
  () => props.initialGroupId,
  (value) => {
    if (value && value !== groupId.value) {
      groupId.value = value;
      changeGroup();
    }
  },
);
watch(
  () => props.groups.map((group) => group.id).join(","),
  () => {
    if (!props.groups.some((group) => group.id === groupId.value)) {
      groupId.value = props.groups[0]?.id || "";
      changeGroup();
    }
  },
);
onMounted(load);
</script>

<style scoped>
.member-panel {
  color: var(--mx-text);
}
.member-intro {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.6;
}
.member-selectors {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.member-selectors :deep(.el-select),
.member-filters :deep(.el-select) {
  width: 100%;
}
.member-toolbar,
.member-sync-info,
.member-actions,
.member-totals,
.member-pagination {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.member-toolbar {
  justify-content: space-between;
  margin-bottom: 16px;
}
.member-sync-info {
  color: var(--mx-sub);
  font-size: 13px;
}
.member-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.member-totals {
  padding: 16px 0 8px;
  gap: 10px 20px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.member-note {
  color: var(--mx-sub);
  font-size: 13px;
  line-height: 1.65;
  margin: 8px 0;
  overflow-wrap: anywhere;
}
.member-name {
  overflow-wrap: anywhere;
}
.member-filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0 12px;
  margin-top: 20px;
}
.member-search {
  grid-column: span 2;
}
.member-filter-button {
  align-self: end;
}
.member-pagination {
  justify-content: space-between;
  margin-top: 16px;
}
@media (max-width: 600px) {
  .member-selectors {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .member-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .member-pagination {
    align-items: flex-start;
  }
}
</style>

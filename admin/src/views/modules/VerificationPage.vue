<template>
  <div class="identity-page">
    <PageHeader
      title="学生认证"
      subtitle="姓名与学号匹配名册即通过，未匹配的申请转人工审核"
      icon="School"
    />
    <div class="toolbar">
      <el-select
        v-model="schoolId"
        filterable
        remote
        :remote-method="searchSchools"
        :loading="schoolLoading"
        placeholder="选择学校"
        style="width: 310px"
        @change="changeSchool"
        ><el-option
          v-for="s in schools"
          :key="s.id"
          :label="s.name"
          :value="s.id"
      /></el-select>
      <el-button :disabled="!schoolId || loading" @click="load">刷新</el-button
      ><el-button :disabled="!schoolId" @click="showHistory()"
        >处理记录</el-button
      ><span class="spacer" />
      <el-button :disabled="!school || !canReview" @click="openPolicy"
        >认证方式</el-button
      ><el-button
        type="primary"
        :disabled="!schoolId || !canReview || busy"
        @click="fileInput?.click()"
        >导入学校名册</el-button
      >
      <input
        ref="fileInput"
        type="file"
        accept=".xls,.xlsx"
        hidden
        @change="previewFile"
      />
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />
    <template v-if="schoolId">
      <div class="stats">
        <div v-for="s in statCards" :key="s.label" class="stat">
          <span>{{ s.label }}</span
          ><strong>{{ s.value }}</strong>
        </div>
      </div>
      <el-alert type="info" :closable="false" show-icon
        ><template #title
          >历史未对应名册：已通过 {{ stats.legacy?.APPROVED || 0 }} 条，待审核
          {{ stats.legacy?.PENDING || 0 }} 条。</template
        >统计以本期在校名册为准。“未提交”不等于“未注册”；同名不会自动合并，名册中缺失的学生不会自动毕业。</el-alert
      >
      <p v-if="stats.outsideApproved" class="hint">
        另有
        {{ stats.outsideApproved }}
        个名册外账号经人工审核通过，单独统计，未计入名册人数。
      </p>
      <el-tabs v-model="tab" @tab-change="resetPage"
        ><el-tab-pane label="学生名册" name="roster" /><el-tab-pane
          label="认证审核"
          name="applications"
      /></el-tabs>
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="姓名或学号"
          clearable
          style="width: 220px"
          @keyup.enter="resetPage"
        /><el-select
          v-model="status"
          placeholder="全部认证状态"
          clearable
          style="width: 180px"
          @change="resetPage"
          ><el-option
            v-for="(label, value) in statusLabels"
            :key="value"
            :value="value"
            :label="label"
            :disabled="tab === 'applications' && value === 'none'" /></el-select
        ><el-select
          v-if="tab === 'roster'"
          v-model="enrollment"
          placeholder="在校状态"
          clearable
          style="width: 140px"
          @change="resetPage"
          ><el-option
            v-for="(label, value) in enrollmentLabels"
            :key="value"
            :value="value"
            :label="label" /></el-select
        ><el-button @click="resetPage">查询</el-button>
      </div>
      <el-table
        v-if="tab === 'roster'"
        :data="rows"
        v-loading="loading"
        border
        stripe
        row-key="id"
      >
        <el-table-column
          prop="studentId"
          label="学号 / 校内学籍号"
          min-width="175"
        /><el-table-column prop="realName" label="姓名" width="100" />
        <el-table-column label="在校状态" width="100"
          ><template #default="{ row }">{{
            enrollmentLabels[row.enrollmentStatus]
          }}</template></el-table-column
        >
        <el-table-column label="认证状态" min-width="145"
          ><template #default="{ row }"
            ><el-tag :type="tagType(row.certificationStatus)">{{
              statusLabels[row.certificationStatus]
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="绑定账号" min-width="150" show-overflow-tooltip
          ><template #default="{ row }">{{
            row.boundUserId || '尚未绑定'
          }}</template></el-table-column
        >
        <el-table-column label="认证时间" min-width="155"
          ><template #default="{ row }">{{
            formatDate(row.boundAt)
          }}</template></el-table-column
        >
        <el-table-column label="操作" min-width="280" fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              :disabled="!canReview"
              @click="openAction('enrollment', row)"
              >在校状态</el-button
            ><el-button
              link
              type="danger"
              :disabled="!canReview || !row.boundUserId"
              @click="openAction('release', row)"
              >绑定争议</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <el-table
        v-else
        :data="rows"
        v-loading="loading"
        border
        stripe
        row-key="id"
      >
        <el-table-column
          prop="student_id"
          label="学号"
          min-width="170"
        /><el-table-column prop="name" label="姓名" width="100" />
        <el-table-column label="认证状态" min-width="170"
          ><template #default="{ row }"
            ><el-tag :type="tagType(row.verification_status)">{{
              statusLabels[row.verification_status]
            }}</el-tag>
            <div v-if="!row.rosterStudentId" class="hint">
              {{
                row.historicalStatus === 'approved'
                  ? '历史已通过 · 待名册对照'
                  : '未对应名册'
              }}
            </div>
            <div v-else-if="row.manual_review_required" class="hint">
              等待人工审核
            </div></template
          ></el-table-column
        >
        <el-table-column label="认证方式" min-width="140"
          ><template #default="{ row }">{{
            proofLabels[row.proof_method] || row.proof_method
          }}</template></el-table-column
        >
        <el-table-column
          prop="userId"
          label="平台账号"
          min-width="150"
          show-overflow-tooltip
        /><el-table-column label="更新时间" min-width="155"
          ><template #default="{ row }">{{
            formatDate(row.updated_at)
          }}</template></el-table-column
        >
        <el-table-column label="操作" width="195" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="openReview(row)"
              >查看与审核</el-button
            ><el-button link @click="showHistory(row.userId)"
              >历史记录</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <el-pagination
        v-model:current-page="page"
        :page-size="20"
        :total="total"
        layout="total, prev, pager, next"
        class="pagination"
        @current-change="load"
      /> </template
    ><el-empty v-else description="请选择有管理权限的学校" />

    <el-dialog
      v-model="previewOpen"
      title="学校名册导入预览"
      width="720px"
      :close-on-click-modal="false"
    >
      <template v-if="preview"
        ><p>
          <strong>{{ preview.schoolName }}</strong> · 本次
          {{ preview.summary.total }} 人
        </p>
        <p>
          新增 {{ preview.summary.added }} 人，未变化
          {{ preview.summary.unchanged }} 人，冲突
          {{ preview.summary.conflicts.length }} 条。
        </p>
        <el-alert
          :title="`旧名册中 ${preview.summary.missing} 人未出现在本次文件，系统将保留其原状态。`"
          type="info"
          :closable="false"
        />
        <p class="hint">
          导入学号和姓名后，学生提交的信息与本校名册一致即可自动通过；未匹配则转人工审核。
        </p>
        <el-table
          v-if="preview.summary.conflicts.length"
          :data="preview.summary.conflicts"
          max-height="230"
          ><el-table-column prop="row" label="文件行" /><el-table-column
            prop="studentId"
            label="学号" /><el-table-column
            prop="existingName"
            label="现有姓名" /><el-table-column
            prop="incomingName"
            label="文件姓名"
        /></el-table>
        <el-table v-else :data="preview.sample" max-height="260"
          ><el-table-column prop="row" label="文件行" /><el-table-column
            prop="studentId"
            label="学号（前20条预览）" /><el-table-column
            prop="realName"
            label="姓名"
        /></el-table> </template
      ><template #footer
        ><el-button @click="previewOpen = false">取消</el-button
        ><el-button
          type="primary"
          :loading="busy"
          :disabled="!preview?.canCommit || previewSchool !== schoolId"
          @click="commitImport"
          >确认导入本校名册</el-button
        ></template
      >
    </el-dialog>
    <el-dialog
      v-model="actionOpen"
      :title="actionTitles[actionKind]"
      width="590px"
      :close-on-click-modal="false"
    >
      <p>{{ actionRow?.realName }} · {{ actionRow?.studentId }}</p>
      <el-form label-position="top">
        <el-form-item v-if="actionKind === 'enrollment'" label="在校状态"
          ><el-select v-model="actionStatus"
            ><el-option
              v-for="(label, value) in enrollmentLabels"
              :key="value"
              :value="value"
              :label="label" /></el-select
        ></el-form-item>
        <el-alert
          v-if="actionKind === 'release'"
          title="解除后会撤销相关账号的本校认证，学生需重新认证。"
          type="warning"
          :closable="false"
        />
        <el-form-item label="处理原因" required
          ><el-input
            v-model="actionReason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
        /></el-form-item>
        <el-checkbox v-if="actionKind === 'release'" v-model="confirmed"
          >已核实账号绑定争议，确认解除绑定</el-checkbox
        >
      </el-form>
      <template #footer
        ><el-button @click="actionOpen = false">关闭</el-button
        ><el-button
          type="primary"
          :loading="busy"
          :disabled="
            actionReason.trim().length < 5 ||
            (actionKind === 'release' && !confirmed)
          "
          @click="submitAction"
          >确认处理</el-button
        ></template
      >
    </el-dialog>
    <el-dialog
      v-model="reviewOpen"
      title="认证资料与审核"
      width="640px"
      :close-on-click-modal="false"
      @closed="clearMaterial"
    >
      <template v-if="reviewRow"
        ><el-descriptions :column="2" border
          ><el-descriptions-item label="姓名">{{
            reviewRow.name
          }}</el-descriptions-item
          ><el-descriptions-item label="学号">{{
            reviewRow.student_id
          }}</el-descriptions-item
          ><el-descriptions-item label="学校" :span="2">{{
            reviewRow.university
          }}</el-descriptions-item
          ><el-descriptions-item label="状态">{{
            statusLabels[reviewRow.verification_status]
          }}</el-descriptions-item
          ><el-descriptions-item label="处理原因">{{
            reviewRow.rejection_reason || '—'
          }}</el-descriptions-item></el-descriptions
        ><img
          v-if="materialUrl"
          :src="materialUrl"
          class="material"
          alt="学生提交的认证材料"
        />
        <p v-else class="hint">
          {{
            reviewRow.material_id
              ? '正在加载私密材料…'
              : reviewRow.student_card_required === false
                ? '本校免传学生证照片，请结合学校记录核对姓名和学号后审核。'
                : reviewRow.rosterStudentId
                  ? '本申请已进行名册核对，无须上传学生证。'
                  : '没有可显示的材料'
          }}
        </p>
        <template
          v-if="
            canReview &&
            ['pending', 'approved'].includes(reviewRow.historicalStatus)
          "
          ><el-select v-model="reviewStatus" class="control"
            ><el-option
              v-if="reviewRow.historicalStatus === 'pending'"
              label="审核通过"
              value="approved" /><el-option
              v-if="reviewRow.historicalStatus === 'pending'"
              label="驳回"
              value="rejected" /><el-option
              v-if="reviewRow.historicalStatus === 'approved'"
              label="撤销认证"
              value="revoked" /></el-select
          ><el-input
            v-model="reviewReason"
            type="textarea"
            :rows="3"
            maxlength="500"
            :placeholder="
              reviewStatus === 'approved' ? '审核备注（选填）' : '填写处理原因'
            "
          />
          <el-form
            v-if="reviewStatus === 'approved'"
            label-position="top"
            class="control"
          >
            <p class="hint">
              如学生填错，可根据学校记录或提交的材料更正。更正后与名册匹配的，将计入对应学生的已认证名单。
            </p>
            <el-form-item label="核对后姓名"
              ><el-input v-model="reviewName" maxlength="191"
            /></el-form-item>
            <el-form-item label="核对后学号"
              ><el-input v-model="reviewStudentId" maxlength="191"
            /></el-form-item>
          </el-form>
        </template> </template
      ><template #footer
        ><el-button @click="reviewOpen = false">关闭</el-button
        ><el-button
          v-if="
            canReview &&
            ['pending', 'approved'].includes(reviewRow?.historicalStatus)
          "
          type="primary"
          :loading="busy"
          :disabled="
            reviewStatus === 'approved'
              ? !reviewName.trim() ||
                !reviewStudentId.trim() ||
                (!materialUrl && reviewRow.student_card_required !== false)
              : !reviewReason.trim()
          "
          @click="submitReview"
          >提交审核结果</el-button
        ></template
      >
    </el-dialog>
    <el-dialog
      v-model="policyOpen"
      title="本校认证方式"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-radio-group v-model="policyMode"
        ><el-radio value="MANUAL">全部人工审核</el-radio
        ><el-radio value="ROSTER"
          >名册匹配自动通过，未匹配人工审核</el-radio
        ></el-radio-group
      >
      <p class="hint">
        确认导入本校名册后会自动启用名册匹配；其他学校继续使用各自的认证方式。
      </p>
      <template #footer
        ><el-button @click="policyOpen = false">取消</el-button
        ><el-button type="primary" :loading="busy" @click="savePolicy"
          >保存本校规则</el-button
        ></template
      >
    </el-dialog>
    <el-drawer v-model="historyOpen" title="学校认证处理记录" size="600px"
      ><el-empty
        v-if="!history.length"
        description="暂无处理记录"
      /><el-timeline
        ><el-timeline-item
          v-for="event in history"
          :key="event.id"
          :timestamp="formatDate(event.createdAt)"
          ><strong>{{ eventLabels[event.action] || event.action }}</strong>
          <p>经办账号：{{ event.actorId }}</p>
          <p v-if="event.submissionVersion">
            资料版本：{{ event.submissionVersion }}
          </p>
          <pre>{{ describeEvent(event.detail) }}</pre>
          <el-button
            v-if="event.materialId"
            link
            type="primary"
            @click="showHistoryMaterial(event.materialId)"
            >查看此版本材料</el-button
          ></el-timeline-item
        ></el-timeline
      ></el-drawer
    >
    <el-dialog
      v-model="historyMaterialOpen"
      title="历史版本认证材料"
      width="640px"
      @closed="clearHistoryMaterial"
      ><img
        v-if="historyMaterialUrl"
        :src="historyMaterialUrl"
        class="material"
        alt="该次申请提交的原始版本材料"
      />
      <p v-else class="hint">
        {{ historyMaterialError || '正在读取该版本材料…' }}
      </p></el-dialog
    >
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/common/PageHeader.vue';
import { useAuthStore } from '@/stores/auth';
import { studentIdentityApi as api } from '@/api/student-identity';
const route = useRoute(),
  auth = useAuthStore();
const canReview = computed(
  () =>
    auth.permissions.includes('user:cert') ||
    auth.permissions.includes('*') ||
    auth.user.role === '超级管理员',
);
const schoolId = ref(''),
  schools = ref<any[]>([]),
  schoolLoading = ref(false),
  school = ref<any>(null),
  tab = ref('roster');
const keyword = ref(''),
  status = ref(''),
  enrollment = ref('ACTIVE'),
  page = ref(1),
  total = ref(0),
  rows = ref<any[]>([]),
  stats = ref<any>({}),
  loading = ref(false),
  busy = ref(false),
  error = ref(''),
  fileInput = ref<HTMLInputElement>();
const statusLabels: Record<string, string> = {
  none: '未提交',
  pending: '待人工审核',
  approved: '已通过',
  rejected: '已驳回',
  revoked: '已撤销 / 已失效',
};
const enrollmentLabels: Record<string, string> = {
  ACTIVE: '在校',
  GRADUATED: '已毕业',
  WITHDRAWN: '已退学',
};
const proofLabels: Record<string, string> = {
  LEGACY: '历史人工认证',
  ROSTER_MATCH: '名册自动通过',
  ROSTER_EXCEPTION: '名册未匹配 / 存在冲突',
  SCHOOL_REVIEW: '人工审核并对应名册',
  SCHOOL_EXCEPTION: '名册外人工通过',
  MANUAL_PENDING: '材料待审核',
  MANUAL_REVIEW: '人工材料核验',
};
const eventLabels: Record<string, string> = {
  ARCHIVE_SUBMISSION: '保留重新提交前的资料版本',
  POLICY: '变更认证方式',
  ROSTER_IMPORT: '导入名册',
  AUTO_APPROVE: '名册自动核验通过',
  SUBMIT: '提交申请',
  APPROVED: '审核通过',
  REJECTED: '审核驳回',
  REVOKED: '撤销认证',
  ENROLLMENT: '更新在校状态',
  RELEASE_BINDING: '处理绑定争议',
};
function describeEvent(detail: any) {
  const lines: string[] = [];
  if (detail.total !== undefined) lines.push(`名册人数：${detail.total}`);
  if (detail.added !== undefined) lines.push(`新增人数：${detail.added}`);
  if (detail.reason) lines.push(`处理原因：${detail.reason}`);
  if (detail.realName) lines.push(`学生姓名：${detail.realName}`);
  if (detail.studentId) lines.push(`学号：${detail.studentId}`);
  if (detail.status)
    lines.push(
      `处理结果：${enrollmentLabels[detail.status] || statusLabels[String(detail.status).toLowerCase()] || detail.status}`,
    );
  if (detail.mode)
    lines.push(
      `认证方式：${detail.mode === 'ROSTER' ? '名册自动核验' : '人工材料审核'}`,
    );
  return lines.join('\n') || '处理已记录';
}
const statCards = computed(() => [
  { label: '本期在校学生', value: stats.value.active ?? '—' },
  { label: '已完成名册认证', value: stats.value.approved ?? '—' },
  { label: '尚未完成认证', value: stats.value.unfinished ?? '—' },
  { label: '待人工审核申请', value: stats.value.manualPending ?? '—' },
]);
const tagType = (s: string) =>
  s === 'approved'
    ? 'success'
    : s === 'pending'
      ? 'warning'
      : s === 'none'
        ? 'info'
        : 'danger';
const formatDate = (s: string) =>
  s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '—';
let loadSequence = 0,
  schoolSequence = 0;
async function searchSchools(value = '') {
  const seq = ++schoolSequence;
  schoolLoading.value = true;
  try {
    const r = await api.schools(value);
    if (seq === schoolSequence) schools.value = r.list || [];
  } catch {
    /* interceptor */
  } finally {
    if (seq === schoolSequence) schoolLoading.value = false;
  }
}
async function load() {
  if (!schoolId.value) return;
  const seq = ++loadSequence,
    selected = schoolId.value,
    activeTab = tab.value;
  loading.value = true;
  error.value = '';
  try {
    const roster = await api.roster(selected, {
      page: page.value,
      pageSize: 20,
      ...(activeTab === 'roster'
        ? {
            keyword: keyword.value,
            status: status.value || undefined,
            enrollmentStatus: enrollment.value || undefined,
          }
        : {}),
    });
    if (seq !== loadSequence) return;
    school.value = roster.school;
    stats.value = roster.stats;
    const r =
      activeTab === 'roster'
        ? roster
        : await api.applications({
            schoolId: selected,
            page: page.value,
            pageSize: 20,
            keyword: keyword.value,
            status:
              status.value === 'none' ? undefined : status.value || undefined,
          });
    if (seq !== loadSequence) return;
    rows.value = r.list || [];
    total.value = r.total || 0;
  } catch (e: any) {
    if (seq === loadSequence && e?.code !== 'ERR_CANCELED') {
      rows.value = [];
      error.value = '读取失败，请刷新后重试。';
    }
  } finally {
    if (seq === loadSequence) loading.value = false;
  }
}
function resetPage() {
  page.value = 1;
  void load();
}
function changeSchool() {
  rows.value = [];
  stats.value = {};
  school.value = null;
  resetPage();
}
const preview = ref<any>(null),
  previewOpen = ref(false),
  previewSchool = ref('');
async function previewFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = '';
  if (!file || busy.value) return;
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.error('名册不能超过2MB');
    return;
  }
  const selected = schoolId.value;
  busy.value = true;
  try {
    const r = await api.preview(selected, file);
    if (r.alreadyImported) {
      ElMessage.info('这份名册已导入，无须重复操作');
      return;
    }
    preview.value = r;
    previewSchool.value = selected;
    previewOpen.value = true;
  } catch {
    /* interceptor */
  } finally {
    busy.value = false;
  }
}
async function commitImport() {
  if (busy.value) return;
  busy.value = true;
  try {
    await api.commit(previewSchool.value, preview.value.batchId);
    previewOpen.value = false;
    ElMessage.success('名册已导入，后续姓名和学号匹配将自动通过');
    await load();
  } catch {
    /* interceptor */
  } finally {
    busy.value = false;
  }
}
const actionOpen = ref(false),
  actionKind = ref('enrollment'),
  actionRow = ref<any>(null),
  actionSchool = ref(''),
  actionReason = ref(''),
  confirmed = ref(false),
  actionStatus = ref('ACTIVE');
const actionTitles: Record<string, string> = {
  enrollment: '更新学生在校状态',
  release: '核实并解除争议绑定',
};
function openAction(kind: string, row: any) {
  actionKind.value = kind;
  actionRow.value = { ...row };
  actionSchool.value = schoolId.value;
  actionReason.value = '';
  confirmed.value = false;
  actionStatus.value = row.enrollmentStatus;
  actionOpen.value = true;
}
async function submitAction() {
  if (busy.value) return;
  busy.value = true;
  try {
    const version = actionRow.value.version;
    if (actionKind.value === 'enrollment') {
      await api.enrollment(actionSchool.value, actionRow.value.id, {
        version,
        status: actionStatus.value,
        reason: actionReason.value.trim(),
      });
      actionOpen.value = false;
    } else {
      await api.release(actionSchool.value, actionRow.value.id, {
        version,
        identityConfirmed: confirmed.value,
        reason: actionReason.value.trim(),
      });
      actionOpen.value = false;
    }
    ElMessage.success('处理成功');
    await load();
  } catch {
    /* interceptor */
  } finally {
    busy.value = false;
  }
}
const reviewOpen = ref(false),
  reviewRow = ref<any>(null),
  reviewStatus = ref('approved'),
  reviewReason = ref(''),
  reviewName = ref(''),
  reviewStudentId = ref(''),
  materialUrl = ref('');
function clearMaterial() {
  if (materialUrl.value.startsWith('blob:'))
    URL.revokeObjectURL(materialUrl.value);
  materialUrl.value = '';
}
async function openReview(row: any) {
  clearMaterial();
  reviewRow.value = { ...row };
  reviewStatus.value =
    row.historicalStatus === 'approved' ? 'revoked' : 'approved';
  reviewReason.value = '';
  reviewName.value = row.name || '';
  reviewStudentId.value = row.student_id || '';
  reviewOpen.value = true;
  if (row.material_id) {
    try {
      const file = await api.material(row.material_id);
      if (reviewOpen.value && reviewRow.value?.id === row.id)
        materialUrl.value = URL.createObjectURL(file);
    } catch {
      ElMessage.error('材料读取失败，请勿在未核实资料时通过');
    }
  } else if (/^https?:\/\//.test(row.photo_url || ''))
    materialUrl.value = row.photo_url;
}
async function submitReview() {
  if (busy.value) return;
  busy.value = true;
  try {
    await api.review(reviewRow.value.userId, {
      applicationId: reviewRow.value.id,
      submissionVersion: reviewRow.value.submission_version,
      status: reviewStatus.value,
      correctedRealName:
        reviewStatus.value === 'approved' ? reviewName.value.trim() : undefined,
      correctedStudentId:
        reviewStatus.value === 'approved'
          ? reviewStudentId.value.trim()
          : undefined,
      reason: reviewReason.value.trim() || undefined,
    });
    reviewOpen.value = false;
    ElMessage.success('审核结果已保存');
    await load();
  } catch {
    /* interceptor */
  } finally {
    busy.value = false;
  }
}
const policyOpen = ref(false),
  policyMode = ref('MANUAL'),
  policyRevision = ref(0),
  policySchool = ref('');
function openPolicy() {
  if (!school.value) return;
  policyMode.value = school.value.studentVerificationMode;
  policyRevision.value = school.value.rosterRevision;
  policySchool.value = schoolId.value;
  policyOpen.value = true;
}
async function savePolicy() {
  if (busy.value) return;
  busy.value = true;
  try {
    await api.policy(policySchool.value, {
      mode: policyMode.value,
      revision: policyRevision.value,
    });
    policyOpen.value = false;
    ElMessage.success('本校认证方式已更新');
    await load();
  } catch {
    /* interceptor */
  } finally {
    busy.value = false;
  }
}
const historyMaterialOpen = ref(false),
  historyMaterialUrl = ref(''),
  historyMaterialError = ref('');
let historyMaterialSequence = 0;
function clearHistoryMaterial() {
  historyMaterialSequence++;
  if (historyMaterialUrl.value) URL.revokeObjectURL(historyMaterialUrl.value);
  historyMaterialUrl.value = '';
}
async function showHistoryMaterial(id: string) {
  clearHistoryMaterial();
  const sequence = historyMaterialSequence;
  historyMaterialError.value = '';
  historyMaterialOpen.value = true;
  try {
    const file = await api.material(id);
    if (historyMaterialOpen.value && sequence === historyMaterialSequence)
      historyMaterialUrl.value = URL.createObjectURL(file);
  } catch {
    historyMaterialError.value = '材料读取失败，请重试或联系本校管理员';
  }
}
const historyOpen = ref(false),
  history = ref<any[]>([]);
async function showHistory(userId?: string) {
  history.value = [];
  historyOpen.value = true;
  try {
    history.value = await api.events(schoolId.value, userId);
  } catch {
    /* interceptor */
  }
}
onMounted(async () => {
  await searchSchools();
  const requested = String(route.query.schoolId || '');
  schoolId.value =
    schools.value.find((s) => s.id === requested)?.id ||
    schools.value.find((s) => s.name === '重庆城乡发展职业学院')?.id ||
    schools.value[0]?.id ||
    '';
  await load();
});
onBeforeUnmount(() => {
  loadSequence++;
  schoolSequence++;
  clearMaterial();
  clearHistoryMaterial();
});
</script>
<style scoped>
.identity-page {
  padding: 24px;
  color: var(--el-text-color-primary);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 18px 0;
}
.spacer {
  flex: 1;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin: 22px 0;
}
.stat {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.stat span,
.hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.stat strong {
  font-size: 30px;
  font-weight: 650;
}
.pagination {
  justify-content: flex-end;
  margin-top: 20px;
}
.control {
  margin: 18px 0;
}
.material {
  display: block;
  max-width: 100%;
  max-height: 330px;
  margin: 18px auto;
  border-radius: 8px;
}
.hint {
  line-height: 1.7;
}
pre {
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 8px;
  font-size: 12px;
}
@media (max-width: 900px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .identity-page {
    padding: 12px;
  }
}
</style>

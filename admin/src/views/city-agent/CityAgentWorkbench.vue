<template>
  <div class="city-agent-page">
    <PageHeader
      title="区域合作"
      subtitle="处理小程序区域合作申请，审核通过后自动生成区域代理档案"
      icon="Connection"
    />

    <div class="summary-grid">
      <div class="summary-card">
        <span>待审核申请</span>
        <strong>{{ pendingTotal }}</strong>
      </div>
      <div class="summary-card">
        <span>已通过申请</span>
        <strong>{{ approvedTotal }}</strong>
      </div>
      <div class="summary-card">
        <span>活跃代理</span>
        <strong>{{ activeAgentTotal }}</strong>
      </div>
      <div class="summary-card">
        <span>待结算金额</span>
        <strong>{{ formatMoney(pendingAmountTotal) }}</strong>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="work-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="申请审核" name="applications">
        <div class="toolbar">
          <el-input
            v-model="applicationKeyword"
            clearable
            placeholder="搜索姓名/电话/区域"
            style="width: 260px"
          />
          <el-select v-model="applicationStatus" clearable placeholder="审核状态" style="width: 140px" @change="loadApplications">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
          </el-select>
          <el-button type="primary" @click="loadApplications">查询</el-button>
          <el-button @click="resetApplicationFilters">重置</el-button>
        </div>

        <el-table :data="filteredApplications" v-loading="loadingApplications" border stripe>
          <el-table-column label="申请人" min-width="150">
            <template #default="{ row }">
              <strong>{{ row.realName }}</strong>
              <p class="muted">{{ row.user?.nickname || row.userId }}</p>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="电话" width="130" />
          <el-table-column label="申请区域" min-width="150">
            <template #default="{ row }">{{ row.region?.name || row.regionName || row.regionId }}</template>
          </el-table-column>
          <el-table-column prop="companyName" label="团队/公司" min-width="150">
            <template #default="{ row }">{{ row.companyName || '-' }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="合作说明" min-width="220" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="rejectReason" label="拒绝原因" min-width="150">
            <template #default="{ row }">{{ row.rejectReason || '-' }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" label="提交时间" width="180">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button size="small" type="success" @click="auditApplication(row, 'approved')">通过</el-button>
                <el-button size="small" type="danger" @click="auditApplication(row, 'rejected')">拒绝</el-button>
              </template>
              <span v-else class="muted">已处理</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="applicationPage.page"
            v-model:page-size="applicationPage.pageSize"
            :total="applicationPage.total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @size-change="loadApplications"
            @current-change="loadApplications"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="代理档案" name="agents">
        <div class="toolbar">
          <el-input v-model="agentKeyword" clearable placeholder="搜索代理/电话/区域" style="width: 260px" />
          <el-select v-model="agentStatus" clearable placeholder="状态" style="width: 140px" @change="loadAgents">
            <el-option label="正常" value="active" />
            <el-option label="冻结" value="frozen" />
            <el-option label="关闭" value="closed" />
          </el-select>
          <el-button type="primary" @click="loadAgents">查询</el-button>
          <el-button @click="resetAgentFilters">重置</el-button>
        </div>

        <el-table :data="filteredAgents" v-loading="loadingAgents" border stripe>
          <el-table-column label="代理人" min-width="150">
            <template #default="{ row }">
              <strong>{{ row.realName }}</strong>
              <p class="muted">{{ row.userNickname || row.userId }}</p>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="电话" width="130" />
          <el-table-column prop="regionName" label="负责区域" min-width="160" />
          <el-table-column label="分佣比例" width="110">
            <template #default="{ row }">{{ percent(row.commissionRate) }}</template>
          </el-table-column>
          <el-table-column label="累计佣金" width="120">
            <template #default="{ row }">{{ formatMoney(row.totalCommission) }}</template>
          </el-table-column>
          <el-table-column label="待结算" width="120">
            <template #default="{ row }">{{ formatMoney(row.pendingAmount) }}</template>
          </el-table-column>
          <el-table-column label="已结算" width="120">
            <template #default="{ row }">{{ formatMoney(row.settledAmount) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="agentStatusType(row.status)" size="small">{{ agentStatusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="通过时间" width="180">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="agentPage.page"
            v-model:page-size="agentPage.pageSize"
            :total="agentPage.total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @size-change="loadAgents"
            @current-change="loadAgents"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="结算记录" name="settlements">
        <div class="toolbar">
          <el-select v-model="settlementStatus" clearable placeholder="结算状态" style="width: 150px" @change="loadSettlements">
            <el-option label="待处理" value="pending" />
            <el-option label="处理中" value="processing" />
            <el-option label="已完成" value="completed" />
            <el-option label="失败" value="failed" />
          </el-select>
          <el-button type="primary" @click="loadSettlements">查询</el-button>
          <el-button @click="resetSettlementFilters">重置</el-button>
        </div>
        <el-table :data="settlements" v-loading="loadingSettlements" border stripe>
          <el-table-column prop="settlementNo" label="结算单号" min-width="170" />
          <el-table-column prop="agentName" label="代理人" width="130" />
          <el-table-column prop="settlementMonth" label="结算月份" width="120" />
          <el-table-column label="金额" width="120">
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="settlementStatusType(row.status)" size="small">{{ settlementStatusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="180">
            <template #default="{ row }">{{ row.remark || '-' }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="180">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="settlementPage.page"
            v-model:page-size="settlementPage.pageSize"
            :total="settlementPage.total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @size-change="loadSettlements"
            @current-change="loadSettlements"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const activeTab = ref('applications')
const loadingApplications = ref(false)
const loadingAgents = ref(false)
const loadingSettlements = ref(false)
const applications = ref<any[]>([])
const agents = ref<any[]>([])
const settlements = ref<any[]>([])
const applicationKeyword = ref('')
const applicationStatus = ref('')
const agentKeyword = ref('')
const agentStatus = ref('')
const settlementStatus = ref('')
const applicationPage = reactive({ page: 1, pageSize: 20, total: 0 })
const agentPage = reactive({ page: 1, pageSize: 20, total: 0 })
const settlementPage = reactive({ page: 1, pageSize: 20, total: 0 })

const pendingTotal = computed(() => applications.value.filter(item => item.status === 'pending').length)
const approvedTotal = computed(() => applications.value.filter(item => item.status === 'approved').length)
const activeAgentTotal = computed(() => agents.value.filter(item => item.status === 'active').length)
const pendingAmountTotal = computed(() => agents.value.reduce((sum, item) => sum + Number(item.pendingAmount || 0), 0))

const filteredApplications = computed(() => {
  const keyword = applicationKeyword.value.trim().toLowerCase()
  if (!keyword) return applications.value
  return applications.value.filter(row => [
    row.realName,
    row.phone,
    row.companyName,
    row.region?.name,
    row.regionName,
    row.user?.nickname,
  ].some(value => String(value || '').toLowerCase().includes(keyword)))
})

const filteredAgents = computed(() => {
  const keyword = agentKeyword.value.trim().toLowerCase()
  if (!keyword) return agents.value
  return agents.value.filter(row => [
    row.realName,
    row.phone,
    row.regionName,
    row.userNickname,
  ].some(value => String(value || '').toLowerCase().includes(keyword)))
})

function normalizePage(res: any) {
  const data = res?.data || res || {}
  return {
    list: Array.isArray(data.list) ? data.list : [],
    total: Number(data.total || 0),
  }
}

function formatTime(value: any) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

function formatMoney(value: any) {
  return `¥${Number(value || 0).toFixed(2)}`
}

function percent(value: any) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`
}

function statusLabel(status: string) {
  return ({ pending: '待审核', approved: '已通过', rejected: '已拒绝' } as Record<string, string>)[status] || status || '-'
}

function statusType(status: string) {
  return ({ pending: 'warning', approved: 'success', rejected: 'danger' } as Record<string, string>)[status] || 'info'
}

function agentStatusLabel(status: string) {
  return ({ active: '正常', frozen: '冻结', closed: '关闭' } as Record<string, string>)[status] || status || '-'
}

function agentStatusType(status: string) {
  return ({ active: 'success', frozen: 'warning', closed: 'info' } as Record<string, string>)[status] || 'info'
}

function settlementStatusLabel(status: string) {
  return ({ pending: '待处理', processing: '处理中', completed: '已完成', failed: '失败' } as Record<string, string>)[status] || status || '-'
}

function settlementStatusType(status: string) {
  return ({ pending: 'warning', processing: 'primary', completed: 'success', failed: 'danger' } as Record<string, string>)[status] || 'info'
}

async function loadApplications() {
  loadingApplications.value = true
  try {
    const page = normalizePage(await request.get('/admin/city-agent/applications', {
      params: {
        page: applicationPage.page,
        pageSize: applicationPage.pageSize,
        status: applicationStatus.value || undefined,
      },
    }))
    applications.value = page.list
    applicationPage.total = page.total
  } finally {
    loadingApplications.value = false
  }
}

async function loadAgents() {
  loadingAgents.value = true
  try {
    const page = normalizePage(await request.get('/admin/city-agent/agents', {
      params: {
        page: agentPage.page,
        pageSize: agentPage.pageSize,
        status: agentStatus.value || undefined,
      },
    }))
    agents.value = page.list
    agentPage.total = page.total
  } finally {
    loadingAgents.value = false
  }
}

async function loadSettlements() {
  loadingSettlements.value = true
  try {
    const page = normalizePage(await request.get('/admin/city-agent/settlements', {
      params: {
        page: settlementPage.page,
        pageSize: settlementPage.pageSize,
        status: settlementStatus.value || undefined,
      },
    }))
    settlements.value = page.list
    settlementPage.total = page.total
  } finally {
    loadingSettlements.value = false
  }
}

async function auditApplication(row: any, status: 'approved' | 'rejected') {
  try {
    let reason = ''
    if (status === 'rejected') {
      const prompt = await ElMessageBox.prompt('请输入拒绝原因，用户会在小程序申请页看到', '拒绝区域合作申请', {
        inputPlaceholder: '例如：资料不完整，请补充学校资源说明',
        type: 'warning',
      })
      reason = String(prompt.value || '').trim()
      if (!reason) {
        ElMessage.warning('拒绝原因不能为空')
        return
      }
    } else {
      await ElMessageBox.confirm(`通过 ${row.realName} 的区域合作申请？通过后会生成代理档案。`, '确认审核', { type: 'warning' })
    }
    await request.put(`/admin/city-agent/applications/${row.id}/audit`, { status, reason })
    ElMessage.success(status === 'approved' ? '已通过申请' : '已拒绝申请')
    await Promise.all([loadApplications(), loadAgents()])
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(error?.message || '审核操作失败')
  }
}

function resetApplicationFilters() {
  applicationKeyword.value = ''
  applicationStatus.value = ''
  applicationPage.page = 1
  loadApplications()
}

function resetAgentFilters() {
  agentKeyword.value = ''
  agentStatus.value = ''
  agentPage.page = 1
  loadAgents()
}

function resetSettlementFilters() {
  settlementStatus.value = ''
  settlementPage.page = 1
  loadSettlements()
}

function handleTabChange() {
  if (activeTab.value === 'applications') loadApplications()
  if (activeTab.value === 'agents') loadAgents()
  if (activeTab.value === 'settlements') loadSettlements()
}

onMounted(async () => {
  await Promise.all([loadApplications(), loadAgents()])
})
</script>

<style scoped>
.city-agent-page {
  padding: 24px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin: 18px 0;
}

.summary-card {
  min-height: 96px;
  padding: 20px;
  border: 1px solid #dce8f8;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 46, 89, 0.05);
}

.summary-card span {
  display: block;
  color: #66758a;
  font-size: 13px;
}

.summary-card strong {
  display: block;
  margin-top: 10px;
  color: #15233c;
  font-size: 28px;
  line-height: 1;
}

.work-tabs {
  padding: 18px;
  border: 1px solid #dce8f8;
  border-radius: 6px;
  background: #fff;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.muted {
  margin: 4px 0 0;
  color: #7d8ca3;
  font-size: 12px;
}

@media (max-width: 1200px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

<template>
  <div class="page-shell">
    <PageHeader title="骑手管理" subtitle="管理骑手信息" icon="User" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索 UID / 姓名 / 手机号 / 昵称" aria-label="搜索 UID、姓名、手机号或昵称" clearable class="keyword-input" @clear="applyFilters" @keyup.enter="applyFilters" />
      <el-select v-model="filters.auditStatus" placeholder="审核状态" clearable style="width: 120px" @change="applyFilters">
        <el-option label="待审核" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已拒绝" value="rejected" />
        <el-option label="已撤销" value="revoked" />
        <el-option label="普通用户" value="ordinary_user" />
      </el-select>
      <el-select v-model="filters.status" placeholder="在线状态" clearable style="width: 120px" @change="applyFilters">
        <el-option label="离线" value="offline" />
        <el-option label="在线" value="online" />
        <el-option label="忙碌" value="busy" />
      </el-select>
      <el-select v-model="filters.riderType" placeholder="骑手类型" clearable style="width: 120px" @change="applyFilters">
        <el-option label="兼职骑手" value="part_time" />
        <el-option label="官方骑手" value="official" />
        <el-option label="普通用户" value="ordinary_user" />
      </el-select>
      <el-button type="primary" @click="applyFilters">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="realName" label="姓名" width="100" />
      <el-table-column prop="phone" label="手机号" width="120" />
      <el-table-column label="小程序用户" min-width="190">
        <template #default="{ row }">
          <div v-if="miniUser(row)" class="user-cell">
            <el-avatar :size="32" :src="miniUser(row).avatar">{{ userInitial(miniUser(row)) }}</el-avatar>
            <div class="user-meta">
              <div class="user-name">{{ miniUser(row).nickname || '未设置昵称' }}</div>
              <div class="user-sub">UID：{{ userUid(miniUser(row)) }}</div>
            </div>
          </div>
          <el-tag v-else type="warning" size="small">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="verifyStatus" label="审核" width="90">
        <template #default="{ row }">
          <el-tag :type="auditTypeMap[row.verifyStatus]" size="small">{{ auditMap[row.verifyStatus] || row.verifyStatus }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="在线状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.status]" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="riderType" label="类型" width="100">
        <template #default="{ row }">
          <el-tag :type="row.riderType === 'official' ? 'success' : 'info'" size="small">{{ riderTypeLabel(row.riderType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="riskLevel" label="风控" width="100">
        <template #default="{ row }">
          <el-tag :type="riskTypeMap[row.riskLevel || 'normal']" size="small">{{ riskMap[row.riskLevel || 'normal'] || row.riskLevel }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="rating" label="评分" width="80" />
      <el-table-column prop="totalOrders" label="总订单" width="80" />
      <el-table-column prop="todayOrders" label="今日订单" width="80" />
      <el-table-column prop="createdAt" label="注册时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="330" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
          <template v-if="canAudit && row.verifyStatus === 'pending'">
            <el-button size="small" type="success" @click="audit(row, 'approved')">通过</el-button>
            <el-button size="small" type="danger" @click="audit(row, 'rejected')">拒绝</el-button>
          </template>
          <template v-else-if="canAudit && row.verifyStatus === 'approved'">
	            <el-button v-if="row.verifyStatus === 'approved' && row.status !== 'offline'" size="small" type="warning" @click="updateStatus(row, 'offline')">下线</el-button>
	            <el-button v-if="row.verifyStatus === 'approved' && row.status !== 'online'" size="small" type="success" @click="updateStatus(row, 'online')">上线</el-button>
	            <el-button v-if="row.riderType !== 'official'" size="small" type="primary" @click="updateRiderType(row, 'official')">设官方</el-button>
	            <el-button v-if="row.riderType === 'official'" size="small" @click="updateRiderType(row, 'part_time')">设兼职</el-button>
            <el-button size="small" type="danger" plain @click="openRevoke(row)">撤销认证</el-button>
	          </template>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" />
    </div>

    <el-dialog v-model="detailVisible" title="骑手详情" width="620px">
      <el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="小程序用户" :span="2">
          <div v-if="miniUser(detail)" class="user-cell">
            <el-avatar :size="36" :src="miniUser(detail).avatar">{{ userInitial(miniUser(detail)) }}</el-avatar>
            <div class="user-meta">
              <div class="user-name">{{ miniUser(detail).nickname || '未设置昵称' }}</div>
              <div class="user-sub">UID：{{ userUid(miniUser(detail)) }}</div>
            </div>
          </div>
          <el-tag v-else type="warning" size="small">未绑定小程序用户</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="小程序手机号">{{ miniUser(detail)?.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="骑手编号">{{ detail.id }}</el-descriptions-item>
        <el-descriptions-item label="真实姓名">{{ detail.realName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系手机号">{{ detail.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="审核状态">{{ auditMap[detail.verifyStatus] || detail.verifyStatus }}</el-descriptions-item>
        <el-descriptions-item label="在线状态">{{ statusMap[detail.status] || detail.status }}</el-descriptions-item>
        <el-descriptions-item label="骑手类型">{{ riderTypeLabel(detail.riderType) }}</el-descriptions-item>
        <el-descriptions-item label="风控状态">{{ riskMap[detail.riskLevel || 'normal'] || detail.riskLevel }}</el-descriptions-item>
        <el-descriptions-item label="违规次数">{{ detail.violationCount || 0 }}</el-descriptions-item>
        <el-descriptions-item label="最后定位">{{ formatDate(detail.locationUpdatedAt) }}</el-descriptions-item>
        <el-descriptions-item label="评分">{{ detail.rating || 0 }}</el-descriptions-item>
        <el-descriptions-item label="总订单">{{ detail.totalOrders || 0 }}</el-descriptions-item>
        <el-descriptions-item label="今日订单">{{ detail.todayOrders || 0 }}</el-descriptions-item>
        <el-descriptions-item label="注册时间">{{ formatDate(detail.createdAt) }}</el-descriptions-item>
        <template v-if="detail.revocation">
          <el-descriptions-item label="撤销时间" :span="2">{{ formatDate(detail.revocation.revokedAt) }}</el-descriptions-item>
          <el-descriptions-item label="撤销原因" :span="2">{{ detail.revocation.reason }}</el-descriptions-item>
        </template>
      </el-descriptions>
    </el-dialog>

    <el-dialog v-model="revokeVisible" title="撤销骑手认证" width="520px" :close-on-click-modal="false" :close-on-press-escape="!revoking" :show-close="!revoking">
      <p class="revoke-target">将撤销 <strong>{{ revokeTarget?.realName || miniUser(revokeTarget)?.nickname || '该用户' }}</strong> 的骑手认证。</p>
      <el-alert type="warning" :closable="false" show-icon>
        <template #title>有未完成订单时，请先完成或转交订单。</template>
        撤销后退出认证骑手接单，学生认证保持不变。符合规则时仍可作为普通用户接单，也可重新申请骑手并等待审核。
      </el-alert>
      <el-form label-position="top" class="revoke-form" @submit.prevent="submitRevoke">
        <el-form-item label="撤销原因" required :error="revokeError">
          <el-input v-model="revokeReason" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="请填写撤销原因，便于后续核查" :disabled="revoking" @input="revokeError = ''" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="revoking" @click="revokeVisible = false">取消</el-button>
        <el-button type="danger" :loading="revoking" @click="submitRevoke">确认撤销</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted, watch } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const canAudit = computed(() => auth.permissions.includes('rider:audit') || auth.permissions.includes('*') || auth.user.role === '超级管理员')
const auditMap: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝', revoked: '已撤销', ordinary_user: '普通用户' }
const auditTypeMap: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'danger', revoked: 'danger', ordinary_user: 'info' }
const statusMap: Record<string, string> = { offline: '离线', online: '在线', busy: '忙碌' }
const statusTypeMap: Record<string, string> = { offline: 'info', online: 'success', busy: 'warning' }
const riskMap: Record<string, string> = { normal: '正常', warning: '关注', restricted: '限制接单', banned: '封禁' }
const riskTypeMap: Record<string, string> = { normal: 'success', warning: 'warning', restricted: 'danger', banned: 'danger' }
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', auditStatus: '', status: '', riderType: '' })
const detailVisible = ref(false)
const detail = ref<any>(null)
const revokeVisible = ref(false)
const revokeTarget = ref<any>(null)
const revokeReason = ref('')
const revokeError = ref('')
const revoking = ref(false)

const miniUser = (row: any) => row?.User || row?.user || row?.miniUser || null
const userUid = (user: any) => user?.publicUid || user?.public_uid || user?.displayUid || user?.uid || '-'
const userInitial = (user: any) => String(user?.nickname || '用').slice(0, 1)
const formatDate = (d: any) => d ? new Date(d).toLocaleString('zh-CN') : '-'
const riderTypeLabel = (value?: string) => value === 'ordinary_user' ? '普通用户' : value === 'official' ? '官方骑手' : '兼职骑手'

const loadData = async () => {
  loading.value = true
	  try {
	    const params: any = { page: page.value, pageSize: pageSize.value, ...filters, keyword: filters.keyword.trim() }
    const res: any = await request.get('/admin/riders', { params, skipGetDeduplication: true })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const applyFilters = () => {
  if (page.value !== 1) page.value = 1
  else void loadData()
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', auditStatus: '', status: '', riderType: '' })
  applyFilters()
}

const openRevoke = (row: any) => {
  revokeTarget.value = row
  revokeReason.value = ''
  revokeError.value = ''
  revokeVisible.value = true
}

const submitRevoke = async () => {
  if (revoking.value || !revokeTarget.value) return
  const reason = revokeReason.value.trim()
  if (!reason) {
    revokeError.value = '请填写撤销原因'
    return
  }
  revoking.value = true
  revokeError.value = ''
  try {
    await request.post(`/admin/riders/${revokeTarget.value.id}/revoke`, { reason })
    revokeVisible.value = false
    ElMessage.success('骑手认证已撤销')
    await loadData()
  } catch (error: any) {
    revokeError.value = error?.message || '撤销失败，请稍后重试'
  } finally {
    revoking.value = false
  }
}

const audit = async (row: any, status: string) => {
  try {
    await ElMessageBox.confirm(status === 'approved' ? '通过该骑手？' : '拒绝该骑手？', '确认', { type: 'warning' })
    await request.put(`/admin/riders/${row.id}/audit`, { status })
    ElMessage.success('操作成功'); loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

const updateStatus = async (row: any, status: string) => {
  try {
    await request.put(`/admin/riders/${row.id}/status`, { status })
    ElMessage.success('状态已更新'); loadData()
  } catch (e) { ElMessage.error('操作失败') }
}

const updateRiderType = async (row: any, riderType: string) => {
  try {
    await request.put(`/admin/riders/${row.id}/status`, { riderType })
    ElMessage.success('骑手类型已更新')
    loadData()
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

const viewDetail = async (row: any) => {
  try {
    const res: any = await request.get(`/admin/riders/${row.id}`)
    detail.value = res?.data ?? res
    detailVisible.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '获取骑手详情失败')
  }
}

watch([page, pageSize], () => { void loadData() })
onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.keyword-input { width: 280px; max-width: 100%; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.revoke-target { margin-top: 0; }
.revoke-form { margin-top: 20px; }
.user-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.user-meta { min-width: 0; line-height: 1.35; }
.user-name { font-weight: 600; color: #172033; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-sub { color: var(--mx-sub, #526174); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

<template>
  <div class="page-shell">
    <PageHeader title="分销管理" />

    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索姓名/手机号"
        clearable
        style="width: 200px"
        @clear="loadDistributors"
        @keyup.enter="loadDistributors"
      />
      <el-select v-model="filters.status" placeholder="审核状态" clearable style="width: 120px" @change="loadDistributors">
        <el-option label="待审核" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已拒绝" value="rejected" />
        <el-option label="已冻结" value="frozen" />
      </el-select>
      <el-button type="primary" @click="loadDistributors">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="distributors" v-loading="loading" border stripe>
      <el-table-column prop="realName" label="姓名" width="100" />
      <el-table-column prop="phone" label="手机号" width="120" />
      <el-table-column label="小程序用户" min-width="190">
        <template #default="{ row }">
          <div v-if="miniUser(row)" class="user-cell">
            <el-avatar :size="32" :src="miniUser(row).avatar">{{ userInitial(miniUser(row)) }}</el-avatar>
            <div class="user-meta">
              <div class="user-name">{{ miniUser(row).nickname || '未设置昵称' }}</div>
              <div class="user-sub">{{ miniUser(row).phone || `UID ${miniUser(row).uid || miniUser(row).id}` }}</div>
            </div>
          </div>
          <el-tag v-else type="warning" size="small">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="levelName" label="等级" width="100">
        <template #default="{ row }">
          {{ row.level?.name || '默认' }}
        </template>
      </el-table-column>
      <el-table-column prop="totalEarnings" label="累计收益" width="120">
        <template #default="{ row }">
          ¥{{ Number(row.totalEarnings || 0).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="pendingEarnings" label="待结算" width="120">
        <template #default="{ row }">
          ¥{{ Number(row.pendingEarnings || 0).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="totalOrders" label="累计订单" width="100" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
          <el-button v-if="row.status === 'pending'" size="small" type="success" @click="approveDistributor(row)">通过</el-button>
          <el-button v-if="row.status === 'pending'" size="small" type="warning" @click="rejectDistributor(row)">拒绝</el-button>
          <el-button v-if="row.status === 'approved'" size="small" type="danger" @click="freezeDistributor(row)">冻结</el-button>
          <el-button v-if="row.status === 'frozen'" size="small" type="success" @click="unfreezeDistributor(row)">解冻</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadDistributors"
        @current-change="loadDistributors"
      />
    </div>

    <!-- Detail Dialog -->
    <el-dialog v-model="showDetailDialog" title="分销员详情" width="700px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="小程序用户" :span="2">
          <div v-if="miniUser(selectedDistributor)" class="user-cell">
            <el-avatar :size="36" :src="miniUser(selectedDistributor).avatar">{{ userInitial(miniUser(selectedDistributor)) }}</el-avatar>
            <div class="user-meta">
              <div class="user-name">{{ miniUser(selectedDistributor).nickname || '未设置昵称' }}</div>
              <div class="user-sub">用户ID：{{ miniUser(selectedDistributor).id }}</div>
            </div>
          </div>
          <el-tag v-else type="warning" size="small">未绑定小程序用户</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="小程序手机号">{{ miniUser(selectedDistributor)?.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="小程序UID">{{ miniUser(selectedDistributor)?.uid ? `UID ${miniUser(selectedDistributor).uid}` : '-' }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ selectedDistributor?.realName }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ selectedDistributor?.phone }}</el-descriptions-item>
        <el-descriptions-item label="等级">{{ selectedDistributor?.level?.name || '默认' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(selectedDistributor?.status)">
            {{ getStatusLabel(selectedDistributor?.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="累计收益">¥{{ Number(selectedDistributor?.totalEarnings || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="待结算">¥{{ Number(selectedDistributor?.pendingEarnings || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="已提现">¥{{ Number(selectedDistributor?.withdrawnEarnings || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="累计订单">{{ selectedDistributor?.totalOrders || 0 }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ selectedDistributor?.remark || '-' }}</el-descriptions-item>
        <el-descriptions-item label="申请时间" :span="2">{{ formatDate(selectedDistributor?.createdAt) }}</el-descriptions-item>
      </el-descriptions>

      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
        <el-button v-if="selectedDistributor?.status === 'pending'" type="success" @click="approveDistributor(selectedDistributor)">通过</el-button>
        <el-button v-if="selectedDistributor?.status === 'pending'" type="warning" @click="rejectDistributor(selectedDistributor)">拒绝</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'

const loading = ref(false)
const distributors = ref<any[]>([])
const filters = ref({ keyword: '', status: '' })
const pagination = ref({ page: 1, pageSize: 20, total: 0 })
const showDetailDialog = ref(false)
const selectedDistributor = ref<any>(null)
const miniUser = (row: any) => row?.User || row?.user || null
const userInitial = (user: any) => String(user?.nickname || '用').slice(0, 1)

const getStatusType = (status: string) => {
  const map: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'danger', frozen: 'info' }
  return map[status] || 'info'
}

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝', frozen: '已冻结' }
  return map[status] || status
}

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const loadDistributors = async () => {
  loading.value = true
  try {
    const res = await request.get('/mall/distributor/admin/list', {
      params: {
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
        ...filters.value,
      },
    })
    const data = (res as any).data || res
    distributors.value = data.list || []
    pagination.value.total = data.total || 0
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.value = { keyword: '', status: '' }
  loadDistributors()
}

const viewDetail = async (distributor: any) => {
  try {
    const res = await request.get(`/mall/distributor/admin/${distributor.id}`)
    selectedDistributor.value = (res as any).data || res
    showDetailDialog.value = true
  } catch (error) {
    ElMessage.error('获取详情失败')
  }
}

const approveDistributor = async (distributor: any) => {
  try {
    await ElMessageBox.confirm('确定通过该分销员的申请吗？', '确认操作', { type: 'warning' })
    await request.put(`/mall/distributor/admin/${distributor.id}/review`, { status: 'approved' })
    ElMessage.success('审核通过')
    showDetailDialog.value = false
    loadDistributors()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

const rejectDistributor = async (distributor: any) => {
  try {
    const { value: reason } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝分销员', {
      inputPlaceholder: '拒绝原因',
      type: 'warning',
    })
    await request.put(`/mall/distributor/admin/${distributor.id}/review`, { status: 'rejected', remark: reason })
    ElMessage.success('已拒绝')
    showDetailDialog.value = false
    loadDistributors()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

const freezeDistributor = async (distributor: any) => {
  try {
    await ElMessageBox.confirm('确定冻结该分销员吗？', '确认操作', { type: 'warning' })
    await request.put(`/mall/distributor/admin/${distributor.id}/status`, { status: 'frozen' })
    ElMessage.success('已冻结')
    loadDistributors()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

const unfreezeDistributor = async (distributor: any) => {
  try {
    await ElMessageBox.confirm('确定解冻该分销员吗？', '确认操作', { type: 'warning' })
    await request.put(`/mall/distributor/admin/${distributor.id}/status`, { status: 'approved' })
    ElMessage.success('已解冻')
    loadDistributors()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

onMounted(() => {
  loadDistributors()
})
</script>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.user-meta {
  min-width: 0;
  line-height: 1.35;
}

.user-name {
  font-weight: 600;
  color: #172033;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-sub {
  color: #7b8798;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

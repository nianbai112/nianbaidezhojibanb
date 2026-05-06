<template>
  <div class="page-container">
    <div class="page-title mb-4">分销管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="4"><a-input v-model:value="filters.realName" placeholder="姓名" allow-clear @change="fetchList" /></a-col>
        <a-col :span="4"><a-input v-model:value="filters.phone" placeholder="手机号" allow-clear @change="fetchList" /></a-col>
        <a-col :span="3">
          <a-select v-model:value="filters.status" placeholder="状态" allow-clear @change="fetchList">
            <a-select-option value="pending">待审核</a-select-option>
            <a-select-option value="approved">已通过</a-select-option>
            <a-select-option value="rejected">已拒绝</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filters.levelId" placeholder="等级" allow-clear @change="fetchList">
            <a-select-option v-for="l in levels" :key="l.id" :value="l.id">{{ l.name }}</a-select-option>
          </a-select>
        </a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'user'">
          <a-space><a-avatar :src="record.User?.avatar" size="small" /><span>{{ record.User?.nickname || '-' }}</span></a-space>
        </template>
        <template v-else-if="column.dataIndex === 'level'">
          <a-tag v-if="record.level" color="blue">{{ record.level.name }}</a-tag>
          <span v-else>-</span>
        </template>
        <template v-else-if="column.dataIndex === 'earnings'">
          <span>{{ (Number(record.totalEarnings) / 100).toFixed(2) }}</span>
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <a-tag :color="record.status === 'approved' ? 'success' : record.status === 'rejected' ? 'error' : 'warning'">
            {{ record.status === 'approved' ? '已通过' : record.status === 'rejected' ? '已拒绝' : '待审核' }}
          </a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <template v-if="record.status === 'pending'">
              <a v-permission="'mall:distributor'" @click="handleAudit(record, 'approved')">通过</a>
              <a v-permission="'mall:distributor'" @click="handleAudit(record, 'rejected')">拒绝</a>
            </template>
            <a v-permission="'mall:distributor'" @click="openEdit(record)">编辑</a>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="editVisible" title="编辑分销商" :width="400" :confirm-loading="editSubmitting" @ok="handleEditSubmit">
      <a-form layout="vertical">
        <a-form-item label="等级">
          <a-select v-model:value="editForm.levelId" placeholder="选择等级">
            <a-select-option v-for="l in levels" :key="l.id" :value="l.id">{{ l.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" placeholder="备注信息" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { shopApi } from '@/api/shop'

const loading = ref(false)
const list = ref<any[]>([])
const levels = ref<any[]>([])
const filters = reactive({
  realName: '',
  phone: '',
  status: undefined as string | undefined,
  levelId: undefined as string | undefined,
})
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const columns = [
  { title: '用户', dataIndex: 'user', width: 150 },
  { title: '姓名', dataIndex: 'realName', width: 100 },
  { title: '手机号', dataIndex: 'phone', width: 130 },
  { title: '等级', dataIndex: 'level', width: 100 },
  { title: '累计收益', dataIndex: 'earnings', width: 100 },
  { title: '订单数', dataIndex: 'totalOrders', width: 80 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '申请时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140 },
]

const fetchLevels = async () => {
  try {
    const res = await shopApi.getLevelList({ page: 1, pageSize: 100 })
    levels.value = (res.data as any).list || []
  } catch { /* ignore */ }
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await shopApi.getDistributorList({
      page: pagination.current, pageSize: pagination.pageSize,
      realName: filters.realName || undefined,
      phone: filters.phone || undefined,
      status: filters.status,
      levelId: filters.levelId,
    })
    const data = res.data as any
    list.value = data.list || []
    pagination.total = data.total || 0
  } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; fetchList() }

const handleAudit = async (record: any, status: string) => {
  try {
    await shopApi.auditDistributor(record.id, { status })
    message.success(status === 'approved' ? '已通过' : '已拒绝')
    fetchList()
  } catch { /* handled */ }
}

const editVisible = ref(false)
const editSubmitting = ref(false)
const editingId = ref('')
const editForm = reactive({ levelId: undefined as string | undefined, remark: '' })

const openEdit = (record: any) => {
  editingId.value = record.id
  editForm.levelId = record.levelId
  editForm.remark = record.remark || ''
  editVisible.value = true
}

const handleEditSubmit = async () => {
  editSubmitting.value = true
  try {
    await shopApi.updateDistributor(editingId.value, {
      levelId: editForm.levelId,
      remark: editForm.remark || undefined,
    })
    message.success('已更新')
    editVisible.value = false
    fetchList()
  } catch { /* handled */ }
  finally { editSubmitting.value = false }
}

onMounted(() => { fetchLevels(); fetchList() })
</script>

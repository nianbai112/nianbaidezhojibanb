<template>
  <div class="page-container">
    <div class="page-title mb-4">奖励管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="16">
        <a-col :span="6">
          <a-select v-model:value="activityId" placeholder="选择活动查看奖励" allow-clear show-search option-filter-prop="label" @change="fetchList">
            <a-select-option v-for="a in activities" :key="a.id" :value="a.id" :label="a.title">{{ a.title }}</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3"><a-button type="primary" @click="openCreate">新建奖励</a-button></a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'rewardType'">
          <a-tag :color="record.rewardType === 'points' ? 'blue' : record.rewardType === 'balance' ? 'success' : 'purple'">{{ rewardTypeMap[record.rewardType] || record.rewardType }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a @click="openEdit(record)">编辑</a>
            <a-popconfirm title="确定删除该奖励？" @confirm="handleDelete(record.id)"><a class="text-danger">删除</a></a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑奖励' : '新建奖励'" @ok="handleSave" :confirmLoading="saving">
      <a-form :model="form" :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="名称" required><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="关联活动"><a-select v-model:value="form.activityId" placeholder="选择活动（可选）" allow-clear show-search option-filter-prop="label"><a-select-option v-for="a in activities" :key="a.id" :value="a.id" :label="a.title">{{ a.title }}</a-select-option></a-select></a-form-item>
        <a-form-item label="奖励类型"><a-select v-model:value="form.rewardType"><a-select-option value="points">积分</a-select-option><a-select-option value="balance">余额</a-select-option><a-select-option value="title">称号</a-select-option></a-select></a-form-item>
        <a-form-item v-if="form.rewardType !== 'title'" label="奖励值"><a-input-number v-model:value="form.rewardValue" :min="0" :precision="form.rewardType === 'balance' ? 2 : 0" style="width:100%" :addon-after="form.rewardType === 'points' ? '积分' : '元'" /></a-form-item>
        <a-form-item v-if="form.rewardType === 'title'" label="称号ID"><a-input v-model:value="form.titleId" placeholder="称号ID" /></a-form-item>
        <a-form-item label="发放数量"><a-input-number v-model:value="form.quantity" :min="0" style="width:100%" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { activityApi } from '@/api/activity'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const modalVisible = ref(false)
const editingId = ref('')
const activityId = ref<string | undefined>()
const activities = ref<any[]>([])
const list = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const rewardTypeMap: Record<string, string> = { points: '积分', balance: '余额', title: '称号' }

const columns = [
  { title: '名称', dataIndex: 'name', width: 150 },
  { title: '关联活动', dataIndex: 'activity', width: 150 },
  { title: '类型', dataIndex: 'rewardType', width: 80 },
  { title: '值', dataIndex: 'rewardValue', width: 80 },
  { title: '数量', dataIndex: 'quantity', width: 60 },
  { title: '已发放', dataIndex: 'issuedCount', width: 60 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

const defaultForm = { name: '', activityId: undefined, rewardType: 'points', rewardValue: undefined, titleId: undefined, quantity: 0 }
const form = reactive<any>({ ...defaultForm })

const fetchActivities = async () => {
  const res = await activityApi.getActivities({ page: 1, pageSize: 100 })
  activities.value = (res.data as any).list || []
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await activityApi.getActivityRewards({
      page: pagination.current, pageSize: pagination.pageSize,
      activityId: activityId.value || undefined, regionId: userStore.regionId,
    })
    const data = res.data as any
    list.value = data.list || []
    pagination.total = data.total || 0
  } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; fetchList() }

const openCreate = () => { editingId.value = ''; Object.assign(form, defaultForm); modalVisible.value = true }
const openEdit = (record: any) => {
  editingId.value = record.id
  Object.assign(form, { ...defaultForm, ...record, rewardValue: record.rewardValue ? Number(record.rewardValue) : undefined })
  modalVisible.value = true
}

const handleSave = async () => {
  if (!form.name) return message.warning('请输入名称')
  saving.value = true
  try {
    const data: any = { ...form, regionId: userStore.regionId }
    if (!data.activityId) delete data.activityId
    if (editingId.value) {
      await activityApi.updateActivityReward(editingId.value, data)
    } else {
      await activityApi.createActivityReward(data)
    }
    message.success('保存成功')
    modalVisible.value = false
    fetchList()
  } finally { saving.value = false }
}

const handleDelete = async (id: string) => {
  try { await activityApi.deleteActivityReward(id); message.success('已删除'); fetchList() } catch {}
}

onMounted(() => { fetchActivities(); fetchList() })
</script>

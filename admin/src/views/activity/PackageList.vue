<template>
  <div class="page-container">
    <div class="page-title mb-4">套餐管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="16">
        <a-col :span="8">
          <a-select v-model:value="activityId" placeholder="选择活动查看套餐" show-search option-filter-prop="label" allow-clear @change="fetchList">
            <a-select-option v-for="a in activities" :key="a.id" :value="a.id" :label="a.title">{{ a.title }}</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3"><a-button type="primary" :disabled="!activityId" @click="openCreate">新建套餐</a-button></a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'isActive'">
          <a-switch :checked="record.isActive" size="small" @change="(checked: boolean) => handleToggle(record, checked)" />
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a @click="openEdit(record)">编辑</a>
            <a-popconfirm title="确定删除该套餐？" @confirm="handleDelete(record.id)"><a class="text-danger">删除</a></a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑套餐' : '新建套餐'" @ok="handleSave" :confirmLoading="saving" width="500px">
      <a-form :model="form" :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="活动" required><span>{{ activityTitle }}</span></a-form-item>
        <a-form-item label="名称" required><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="售价" required><a-input-number v-model:value="form.price" :min="0" :precision="2" style="width:100%" /></a-form-item>
        <a-form-item label="原价"><a-input-number v-model:value="form.originalPrice" :min="0" :precision="2" style="width:100%" /></a-form-item>
        <a-form-item label="总库存"><a-input-number v-model:value="form.stock" :min="0" style="width:100%" /></a-form-item>
        <a-form-item label="可售票"><a-input-number v-model:value="form.availableTickets" :min="0" style="width:100%" /></a-form-item>
        <a-form-item label="人均限购"><a-input-number v-model:value="form.limitPerUser" :min="1" style="width:100%" /></a-form-item>
        <a-form-item label="票券类型"><a-select v-model:value="form.ticketType"><a-select-option value="single">单人票</a-select-option><a-select-option value="double">双人票</a-select-option><a-select-option value="group">团体票</a-select-option></a-select></a-form-item>
        <a-form-item label="性别限制"><a-select v-model:value="form.genderLimit" allow-clear placeholder="不限"><a-select-option value="male">仅男性</a-select-option><a-select-option value="female">仅女性</a-select-option></a-select></a-form-item>
        <a-form-item label="描述"><a-textarea v-model:value="form.description" :rows="2" /></a-form-item>
        <a-form-item label="开售时间"><a-date-picker v-model:value="form.saleStartAt" show-time style="width:100%" /></a-form-item>
        <a-form-item label="停售时间"><a-date-picker v-model:value="form.saleEndAt" show-time style="width:100%" /></a-form-item>
        <a-form-item label="排序"><a-input-number v-model:value="form.sortOrder" :min="0" style="width:100%" /></a-form-item>
        <a-form-item label="启用"><a-switch v-model:checked="form.isActive" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { activityApi } from '@/api/activity'

const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const modalVisible = ref(false)
const editingId = ref('')
const activityId = ref<string | undefined>(route.query.activityId as string || undefined)
const activities = ref<any[]>([])
const list = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const activityTitle = computed(() => {
  const a = activities.value.find((a: any) => a.id === activityId.value)
  return a?.title || ''
})

const columns = [
  { title: '名称', dataIndex: 'name', width: 120 },
  { title: '活动', dataIndex: 'activity', width: 150 },
  { title: '售价', dataIndex: 'price', width: 80 },
  { title: '库存', dataIndex: 'stock', width: 60 },
  { title: '可售', dataIndex: 'availableTickets', width: 60 },
  { title: '类型', dataIndex: 'ticketType', width: 70 },
  { title: '启用', dataIndex: 'isActive', width: 60 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

const defaultForm = {
  name: '', price: undefined, originalPrice: undefined, stock: 0, availableTickets: 0,
  limitPerUser: undefined, ticketType: 'single', description: '', genderLimit: undefined,
  saleStartAt: undefined, saleEndAt: undefined, isActive: true, sortOrder: 0,
}
const form = reactive<any>({ ...defaultForm })

const fetchActivities = async () => {
  const res = await activityApi.getActivities({ page: 1, pageSize: 100 })
  activities.value = (res.data as any).list || []
}

const fetchList = async () => {
  if (!activityId.value) { list.value = []; return }
  loading.value = true
  try {
    const res = await activityApi.getActivityPackages({
      page: pagination.current, pageSize: pagination.pageSize, activityId: activityId.value,
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
  Object.assign(form, { ...defaultForm, ...record, price: Number(record.price || 0), originalPrice: record.originalPrice ? Number(record.originalPrice) : undefined })
  modalVisible.value = true
}

const handleSave = async () => {
  if (!form.name) return message.warning('请输入名称')
  if (form.price === undefined || form.price === null) return message.warning('请输入售价')
  saving.value = true
  try {
    const data: any = { ...form, activityId: activityId.value }
    if (data.saleStartAt) data.saleStartAt = data.saleStartAt.toISOString()
    if (data.saleEndAt) data.saleEndAt = data.saleEndAt.toISOString()
    if (editingId.value) {
      await activityApi.updateActivityPackage(editingId.value, data)
    } else {
      await activityApi.createActivityPackage(data)
    }
    message.success('保存成功')
    modalVisible.value = false
    fetchList()
  } finally { saving.value = false }
}

const handleToggle = async (record: any, checked: boolean) => {
  try { await activityApi.updateActivityPackage(record.id, { isActive: checked }); fetchList() } catch {}
}

const handleDelete = async (id: string) => {
  try { await activityApi.deleteActivityPackage(id); message.success('已删除'); fetchList() } catch {}
}

onMounted(() => { fetchActivities(); if (activityId.value) fetchList() })
</script>

<template>
  <div class="page-container">
    <div class="page-title mb-4">区域评分设置</div>

    <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="regionId" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'enableRating'">
          <a-switch :checked="record.enableRating" size="small" @change="(v: boolean) => handleToggle(record, 'enableRating', v)" />
        </template>
        <template v-else-if="column.dataIndex === 'enableDynamic'">
          <a-switch :checked="record.enableDynamic" size="small" @change="(v: boolean) => handleToggle(record, 'enableDynamic', v)" />
        </template>
        <template v-else-if="column.dataIndex === 'requireLoginToRate'">
          <a-switch :checked="record.requireLoginToRate" size="small" @change="(v: boolean) => handleToggle(record, 'requireLoginToRate', v)" />
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a @click="openEdit(record)">编辑</a>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" title="编辑区域设置" @ok="handleSave" :confirmLoading="saving">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="区域">{{ currentRegion?.regionName }}</a-form-item>
        <a-form-item label="启用评分"><a-switch v-model:checked="form.enableRating" /></a-form-item>
        <a-form-item label="启用动态"><a-switch v-model:checked="form.enableDynamic" /></a-form-item>
        <a-form-item label="登录后评分"><a-switch v-model:checked="form.requireLoginToRate" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { ratingApi } from '@/api/rating'

const loading = ref(false)
const saving = ref(false)
const modalVisible = ref(false)
const currentRegion = ref<any>(null)
const list = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })
const form = reactive({ enableRating: true, enableDynamic: true, requireLoginToRate: true })

const columns = [
  { title: '区域', dataIndex: 'regionName', width: 150 },
  { title: '启用评分', dataIndex: 'enableRating', width: 100 },
  { title: '启用动态', dataIndex: 'enableDynamic', width: 100 },
  { title: '登录后评分', dataIndex: 'requireLoginToRate', width: 120 },
  { title: '更新时间', dataIndex: 'updatedAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 80 },
]

const fetchList = async () => {
  loading.value = true
  try {
    const res = await ratingApi.getSettings({ page: pagination.current, pageSize: pagination.pageSize })
    const data = res.data as any
    list.value = data.list || []
    pagination.total = data.total || 0
  } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; fetchList() }

const handleToggle = async (record: any, field: string, value: boolean) => {
  try {
    await ratingApi.updateSetting(record.regionId, { [field]: value })
    message.success('已更新')
    fetchList()
  } catch {}
}

const openEdit = (record: any) => {
  currentRegion.value = record
  form.enableRating = record.enableRating
  form.enableDynamic = record.enableDynamic
  form.requireLoginToRate = record.requireLoginToRate
  modalVisible.value = true
}

const handleSave = async () => {
  saving.value = true
  try {
    await ratingApi.updateSetting(currentRegion.value.regionId, { ...form })
    message.success('保存成功')
    modalVisible.value = false
    fetchList()
  } finally { saving.value = false }
}

onMounted(() => { fetchList() })
</script>

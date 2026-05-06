<template>
  <div class="page-container">
    <div class="page-title mb-4">分类管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="16">
        <a-col :span="3"><a-button type="primary" @click="openCreate">新建分类</a-button></a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'icon'">
          <a-avatar v-if="record.icon" :src="record.icon" shape="square" size="small" />
        </template>
        <template v-else-if="column.dataIndex === 'isActive'">
          <a-switch :checked="record.isActive" size="small" @change="(checked: boolean) => handleToggle(record, checked)" />
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a @click="openEdit(record)">编辑</a>
            <a-popconfirm title="确定删除该分类？" @confirm="handleDelete(record.id)"><a class="text-danger">删除</a></a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑分类' : '新建分类'" @ok="handleSave" :confirmLoading="saving">
      <a-form :model="form" :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="名称" required><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="图标"><a-input v-model:value="form.icon" placeholder="图标URL" /></a-form-item>
        <a-form-item label="描述"><a-textarea v-model:value="form.description" :rows="2" /></a-form-item>
        <a-form-item label="排序"><a-input-number v-model:value="form.sortOrder" :min="0" style="width:100%" /></a-form-item>
        <a-form-item label="启用"><a-switch v-model:checked="form.isActive" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { ratingApi } from '@/api/rating'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const modalVisible = ref(false)
const editingId = ref('')
const list = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const columns = [
  { title: '图标', dataIndex: 'icon', width: 60 },
  { title: '名称', dataIndex: 'name', width: 120 },
  { title: '描述', dataIndex: 'description', ellipsis: true },
  { title: '项目数', dataIndex: ['_count', 'items'], width: 70 },
  { title: '排序', dataIndex: 'sortOrder', width: 60 },
  { title: '启用', dataIndex: 'isActive', width: 60 },
  { title: '创建时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

const defaultForm = { name: '', icon: '', description: '', sortOrder: 0, isActive: true }
const form = reactive<any>({ ...defaultForm })

const fetchList = async () => {
  loading.value = true
  try {
    const res = await ratingApi.getCategoryList({
      page: pagination.current, pageSize: pagination.pageSize,
      regionId: userStore.regionId || undefined,
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
  Object.assign(form, { ...defaultForm, ...record })
  modalVisible.value = true
}

const handleSave = async () => {
  if (!form.name) return message.warning('请输入名称')
  saving.value = true
  try {
    if (editingId.value) {
      await ratingApi.updateCategory(editingId.value, form)
    } else {
      await ratingApi.createCategory({ ...form, regionId: userStore.regionId || undefined })
    }
    message.success('保存成功')
    modalVisible.value = false
    fetchList()
  } finally { saving.value = false }
}

const handleToggle = async (record: any, checked: boolean) => {
  try { await ratingApi.updateCategory(record.id, { isActive: checked }); fetchList() } catch {}
}

const handleDelete = async (id: string) => {
  try { await ratingApi.deleteCategory(id); message.success('已删除'); fetchList() } catch {}
}

onMounted(() => { fetchList() })
</script>

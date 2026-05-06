<template>
  <div class="page-container">
    <div class="page-title mb-4">项目管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="5">
          <a-select v-model:value="filters.categoryId" placeholder="选择分类" allow-clear @change="fetchList">
            <a-select-option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filters.status" placeholder="状态" allow-clear @change="fetchList">
            <a-select-option value="enabled">启用</a-select-option>
            <a-select-option value="disabled">禁用</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3"><a-input v-model:value="filters.keyword" placeholder="搜索名称" allow-clear @change="fetchList" /></a-col>
        <a-col :span="3"><a-button type="primary" @click="openCreate">新建项目</a-button></a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'cover'">
          <a-avatar v-if="record.cover" :src="record.cover" shape="square" size="small" />
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <a-tag :color="record.status === 'enabled' ? 'success' : 'default'">{{ record.status === 'enabled' ? '启用' : '禁用' }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a @click="openEdit(record)">编辑</a>
            <a-popconfirm title="确定删除该项目？" @confirm="handleDelete(record.id)"><a class="text-danger">删除</a></a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑项目' : '新建项目'" @ok="handleSave" :confirmLoading="saving" width="500px">
      <a-form :model="form" :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="分类" required>
          <a-select v-model:value="form.categoryId" placeholder="选择分类">
            <a-select-option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="名称" required><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="封面"><a-input v-model:value="form.cover" placeholder="封面图片URL" /></a-form-item>
        <a-form-item label="描述"><a-textarea v-model:value="form.description" :rows="2" /></a-form-item>
        <a-form-item label="排序"><a-input-number v-model:value="form.sortOrder" :min="0" style="width:100%" /></a-form-item>
        <a-form-item label="状态">
          <a-select v-model:value="form.status">
            <a-select-option value="enabled">启用</a-select-option>
            <a-select-option value="disabled">禁用</a-select-option>
          </a-select>
        </a-form-item>
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
const categories = ref<any[]>([])
const list = ref<any[]>([])
const filters = reactive({ categoryId: undefined as string | undefined, status: undefined as string | undefined, keyword: '' })
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const columns = [
  { title: '封面', dataIndex: 'cover', width: 60 },
  { title: '名称', dataIndex: 'name', width: 120 },
  { title: '分类', dataIndex: ['category', 'name'], width: 100 },
  { title: '平均分', dataIndex: 'avgScore', width: 80 },
  { title: '评分人数', dataIndex: 'ratingCount', width: 80 },
  { title: '状态', dataIndex: 'status', width: 70 },
  { title: '排序', dataIndex: 'sortOrder', width: 60 },
  { title: '创建时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

const defaultForm = { categoryId: undefined, name: '', cover: '', description: '', sortOrder: 0, status: 'enabled' }
const form = reactive<any>({ ...defaultForm })

const fetchCategories = async () => {
  const res = await ratingApi.getCategoryList({ page: 1, pageSize: 100 })
  categories.value = (res.data as any).list || []
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await ratingApi.getItemList({
      page: pagination.current, pageSize: pagination.pageSize,
      categoryId: filters.categoryId, status: filters.status,
      keyword: filters.keyword || undefined,
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
  if (!form.categoryId) return message.warning('请选择分类')
  if (!form.name) return message.warning('请输入名称')
  saving.value = true
  try {
    if (editingId.value) {
      await ratingApi.updateItem(editingId.value, form)
    } else {
      await ratingApi.createItem({ ...form, regionId: userStore.regionId || undefined })
    }
    message.success('保存成功')
    modalVisible.value = false
    fetchList()
  } finally { saving.value = false }
}

const handleDelete = async (id: string) => {
  try { await ratingApi.deleteItem(id); message.success('已删除'); fetchList() } catch {}
}

onMounted(() => { fetchCategories(); fetchList() })
</script>

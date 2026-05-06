<template>
  <div class="page-container table-page">
    <div class="table-toolbar">
      <div class="page-title">匿名身份管理</div>
      <a-button type="primary" @click="handleAdd">新增身份</a-button>
    </div>

    <div class="table-container">
      <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'avatar'">
            <a-avatar :src="record.avatar" size="small">{{ record.name?.[0] }}</a-avatar>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-space>
              <a @click="handleEdit(record)">编辑</a>
              <a-popconfirm title="确定删除？" @confirm="handleDelete(record.id)">
                <a class="text-danger">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <a-modal v-model:open="visible" :title="isEdit ? '编辑匿名身份' : '新增匿名身份'" @ok="handleSave" :confirmLoading="saving">
      <a-form :model="form" layout="vertical">
        <a-form-item label="身份名称" required>
          <a-input v-model:value="form.name" placeholder="例如: 神秘人、路过的狐狸" />
        </a-form-item>
        <a-form-item label="头像 URL">
          <a-input v-model:value="form.avatar" placeholder="可填写头像图片链接" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { contentExtApi } from '@/api'

const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const isEdit = ref(false)
const list = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const form = reactive({ id: '', name: '', avatar: '' })

const columns = [
  { title: '头像', dataIndex: 'avatar', width: 70 },
  { title: '身份名称', dataIndex: 'name' },
  { title: '创建时间', dataIndex: 'createdAt', width: 180 },
  { title: '操作', dataIndex: 'action', width: 120 }
]

const fetchList = async () => {
  loading.value = true
  try {
    const res = await contentExtApi.getAnonymousIdentities({ page: pagination.current, pageSize: pagination.pageSize })
    list.value = res.data.list
    pagination.total = res.data.total
  } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; fetchList() }

const handleAdd = () => {
  isEdit.value = false
  Object.assign(form, { id: '', name: '', avatar: '' })
  visible.value = true
}

const handleEdit = (record: any) => {
  isEdit.value = true
  Object.assign(form, record)
  visible.value = true
}

const handleSave = async () => {
  if (!form.name) return message.warning('请填写身份名称')
  saving.value = true
  try {
    if (isEdit.value) {
      await contentExtApi.updateAnonymousIdentity(form.id, { name: form.name, avatar: form.avatar })
    } else {
      await contentExtApi.createAnonymousIdentity({ name: form.name, avatar: form.avatar })
    }
    message.success('保存成功')
    visible.value = false
    fetchList()
  } finally { saving.value = false }
}

const handleDelete = async (id: string) => {
  try {
    await contentExtApi.deleteAnonymousIdentity(id)
    message.success('已删除')
    fetchList()
  } catch {}
}

onMounted(() => fetchList())
</script>

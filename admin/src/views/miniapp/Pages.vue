<template>
  <div class="page-container table-page">
    <div class="table-toolbar">
      <div class="page-title">小程序页面路径管理</div>
      <a-space>
        <a-button @click="handleAdd">新增路径</a-button>
        <a-button type="primary" :loading="saving" @click="handleSave">保存所有</a-button>
      </a-space>
    </div>

    <div class="table-container">
      <a-table :dataSource="paths" :columns="columns" :loading="loading" rowKey="path" :pagination="false">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.dataIndex === 'name'">
            <a-input v-model:value="record.name" placeholder="页面名称" />
          </template>
          <template v-else-if="column.dataIndex === 'path'">
            <a-input v-model:value="record.path" placeholder="pages/xxx/xxx" />
          </template>
          <template v-else-if="column.dataIndex === 'desc'">
            <a-input v-model:value="record.desc" placeholder="备注说明" />
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a class="text-danger" @click="handleDelete(index)">删除</a>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { miniappApi } from '@/api'

const loading = ref(false)
const saving = ref(false)
const paths = ref<any[]>([])

const columns = [
  { title: '页面名称', dataIndex: 'name', width: 180 },
  { title: '页面路径', dataIndex: 'path', width: 280 },
  { title: '备注', dataIndex: 'desc' },
  { title: '操作', dataIndex: 'action', width: 80 }
]

const fetchPaths = async () => {
  loading.value = true
  try {
    const res = await miniappApi.getPagePaths()
    paths.value = Array.isArray(res.data) ? res.data : []
  } finally {
    loading.value = false
  }
}

const handleAdd = () => {
  paths.value.push({ name: '', path: '', desc: '' })
}

const handleDelete = (index: number) => {
  paths.value.splice(index, 1)
}

const handleSave = async () => {
  const valid = paths.value.every(p => p.name && p.path)
  if (!valid) return message.warning('请确保每一行的名称和路径都已填写')
  saving.value = true
  try {
    await miniappApi.updatePagePaths(paths.value)
    message.success('页面路径已保存')
  } finally {
    saving.value = false
  }
}

onMounted(() => fetchPaths())
</script>

<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">运费模板</span>
        <a-button type="primary" @click="onCreate">
          <PlusOutlined />
          新建模板
        </a-button>
      </div>

      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
      >
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a-popconfirm
              title="确定删除?"
              @confirm="onDelete(record.id)"
            >
              <a style="color: #ef4444">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { shopApi } from '@/api/shop'
import DataTable from '@/components/common/DataTable.vue'

// --------------- state ---------------
const loading = ref(false)
const list = ref<any[]>([])

// --------------- columns ---------------
const columns = [
  { title: '名称', dataIndex: 'name' },
  { title: '类型', dataIndex: 'type', width: 100 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action' },
]

// --------------- methods ---------------
async function fetchList() {
  loading.value = true
  try {
    const res = await shopApi.getFreightTemplates()
    list.value = res.data.data ?? []
  } catch (err: any) {
    message.error(err?.message || '获取运费模板失败')
  } finally {
    loading.value = false
  }
}

function onCreate() {
  message.info('新建运费模板功能开发中')
}

function onEdit(_record: any) {
  message.info('编辑运费模板功能开发中')
}

async function onDelete(id: number) {
  try {
    await shopApi.deleteFreightTemplate(id)
    message.success('已删除')
    await fetchList()
  } catch (err: any) {
    message.error(err?.message || '删除失败')
  }
}

// --------------- lifecycle ---------------
onMounted(() => {
  fetchList()
})
</script>

<style scoped>
/* 运费模板页面样式 */
</style>

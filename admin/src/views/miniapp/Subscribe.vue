<template>
  <div class="page-container table-page">
    <div class="table-toolbar">
      <div class="page-title">订阅消息模板管理</div>
      <a-button type="primary" @click="addVisible = true">添加模板</a-button>
    </div>

    <div class="table-container">
      <a-table :dataSource="list" :columns="columns" :loading="loading" rowKey="priTmplId" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'action'">
            <a-popconfirm title="确定要删除该模板吗？" @confirm="handleDelete(record.priTmplId)">
              <a class="text-danger">删除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </div>

    <!-- 添加模板弹窗 -->
    <a-modal v-model:open="addVisible" title="添加订阅消息模板" @ok="handleAdd" :confirmLoading="adding">
      <a-form :model="addForm" layout="vertical">
        <a-form-item label="微信模板库 TID" required>
          <a-input v-model:value="addForm.tid" placeholder="例如: AT0002" />
          <div class="text-secondary mt-1" style="font-size:12px;">
            前往 <a href="https://mp.weixin.qq.com" target="_blank">微信公众平台</a> → 订阅消息 → 搜索模板库获取 TID
          </div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { miniappApi } from '@/api'

const loading = ref(false)
const adding = ref(false)
const addVisible = ref(false)
const list = ref<any[]>([])

const addForm = reactive({ tid: '' })

const columns = [
  { title: '模板ID (priTmplId)', dataIndex: 'priTmplId', width: 200 },
  { title: '模板标题', dataIndex: 'title', width: 220 },
  { title: '模板内容', dataIndex: 'content' },
  { title: '场景描述', dataIndex: 'example', width: 200 },
  { title: '操作', dataIndex: 'action', width: 80 }
]

const fetchList = async () => {
  loading.value = true
  try {
    const res = await miniappApi.getSubscribeTemplates()
    list.value = Array.isArray(res.data) ? res.data : []
  } catch (err: any) {
    message.warning(err?.response?.data?.message || '获取模板列表失败，请确认已配置微信小程序 APPID 和 SECRET')
  } finally {
    loading.value = false
  }
}

const handleAdd = async () => {
  if (!addForm.tid) return message.warning('请填写模板 TID')
  adding.value = true
  try {
    await miniappApi.addSubscribeTemplate({ tid: addForm.tid })
    message.success('模板已添加')
    addVisible.value = false
    addForm.tid = ''
    fetchList()
  } catch (err: any) {
    message.error(err?.response?.data?.message || '添加失败')
  } finally {
    adding.value = false
  }
}

const handleDelete = async (priTmplId: string) => {
  try {
    await miniappApi.deleteSubscribeTemplate(priTmplId)
    message.success('已删除')
    fetchList()
  } catch (err: any) {
    message.error(err?.response?.data?.message || '删除失败')
  }
}

onMounted(() => fetchList())
</script>

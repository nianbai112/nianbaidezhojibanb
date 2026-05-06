<template>
  <div class="page-container">
    <div class="page-title mb-4">引导页管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="3">
          <a-input v-model:value="f.regionId" placeholder="区域ID" allow-clear @pressEnter="onSearch" />
        </a-col>
        <a-col :span="2">
          <a-button type="primary" @click="openCreate">新增引导页</a-button>
        </a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="cols" :loading="ld" :pagination="{ current: p, pageSize: ps, total: t }" @change="onTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'type'">
          <a-tag :color="record.type === 'guide' ? 'blue' : record.type === 'popup' ? 'orange' : 'green'">
            {{ record.type === 'guide' ? '引导页' : record.type === 'popup' ? '弹窗' : '横幅' }}
          </a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'isShow'">
          <a-tag :color="record.isShow ? 'green' : 'default'">{{ record.isShow ? '显示' : '隐藏' }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a @click="openEdit(record)">编辑</a>
            <a-popconfirm title="确定删除？" @confirm="onDelete(record)">
              <a style="color:#ff4d4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑引导页' : '新增引导页'" :width="600" @ok="onSubmit" :confirm-loading="submitting">
      <a-form layout="vertical">
        <a-form-item label="区域ID" required>
          <a-input v-model:value="form.regionId" :disabled="!!editingId" />
        </a-form-item>
        <a-form-item label="标题" required>
          <a-input v-model:value="form.title" />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="类型">
              <a-select v-model:value="form.type">
                <a-select-option value="guide">引导页</a-select-option>
                <a-select-option value="popup">弹窗</a-select-option>
                <a-select-option value="banner">横幅</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="排序">
              <a-input-number v-model:value="form.sortOrder" :min="0" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="显示">
              <a-switch v-model:checked="form.isShow" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="内容" required>
          <a-textarea v-model:value="form.content" :rows="8" placeholder="HTML内容" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { userApi } from '@/api/user'
import type { UserGuidancePage } from '@/types/user'

const ld = ref(false), list = ref<UserGuidancePage[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ regionId: '' })

const cols = [
  { title: '区域ID', dataIndex: 'regionId', width: 100 },
  { title: '标题', dataIndex: 'title', width: 150 },
  { title: '类型', dataIndex: 'type', width: 80 },
  { title: '排序', dataIndex: 'sortOrder', width: 60 },
  { title: '显示', dataIndex: 'isShow', width: 60 },
  { title: '更新时间', dataIndex: 'updatedAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 100 },
]

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.regionId) params.regionId = f.regionId
    const res = await userApi.getGuidanceList(params)
    const data = res.data as any
    list.value = data.list || []
    t.value = data.total || 0
  } catch { /* ignore */ } finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onTableChange(pag: any) { p.value = pag.current; fetchList() }

const modalVisible = ref(false), editingId = ref(''), submitting = ref(false)
const form = reactive<any>({
  regionId: '', title: '', content: '', type: 'guide', sortOrder: 0, isShow: true,
})

function openCreate() {
  editingId.value = ''
  Object.assign(form, { regionId: '', title: '', content: '', type: 'guide', sortOrder: 0, isShow: true })
  modalVisible.value = true
}

function openEdit(r: Record<string, any>) {
  editingId.value = r.id
  Object.assign(form, r)
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    if (editingId.value) {
      await userApi.updateGuidance(editingId.value, form)
      message.success('已更新')
    } else {
      await userApi.createGuidance(form)
      message.success('已创建')
    }
    modalVisible.value = false
    fetchList()
  } catch { /* ignore */ } finally { submitting.value = false }
}

async function onDelete(r: Record<string, any>) {
  await userApi.deleteGuidance(r.id)
  message.success('已删除')
  fetchList()
}

onMounted(() => fetchList())
</script>

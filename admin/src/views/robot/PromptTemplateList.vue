<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.type" placeholder="类型" allow-clear style="width:130px">
        <a-select-option value="post">发帖</a-select-option>
        <a-select-option value="comment">评论</a-select-option>
        <a-select-option value="message">私信</a-select-option>
        <a-select-option value="audit">审核</a-select-option>
        <a-select-option value="merchant">商家文案</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <div class="page-header">
        <span class="page-title">AI 提示词模板</span>
        <a-button type="primary" @click="openCreate">新建模板</a-button>
      </div>
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        @change="onTableChange"
      >
        <template #type="{ record }">
          <a-tag :color="typeColorMap[record.type] || 'default'" size="small">
            {{ typeLabelMap[record.type] || record.type }}
          </a-tag>
        </template>
        <template #content="{ record }">
          <span :title="record.content">
            {{ (record.content || '').length > 60 ? record.content.slice(0, 60) + '...' : (record.content || '-') }}
          </span>
        </template>
        <template #variables="{ record }">
          <a-space v-if="record.variables && record.variables.length" :size="4" wrap>
            <a-tag v-for="v in record.variables" :key="v" size="small" color="cyan">{{ tagVariable(v) }}</a-tag>
          </a-space>
          <span v-else style="color:#9ca3af">-</span>
        </template>
        <template #status="{ record }">
          <a-switch :checked="record.status === 1" size="small" @change="(val: boolean) => onToggleStatus(record, val)" />
        </template>
        <template #action="{ record }">
          <a-space>
            <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
            <a-popconfirm title="确定删除该模板?" @confirm="onDelete(record.id)">
              <a-button type="link" size="small" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEdit ? '编辑模板' : '新建模板'"
      @ok="onModalSubmit"
      :confirm-loading="modalLoading"
      width="600px"
      destroy-on-close
    >
      <a-form layout="vertical" :model="form">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="模板名称" required>
              <a-input v-model:value="form.name" placeholder="如：咖啡探店帖" :maxlength="30" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="模板类型" required>
              <a-select v-model:value="form.type" placeholder="选择类型">
                <a-select-option value="post">发帖</a-select-option>
                <a-select-option value="comment">评论</a-select-option>
                <a-select-option value="message">私信</a-select-option>
                <a-select-option value="audit">审核</a-select-option>
                <a-select-option value="merchant">商家文案</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="模板内容" required>
          <a-textarea
            v-model:value="form.content"
            placeholder="输入提示词模板，可使用变量如：{{ '{{topic}}' }} {{ '{{direction}}' }} {{ '{{style}}' }} {{ '{{city}}' }}"
            :rows="6"
            :maxlength="2000"
            show-count
          />
        </a-form-item>
        <a-form-item label="模板变量提示">
          <a-space :size="4" wrap>
            <a-tag v-for="v in availableVariables" :key="v" size="small" color="cyan" style="cursor:pointer" @click="insertVariable(v)">
              {{ tagVariable(v) }}
            </a-tag>
          </a-space>
          <div style="margin-top:8px;font-size:12px;color:#9ca3af">
            点击上方变量标签可快速插入到模板内容中
          </div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { robotApi } from '@/api/robot'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import type { PromptTemplate } from '@/types/robot'

const loading = ref(false)
const list = ref<PromptTemplate[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ type: undefined as string | undefined })

const modalVisible = ref(false)
const modalLoading = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)
const form = reactive({
  name: '',
  type: 'post' as 'post' | 'comment' | 'message' | 'audit' | 'merchant',
  content: '',
})

const typeColorMap: Record<string, string> = {
  post: 'blue',
  comment: 'green',
  message: 'purple',
  audit: 'orange',
  merchant: 'gold',
}
const typeLabelMap: Record<string, string> = {
  post: '发帖',
  comment: '评论',
  message: '私信',
  audit: '审核',
  merchant: '商家文案',
}

const availableVariables = ['topic', 'direction', 'style', 'city', 'circle', 'postContent', 'userNickname']

const columns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '名称', dataIndex: 'name', width: 150, ellipsis: true },
  { title: '类型', dataIndex: 'type', width: 90, slot: 'type' },
  { title: '内容', dataIndex: 'content', width: 260, ellipsis: true, slot: 'content' },
  { title: '变量', dataIndex: 'variables', width: 180, slot: 'variables' },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await robotApi.getPromptTemplates({
      page: page.value,
      pageSize: pageSize.value,
      type: filter.type,
    })
    list.value = (res.data?.data?.list || res.data?.list || []) as PromptTemplate[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    message.error('加载模板列表失败')
  } finally {
    loading.value = false
  }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.type = undefined; onSearch() }
function onTableChange() { fetchList() }

function openCreate() {
  isEdit.value = false
  editId.value = null
  form.name = ''
  form.type = 'post' as 'post' | 'comment' | 'message' | 'audit' | 'merchant'
  form.content = ''
  modalVisible.value = true
}

function openEdit(record: PromptTemplate) {
  isEdit.value = true
  editId.value = record.id
  form.name = record.name || ''
  form.type = (record.type || 'post') as 'post' | 'comment' | 'message' | 'audit' | 'merchant'
  form.content = record.content || ''
  modalVisible.value = true
}

function tagVariable(v: string): string {
  return '{{ ' + v + ' }}'
}

function insertVariable(variable: string) {
  form.content += `{{${variable}}}`
}

async function onModalSubmit() {
  if (!form.name.trim() || !form.content.trim()) {
    message.warning('请填写模板名称和内容')
    return
  }
  modalLoading.value = true
  try {
    const data = {
      name: form.name.trim(),
      type: form.type,
      content: form.content,
    }
    if (isEdit.value && editId.value) {
      await robotApi.updatePromptTemplate(editId.value, data)
      message.success('更新成功')
    } else {
      await robotApi.savePromptTemplate(data)
      message.success('创建成功')
    }
    modalVisible.value = false
    fetchList()
  } catch {
    message.error(isEdit.value ? '更新失败' : '创建失败')
  } finally {
    modalLoading.value = false
  }
}

async function onToggleStatus(record: PromptTemplate, checked: boolean) {
  try {
    await robotApi.togglePromptTemplate(record.id, checked ? 1 : 0)
    record.status = checked ? 1 : 0
    message.success(checked ? '已启用' : '已禁用')
  } catch {
    message.error('操作失败')
  }
}

async function onDelete(id: number) {
  try {
    await robotApi.deletePromptTemplate(id)
    message.success('已删除')
    fetchList()
  } catch {
    message.error('删除失败')
  }
}

fetchList()
</script>

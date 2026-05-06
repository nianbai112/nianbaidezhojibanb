<template>
  <a-card title="敏感词管理" :bordered="false">
    <div class="page-header">
      <span class="page-title">敏感词列表</span>
      <a-space>
        <a-button @click="onBatchImport">批量导入</a-button>
        <a-button type="primary" @click="onAdd">添加敏感词</a-button>
      </a-space>
    </div>

    <FilterBar @search="fetchList" @reset="onFilterReset">
      <a-input
        v-model:value="filterKeyword"
        placeholder="搜索敏感词"
        allow-clear
        style="width: 200px"
        @press-enter="fetchList"
      />
      <a-select v-model:value="filterCategory" placeholder="分类" allow-clear style="width: 140px" @change="fetchList">
        <a-select-option value="politics">政治</a-select-option>
        <a-select-option value="porn">色情</a-select-option>
        <a-select-option value="violence">暴力</a-select-option>
        <a-select-option value="abuse">辱骂</a-select-option>
        <a-select-option value="ad">广告</a-select-option>
        <a-select-option value="other">其他</a-select-option>
      </a-select>
      <a-select v-model:value="filterLevel" placeholder="等级" allow-clear style="width: 120px" @change="fetchList">
        <a-select-option value="block">拦截</a-select-option>
        <a-select-option value="audit">审核</a-select-option>
        <a-select-option value="replace">替换</a-select-option>
      </a-select>
    </FilterBar>

    <DataTable
      :columns="columns"
      :data-source="list"
      :loading="loading"
      :total="total"
      :page="page"
      :page-size="pageSize"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
    >
      <template #category="{ record }">
        <a-tag>{{ categoryMap[record.category] || record.category }}</a-tag>
      </template>
      <template #level="{ record }">
        <a-tag :color="levelColorMap[record.level]">{{ levelMap[record.level] || record.level }}</a-tag>
      </template>
      <template #replaceWord="{ record }">
        <span v-if="record.replaceWord">{{ record.replaceWord }}</span>
        <span v-else class="text-muted">-</span>
      </template>
      <template #status="{ record }">
        <StatusTag :status="record.status === 1 ? 'active' : 'disabled'" type="user" />
      </template>
      <template #action="{ record }">
        <a-space>
          <a @click="onEdit(record)">编辑</a>
          <a-popconfirm title="确定删除？" ok-text="确定" cancel-text="取消" @confirm="onDelete(record.id)">
            <a style="color: #ef4444">删除</a>
          </a-popconfirm>
        </a-space>
      </template>
    </DataTable>

    <!-- Add/Edit Modal -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingId ? '编辑敏感词' : '添加敏感词'"
      :confirm-loading="modalSaving"
      @ok="onModalSave"
      @cancel="modalVisible = false"
    >
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="敏感词">
          <a-input v-model:value="modalForm.word" placeholder="请输入敏感词" />
        </a-form-item>
        <a-form-item label="分类">
          <a-select v-model:value="modalForm.category" placeholder="请选择分类" style="width: 100%">
            <a-select-option value="politics">政治</a-select-option>
            <a-select-option value="porn">色情</a-select-option>
            <a-select-option value="violence">暴力</a-select-option>
            <a-select-option value="abuse">辱骂</a-select-option>
            <a-select-option value="ad">广告</a-select-option>
            <a-select-option value="other">其他</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="处理等级">
          <a-select v-model:value="modalForm.level" placeholder="请选择处理等级" style="width: 100%">
            <a-select-option value="block">拦截 - 直接禁止发布</a-select-option>
            <a-select-option value="audit">审核 - 转人工审核</a-select-option>
            <a-select-option value="replace">替换 - 自动替换为指定词</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="modalForm.level === 'replace'" label="替换词">
          <a-input v-model:value="modalForm.replaceWord" placeholder="请输入替换后的词" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Batch Import Modal -->
    <a-modal
      v-model:open="batchVisible"
      title="批量导入敏感词"
      :confirm-loading="batchSaving"
      @ok="onBatchSave"
      @cancel="batchVisible = false"
    >
      <a-textarea
        v-model:value="batchWords"
        placeholder="每行一个敏感词"
        :rows="10"
      />
      <div class="batch-hint">
        每行输入一个敏感词，导入后将使用默认分类（其他）和默认等级（拦截）
      </div>
    </a-modal>
  </a-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { configApi } from '@/api/config'
import type { SensitiveWord } from '@/types/config'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'

const categoryMap: Record<string, string> = {
  politics: '政治',
  porn: '色情',
  violence: '暴力',
  abuse: '辱骂',
  ad: '广告',
  other: '其他',
}

const levelMap: Record<string, string> = {
  block: '拦截',
  audit: '审核',
  replace: '替换',
}

const levelColorMap: Record<string, string> = {
  block: 'red',
  audit: 'orange',
  replace: 'blue',
}

const columns = [
  { title: '敏感词', dataIndex: 'word', width: 160 },
  { title: '分类', key: 'category', width: 100 },
  { title: '等级', key: 'level', width: 80 },
  { title: '替换词', key: 'replaceWord', width: 120 },
  { title: '状态', key: 'status', width: 80 },
  { title: '创建时间', dataIndex: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 120 },
]

const list = ref<SensitiveWord[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const filterKeyword = ref('')
const filterCategory = ref<string | undefined>(undefined)
const filterLevel = ref<string | undefined>(undefined)

const modalVisible = ref(false)
const modalSaving = ref(false)
const editingId = ref<number | null>(null)

const modalForm = reactive({
  word: '',
  category: 'other' as string,
  level: 'block' as string,
  replaceWord: '',
})

const batchVisible = ref(false)
const batchSaving = ref(false)
const batchWords = ref('')

onMounted(() => {
  fetchList()
})

async function fetchList() {
  loading.value = true
  try {
    const res = await configApi.getSensitiveWords({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filterKeyword.value || undefined,
      category: filterCategory.value,
      level: filterLevel.value,
    })
    const data = res.data as any
    list.value = data?.list || data?.data?.list || []
    total.value = data?.total || data?.data?.total || 0
  } catch {
    /* handled */
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  fetchList()
}

function onPageSizeChange(ps: number) {
  pageSize.value = ps
  page.value = 1
  fetchList()
}

function onFilterReset() {
  filterKeyword.value = ''
  filterCategory.value = undefined
  filterLevel.value = undefined
  page.value = 1
  fetchList()
}

function onAdd() {
  editingId.value = null
  modalForm.word = ''
  modalForm.category = 'other'
  modalForm.level = 'block'
  modalForm.replaceWord = ''
  modalVisible.value = true
}

function onEdit(record: SensitiveWord) {
  editingId.value = record.id
  modalForm.word = record.word
  modalForm.category = record.category
  modalForm.level = record.level
  modalForm.replaceWord = record.replaceWord || ''
  modalVisible.value = true
}

async function onModalSave() {
  if (!modalForm.word.trim()) {
    message.warning('请输入敏感词')
    return
  }
  modalSaving.value = true
  try {
    const data: any = {
      word: modalForm.word,
      category: modalForm.category,
      level: modalForm.level,
    }
    if (modalForm.level === 'replace') {
      data.replaceWord = modalForm.replaceWord
    }

    if (editingId.value) {
      await configApi.updateSensitiveWord(editingId.value, data)
      message.success('更新成功')
    } else {
      await configApi.saveSensitiveWord(data)
      message.success('添加成功')
    }
    modalVisible.value = false
    fetchList()
  } catch {
    message.error('操作失败')
  } finally {
    modalSaving.value = false
  }
}

async function onDelete(id: number) {
  try {
    await configApi.deleteSensitiveWord(id)
    message.success('已删除')
    fetchList()
  } catch {
    message.error('删除失败')
  }
}

function onBatchImport() {
  batchWords.value = ''
  batchVisible.value = true
}

async function onBatchSave() {
  const words = batchWords.value
    .split('\n')
    .map((w) => w.trim())
    .filter((w) => w.length > 0)

  if (words.length === 0) {
    message.warning('请输入至少一个敏感词')
    return
  }

  batchSaving.value = true
  try {
    await configApi.batchImportWords(words)
    message.success(`成功导入 ${words.length} 个敏感词`)
    batchVisible.value = false
    fetchList()
  } catch {
    message.error('导入失败')
  } finally {
    batchSaving.value = false
  }
}
</script>

<style lang="less" scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  .page-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }
}

.text-muted {
  color: #d1d5db;
}

.batch-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #9ca3af;
}
</style>

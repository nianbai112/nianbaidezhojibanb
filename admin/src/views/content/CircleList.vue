<template>
  <div class="page-container">
    <div class="page-header">
      <h3 class="page-title">圈子管理</h3>
      <a-button type="primary" @click="onCreate">
        <template #icon><plus-outlined /></template>
        新建圈子
      </a-button>
    </div>

    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="圈子名称" allow-clear style="width:200px" />
      <a-select v-model:value="filter.category" placeholder="分类" allow-clear style="width:130px">
        <a-select-option value="campus">校园</a-select-option>
        <a-select-option value="life">生活</a-select-option>
        <a-select-option value="study">学习</a-select-option>
        <a-select-option value="game">游戏</a-select-option>
        <a-select-option value="emotion">情感</a-select-option>
        <a-select-option value="other">其他</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        @change="onTableChange"
      >
        <template #cover="{ record }">
          <a-image v-if="record.cover" :src="record.cover" :width="48" :height="48" style="border-radius:8px;object-fit:cover" />
          <div v-else style="width:48px;height:48px;background:#f3f4f6;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:20px">#</div>
        </template>
        <template #status="{ record }">
          <a-switch :checked="record.status === 1" :loading="toggleLoadingMap[record.id]" @change="(val: boolean) => onToggleStatus(record, val)" />
          <span style="margin-left:8px;font-size:12px;color:#6b7280">{{ record.status === 1 ? '启用' : '禁用' }}</span>
        </template>
        <template #action="{ record }">
          <a-space>
            <a-button type="link" size="small" @click="onEdit(record)">编辑</a-button>
            <a-popconfirm title="确定删除该圈子？" @confirm="onDelete(record.id)">
              <a-button type="link" size="small" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 创建/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEdit ? '编辑圈子' : '新建圈子'"
      :confirm-loading="modalLoading"
      @ok="onModalSubmit"
      @cancel="onModalCancel"
      width="520px"
    >
      <a-form ref="formRef" :model="formState" :rules="formRules as any" layout="vertical">
        <a-form-item label="圈子名称" name="name">
          <a-input v-model:value="formState.name" placeholder="请输入圈子名称" :maxlength="30" show-count />
        </a-form-item>
        <a-form-item label="封面图" name="cover">
          <a-input v-model:value="formState.cover" placeholder="请输入封面图URL" />
        </a-form-item>
        <a-form-item label="分类" name="category">
          <a-select v-model:value="formState.category" placeholder="请选择分类">
            <a-select-option value="campus">校园</a-select-option>
            <a-select-option value="life">生活</a-select-option>
            <a-select-option value="study">学习</a-select-option>
            <a-select-option value="game">游戏</a-select-option>
            <a-select-option value="emotion">情感</a-select-option>
            <a-select-option value="other">其他</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-textarea v-model:value="formState.description" placeholder="请输入圈子描述" :rows="3" :maxlength="200" show-count />
        </a-form-item>
        <a-form-item label="是否官方" name="isOfficial">
          <a-switch v-model:checked="formState.isOfficial" checked-children="是" un-checked-children="否" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { contentApi } from '@/api/content'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import type { Topic } from '@/types/content'
import type { FormInstance } from 'ant-design-vue'

const loading = ref(false)
const list = ref<Topic[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ keyword: '', category: undefined as string | undefined })

const toggleLoadingMap = ref<Record<number, boolean>>({})

const columns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '封面', dataIndex: 'cover', width: 70, slot: 'cover' },
  { title: '名称', dataIndex: 'name', width: 150, ellipsis: true },
  { title: '分类', dataIndex: 'category', width: 80 },
  { title: '帖子数', dataIndex: 'postCount', width: 80 },
  { title: '成员数', dataIndex: 'memberCount', width: 80 },
  { title: '今日帖', dataIndex: 'todayPostCount', width: 70 },
  { title: '排序', dataIndex: 'sort', width: 60 },
  { title: '状态', dataIndex: 'status', width: 90, slot: 'status' },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action', fixed: 'right' },
]

const modalVisible = ref(false)
const modalLoading = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)
const formRef = ref<FormInstance>()
const formState = reactive({
  name: '',
  cover: '',
  category: undefined as string | undefined,
  description: '',
  isOfficial: false,
})

const formRules = {
  name: [{ required: true, message: '请输入圈子名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
}

async function fetchList() {
  loading.value = true
  try {
    const res = await contentApi.getTopicList({ page: page.value, pageSize: pageSize.value, keyword: filter.keyword, category: filter.category })
    list.value = (res.data?.data?.list || res.data?.list || []) as Topic[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    message.error('加载圈子列表失败')
  } finally {
    loading.value = false
  }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.category = undefined; onSearch() }
function onTableChange() { fetchList() }

function onCreate() {
  isEdit.value = false
  editId.value = null
  formState.name = ''
  formState.cover = ''
  formState.category = undefined
  formState.description = ''
  formState.isOfficial = false
  modalVisible.value = true
}

function onEdit(record: Topic) {
  isEdit.value = true
  editId.value = record.id
  formState.name = record.name
  formState.cover = record.cover || ''
  formState.category = record.category
  formState.description = record.description || ''
  formState.isOfficial = record.isOfficial
  modalVisible.value = true
}

function onModalCancel() {
  modalVisible.value = false
  formRef.value?.resetFields()
}

async function onModalSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  modalLoading.value = true
  try {
    const data = {
      name: formState.name,
      cover: formState.cover,
      category: formState.category,
      description: formState.description,
      isOfficial: formState.isOfficial,
    }
    if (isEdit.value && editId.value) {
      await contentApi.updateTopic(editId.value, data)
      message.success('更新成功')
    } else {
      await contentApi.saveTopic(data)
      message.success('创建成功')
    }
    modalVisible.value = false
    fetchList()
  } catch {
    message.error('操作失败')
  } finally {
    modalLoading.value = false
  }
}

async function onToggleStatus(record: Topic, checked: boolean) {
  toggleLoadingMap.value[record.id] = true
  try {
    await contentApi.toggleTopicStatus(record.id, checked ? 1 : 0)
    record.status = checked ? 1 : 0
    message.success(checked ? '已启用' : '已禁用')
  } catch {
    message.error('操作失败')
  } finally {
    toggleLoadingMap.value[record.id] = false
  }
}

async function onDelete(id: number) {
  try {
    await contentApi.deletePost(id)
    message.success('已删除')
    fetchList()
  } catch {
    message.error('删除失败')
  }
}

fetchList()
</script>

<style lang="less" scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}
</style>

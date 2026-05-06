<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="话题名称" allow-clear style="width:180px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:100px">
        <a-select-option :value="1">启用</a-select-option>
        <a-select-option :value="0">禁用</a-select-option>
      </a-select>
    </FilterBar>
    <div class="page-card">
      <DataTable
        :columns="columns as any"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        @change="onTableChange"
      >
        <template #toolbar>
          <a-button type="primary" @click="onCreate"><PlusOutlined /> 新建话题</a-button>
        </template>
        <template #cover="{ record }">
          <a-image v-if="record.cover" :src="record.cover" :width="44" :height="44" style="object-fit:cover;border-radius:6px" />
          <span v-else style="color:#ccc">-</span>
        </template>
        <template #status="{ record }">
          <a-switch :checked="record.status === 1" size="small" @change="(checked: boolean) => onToggleStatus(record, checked)" />
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a-popconfirm title="确定删除?" @confirm="onDelete(record)">
              <a style="color:#ef4444">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 新建/编辑弹窗 -->
    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑话题' : '新建话题'" @ok="onSubmit" :confirm-loading="saving" width="520">
      <a-form :model="form" layout="vertical">
        <a-form-item label="话题名称" required>
          <a-input v-model:value="form.name" placeholder="话题名称" :maxlength="30" show-count />
        </a-form-item>
        <a-form-item label="分类">
          <a-input v-model:value="form.category" placeholder="如：兴趣、校园、生活" />
        </a-form-item>
        <a-form-item label="封面图片 URL">
          <a-input v-model:value="form.cover" placeholder="图片链接" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="form.description" placeholder="话题简介" :rows="3" :maxlength="300" show-count />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="排序">
              <a-input-number v-model:value="form.sort" :min="0" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="官方话题">
              <a-switch v-model:checked="form.isOfficial" />
            </a-form-item>
          </a-col>
        </a-row>
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

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ keyword: '', status: undefined as number | undefined })

const modalVisible = ref(false)
const saving = ref(false)
const editingId = ref<string | number>('')
const form = reactive({ name: '', category: '', cover: '', description: '', sort: 0, isOfficial: false })

const columns = [
  { title: '封面', dataIndex: 'cover', width: 60, slot: 'cover' },
  { title: '名称', dataIndex: 'name', width: 150 },
  { title: '分类', dataIndex: 'category', width: 90 },
  { title: '帖子数', dataIndex: 'postCount', width: 70 },
  { title: '成员', dataIndex: 'memberCount', width: 60 },
  { title: '今日', dataIndex: 'todayPostCount', width: 50 },
  { title: '官方', dataIndex: 'isOfficial', width: 60 },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 130, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (filter.keyword) params.keyword = filter.keyword
    const res = await contentApi.getTopicList(params)
    const body: any = res.data?.data || res.data || {}
    list.value = body.list || []
    total.value = body.total || 0
  } catch { /* ignore */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.status = undefined; onSearch() }
function onTableChange() { fetchList() }

function onCreate() {
  editingId.value = ''
  Object.assign(form, { name: '', category: '', cover: '', description: '', sort: 0, isOfficial: false })
  modalVisible.value = true
}

function onEdit(r: any) {
  editingId.value = r.id
  Object.assign(form, {
    name: r.name || '',
    category: r.category || '',
    cover: r.cover || '',
    description: r.description || '',
    sort: r.sort || 0,
    isOfficial: r.isOfficial || false,
  })
  modalVisible.value = true
}

async function onSubmit() {
  if (!form.name.trim()) { message.warning('请填写话题名称'); return }
  saving.value = true
  try {
    const data = { ...form, name: form.name.trim() }
    if (editingId.value) {
      await contentApi.updateTopic(Number(editingId.value), data)
    } else {
      await contentApi.saveTopic(data)
    }
    message.success('保存成功')
    modalVisible.value = false
    fetchList()
  } catch { message.error('保存失败') } finally { saving.value = false }
}

async function onToggleStatus(r: any, checked: boolean) {
  try {
    await contentApi.toggleTopicStatus(r.id, checked ? 1 : 0)
    r.status = checked ? 1 : 0
    message.success(checked ? '已启用' : '已禁用')
  } catch { message.error('操作失败') }
}

async function onDelete(r: any) {
  try {
    await contentApi.toggleTopicStatus(r.id, 0)
    message.success('已删除')
    fetchList()
  } catch { message.error('删除失败') }
}

fetchList()
</script>

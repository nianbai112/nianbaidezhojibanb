<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="昵称/描述" allow-clear style="width:200px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:110px">
        <a-select-option :value="1">启用</a-select-option>
        <a-select-option :value="0">禁用</a-select-option>
      </a-select>
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:160px" :loading="regionLoading" show-search :filter-option="false" @search="onRegionSearch">
        <a-select-option v-for="r in regionOptions" :key="r.id" :value="r.id">{{ r.name }}</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <div class="page-header">
        <span class="page-title">机器人账号</span>
        <a-button type="primary" @click="openCreate">新建机器人</a-button>
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
        <template #avatar="{ record }">
          <a-avatar :src="record.avatar" :size="40">
            {{ (record.nickname || 'R').charAt(0) }}
          </a-avatar>
        </template>
        <template #gender="{ record }">
          <a-tag :color="record.gender === 1 ? 'blue' : record.gender === 2 ? 'pink' : 'default'" size="small">
            {{ record.gender === 1 ? '男' : record.gender === 2 ? '女' : '未知' }}
          </a-tag>
        </template>
        <template #tags="{ record }">
          <a-space v-if="record.tags && record.tags.length" :size="4" wrap>
            <a-tag v-for="tag in record.tags" :key="tag" size="small" color="purple">{{ tag }}</a-tag>
          </a-space>
          <span v-else style="color:#9ca3af">-</span>
        </template>
        <template #persona="{ record }">
          <span :title="record.persona">{{ (record.persona || '').length > 40 ? record.persona.slice(0, 40) + '...' : (record.persona || '-') }}</span>
        </template>
        <template #status="{ record }">
          <a-switch :checked="record.status === 1" size="small" @change="(val: boolean) => onToggleStatus(record, val)" />
        </template>
        <template #action="{ record }">
          <a-space>
            <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
            <a-popconfirm title="确定删除该机器人?" @confirm="onDelete(record.id)">
              <a-button type="link" size="small" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEdit ? '编辑机器人' : '新建机器人'"
      @ok="onModalSubmit"
      :confirm-loading="modalLoading"
      width="560px"
      destroy-on-close
    >
      <a-form layout="vertical" :model="form" ref="formRef">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="昵称" required>
              <a-input v-model:value="form.nickname" placeholder="机器人昵称" :maxlength="20" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="性别">
              <a-select v-model:value="form.gender" placeholder="选择性别">
                <a-select-option :value="0">未知</a-select-option>
                <a-select-option :value="1">男</a-select-option>
                <a-select-option :value="2">女</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="头像">
          <a-input v-model:value="form.avatar" placeholder="头像 URL 地址" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="城市">
              <a-input v-model:value="form.city" placeholder="如：北京" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="所属区域">
              <a-select v-model:value="form.regionId" placeholder="选择区域" :loading="regionLoading" show-search :filter-option="false" @search="onRegionSearch">
                <a-select-option v-for="r in regionOptions" :key="r.id" :value="r.id">{{ r.name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="标签">
          <a-select v-model:value="form.tags" mode="tags" placeholder="输入标签回车添加" />
        </a-form-item>
        <a-form-item label="人设（persona）">
          <a-textarea v-model:value="form.persona" placeholder="描述该机器人的性格、说话风格、兴趣爱好等" :rows="3" :maxlength="500" show-count />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="form.description" placeholder="补充描述信息" :rows="2" :maxlength="300" show-count />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { robotApi } from '@/api/robot'
import { areaApi } from '@/api/area'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import type { RobotAccount } from '@/types/robot'

const loading = ref(false)
const list = ref<RobotAccount[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ keyword: '', status: undefined as number | undefined, regionId: undefined as number | undefined })

const regionLoading = ref(false)
const regionOptions = ref<{ id: number; name: string }[]>([])
let regionSearchTimer: ReturnType<typeof setTimeout> | null = null

const modalVisible = ref(false)
const modalLoading = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)
const formRef = ref()
const form = reactive({
  nickname: '',
  avatar: '',
  gender: 0 as 0 | 1 | 2,
  city: '',
  tags: [] as string[],
  persona: '',
  description: '',
  regionId: undefined as number | undefined,
})

const columns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '头像', dataIndex: 'avatar', width: 70, slot: 'avatar' },
  { title: '昵称', dataIndex: 'nickname', width: 120, ellipsis: true },
  { title: '性别', dataIndex: 'gender', width: 60, slot: 'gender' },
  { title: '城市', dataIndex: 'city', width: 90 },
  { title: '标签', dataIndex: 'tags', width: 160, slot: 'tags' },
  { title: '人设', dataIndex: 'persona', width: 180, ellipsis: true, slot: 'persona' },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '发帖', dataIndex: 'postCount', width: 60 },
  { title: '评论', dataIndex: 'commentCount', width: 60 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 130, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await robotApi.getList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filter.keyword || undefined,
      status: filter.status,
      regionId: filter.regionId,
    })
    list.value = (res.data?.data?.list || res.data?.list || []) as RobotAccount[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    message.error('加载机器人列表失败')
  } finally {
    loading.value = false
  }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.status = undefined; filter.regionId = undefined; onSearch() }
function onTableChange() { fetchList() }

function onRegionSearch(val: string) {
  if (regionSearchTimer) clearTimeout(regionSearchTimer)
  regionSearchTimer = setTimeout(async () => {
    regionLoading.value = true
    try {
      const res = await areaApi.getList({ page: 1, pageSize: 50, keyword: val || undefined })
      regionOptions.value = (res.data?.data?.list || res.data?.list || []) as { id: number; name: string }[]
    } catch {
      // ignore
    } finally {
      regionLoading.value = false
    }
  }, 300)
}
onRegionSearch('')

function openCreate() {
  isEdit.value = false
  editId.value = null
  form.nickname = ''
  form.avatar = ''
  form.gender = 0
  form.city = ''
  form.tags = []
  form.persona = ''
  form.description = ''
  form.regionId = undefined
  modalVisible.value = true
}

function openEdit(record: RobotAccount) {
  isEdit.value = true
  editId.value = record.id
  form.nickname = record.nickname || ''
  form.avatar = record.avatar || ''
  form.gender = record.gender ?? 0
  form.city = record.city || ''
  form.tags = [...(record.tags || [])]
  form.persona = record.persona || ''
  form.description = record.description || ''
  form.regionId = record.regionId
  modalVisible.value = true
}

async function onModalSubmit() {
  modalLoading.value = true
  try {
    const data = {
      nickname: form.nickname,
      avatar: form.avatar,
      gender: form.gender,
      city: form.city,
      tags: form.tags,
      persona: form.persona,
      description: form.description,
      regionId: form.regionId,
    }
    if (isEdit.value && editId.value) {
      await robotApi.update(editId.value, data)
      message.success('更新成功')
    } else {
      await robotApi.create(data)
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

async function onToggleStatus(record: RobotAccount, checked: boolean) {
  try {
    await robotApi.toggleStatus(record.id, checked ? 1 : 0)
    record.status = checked ? 1 : 0
    message.success(checked ? '已启用' : '已禁用')
  } catch {
    message.error('操作失败')
  }
}

async function onDelete(id: number) {
  try {
    await robotApi.toggleStatus(id, 0)
    message.success('已删除')
    fetchList()
  } catch {
    message.error('删除失败')
  }
}

fetchList()
</script>

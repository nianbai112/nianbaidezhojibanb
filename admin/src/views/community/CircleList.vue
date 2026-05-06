<template>
  <div class="page-container">
    <div class="page-title mb-4">社群列表</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="5">
          <a-input v-model:value="f.keyword" placeholder="搜索社群名称" allow-clear @pressEnter="onSearch" />
        </a-col>
        <a-col :span="4">
          <a-select v-model:value="f.regionId" placeholder="区域" allow-clear style="width:100%" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" @change="onSearch" />
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:100%" @change="onSearch">
            <a-select-option value="active">正常</a-select-option>
            <a-select-option value="dissolved">已解散</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="2">
          <a-button type="primary" @click="openCreate" v-permission="'community:edit'">新建社群</a-button>
        </a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="cols" :loading="ld" :pagination="{ current: p, pageSize: ps, total: t }" @change="onTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'cover'">
          <a-avatar :src="record.cover" :size="36" shape="square" />
        </template>
        <template v-else-if="column.dataIndex === 'region'">
          {{ record.region?.name || '-' }}
        </template>
        <template v-else-if="column.dataIndex === 'memberCount'">
          {{ record._count?.members ?? record.memberCount }}
        </template>
        <template v-else-if="column.dataIndex === 'price'">
          <span v-if="record.paidJoin && record.price">¥{{ (Number(record.price)).toFixed(2) }}</span>
          <span v-else style="color:#999">免费</span>
        </template>
        <template v-else-if="column.dataIndex === 'joinType'">
          <a-tag>{{ joinTypeMap[record.joinType] || record.joinType }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'isOfficial'">
          <a-tag :color="record.isOfficial ? 'gold' : 'default'">{{ record.isOfficial ? '官方' : '普通' }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <a-tag :color="record.status === 'active' ? 'green' : 'red'">
            {{ record.status === 'active' ? '正常' : '已解散' }}
          </a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a @click="$router.push(`/community/circles/${record.id}/members`)">成员</a>
            <a @click="openEdit(record)" v-permission="'community:edit'">编辑</a>
            <a v-if="record.status === 'active'" @click="onToggleStatus(record, 'dissolved')" v-permission="'community:edit'">解散</a>
            <a v-else @click="onToggleStatus(record, 'active')" v-permission="'community:edit'">启用</a>
            <a-popconfirm title="确定删除该社群？此操作不可撤销。" @confirm="onDelete(record)" v-permission="'community:edit'">
              <a style="color:#ff4d4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 创建/编辑弹窗 -->
    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑社群' : '新建社群'" :width="520" :confirm-loading="submitting" @ok="onSubmit">
      <a-form layout="vertical">
        <a-form-item label="名称" required>
          <a-input v-model:value="form.name" placeholder="社群名称" />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="区域">
              <a-select v-model:value="form.regionId" placeholder="选择区域" allow-clear :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="加入方式">
              <a-select v-model:value="form.joinType" :options="joinTypeOpts" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="封面">
          <a-input v-model:value="form.cover" placeholder="封面图片URL" />
        </a-form-item>
        <a-form-item label="简介">
          <a-textarea v-model:value="form.description" :rows="2" placeholder="社群简介" />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="最大人数">
              <a-input-number v-model:value="form.maxMembers" :min="1" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="官方社群">
              <a-switch v-model:checked="form.isOfficial" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="付费加入">
              <a-switch v-model:checked="form.paidJoin" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12" v-if="form.paidJoin">
          <a-col :span="12">
            <a-form-item label="价格 (元)">
              <a-input-number v-model:value="form.price" :min="0" :precision="2" style="width:100%" placeholder="0.00" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="邀请码">
              <a-input v-model:value="form.inviteCode" placeholder="可选邀请码" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="截止时间" v-if="form.paidJoin">
          <a-date-picker v-model:value="form.deadline" show-time style="width:100%" placeholder="选择截止时间" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { communityApi } from '@/api/community'
import { areaApi } from '@/api/area'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const regionOpts = ref<any[]>([])
const f = reactive({ keyword: '', regionId: undefined as string | undefined, status: undefined as string | undefined })

const joinTypeMap: Record<string, string> = { OPEN: '公开', APPLY: '申请', INVITE: '邀请' }
const joinTypeOpts = [
  { label: '公开', value: 'OPEN' },
  { label: '申请', value: 'APPLY' },
  { label: '邀请', value: 'INVITE' },
]

const cols = [
  { title: '封面', dataIndex: 'cover', width: 60 },
  { title: '名称', dataIndex: 'name', width: 150 },
  { title: '区域', dataIndex: 'region', width: 100 },
  { title: '加入方式', dataIndex: 'joinType', width: 80 },
  { title: '类型', dataIndex: 'isOfficial', width: 70 },
  { title: '成员数', dataIndex: 'memberCount', width: 80 },
  { title: '价格', dataIndex: 'price', width: 80 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 180 },
]

async function fetchRegions() {
  try {
    const res = await areaApi.getList({ page: 1, pageSize: 200 })
    regionOpts.value = (res.data as any).list || []
  } catch { /* ignore */ }
}

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.keyword) params.keyword = f.keyword
    if (f.regionId) params.regionId = f.regionId
    if (f.status) params.status = f.status
    const res = await communityApi.getList(params)
    const data = res.data as any
    list.value = data.list || []
    t.value = data.total || 0
  } catch { /* ignore */ }
  finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onTableChange(pag: any) { p.value = pag.current; fetchList() }

// ---- 创建/编辑 ----
const modalVisible = ref(false), editingId = ref(''), submitting = ref(false)
const form = reactive<any>({
  name: '', regionId: undefined, cover: '', description: '', joinType: 'OPEN',
  isOfficial: false, maxMembers: 500, paidJoin: false, price: undefined,
  inviteCode: '', deadline: undefined,
})

function openCreate() {
  editingId.value = ''
  Object.assign(form, {
    name: '', regionId: undefined, cover: '', description: '', joinType: 'OPEN',
    isOfficial: false, maxMembers: 500, paidJoin: false, price: undefined,
    inviteCode: '', deadline: undefined,
  })
  modalVisible.value = true
}

function openEdit(record: any) {
  editingId.value = record.id
  form.name = record.name
  form.regionId = record.regionId
  form.cover = record.cover
  form.description = record.description
  form.joinType = record.joinType
  form.isOfficial = record.isOfficial
  form.maxMembers = record.maxMembers
  form.paidJoin = record.paidJoin
  form.price = record.price ? Number(record.price) : undefined
  form.inviteCode = record.inviteCode
  form.deadline = record.deadline ? dayjs(record.deadline) : undefined
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    const payload: any = { ...form }
    if (payload.deadline && dayjs.isDayjs(payload.deadline)) {
      payload.deadline = payload.deadline.toISOString()
    }
    if (!payload.paidJoin) {
      payload.price = undefined
      payload.inviteCode = undefined
      payload.deadline = undefined
    }
    if (editingId.value) {
      await communityApi.update(editingId.value, payload)
      message.success('已保存')
    } else {
      await communityApi.create(payload)
      message.success('已创建')
    }
    modalVisible.value = false
    fetchList()
  } catch { /* ignore */ }
  finally { submitting.value = false }
}

async function onToggleStatus(record: any, status: string) {
  await communityApi.updateStatus(record.id, status)
  message.success(status === 'active' ? '已启用' : '已解散')
  fetchList()
}

async function onDelete(record: any) {
  await communityApi.delete(record.id)
  message.success('已删除')
  fetchList()
}

onMounted(() => { fetchRegions(); fetchList() })
</script>

<template>
  <div class="page-container">
    <div class="page-title mb-4">活动管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="16">
        <a-col :span="6"><a-input-search v-model:value="filters.keyword" placeholder="搜索活动标题" allow-clear @search="fetchList" /></a-col>
        <a-col :span="4">
          <a-select v-model:value="filters.status" placeholder="状态筛选" allow-clear @change="fetchList">
            <a-select-option value="upcoming">即将开始</a-select-option>
            <a-select-option value="signup">报名中</a-select-option>
            <a-select-option value="ongoing">进行中</a-select-option>
            <a-select-option value="ended">已结束</a-select-option>
            <a-select-option value="cancelled">已取消</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="4">
          <a-select v-model:value="filters.typeId" placeholder="活动类型" allow-clear @change="fetchList">
            <a-select-option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="2"><a-button type="primary" @click="openCreate">新建活动</a-button></a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'cover'">
          <a-image v-if="record.cover" :src="record.cover" :width="60" :height="40" style="object-fit:cover;border-radius:4px" />
          <span v-else style="color:#ccc">-</span>
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <a-tag :color="statusColor[record.status]">{{ statusMap[record.status] || record.status }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a-dropdown>
              <a class="ant-dropdown-link" @click.prevent>操作 <DownOutlined /></a>
              <template #overlay>
                <a-menu>
                  <a-menu-item @click="openEdit(record)">编辑</a-menu-item>
                  <a-menu-item v-if="record.status === 'upcoming'" @click="changeStatus(record, 'signup')">设为报名中</a-menu-item>
                  <a-menu-item v-if="record.status === 'signup'" @click="changeStatus(record, 'ongoing')">设为进行中</a-menu-item>
                  <a-menu-item v-if="record.status === 'ongoing'" @click="changeStatus(record, 'ended')">结束活动</a-menu-item>
                  <a-menu-item v-if="!['cancelled','ended'].includes(record.status)" @click="changeStatus(record, 'cancelled')" danger>取消活动</a-menu-item>
                  <a-menu-divider />
                  <a-menu-item @click="$router.push('/activity/packages?activityId=' + record.id)">套餐管理</a-menu-item>
                  <a-menu-item @click="$router.push('/activity/orders?activityId=' + record.id)">查看订单</a-menu-item>
                  <a-menu-divider />
                  <a-menu-item danger @click="handleDelete(record.id)">删除</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- Create/Edit Modal -->
    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑活动' : '新建活动'" @ok="handleSave" :confirmLoading="saving" width="700px">
      <a-form :model="form" :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-tabs v-model:activeKey="activeTab">
          <a-tab-pane key="basic" tab="基本信息">
            <a-form-item label="标题" required><a-input v-model:value="form.title" /></a-form-item>
            <a-form-item label="活动类型"><a-select v-model:value="form.typeId" placeholder="选择类型" allow-clear><a-select-option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</a-select-option></a-select></a-form-item>
            <a-form-item label="所属社团"><a-select v-model:value="form.clubId" placeholder="选择社团" allow-clear show-search option-filter-prop="label"><a-select-option v-for="c in clubs" :key="c.id" :value="c.id" :label="c.name">{{ c.name }}</a-select-option></a-select></a-form-item>
            <a-form-item label="封面图"><a-input v-model:value="form.cover" placeholder="封面图片URL" /></a-form-item>
            <a-form-item label="活动描述"><a-textarea v-model:value="form.description" :rows="3" placeholder="活动描述" /></a-form-item>
            <a-form-item label="活动地点"><a-input v-model:value="form.location" placeholder="地点" /></a-form-item>
            <a-form-item label="纬度"><a-input-number v-model:value="form.lat" :min="-90" :max="90" style="width:100%" /></a-form-item>
            <a-form-item label="经度"><a-input-number v-model:value="form.lng" :min="-180" :max="180" style="width:100%" /></a-form-item>
            <a-form-item label="组织者"><a-input v-model:value="form.organizer" /></a-form-item>
            <a-form-item label="联系方式"><a-input v-model:value="form.contact" /></a-form-item>
          </a-tab-pane>
          <a-tab-pane key="time" tab="时间与人数">
            <a-form-item label="活动开始" required><a-date-picker v-model:value="form.startAt" show-time style="width:100%" /></a-form-item>
            <a-form-item label="活动结束" required><a-date-picker v-model:value="form.endAt" show-time style="width:100%" /></a-form-item>
            <a-form-item label="报名开始"><a-date-picker v-model:value="form.signStartAt" show-time style="width:100%" /></a-form-item>
            <a-form-item label="报名截止"><a-date-picker v-model:value="form.signEndAt" show-time style="width:100%" /></a-form-item>
            <a-form-item label="人数上限"><a-input-number v-model:value="form.maxPeople" :min="1" style="width:100%" /></a-form-item>
            <a-form-item label="报名费用"><a-input-number v-model:value="form.fee" :min="0" :precision="2" style="width:100%" addon-after="元" /></a-form-item>
          </a-tab-pane>
          <a-tab-pane key="settings" tab="设置">
            <a-form-item label="可见性"><a-radio-group v-model:value="form.visibility"><a-radio value="public">公开</a-radio><a-radio value="private">私密</a-radio></a-radio-group></a-form-item>
            <a-form-item label="退款策略"><a-select v-model:value="form.refundPolicy" placeholder="选择退款策略" allow-clear><a-select-option value="anytime">随时可退</a-select-option><a-select-option value="24_hours">开始前24小时</a-select-option><a-select-option value="48_hours">开始前48小时</a-select-option><a-select-option value="7_days">开始前7天</a-select-option><a-select-option value="no_refund">不可退款</a-select-option></a-select></a-form-item>
            <a-form-item label="排序"><a-input-number v-model:value="form.sortOrder" :min="0" style="width:100%" /></a-form-item>
          </a-tab-pane>
        </a-tabs>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { DownOutlined } from '@ant-design/icons-vue'
import { activityApi } from '@/api/activity'
import { clubApi } from '@/api/club'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const modalVisible = ref(false)
const editingId = ref('')
const activeTab = ref('basic')
const list = ref<any[]>([])
const types = ref<any[]>([])
const clubs = ref<any[]>([])
const filters = reactive({ keyword: '', status: undefined as string | undefined, typeId: undefined as string | undefined })
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const statusMap: Record<string, string> = { upcoming: '即将开始', signup: '报名中', ongoing: '进行中', ended: '已结束', cancelled: '已取消' }
const statusColor: Record<string, string> = { upcoming: 'blue', signup: 'processing', ongoing: 'success', ended: 'default', cancelled: 'error' }

const columns = [
  { title: '封面', dataIndex: 'cover', width: 70 },
  { title: '标题', dataIndex: 'title', ellipsis: true, width: 150 },
  { title: '类型', dataIndex: 'type', width: 80 },
  { title: '地点', dataIndex: 'location', width: 120, ellipsis: true },
  { title: '时间', dataIndex: 'startAt', width: 150 },
  { title: '报名/上限', dataIndex: 'joinCount', width: 90 },
  { title: '费用', dataIndex: 'fee', width: 70 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '操作', dataIndex: 'action', width: 80 },
]

const defaultForm = {
  title: '', typeId: undefined, clubId: undefined, cover: '', description: '',
  location: '', lat: undefined, lng: undefined, startAt: undefined, endAt: undefined,
  signStartAt: undefined, signEndAt: undefined, maxPeople: undefined, fee: undefined,
  refundPolicy: undefined, visibility: 'public', status: 'upcoming', organizer: '', contact: '', sortOrder: 0,
}
const form = reactive<any>({ ...defaultForm })

const fetchTypes = async () => {
  const res = await activityApi.getActivityTypes({ page: 1, pageSize: 100, regionId: userStore.regionId })
  types.value = (res.data as any).list || []
}
const fetchClubs = async () => {
  const res = await clubApi.getClubList({ page: 1, pageSize: 100, regionId: userStore.regionId })
  clubs.value = (res.data as any).list || []
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await activityApi.getActivities({
      page: pagination.current, pageSize: pagination.pageSize,
      regionId: userStore.regionId, keyword: filters.keyword || undefined,
      status: filters.status, typeId: filters.typeId,
    })
    const data = res.data as any
    list.value = data.list || []
    pagination.total = data.total || 0
  } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; fetchList() }

const openCreate = () => {
  editingId.value = ''
  Object.assign(form, defaultForm)
  activeTab.value = 'basic'
  modalVisible.value = true
}

const openEdit = (record: any) => {
  editingId.value = record.id
  Object.assign(form, {
    ...defaultForm,
    ...record,
    startAt: record.startAt ? record.startAt : undefined,
    endAt: record.endAt ? record.endAt : undefined,
    signStartAt: record.signStartAt || undefined,
    signEndAt: record.signEndAt || undefined,
    fee: record.fee ? Number(record.fee) : undefined,
    clubId: record.clubId || undefined,
    typeId: record.typeId || undefined,
  })
  activeTab.value = 'basic'
  modalVisible.value = true
}

const handleSave = async () => {
  if (!form.title) return message.warning('请输入标题')
  if (!form.startAt || !form.endAt) return message.warning('请选择活动时间')
  saving.value = true
  try {
    const data: any = { ...form }
    if (data.startAt) data.startAt = data.startAt.toISOString()
    if (data.endAt) data.endAt = data.endAt.toISOString()
    if (data.signStartAt) data.signStartAt = data.signStartAt.toISOString()
    if (data.signEndAt) data.signEndAt = data.signEndAt.toISOString()
    if (!data.clubId) delete data.clubId
    if (!data.typeId) delete data.typeId

    if (editingId.value) {
      await activityApi.updateActivity(editingId.value, data)
    } else {
      await activityApi.createActivity(data)
    }
    message.success('保存成功')
    modalVisible.value = false
    fetchList()
  } finally { saving.value = false }
}

const changeStatus = async (record: any, newStatus: string) => {
  try {
    await activityApi.updateActivity(record.id, { status: newStatus })
    message.success(`状态已变更`)
    fetchList()
  } catch {}
}

const handleDelete = async (id: string) => {
  try { await activityApi.deleteActivity(id); message.success('已删除'); fetchList() } catch {}
}

onMounted(() => { fetchTypes(); fetchClubs(); fetchList() })
</script>

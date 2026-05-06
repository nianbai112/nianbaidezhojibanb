<template>
  <div class="page-container table-page">
    <div class="table-toolbar">
      <div class="page-title">评选项目管理</div>
      <a-space>
        <a-input-search v-model:value="keyword" placeholder="搜索名称..." style="width:200px" @search="fetchList" allow-clear />
        <a-select v-model:value="filterStatus" placeholder="状态" style="width:110px" allow-clear @change="fetchList">
          <a-select-option value="draft">草稿</a-select-option>
          <a-select-option value="active">征集中</a-select-option>
          <a-select-option value="voting">投票中</a-select-option>
          <a-select-option value="ended">已结束</a-select-option>
        </a-select>
        <a-button type="primary" @click="handleAdd">新建评选</a-button>
      </a-space>
    </div>

    <div class="table-container">
      <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'cover'">
            <a-image v-if="record.cover" :src="record.cover" :width="60" :height="40" style="object-fit:cover;border-radius:4px;" />
            <span v-else class="text-muted">-</span>
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <a-tag :color="statusColorMap[record.status]">{{ statusMap[record.status] || record.status }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'entryCount'">
            {{ record._count?.entries ?? 0 }} 件
          </template>
          <template v-else-if="column.dataIndex === 'duration'">
            <span style="font-size:12px">
              {{ record.startAt ? dayjs(record.startAt).format('MM-DD') : '...' }} ~ {{ record.endAt ? dayjs(record.endAt).format('MM-DD') : '...' }}
            </span>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-space>
              <a @click="handleEdit(record)">编辑</a>
              <a-button v-if="record.status === 'draft'" size="small" type="primary" ghost @click="changeStatus(record, 'active')">发布</a-button>
              <a-button v-if="record.status === 'active'" size="small" type="primary" ghost @click="changeStatus(record, 'voting')">开始投票</a-button>
              <a-button v-if="record.status === 'voting'" size="small" @click="changeStatus(record, 'ended')">结束</a-button>
              <a @click="$router.push('/photo-contest/stats?contestId=' + record.id)">统计</a>
              <a @click="$router.push('/photo-contest/entries?contestId=' + record.id)">作品</a>
              <a-popconfirm title="确定删除？" @confirm="handleDelete(record.id)">
                <a class="text-danger">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <a-modal v-model:open="visible" :title="editingId ? '编辑评选' : '新建评选'" @ok="handleSave" :confirmLoading="saving" width="720px" :ok-text="editingId ? '保存' : '创建'">
      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="basic" tab="基本信息">
          <a-form :model="form" :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
            <a-form-item label="评选标题" required>
              <a-input v-model:value="form.title" placeholder="如：校园摄影大赛" />
            </a-form-item>
            <a-form-item label="简介">
              <a-textarea v-model:value="form.description" :rows="3" placeholder="评选活动简介" />
            </a-form-item>
            <a-form-item label="封面图">
              <a-input v-model:value="form.cover" placeholder="封面图URL" />
            </a-form-item>
            <a-form-item label="状态">
              <a-select v-model:value="form.status">
                <a-select-option value="draft">草稿</a-select-option>
                <a-select-option value="active">征集中</a-select-option>
                <a-select-option value="voting">投票中</a-select-option>
                <a-select-option value="ended">已结束</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item label="征集截止时间">
              <a-date-picker v-model:value="form.endAt" show-time style="width:100%" placeholder="作品提交截止时间" />
            </a-form-item>
            <a-form-item label="投票截止时间">
              <a-date-picker v-model:value="form.voteEndAt" show-time style="width:100%" placeholder="投票截止时间" />
            </a-form-item>
          </a-form>
        </a-tab-pane>
        <a-tab-pane key="vote" tab="投票规则">
          <a-form :model="form" :label-col="{ span: 7 }" :wrapper-col="{ span: 15 }">
            <a-form-item label="每人最多投票数">
              <a-input-number v-model:value="form.maxVotesPerUser" :min="1" style="width:100%" />
            </a-form-item>
            <a-form-item label="每日最多投票数">
              <a-input-number v-model:value="form.maxVotesPerDay" :min="1" style="width:100%" placeholder="留空则不限制" />
            </a-form-item>
            <a-form-item label="每作品最多投票数">
              <a-input-number v-model:value="form.maxVotesPerPhoto" :min="1" style="width:100%" />
            </a-form-item>
            <a-form-item label="允许给自己投票">
              <a-switch v-model:checked="form.allowSelfVote" />
            </a-form-item>
            <a-form-item label="允许匿名投票">
              <a-switch v-model:checked="form.allowAnonymousVote" />
            </a-form-item>
            <a-form-item label="仅圈子成员参与">
              <a-switch v-model:checked="form.requireCircleMember" />
            </a-form-item>
          </a-form>
        </a-tab-pane>
        <a-tab-pane key="reward" tab="奖励设置">
          <a-form :model="form" :label-col="{ span: 7 }" :wrapper-col="{ span: 15 }">
            <a-form-item label="启用奖励">
              <a-switch v-model:checked="form.rewardEnabled" />
            </a-form-item>
            <a-form-item label="奖励类型">
              <a-select v-model:value="form.rewardType" :disabled="!form.rewardEnabled">
                <a-select-option value="score">积分</a-select-option>
                <a-select-option value="balance">余额</a-select-option>
                <a-select-option value="coupon">优惠券</a-select-option>
                <a-select-option value="manual">手动发放</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item label="备注">
              <a-textarea v-model:value="form.adminNote" :rows="2" placeholder="管理员内部备注" />
            </a-form-item>
          </a-form>
        </a-tab-pane>
      </a-tabs>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { photoContestApi } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const editingId = ref('')
const activeTab = ref('basic')
const keyword = ref('')
const filterStatus = ref<string | undefined>()
const list = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const statusMap: Record<string, string> = { draft: '草稿', active: '征集中', voting: '投票中', ended: '已结束' }
const statusColorMap: Record<string, string> = { draft: 'default', active: 'blue', voting: 'orange', ended: 'green' }

const columns = [
  { title: '封面', dataIndex: 'cover', width: 80 },
  { title: '标题', dataIndex: 'title', width: 200 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '作品数', dataIndex: 'entryCount', width: 80 },
  { title: '每人投票数', dataIndex: 'maxVotesPerUser', width: 100 },
  { title: '活动时间', dataIndex: 'duration', width: 150 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 280 },
]

const defaultForm = {
  title: '', description: '', cover: '', status: 'draft', endAt: null, voteEndAt: null,
  maxVotesPerUser: 3, maxVotesPerDay: null, maxVotesPerPhoto: 1,
  allowSelfVote: false, allowAnonymousVote: false, requireCircleMember: false,
  rewardEnabled: false, rewardType: null, adminNote: '',
}
const form = reactive({ ...defaultForm })

const fetchList = async () => {
  loading.value = true
  try {
    const res = await photoContestApi.getContests({
      page: pagination.current,
      pageSize: pagination.pageSize,
      regionId: userStore.regionId,
      status: filterStatus.value,
      keyword: keyword.value || undefined,
    })
    list.value = res.data.list
    pagination.total = res.data.total
  } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; fetchList() }

const handleAdd = () => {
  editingId.value = ''
  activeTab.value = 'basic'
  Object.assign(form, { ...defaultForm })
  visible.value = true
}

const handleEdit = (r: any) => {
  editingId.value = r.id
  activeTab.value = 'basic'
  Object.keys(defaultForm).forEach((k) => (form as any)[k] = r[k] !== undefined ? r[k] : (defaultForm as any)[k])
  visible.value = true
}

const handleSave = async () => {
  if (!form.title) return message.warning('请填写评选标题')
  saving.value = true
  try {
    const data = {
      ...form,
      regionId: userStore.regionId,
      maxVotesPerDay: form.maxVotesPerDay || null,
    }
    if (editingId.value) {
      await photoContestApi.updateContest(editingId.value, data)
    } else {
      await photoContestApi.createContest(data)
    }
    message.success('保存成功')
    visible.value = false
    fetchList()
  } finally { saving.value = false }
}

const changeStatus = async (record: any, newStatus: string) => {
  try {
    await photoContestApi.updateContest(record.id, { status: newStatus })
    message.success(`状态已变更为 ${statusMap[newStatus]}`)
    fetchList()
  } catch {}
}

const handleDelete = async (id: string) => {
  try { await photoContestApi.deleteContest(id); message.success('已删除'); fetchList() } catch {}
}

onMounted(() => fetchList())
</script>

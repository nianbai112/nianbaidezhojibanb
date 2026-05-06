<template>
  <div class="page-container">
    <!-- 统计卡片 -->
    <a-row :gutter="16" style="margin-bottom:16px">
      <a-col :span="8">
        <a-card>
          <a-statistic title="总奖励金额" :value="stats.totalRewardAmount" :precision="2" :value-style="{ color: '#E6A23C' }">
            <template #suffix>元</template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card>
          <a-statistic title="成功发放" :value="stats.successInvites" :value-style="{ color: '#67C23A' }" />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card>
          <a-statistic title="失败记录" :value="stats.failedInvites" :value-style="{ color: '#F56C6C' }" />
        </a-card>
      </a-col>
    </a-row>

    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="f.userId" placeholder="用户ID" allow-clear style="width:180px" />
      <a-select v-model:value="f.type" placeholder="类型" allow-clear style="width:120px">
        <a-select-option value="INVITER">邀请奖励</a-select-option>
        <a-select-option value="INVITEE">注册奖励</a-select-option>
      </a-select>
      <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="PENDING">待发放</a-select-option>
        <a-select-option value="SUCCESS">已发放</a-select-option>
        <a-select-option value="FAILED">失败</a-select-option>
      </a-select>
      <a-range-picker v-model:value="f.dateRange" style="width:240px" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header">
        <span class="page-title">奖励记录</span>
      </div>
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #user="{ record }">
          <a-space>
            <a-avatar v-if="record.user?.avatar" :src="record.user.avatar" :size="28" />
            <a-avatar v-else :size="28">{{ record.user?.nickname?.charAt(0) || '?' }}</a-avatar>
            <span>{{ record.user?.nickname || record.userId }}</span>
          </a-space>
        </template>
        <template #type="{ record }">
          <a-tag :color="record.type === 'INVITER' ? 'blue' : 'orange'">
            {{ record.type === 'INVITER' ? '邀请奖励' : '注册奖励' }}
          </a-tag>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'SUCCESS' ? 'green' : record.status === 'FAILED' ? 'red' : 'orange'">
            {{ record.status === 'SUCCESS' ? '已发放' : record.status === 'FAILED' ? '失败' : '待发放' }}
          </a-tag>
        </template>
        <template #failedReason="{ record }">
          <span :style="{ color: '#ff4d4f' }">{{ record.failedReason || '-' }}</span>
        </template>
        <template #action="{ record }">
          <a-popconfirm v-if="record.status !== 'SUCCESS'" title="确定补发该奖励吗？" @confirm="onRetry(record)">
            <a style="color:#409EFF">补发</a>
          </a-popconfirm>
          <span v-else style="color:#ccc">-</span>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { marketingApi } from '@/api/marketing'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import dayjs from 'dayjs'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ userId: '', type: undefined as string | undefined, status: undefined as string | undefined, dateRange: null as any, startDate: '', endDate: '' })
const stats = ref({ totalRewardAmount: 0, successInvites: 0, failedInvites: 0 })

const cols = [
  { title: 'ID', dataIndex: 'id', width: 180, ellipsis: true },
  { title: '用户', dataIndex: 'userId', width: 160, slot: 'user' },
  { title: '关联邀请', dataIndex: ['invite', 'id'], width: 180, ellipsis: true },
  { title: '类型', dataIndex: 'type', width: 90, slot: 'type' },
  { title: '金额', dataIndex: 'amount', width: 90 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '失败原因', dataIndex: 'failedReason', width: 150, slot: 'failedReason' },
  { title: '交易流水', dataIndex: 'relatedTransactionId', width: 180, ellipsis: true },
  { title: '时间', dataIndex: 'createdAt', width: 170 },
  { title: '操作', dataIndex: 'action', width: 70, slot: 'action' },
]

async function fetchData() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.userId) params.userId = f.userId
    if (f.type) params.type = f.type
    if (f.status) params.status = f.status
    if (f.dateRange) {
      params.startDate = dayjs(f.dateRange[0]).format('YYYY-MM-DD')
      params.endDate = dayjs(f.dateRange[1]).format('YYYY-MM-DD')
    }
    const res = await marketingApi.getShareRewardList(params)
    list.value = res.data.data?.list || []
    t.value = res.data.data?.total || 0
  } catch { /* handled */ }
  finally { ld.value = false }
}

async function loadStats() {
  try {
    const res = await marketingApi.getShareStatsOverview()
    stats.value = res.data.data!
  } catch { /* handled */ }
}

function onSearch() { p.value = 1; fetchData() }
function onReset() { f.userId = ''; f.type = undefined; f.status = undefined; f.dateRange = null; onSearch() }

async function onRetry(r: any) {
  try {
    await marketingApi.retryShareReward(r.id)
    message.success('补发成功')
    fetchData()
    loadStats()
  } catch { /* handled */ }
}

loadStats()
fetchData()
</script>

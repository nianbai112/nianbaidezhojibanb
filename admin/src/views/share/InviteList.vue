<template>
  <div class="page-container">
    <!-- 统计卡片 -->
    <a-row :gutter="16" style="margin-bottom:16px">
      <a-col :span="6">
        <a-card>
          <a-statistic title="总邀请数" :value="stats.totalInvites" :value-style="{ color: '#409EFF' }" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="今日邀请" :value="stats.todayInvites" :value-style="{ color: '#67C23A' }" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="成功邀请" :value="stats.successInvites" :value-style="{ color: '#67C23A' }" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="失败邀请" :value="stats.failedInvites" :value-style="{ color: '#F56C6C' }" />
        </a-card>
      </a-col>
    </a-row>

    <!-- 列表 -->
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="f.inviterId" placeholder="邀请人ID" allow-clear style="width:180px" />
      <a-input v-model:value="f.inviteeId" placeholder="被邀请人ID" allow-clear style="width:180px" />
      <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="PENDING">待处理</a-select-option>
        <a-select-option value="SUCCESS">成功</a-select-option>
        <a-select-option value="FAILED">失败</a-select-option>
      </a-select>
      <a-range-picker v-model:value="f.dateRange" style="width:240px" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header">
        <span class="page-title">邀请记录</span>
      </div>
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #inviter="{ record }">
          <a-space>
            <a-avatar v-if="record.inviter?.avatar" :src="record.inviter.avatar" :size="28" />
            <a-avatar v-else :size="28">{{ record.inviter?.nickname?.charAt(0) || '?' }}</a-avatar>
            <span>{{ record.inviter?.nickname || record.inviterId }}</span>
          </a-space>
        </template>
        <template #invitee="{ record }">
          <a-space>
            <a-avatar v-if="record.invitee?.avatar" :src="record.invitee.avatar" :size="28" />
            <a-avatar v-else :size="28">{{ record.invitee?.nickname?.charAt(0) || '?' }}</a-avatar>
            <span>{{ record.invitee?.nickname || record.inviteeId }}</span>
          </a-space>
        </template>
        <template #isNewUser="{ record }">
          <a-tag :color="record.isNewUser ? 'orange' : 'default'">{{ record.isNewUser ? '新用户' : '老用户' }}</a-tag>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'SUCCESS' ? 'green' : record.status === 'FAILED' ? 'red' : 'orange'">
            {{ record.status === 'SUCCESS' ? '成功' : record.status === 'FAILED' ? '失败' : '待处理' }}
          </a-tag>
        </template>
        <template #failedReason="{ record }">
          <span :style="{ color: '#ff4d4f' }">{{ record.failedReason || '-' }}</span>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { marketingApi } from '@/api/marketing'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import dayjs from 'dayjs'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ inviterId: '', inviteeId: '', status: undefined as string | undefined, dateRange: null as any, startDate: '', endDate: '' })
const stats = ref({ totalInvites: 0, todayInvites: 0, successInvites: 0, failedInvites: 0 })

const cols = [
  { title: 'ID', dataIndex: 'id', width: 180, ellipsis: true },
  { title: '邀请人', dataIndex: 'inviterId', width: 160, slot: 'inviter' },
  { title: '被邀请人', dataIndex: 'inviteeId', width: 160, slot: 'invitee' },
  { title: '新用户', dataIndex: 'isNewUser', width: 70, slot: 'isNewUser' },
  { title: '邀请人奖励', dataIndex: 'rewardAmount', width: 90 },
  { title: '被邀人奖励', dataIndex: 'inviteeRewardAmount', width: 90 },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '失败原因', dataIndex: 'failedReason', width: 150, slot: 'failedReason' },
  { title: '时间', dataIndex: 'createdAt', width: 170 },
]

async function fetchData() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.inviterId) params.inviterId = f.inviterId
    if (f.inviteeId) params.inviteeId = f.inviteeId
    if (f.status) params.status = f.status
    if (f.dateRange) {
      params.startDate = dayjs(f.dateRange[0]).format('YYYY-MM-DD')
      params.endDate = dayjs(f.dateRange[1]).format('YYYY-MM-DD')
    }
    const res = await marketingApi.getShareInviteList(params)
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
function onReset() { f.inviterId = ''; f.inviteeId = ''; f.status = undefined; f.dateRange = null; onSearch() }

loadStats()
fetchData()
</script>

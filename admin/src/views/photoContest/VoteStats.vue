<template>
  <div class="page-container">
    <div class="page-title mb-4">投票统计</div>

    <a-row :gutter="12" class="mb-4">
      <a-col :span="12">
        <a-select v-model:value="contestId" placeholder="请选择评选项目查看统计" style="width:100%" @change="fetchStats">
          <a-select-option v-for="c in contests" :key="c.id" :value="c.id">{{ c.title }}</a-select-option>
        </a-select>
      </a-col>
      <a-col :span="4"><a-statistic title="累计总票数" :value="stats.totalVotes || 0" /></a-col>
      <a-col :span="4"><a-statistic title="参赛作品" :value="stats.entries?.length || 0" /></a-col>
      <a-col :span="4">
        <a-space>
          <a-radio-group v-model:value="viewMode" size="small">
            <a-radio-button value="card"><UnorderedListOutlined /></a-radio-button>
            <a-radio-button value="table"><TableOutlined /></a-radio-button>
          </a-radio-group>
          <a-button size="small" disabled>导出Excel</a-button>
        </a-space>
      </a-col>
    </a-row>

    <a-spin :spinning="loading">
      <!-- Card View -->
      <a-row v-if="viewMode === 'card' && stats.entries?.length" :gutter="16">
        <a-col v-for="(entry, index) in stats.entries" :key="entry.id" :span="8" class="mb-4">
          <a-card :body-style="{ padding: '12px' }">
            <div style="display:flex;gap:12px;align-items:flex-start">
              <div style="flex-shrink:0">
                <a-badge :count="index + 1" :color="index === 0 ? 'gold' : index === 1 ? '#999' : index === 2 ? '#cd7f32' : 'blue'">
                  <a-image :src="entry.imageUrl" :width="80" :height="80" style="object-fit:cover;border-radius:6px" />
                </a-badge>
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ entry.title || '无标题' }}</div>
                <div style="font-size:12px;color:#999;margin-top:4px">{{ entry.user?.nickname || '-' }}</div>
                <div style="margin-top:8px">
                  <a-progress :percent="stats.totalVotes ? Math.round((entry.voteCount / stats.totalVotes) * 100) : 0"
                    size="small" :format="() => `${entry.voteCount} 票`" />
                </div>
                <div v-if="entry.ratingsAvg > 0" style="font-size:12px;color:#faad14;margin-top:4px">
                  <StarFilled /> {{ entry.ratingsAvg.toFixed(1) }}
                </div>
              </div>
            </div>
          </a-card>
        </a-col>
      </a-row>

      <!-- Table View -->
      <a-table v-if="viewMode === 'table' && stats.entries?.length" :dataSource="stats.entries" :columns="voteColumns"
        :pagination="false" rowKey="id" size="small">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.dataIndex === 'rank'">
            <a-tag :color="index === 0 ? 'gold' : index === 1 ? 'gray' : index === 2 ? '#cd7f32' : 'default'">{{ index + 1 }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'image'">
            <a-image :src="record.imageUrl" :width="50" :height="40" style="object-fit:cover;border-radius:4px" />
          </template>
          <template v-else-if="column.dataIndex === 'votePercent'">
            <a-progress :percent="stats.totalVotes ? Math.round((record.voteCount / stats.totalVotes) * 100) : 0" size="small" />
          </template>
        </template>
      </a-table>

      <a-empty v-if="contestId && !stats.entries?.length && !loading" description="暂无已通过的参赛作品" />
      <a-empty v-if="!contestId" description="请先选择评选项目" />
    </a-spin>

    <!-- Winners Section -->
    <div v-if="contestId" style="margin-top:32px">
      <a-divider>获奖名单</a-divider>
      <a-button type="primary" size="small" class="mb-3" @click="$router.push('/photo-contest/winners?contestId=' + contestId)">管理获奖名单</a-button>
      <a-table v-if="winners.length" :dataSource="winners" :columns="winnerColumns" rowKey="id" size="small" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'rank'">
            <a-tag :color="record.winnerRank === 1 ? 'gold' : record.winnerRank === 2 ? '#999' : record.winnerRank === 3 ? '#cd7f32' : 'blue'">
              第{{ record.winnerRank }}名
            </a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'rewardStatus'">
            <a-tag :color="record.rewardStatus === 'issued' ? 'success' : record.rewardStatus === 'failed' ? 'error' : 'default'">
              {{ rewardStatusMap[record.rewardStatus] || record.rewardStatus }}
            </a-tag>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { StarFilled, UnorderedListOutlined, TableOutlined } from '@ant-design/icons-vue'
import { photoContestApi } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const route = useRoute()
const loading = ref(false)
const viewMode = ref('card')
const contests = ref<any[]>([])
const contestId = ref<string | undefined>(route.query.contestId as string || undefined)
const stats = ref<any>({ totalVotes: 0, entries: [] })
const winners = ref<any[]>([])

const rewardStatusMap: Record<string, string> = { pending: '待发放', issued: '已发放', failed: '发放失败' }

const voteColumns = [
  { title: '排名', dataIndex: 'rank', width: 60 },
  { title: '照片', dataIndex: 'image', width: 70 },
  { title: '标题', dataIndex: 'title' },
  { title: '用户', dataIndex: 'user', width: 120 },
  { title: '票数', dataIndex: 'voteCount', width: 80, sorter: true },
  { title: '得票率', dataIndex: 'votePercent', width: 150 },
  { title: '评分', dataIndex: 'ratingsAvg', width: 70 },
]

const winnerColumns = [
  { title: '排名', dataIndex: 'rank', width: 80 },
  { title: '作品', dataIndex: 'entry' },
  { title: '奖品', dataIndex: 'prizeName', width: 120 },
  { title: '发放状态', dataIndex: 'rewardStatus', width: 100 },
]

const fetchContests = async () => {
  const res = await photoContestApi.getContests({ page: 1, pageSize: 100, regionId: userStore.regionId })
  contests.value = res.data.list
}

const fetchStats = async () => {
  if (!contestId.value) return
  loading.value = true
  try {
    const [statsRes, winnersRes] = await Promise.all([
      photoContestApi.getVoteStats(contestId.value),
      photoContestApi.getWinners(contestId.value),
    ])
    stats.value = statsRes.data
    winners.value = (winnersRes.data as unknown as any[]) || []
  } finally { loading.value = false }
}

onMounted(() => { fetchContests(); if (contestId.value) fetchStats() })
</script>

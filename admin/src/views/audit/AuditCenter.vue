<template>
  <div class="page-container">
    <!-- 今日统计卡片 -->
    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :span="6">
        <a-card size="small">
          <a-statistic
            title="今日待审核"
            :value="stats.todayPending"
            :value-style="{ color: '#f59e0b' }"
          >
            <template #prefix>
              <clock-circle-outlined />
            </template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small">
          <a-statistic
            title="今日已通过"
            :value="stats.todayApproved"
            :value-style="{ color: '#10b981' }"
          >
            <template #prefix>
              <check-circle-outlined />
            </template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small">
          <a-statistic
            title="今日已拒绝"
            :value="stats.todayRejected"
            :value-style="{ color: '#ef4444' }"
          >
            <template #prefix>
              <close-circle-outlined />
            </template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small">
          <a-statistic
            title="逾期未审核"
            :value="stats.overdueCount"
            :value-style="{ color: stats.overdueCount > 0 ? '#ef4444' : '#6b7280' }"
          >
            <template #prefix>
              <warning-outlined />
            </template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <!-- 各类型待审统计 -->
    <a-row :gutter="16">
      <a-col :span="4" v-for="item in pendingCards" :key="item.key">
        <a-card
          size="small"
          :hoverable="item.count > 0"
          class="pending-type-card"
          @click="item.count > 0 && $router.push(item.route)"
        >
          <div class="pending-type-content">
            <div class="pending-type-icon">
              <component :is="item.icon" />
            </div>
            <div class="pending-type-info">
              <div class="pending-type-label">{{ item.label }}</div>
              <div class="pending-type-count" :class="{ 'has-count': item.count > 0 }">
                {{ item.count }}
              </div>
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import {
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  WarningOutlined, FileTextOutlined, MessageOutlined,
  ShopOutlined, DollarOutlined, EnvironmentOutlined, AlertOutlined,
} from '@ant-design/icons-vue'
import { auditApi } from '@/api/audit'
import type { AuditStats } from '@/types/audit'

const stats = reactive<AuditStats>({
  todayPending: 0,
  todayApproved: 0,
  todayRejected: 0,
  overdueCount: 0,
  postPending: 0,
  commentPending: 0,
  merchantPending: 0,
  withdrawPending: 0,
  cityAgentPending: 0,
  reportPending: 0,
})

const loading = ref(false)

const pendingCards = ref([
  { key: 'posts', label: '待审核帖子', count: 0, route: '/audit/posts', icon: FileTextOutlined },
  { key: 'comments', label: '待审核评论', count: 0, route: '/audit/comments', icon: MessageOutlined },
  { key: 'merchants', label: '待审核商家', count: 0, route: '/audit/merchants', icon: ShopOutlined },
  { key: 'withdraws', label: '待审核提现', count: 0, route: '/audit/withdraws', icon: DollarOutlined },
  { key: 'cityAgents', label: '待审核代理', count: 0, route: '/audit/city-agents', icon: EnvironmentOutlined },
  { key: 'reports', label: '待处理举报', count: 0, route: '/audit/reports', icon: AlertOutlined },
])

async function fetchStats() {
  loading.value = true
  try {
    const [statsRes, countsRes] = await Promise.all([
      auditApi.getStats(),
      auditApi.getPendingCounts(),
    ])
    const statsData = statsRes.data?.data || statsRes.data
    if (statsData) {
      stats.todayPending = statsData.todayPending ?? 0
      stats.todayApproved = statsData.todayApproved ?? 0
      stats.todayRejected = statsData.todayRejected ?? 0
      stats.overdueCount = statsData.overdueCount ?? 0
    }
    const countsData = countsRes.data?.data || countsRes.data
    if (countsData) {
      pendingCards.value[0].count = countsData.posts ?? 0
      pendingCards.value[1].count = countsData.comments ?? 0
      pendingCards.value[2].count = countsData.merchants ?? 0
      pendingCards.value[3].count = countsData.withdraws ?? 0
      pendingCards.value[4].count = countsData.cityAgents ?? 0
      pendingCards.value[5].count = countsData.reports ?? 0
    }
  } catch {
    // handled by interceptor
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchStats()
})
</script>

<style lang="less" scoped>
.pending-type-card {
  cursor: pointer;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  :deep(.ant-card-body) {
    padding: 16px;
  }
}

.pending-type-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pending-type-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #6b7280;
}

.pending-type-info {
  flex: 1;
}

.pending-type-label {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 2px;
}

.pending-type-count {
  font-size: 22px;
  font-weight: 700;
  color: #d1d5db;

  &.has-count {
    color: #ef4444;
  }
}
</style>

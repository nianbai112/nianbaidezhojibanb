<template>
  <div class="page-shell">
    <PageHeader title="营销中心" />

    <div class="dashboard-grid">
      <div class="nav-tile" v-for="stat in stats" :key="stat.label" @click="$router.push(stat.route)">
        <el-icon :size="24" class="nav-tile-icon"><component :is="stat.icon" /></el-icon>
        <div class="nav-tile-info">
          <div class="nav-tile-label">{{ stat.label }}</div>
          <div class="nav-tile-desc">{{ stat.desc }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'

const stats = [
  { label: '优惠券管理', desc: '创建和管理优惠券', icon: 'Ticket', route: '/marketing/coupons' },
  { label: '签到配置', desc: '配置签到奖励规则', icon: 'Calendar', route: '/marketing/sign' },
  { label: '徽章配置', desc: '创建和管理徽章', icon: 'Medal', route: '/marketing/badges' },
  { label: '活动管理', desc: '创建和管理活动', icon: 'Flag', route: '/marketing/activities' },
  { label: '团购管理', desc: '创建和管理团购', icon: 'ShoppingCart', route: '/marketing/group-buys' },
  { label: '首页权益卡片', desc: '配置首页固定权益卡片', icon: 'Monitor', route: '/marketing/popups' },
  { label: '系统通知', desc: '发送系统通知', icon: 'Bell', route: '/marketing/notifications' },
  { label: '分享有礼', desc: '配置分享奖励', icon: 'Share', route: '/marketing/share' },
]
</script>

<style scoped>
.dashboard-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.nav-tile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: #fff;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s;
}
.nav-tile:hover { transform: translateY(-2px); box-shadow: var(--mx-shadow); }
.nav-tile-icon { color: var(--mx-primary); flex-shrink: 0; }
.nav-tile-label { font-size: 15px; font-weight: 600; }
.nav-tile-desc { font-size: 13px; color: var(--mx-muted); margin-top: 4px; }
</style>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>营销中心</h2>
    </div>

    <div class="dashboard-grid">
      <div class="stat-card glass-card" v-for="stat in stats" :key="stat.label" @click="$router.push(stat.route)">
        <el-icon :size="32" :style="{ color: stat.color }"><component :is="stat.icon" /></el-icon>
        <div class="stat-info">
          <div class="stat-label">{{ stat.label }}</div>
          <div class="stat-desc">{{ stat.desc }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Ticket, Calendar, Medal, Flag, ShoppingCart, Monitor, Bell, Share } from '@element-plus/icons-vue'

const stats = [
  { label: '优惠券管理', desc: '创建和管理优惠券', icon: 'Ticket', color: '#409eff', route: '/marketing/coupons' },
  { label: '签到配置', desc: '配置签到奖励规则', icon: 'Calendar', color: '#67c23a', route: '/marketing/sign' },
  { label: '徽章配置', desc: '创建和管理徽章', icon: 'Medal', color: '#e6a23c', route: '/marketing/badges' },
  { label: '活动管理', desc: '创建和管理活动', icon: 'Flag', color: '#f56c6c', route: '/marketing/activities' },
  { label: '团购管理', desc: '创建和管理团购', icon: 'ShoppingCart', color: '#909399', route: '/marketing/group-buys' },
  { label: '弹窗广告', desc: '配置弹窗广告', icon: 'Monitor', color: '#409eff', route: '/marketing/popups' },
  { label: '系统通知', desc: '发送系统通知', icon: 'Bell', color: '#67c23a', route: '/marketing/notifications' },
  { label: '分享有礼', desc: '配置分享奖励', icon: 'Share', color: '#e6a23c', route: '/marketing/share-invite' },
]
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { margin-bottom: 24px; }
.dashboard-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.stat-card { display: flex; align-items: center; gap: 16px; padding: 24px; cursor: pointer; transition: all 0.2s; }
.stat-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
.stat-label { font-size: 16px; font-weight: 600; }
.stat-desc { font-size: 14px; color: #909399; margin-top: 4px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; }
</style>

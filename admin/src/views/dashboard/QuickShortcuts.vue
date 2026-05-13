<template>
  <div class="page-shell">
    <PageHeader title="快捷操作" subtitle="常用功能快捷入口" icon="Operation" />
    <div class="shortcuts-grid">
      <div class="shortcut-card glass-card" v-for="item in shortcuts" :key="item.title" @click="$router.push(item.route)">
        <el-icon :size="24" :style="{ color: item.color }"><component :is="item.icon" /></el-icon>
        <span>{{ item.title }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import { Location, User, Shop, Document, Money, Van, Bell, Setting } from '@element-plus/icons-vue'

const shortcuts = [
  { title: '区域管理', icon: 'Location', color: '#3b82f6', route: '/region/list' },
  { title: '用户管理', icon: 'User', color: '#10b981', route: '/user/list' },
  { title: '商家管理', icon: 'Shop', color: '#f59e0b', route: '/merchant/list' },
  { title: '内容审核', icon: 'Document', color: '#8b5cf6', route: '/content/audit' },
  { title: '财务中心', icon: 'Money', color: '#ef4444', route: '/finance/overview' },
  { title: '跑腿配送', icon: 'Van', color: '#06b6d4', route: '/delivery/orders' },
  { title: '系统通知', icon: 'Bell', color: '#ec4899', route: '/marketing/notifications' },
  { title: '系统设置', icon: 'Setting', color: '#64748b', route: '/system/settings' },
]
</script>

<style scoped>
.page-shell { padding: 24px; }
.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.shortcut-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 16px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  text-align: center;
}
.shortcut-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}
.shortcut-card span {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}
</style>

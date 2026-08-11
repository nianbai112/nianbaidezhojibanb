<template>
  <div class="page-shell">
    <PageHeader title="外卖工作台" subtitle="只显示当前需要处理的外卖事项" icon="DataLine">
      <template #actions><el-button :loading="loading" @click="loadTodos">刷新</el-button></template>
    </PageHeader>

    <el-alert class="start-tip" type="info" :closable="false" show-icon>
      <template #title>新区域开通顺序：设置外卖区域规则 → 审核商家 → 配置商品 → 关注订单履约。</template>
    </el-alert>

    <div class="todo-grid" v-loading="loading">
      <article v-for="item in todos" :key="item.key" class="todo-card glass-card">
        <div class="todo-icon" :style="{ background: item.color }"><el-icon><component :is="item.icon" /></el-icon></div>
        <div class="todo-body">
          <div class="todo-title">{{ item.title }}</div>
          <div class="todo-desc">{{ item.description }}</div>
          <strong>{{ item.count }}</strong><span> 条待处理</span>
        </div>
        <el-button type="primary" plain :disabled="item.count === 0" @click="$router.push(item.route)">处理</el-button>
      </article>
      <EmptyState v-if="!loading && todos.every((item) => item.count === 0)" class="todo-empty" description="外卖运营正常，暂时没有待处理事项" />
    </div>

    <div class="quick-links glass-card">
      <span>常用操作</span>
      <el-button text type="primary" @click="$router.push('/merchant/list')">管理商家</el-button>
      <el-button text type="primary" @click="$router.push('/merchant/products')">管理商品</el-button>
      <el-button text type="primary" @click="$router.push('/merchant/orders')">查看履约</el-button>
      <el-button text type="primary" @click="$router.push('/merchant/region-settings')">外卖区域规则</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { request } from '@/api/request'

const loading = ref(false)
const todos = ref([
  { key: 'pendingMerchants', title: '商家入驻审核', description: '确认资质与营业信息后再开放营业', count: 0, icon: 'Shop', color: '#10b981', route: '/merchant/list?auditStatus=pending' },
  { key: 'takeawayFulfillmentAlerts', title: '履约异常', description: '商家未接单、无人取餐或配送超时', count: 0, icon: 'Warning', color: '#f97316', route: '/merchant/orders?alert=fulfillment' },
  { key: 'pendingRefunds', title: '售后待处理', description: '先看订单与履约证据，再处理退款申请', count: 0, icon: 'Money', color: '#f59e0b', route: '/merchant/refunds' },
  { key: 'pendingOrderAppeals', title: '配送申诉', description: '查看用户描述与送达证据后再做处置', count: 0, icon: 'Warning', color: '#dc2626', route: '/order/appeals?status=pending' },
])

async function loadTodos() {
  loading.value = true
  try {
    const data: Record<string, unknown> = await request.get('/admin/dashboard/todos')
    todos.value.forEach((item) => { item.count = Number(data?.[item.key] || 0) })
  } catch (error: any) {
    ElMessage.error(error?.message || '加载外卖待办失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadTodos)
</script>

<style scoped>
.page-shell { padding: 20px 22px 28px; }
.start-tip { margin: 16px 0; }
.todo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 16px; min-height: 170px; }
.todo-card { display: flex; align-items: center; gap: 14px; padding: 18px; }
.todo-icon { width: 42px; height: 42px; border-radius: 10px; display: grid; place-items: center; color: var(--mx-card); flex: none; }
.todo-body { flex: 1; min-width: 0; }
.todo-title { font-weight: 650; color: var(--mx-text); }
.todo-desc { color: var(--mx-sub); font-size: 12px; margin: 4px 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.todo-body strong { color: var(--mx-text); font-size: 20px; margin-right: 4px; }
.todo-body span { color: var(--mx-sub); font-size: 12px; }
.todo-empty { grid-column: 1 / -1; min-height: 180px; }
.quick-links { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 16px; padding: 12px 18px; }
.quick-links > span { color: var(--mx-sub); font-size: 13px; margin-right: 4px; }
</style>

<template>
  <div class="page-shell">
    <PageHeader title="今日待办" subtitle="来自真实业务表的待处理事项，不再显示演示数字" icon="Calendar">
      <template #actions>
        <el-button :loading="loading" @click="loadTodos">刷新</el-button>
      </template>
    </PageHeader>
    <div class="todos-grid" v-loading="loading">
      <div class="todo-card glass-card" v-for="item in todos" :key="item.title">
        <div class="todo-icon" :style="{ background: item.color }">
          <el-icon><component :is="item.icon" /></el-icon>
        </div>
        <div class="todo-content">
          <div class="todo-title">{{ item.title }}</div>
          <div class="todo-count">{{ item.count }} 条待处理</div>
        </div>
        <el-button type="primary" size="small" :disabled="item.count === 0" @click="$router.push(item.route)">去处理</el-button>
      </div>
      <el-empty v-if="!loading && todos.every(item => item.count === 0)" class="todos-empty" description="当前暂无待处理事项" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const todos = ref([
  { title: '学生认证审核', key: 'pendingCerts', count: 0, icon: 'Checked', color: '#3b82f6', route: '/user/verification' },
  { title: '商家入驻审核', key: 'pendingMerchants', count: 0, icon: 'Shop', color: '#10b981', route: '/merchant/audit' },
  { title: '商品审核', key: 'pendingProducts', count: 0, icon: 'Goods', color: '#0ea5e9', route: '/mall/products' },
  { title: '退款处理', key: 'pendingRefunds', count: 0, icon: 'Money', color: '#f59e0b', route: '/merchant/refunds' },
  { title: '内容待审', key: 'pendingPosts', count: 0, icon: 'Document', color: '#8b5cf6', route: '/content/audit' },
  { title: '评论待审', key: 'pendingComments', count: 0, icon: 'ChatDotRound', color: '#14b8a6', route: '/content/audit' },
  { title: '用户举报', key: 'pendingReports', count: 0, icon: 'Warning', color: '#ec4899', route: '/content/audit' },
  { title: '提现审核', key: 'pendingWithdraws', count: 0, icon: 'Wallet', color: '#ef4444', route: '/finance/withdrawals' },
  { title: '异常订单', key: 'abnormalOrders', count: 0, icon: 'CircleClose', color: '#f97316', route: '/delivery/abnormal' },
])

async function loadTodos() {
  loading.value = true
  try {
    const data: any = await request.get('/admin/dashboard/todos')
    todos.value = todos.value.map(item => ({
      ...item,
      count: Number(data?.[item.key] || 0)
    }))
  } catch (e: any) {
    ElMessage.error(e?.message || '加载待办失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadTodos)
</script>

<style scoped>
.page-shell { padding: 20px 22px 28px; }
.todos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 20px;
  min-height: 180px;
}
.todo-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
}
.todo-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}
.todo-content { flex: 1; }
.todo-title { font-weight: 600; color: #1e293b; }
.todo-count { font-size: 13px; color: #64748b; margin-top: 4px; }
.todos-empty {
  grid-column: 1 / -1;
  min-height: 240px;
}
</style>

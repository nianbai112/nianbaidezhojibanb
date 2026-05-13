<template>
  <div class="page-shell">
    <PageHeader title="异常订单" subtitle="处理异常配送订单" icon="Warning" />
    <div class="filter-bar">
      <el-button type="primary" @click="loadData">刷新</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="orderNo" label="订单号" width="200" show-overflow-tooltip />
      <el-table-column prop="title" label="标题" min-width="150" show-overflow-tooltip />
      <el-table-column prop="user.nickname" label="用户" width="100">
        <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
      </el-table-column>
      <el-table-column prop="price" label="金额" width="100">
        <template #default="{ row }">¥{{ Number(row.price).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag type="danger" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="cancelReason" label="异常原因" width="150" show-overflow-tooltip />
      <el-table-column prop="createdAt" label="下单时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const statusMap: Record<string, string> = { CANCELLED: '已取消', REFUNDING: '退款中', REFUNDED: '已退款' }
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/abnormal-orders', { params: { page: page.value, pageSize: pageSize.value } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

<template>
  <div class="page-shell">
    <PageHeader title="支付订单" subtitle="查看支付订单记录" icon="Tickets" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索订单号" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="成功" value="paid" />
        <el-option label="待支付" value="pending" />
        <el-option label="支付中" value="paying" />
        <el-option label="失败" value="failed" />
        <el-option label="已关闭" value="closed" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="orderNo" label="订单号" width="200" show-overflow-tooltip />
      <el-table-column prop="user.nickname" label="用户" width="120">
        <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
      </el-table-column>
      <el-table-column label="订单类型" width="130">
        <template #default="{ row }">
          <el-tooltip :content="bizTypeTip(row.bizType)" placement="top" :disabled="!bizTypeTip(row.bizType)">
            <el-tag size="small" :type="bizTypeTag(row.bizType)">
              {{ bizTypeLabel(row.bizType) }}
            </el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="amount" label="金额" width="100">
        <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="支付渠道" width="100">
        <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'paid' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'" size="small">
            {{ statusMap[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const statusMap: Record<string, string> = {
  paid: '成功',
  pending: '待支付',
  paying: '支付中',
  failed: '失败',
  closed: '已关闭',
  refunding: '退款中',
  refunded: '已退款',
}
const channelMap: Record<string, string> = {
  wx_pay: '微信支付',
  alipay: '支付宝',
  balance: '余额支付',
  manual: '人工入账',
}
const bizTypeMap: Record<string, { label: string; tag: 'success' | 'warning' | 'info' | 'primary' | 'danger'; tip?: string }> = {
  topup: { label: '笔记置顶', tag: 'warning', tip: '用户购买笔记付费置顶产生的收入' },
  errand_order: { label: '跑腿订单', tag: 'primary', tip: '用户发布跑腿任务后支付的订单' },
  delivery_order: { label: '配送订单', tag: 'primary', tip: '同城或商户配送服务订单' },
  mall_order: { label: '商城订单', tag: 'success', tip: '商城商品交易订单' },
  order: { label: '宿舍小店', tag: 'success', tip: '宿舍小店商品订单' },
  recharge: { label: '余额充值', tag: 'info', tip: '用户向钱包余额充值' },
  group_buy_order: { label: '拼团订单', tag: 'success', tip: '团购或拼团活动订单' },
  second_hand_order: { label: '二手订单', tag: 'info', tip: '二手交易订单' },
  dating_order: { label: '交友订单', tag: 'info', tip: '交友服务相关订单' },
}
const bizTypeMeta = (value: string) => bizTypeMap[value] || { label: value || '未知订单', tag: 'info' as const, tip: value ? `未配置中文名称：${value}` : '' }
const bizTypeLabel = (value: string) => bizTypeMeta(value).label
const bizTypeTag = (value: string) => bizTypeMeta(value).tag
const bizTypeTip = (value: string) => bizTypeMeta(value).tip || ''
const channelLabel = (value: string) => channelMap[value] || value || '-'
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: '' })

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/payment-orders', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '' })
  loadData()
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

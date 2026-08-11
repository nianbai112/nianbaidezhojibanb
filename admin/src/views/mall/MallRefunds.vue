<template>
  <div class="page-shell">
    <PageHeader title="退款售后" />

    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索退款单号/订单号"
        clearable
        style="width: 200px"
        @clear="loadRefunds"
        @keyup.enter="loadRefunds"
      />
      <el-select v-model="filters.status" placeholder="退款状态" clearable style="width: 120px" @change="loadRefunds">
        <el-option label="申请中" value="applying" />
        <el-option label="已同意" value="merchant_approved" />
        <el-option label="退款处理中" value="processing" />
        <el-option label="已拒绝" value="merchant_rejected" />
        <el-option label="已退款" value="refunded" />
        <el-option label="已关闭" value="closed" />
      </el-select>
      <el-button type="primary" @click="loadRefunds">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="refunds" v-loading="loading" border stripe>
      <el-table-column prop="refundNo" label="退款单号" width="180" show-overflow-tooltip />
      <el-table-column label="订单号" width="180">
        <template #default="{ row }">
          {{ row.orderNo || row.order?.orderNo || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="用户" width="100">
        <template #default="{ row }">
          {{ row.order?.User?.nickname || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="refundType" label="退款类型" width="100">
        <template #default="{ row }">
          <el-tag :type="row.refundType === 'refund_only' ? 'warning' : 'danger'" size="small">
            {{ row.refundType === 'refund_only' ? '仅退款' : '退货退款' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="amount" label="退款金额" width="100">
        <template #default="{ row }">
          ¥{{ Number(row.amount).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="退款原因" min-width="150" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
          <el-button v-if="row.status === 'applying'" size="small" type="success" @click="approveRefund(row)">通过</el-button>
          <el-button v-if="row.status === 'applying'" size="small" type="danger" @click="rejectRefund(row)">拒绝</el-button>
          <el-button v-if="['merchant_approved', 'approved'].includes(row.status)" size="small" type="success" @click="finishRefund(row)">发起退款</el-button>
          <el-button v-if="row.status === 'applying'" size="small" @click="closeRefund(row)">取消</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadRefunds"
        @current-change="loadRefunds"
      />
    </div>

    <!-- Detail Dialog -->
    <el-dialog v-model="showDetailDialog" title="退款详情" width="700px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="退款单号">{{ selectedRefund?.refundNo }}</el-descriptions-item>
        <el-descriptions-item label="订单号">{{ selectedRefund?.orderNo || selectedRefund?.order?.orderNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="退款类型">
          {{ selectedRefund?.refundType === 'refund_only' ? '仅退款' : '退货退款' }}
        </el-descriptions-item>
        <el-descriptions-item label="退款金额">¥{{ Number(selectedRefund?.amount || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="退款数量">{{ selectedRefund?.quantity || 1 }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(selectedRefund?.status)">
            {{ getStatusLabel(selectedRefund?.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="退款原因" :span="2">{{ selectedRefund?.reason || '-' }}</el-descriptions-item>
        <el-descriptions-item label="详细描述" :span="2">{{ selectedRefund?.description || '-' }}</el-descriptions-item>
        <el-descriptions-item label="凭证图片" :span="2">
          <div v-if="selectedRefund?.images?.length" class="refund-images">
            <el-image
              v-for="(img, index) in selectedRefund.images"
              :key="index"
              :src="img"
              :preview-src-list="selectedRefund.images"
              style="width: 80px; height: 80px; margin-right: 8px"
              fit="cover"
            />
          </div>
          <span v-else>无</span>
        </el-descriptions-item>
        <el-descriptions-item label="商户回复" :span="2">{{ selectedRefund?.merchantReply || '-' }}</el-descriptions-item>
        <el-descriptions-item label="拒绝原因" :span="2">{{ selectedRefund?.rejectReason || '-' }}</el-descriptions-item>
        <el-descriptions-item label="申请时间" :span="2">{{ formatDate(selectedRefund?.createdAt) }}</el-descriptions-item>
      </el-descriptions>

      <div v-if="selectedRefund?.orderItems?.length" style="margin-top: 16px">
        <h4>订单商品</h4>
        <el-table :data="selectedRefund.orderItems" size="small" border style="margin-top: 8px">
          <el-table-column prop="productName" label="商品名称" min-width="150" />
          <el-table-column prop="skuName" label="规格" width="120" />
          <el-table-column prop="price" label="单价" width="100">
            <template #default="{ row }">¥{{ Number(row.price || 0).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="quantity" label="数量" width="80" />
        </el-table>
      </div>

      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
        <el-button v-if="selectedRefund?.status === 'applying'" type="success" @click="approveRefund(selectedRefund)">通过</el-button>
        <el-button v-if="selectedRefund?.status === 'applying'" type="danger" @click="rejectRefund(selectedRefund)">拒绝</el-button>
        <el-button v-if="['merchant_approved', 'approved'].includes(selectedRefund?.status)" type="success" @click="finishRefund(selectedRefund)">发起退款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'

const loading = ref(false)
const refunds = ref<any[]>([])
const filters = ref({ keyword: '', status: '' })
const pagination = ref({ page: 1, pageSize: 20, total: 0 })
const showDetailDialog = ref(false)
const selectedRefund = ref<any>(null)

const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    applying: 'warning',
    merchant_approved: 'success',
    processing: 'warning',
    merchant_rejected: 'danger',
    refunded: 'success',
    closed: 'info',
  }
  return map[status] || 'info'
}

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    applying: '申请中',
    merchant_approved: '已同意',
    processing: '退款处理中',
    merchant_rejected: '已拒绝',
    refunded: '已退款',
    closed: '已关闭',
  }
  return map[status] || status
}

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const loadRefunds = async () => {
  loading.value = true
  try {
    const res = await request.get('/mall/refunds/admin/list', {
      params: {
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
        ...filters.value,
      },
    })
    const data = (res as any).data || res
    refunds.value = data.list || []
    pagination.value.total = data.total || 0
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.value = { keyword: '', status: '' }
  loadRefunds()
}

const viewDetail = async (refund: any) => {
  try {
    const res = await request.get(`/mall/refunds/admin/${refund.id}`)
    selectedRefund.value = (res as any).data || res
    showDetailDialog.value = true
  } catch (error) {
    console.error('获取退款详情失败:', error)
    selectedRefund.value = refund
    ElMessage.warning('获取退款详情失败，显示本地数据')
  }
  showDetailDialog.value = true
}

const approveRefund = async (refund: any) => {
  try {
    await ElMessageBox.confirm('确定通过该退款申请吗？', '确认操作', { type: 'warning' })
    await request.put(`/mall/refunds/admin/${refund.id}/review`, { status: 'merchant_approved' })
    ElMessage.success('审核通过')
    showDetailDialog.value = false
    loadRefunds()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '操作失败')
    }
  }
}

const rejectRefund = async (refund: any) => {
  try {
    const { value: reason } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝退款', {
      inputPlaceholder: '拒绝原因',
      type: 'warning',
      inputValidator: (val) => !!val?.trim() || '请输入拒绝原因',
    })
    await request.put(`/mall/refunds/admin/${refund.id}/review`, { status: 'merchant_rejected', reject_reason: reason })
    ElMessage.success('已拒绝')
    showDetailDialog.value = false
    loadRefunds()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '操作失败')
    }
  }
}

const finishRefund = async (refund: any) => {
  try {
    await ElMessageBox.confirm('将向支付渠道发起退款；到账前售后会保持“退款处理中”。', '发起退款', { type: 'warning' })
    await request.put(`/mall/refunds/admin/${refund.id}/finish`, {})
    ElMessage.success('退款已提交，请等待支付渠道确认')
    showDetailDialog.value = false
    loadRefunds()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '操作失败')
    }
  }
}

const closeRefund = async (refund: any) => {
  try {
    await ElMessageBox.confirm('确定取消该退款申请吗？', '确认取消', { type: 'warning' })
    await request.put(`/mall/refunds/admin/${refund.id}/review`, { status: 'closed' })
    ElMessage.success('退款已取消')
    showDetailDialog.value = false
    loadRefunds()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '操作失败')
    }
  }
}

onMounted(() => {
  loadRefunds()
})
</script>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.refund-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>

<template>
  <div class="detail-page" v-if="order">
    <!-- 顶部操作栏 -->
    <div class="detail-header">
      <a-space>
        <a-button @click="$router.back()"><ArrowLeftOutlined /> 返回</a-button>
        <span class="page-title">订单详情</span>
        <StatusTag :status="order.status" type="order" />
      </a-space>
      <a-space>
        <a-button v-if="canCancel" danger @click="cancelModal.visible = true">取消订单</a-button>
        <a-dropdown>
          <a-button>更多操作 <DownOutlined /></a-button>
          <template #overlay>
            <a-menu @click="(e:any) => onAction(e.key)">
              <a-menu-item key="status">更改状态</a-menu-item>
              <a-menu-item key="refund" v-if="order.refundStatus==='none'">处理退款</a-menu-item>
              <a-menu-item key="remark">添加备注</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </a-space>
    </div>

    <a-row :gutter="16">
      <!-- 左列 -->
      <a-col :span="16">
        <!-- 订单基本信息 -->
        <a-card title="订单信息" size="small" class="info-card">
          <a-descriptions :column="2" size="small" bordered>
            <a-descriptions-item label="订单号">{{ order.orderNo }}</a-descriptions-item>
            <a-descriptions-item label="订单状态"><StatusTag :status="order.status" type="order" /></a-descriptions-item>
            <a-descriptions-item label="退款状态">{{ refundStatusLabel(order.refundStatus) }}</a-descriptions-item>
            <a-descriptions-item label="备注">{{ order.remark || '-' }}</a-descriptions-item>
            <a-descriptions-item label="商品总价">¥{{ order.totalAmount.toFixed(2) }}</a-descriptions-item>
            <a-descriptions-item label="运费">¥{{ order.freightAmount.toFixed(2) }}</a-descriptions-item>
            <a-descriptions-item label="优惠金额">-¥{{ order.discountAmount.toFixed(2) }}</a-descriptions-item>
            <a-descriptions-item label="实付金额"><span class="money-lg">¥{{ order.payAmount.toFixed(2) }}</span></a-descriptions-item>
            <a-descriptions-item label="下单时间">{{ formatTime(order.createdAt) }}</a-descriptions-item>
            <a-descriptions-item label="支付时间">{{ order.payTime ? formatTime(order.payTime) : '-' }}</a-descriptions-item>
            <a-descriptions-item label="发货时间">{{ order.deliverTime ? formatTime(order.deliverTime) : '-' }}</a-descriptions-item>
            <a-descriptions-item label="完成时间">{{ order.completeTime ? formatTime(order.completeTime) : '-' }}</a-descriptions-item>
            <a-descriptions-item v-if="order.cancelTime" label="取消时间">{{ formatTime(order.cancelTime) }}</a-descriptions-item>
            <a-descriptions-item v-if="order.cancelReason" label="取消原因">{{ order.cancelReason }}</a-descriptions-item>
          </a-descriptions>
        </a-card>

        <!-- 商品列表 -->
        <a-card title="商品明细" size="small" class="info-card">
          <a-table :columns="itemColumns as any" :data-source="(order.items || []) as any" :pagination="false" size="small" bordered>
            <template #bodyCell="{ column, record: it }">
              <template v-if="column.dataIndex === 'product'">
                <a-space>
                  <a-image :src="it.productImage" :width="48" :height="48" :fallback="'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22%3E%3Crect fill=%22%23f0f0f0%22 width=%2248%22 height=%2248%22/%3E%3C/svg%3E'" />
                  <span>{{ it.productName }}</span>
                </a-space>
              </template>
              <template v-else-if="column.dataIndex === 'price'">¥{{ it.price.toFixed(2) }}</template>
              <template v-else-if="column.dataIndex === 'totalPrice'">¥{{ it.totalPrice.toFixed(2) }}</template>
            </template>
          </a-table>
        </a-card>

        <!-- 操作日志 -->
        <a-card title="操作日志" size="small" class="info-card">
          <a-timeline v-if="order.logs?.length">
            <a-timeline-item v-for="log in order.logs" :key="log.createdAt" :color="logColor(log.action)">
              <div class="log-item">
                <span class="log-action">{{ logActionLabel(log.action) }}</span>
                <span v-if="log.remark" class="log-remark"> — {{ log.remark }}</span>
                <span class="log-meta">{{ formatTime(log.createdAt) }} · {{ log.operatorType }}</span>
              </div>
            </a-timeline-item>
          </a-timeline>
          <a-empty v-else description="暂无操作记录" :image-style="{ height: '40px' }" />
        </a-card>
      </a-col>

      <!-- 右列 -->
      <a-col :span="8">
        <!-- 用户信息 -->
        <a-card title="用户信息" size="small" class="info-card">
          <div class="user-info" v-if="order.user">
            <div class="user-avatar-row">
              <a-avatar :src="order.user.avatar" :size="56" />
              <div class="user-names">
                <div class="user-nick">{{ order.user.nickname || '未设置昵称' }}</div>
                <div class="user-id">ID: {{ order.user.id }}</div>
              </div>
            </div>
            <a-descriptions :column="1" size="small" style="margin-top:12px">
              <a-descriptions-item label="手机号">{{ order.user.phone || '-' }}</a-descriptions-item>
              <a-descriptions-item label="真实姓名">{{ order.user.realName || '-' }}</a-descriptions-item>
              <a-descriptions-item label="学校">{{ order.user.school || '-' }}</a-descriptions-item>
            </a-descriptions>
          </div>
          <a-empty v-else description="用户信息不可用" :image-style="{ height: '40px' }" />
        </a-card>

        <!-- 商家信息 -->
        <a-card title="商家信息" size="small" class="info-card" v-if="order.merchant">
          <a-descriptions :column="1" size="small">
            <a-descriptions-item label="商家名称">{{ order.merchant.name }}</a-descriptions-item>
            <a-descriptions-item label="联系电话">{{ order.merchant.phone || '-' }}</a-descriptions-item>
            <a-descriptions-item label="地址">{{ order.merchant.address || '-' }}</a-descriptions-item>
            <a-descriptions-item label="所属区域">{{ order.merchant.regionName || '-' }}</a-descriptions-item>
          </a-descriptions>
        </a-card>

        <!-- 收货信息 -->
        <a-card title="收货信息" size="small" class="info-card" v-if="order.receiver">
          <a-descriptions :column="1" size="small">
            <a-descriptions-item label="收货人">{{ order.receiver.name }}</a-descriptions-item>
            <a-descriptions-item label="电话">{{ order.receiver.phone }}</a-descriptions-item>
            <a-descriptions-item label="地址">{{ order.receiver.address }}</a-descriptions-item>
          </a-descriptions>
        </a-card>

        <!-- 支付信息 -->
        <a-card title="支付信息" size="small" class="info-card" v-if="order.payments?.length">
          <div v-for="pay in order.payments" :key="pay.id" class="pay-item">
            <a-descriptions :column="1" size="small">
              <a-descriptions-item label="支付单号">{{ pay.paymentNo }}</a-descriptions-item>
              <a-descriptions-item label="支付渠道">{{ pay.channel === 'wx_pay' ? '微信支付' : pay.channel === 'ali_pay' ? '支付宝' : pay.channel || '-' }}</a-descriptions-item>
              <a-descriptions-item label="支付金额">¥{{ pay.amount.toFixed(2) }}</a-descriptions-item>
              <a-descriptions-item label="支付状态"><StatusTag :status="pay.status" type="payment" /></a-descriptions-item>
              <a-descriptions-item v-if="pay.wxTransId" label="交易号">{{ pay.wxTransId }}</a-descriptions-item>
              <a-descriptions-item label="支付时间">{{ pay.payTime ? formatTime(pay.payTime) : '-' }}</a-descriptions-item>
            </a-descriptions>
          </div>
        </a-card>
        <a-card v-else title="支付信息" size="small" class="info-card">
          <a-empty description="暂无支付记录" :image-style="{ height: '40px' }" />
        </a-card>

        <!-- 物流信息 -->
        <a-card title="物流信息" size="small" class="info-card" v-if="order.tracking?.no">
          <a-descriptions :column="1" size="small">
            <a-descriptions-item label="快递公司">{{ order.tracking.company || '-' }}</a-descriptions-item>
            <a-descriptions-item label="快递单号">{{ order.tracking.no }}</a-descriptions-item>
          </a-descriptions>
        </a-card>

        <!-- 退款记录 -->
        <a-card title="退款记录" size="small" class="info-card" v-if="order.refunds?.length">
          <div v-for="r in order.refunds" :key="r.id" class="refund-item">
            <a-descriptions :column="1" size="small">
              <a-descriptions-item label="退款单号">{{ r.refundNo }}</a-descriptions-item>
              <a-descriptions-item label="退款金额">¥{{ r.amount.toFixed(2) }}</a-descriptions-item>
              <a-descriptions-item label="原因">{{ r.reason }}</a-descriptions-item>
              <a-descriptions-item label="状态">
                <a-tag :color="r.status==='approved'?'green':r.status==='rejected'?'red':'orange'">{{ r.status }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item v-if="r.rejectReason" label="拒绝原因">{{ r.rejectReason }}</a-descriptions-item>
              <a-descriptions-item label="申请时间">{{ formatTime(r.createdAt) }}</a-descriptions-item>
            </a-descriptions>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <!-- 状态变更弹窗 -->
    <a-modal v-model:visible="statusModal.visible" title="更改订单状态" @ok="doStatusChange" :confirm-loading="statusModal.loading" width="380">
      <a-form :label-col="{ span: 6 }">
        <a-form-item label="当前状态"><a-tag>{{ order?.status }}</a-tag></a-form-item>
        <a-form-item label="目标状态">
          <a-select v-model:value="statusModal.targetStatus" style="width:100%">
            <a-select-option v-for="s in statusModal.allowTransitions" :key="s" :value="s">{{ statusLabel(s) }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 取消弹窗 -->
    <a-modal v-model:visible="cancelModal.visible" title="取消订单" @ok="doCancel" :confirm-loading="cancelModal.loading" width="400">
      <a-form-item label="取消原因">
        <a-textarea v-model:value="cancelModal.reason" placeholder="请输入取消原因" :rows="3" />
      </a-form-item>
    </a-modal>

    <!-- 退款弹窗 -->
    <a-modal v-model:visible="refundModal.visible" title="处理退款" @ok="doRefund" :confirm-loading="refundModal.loading" width="420">
      <a-descriptions :column="1" size="small" bordered>
        <a-descriptions-item label="订单号">{{ order?.orderNo }}</a-descriptions-item>
        <a-descriptions-item label="实付金额">¥{{ order?.payAmount?.toFixed(2) }}</a-descriptions-item>
      </a-descriptions>
      <a-form-item label="退款金额" style="margin-top:12px">
        <a-input-number v-model:value="refundModal.amount" :min="0" :max="order?.payAmount" style="width:100%" prefix="¥" />
      </a-form-item>
      <a-form-item label="退款原因">
        <a-textarea v-model:value="refundModal.reason" :rows="2" />
      </a-form-item>
      <a-form-item label="操作">
        <a-radio-group v-model:value="refundModal.action">
          <a-radio value="approve">同意退款</a-radio>
          <a-radio value="reject">拒绝退款</a-radio>
        </a-radio-group>
      </a-form-item>
    </a-modal>
  </div>

  <!-- 加载中 -->
  <div class="detail-page" v-else-if="loading">
    <a-skeleton active />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { ArrowLeftOutlined, DownOutlined } from '@ant-design/icons-vue'
import { shopApi } from '@/api/shop'
import { formatTime } from '@/utils/format'
import StatusTag from '@/components/common/StatusTag.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const order = ref<any>(null)

const statusTransitions: Record<string, string[]> = {
  pending_pay: ['paid', 'cancelled'],
  paid: ['shipped', 'refunding', 'cancelled'],
  shipped: ['delivered', 'refunding'],
  delivered: ['completed', 'refunding'],
  completed: [],
  cancelled: [],
  refunding: ['refunded'],
  refunded: [],
}

const canCancel = computed(() => {
  const s = order.value?.status
  return s && !['completed', 'cancelled', 'refunded'].includes(s)
})

const itemColumns: any[] = [
  { title: '商品', dataIndex: 'product', width: 280 },
  { title: '规格', dataIndex: 'skuSpecs', width: 140 },
  { title: '单价', dataIndex: 'price', width: 90, align: 'right' },
  { title: '数量', dataIndex: 'quantity', width: 60, align: 'center' },
  { title: '小计', dataIndex: 'totalPrice', width: 90, align: 'right' },
]

const statusModal = reactive({ visible: false, loading: false, targetStatus: '', allowTransitions: [] as string[] })
const cancelModal = reactive({ visible: false, loading: false, reason: '' })
const refundModal = reactive({ visible: false, loading: false, amount: 0, reason: '', action: 'approve' as string })

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pending_pay: '待支付', paid: '已支付', shipped: '已发货',
    delivered: '已送达', completed: '已完成', cancelled: '已取消',
    refunding: '退款中', refunded: '已退款',
  }
  return map[s] || s
}

function refundStatusLabel(s: string) {
  const map: Record<string, string> = { none: '无', refunding: '退款中', refunded: '已退款' }
  return map[s] || s
}

function logActionLabel(action: string) {
  const map: Record<string, string> = {
    PENDING_PAY: '创建订单', PAID: '支付成功', SHIPPED: '已发货',
    DELIVERED: '已送达', RECEIVED: '已收货', COMPLETED: '已完成',
    CANCELLED: '已取消', REFUNDING: '申请退款', REFUNDED: '已退款',
  }
  return map[action] || action
}

function logColor(action: string) {
  const map: Record<string, string> = {
    PAID: 'blue', SHIPPED: 'cyan', DELIVERED: 'geekblue',
    COMPLETED: 'green', CANCELLED: 'red', REFUNDING: 'orange', REFUNDED: 'red',
  }
  return map[action] || 'gray'
}

async function fetchDetail() {
  loading.value = true
  try {
    const res = await shopApi.getOrderDetail(route.params.id as string)
    const body = res.data?.data || res.data || {}
    order.value = body
  } catch { /* handled */ } finally { loading.value = false }
}

function onAction(key: string) {
  const s = order.value?.status
  switch (key) {
    case 'status':
      statusModal.targetStatus = ''
      statusModal.allowTransitions = statusTransitions[s] || []
      statusModal.visible = true
      break
    case 'cancel':
      cancelModal.reason = ''
      cancelModal.visible = true
      break
    case 'refund':
      refundModal.amount = order.value?.payAmount || 0
      refundModal.reason = ''
      refundModal.action = 'approve'
      refundModal.visible = true
      break
  }
}

async function doStatusChange() {
  if (!statusModal.targetStatus) { message.warning('请选择目标状态'); return }
  statusModal.loading = true
  try {
    await shopApi.updateOrderStatus(order.value.id, statusModal.targetStatus)
    message.success('状态更新成功')
    statusModal.visible = false
    fetchDetail()
  } catch { /* handled */ } finally { statusModal.loading = false }
}

async function doCancel() {
  cancelModal.loading = true
  try {
    await shopApi.cancelOrder(order.value.id, cancelModal.reason || '管理员取消')
    message.success('订单已取消')
    cancelModal.visible = false
    fetchDetail()
  } catch { /* handled */ } finally { cancelModal.loading = false }
}

async function doRefund() {
  refundModal.loading = true
  try {
    if (refundModal.action === 'approve') {
      await shopApi.approveRefund(order.value.id, refundModal.reason)
      message.success('退款已批准')
    } else {
      await shopApi.rejectRefund(order.value.id, refundModal.reason)
      message.success('已拒绝退款')
    }
    refundModal.visible = false
    fetchDetail()
  } catch { /* handled */ } finally { refundModal.loading = false }
}

onMounted(fetchDetail)
</script>

<style lang="less" scoped>
.detail-page {
  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: #fff;
    border-radius: 8px;
    margin-bottom: 16px;
    .page-title { font-size: 18px; font-weight: 600; }
  }
  .info-card {
    margin-bottom: 16px;
    border-radius: 8px;
  }
  .money-lg { font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; font-size: 16px; font-weight: 600; color: #374151; }
  .user-info {
    .user-avatar-row { display: flex; align-items: center; gap: 12px; }
    .user-nick { font-size: 14px; font-weight: 500; }
    .user-id { font-size: 12px; color: #9ca3af; }
  }
  .log-item {
    .log-action { font-weight: 500; }
    .log-remark { color: #6b7280; }
    .log-meta { display: block; font-size: 12px; color: #9ca3af; margin-top: 2px; }
  }
  .pay-item, .refund-item {
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 1px solid #f0f0f0;
    &:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  }
}
</style>

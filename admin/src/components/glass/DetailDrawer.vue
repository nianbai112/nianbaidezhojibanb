<template>
  <el-drawer v-model="visible" :title="title" size="580px">
    <template v-if="row">
      <div class="drawer-hero">
        <div class="avatar">{{ avatarLetter }}</div>
        <div>
          <div class="name-main">{{ displayName }}</div>
          <div class="name-sub">{{ row.id || row.orderNo || row.flowNo || '业务详情' }}</div>
        </div>
      </div>
      <el-tabs class="drawer-tabs">
        <el-tab-pane v-for="tab in tabs" :key="tab" :label="tab">
          <div class="detail-scroll">
            <div class="detail-grid">
              <div v-for="(entry, idx) in displayEntries" :key="idx" class="detail-row">
                <span class="detail-label">{{ entry.label }}</span>
                <span class="detail-value">{{ entry.value }}</span>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
    <template #footer>
      <el-button @click="visible=false">关闭</el-button>
      <el-button type="primary">保存处理结果</el-button>
    </template>
  </el-drawer>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
const visible = ref(false)
const row = ref<any>(null)
const tabs = ref<string[]>([])
const title = ref('详情')
defineExpose({ open })
function open(payload:any, options?:{ title?:string; tabs?:string[] }){
  row.value = payload
  tabs.value = options?.tabs || ['基础信息','操作记录']
  title.value = options?.title || '详情'
  visible.value = true
}
const avatarLetter = computed(() => {
  const n = displayName.value
  return n ? n.slice(0, 1) : '详'
})
const displayName = computed(() =>
  row.value?.user?.name || row.value?.merchant?.name || row.value?.name?.name ||
  row.value?.content?.name || row.value?.activity?.name || row.value?.name || '详情信息'
)
const labelMap: Record<string, string> = {
  id: 'ID', orderNo: '订单号', flowNo: '流水号', name: '名称', status: '状态',
  createdAt: '创建时间', updatedAt: '更新时间', phone: '手机号', email: '邮箱',
  amount: '金额', price: '价格', total: '合计', quantity: '数量',
  address: '地址', remark: '备注', description: '描述', reason: '原因',
  type: '类型', category: '分类', code: '编码', role: '角色',
  username: '用户名', nickname: '昵称', realName: '真实姓名',
  school: '学校', studentNo: '学号', merchant: '商家', user: '用户',
  region: '区域', city: '城市', score: '评分', sales: '销量',
  stock: '库存', gmv: 'GMV', fee: '手续费', commission: '佣金',
  deliveryFee: '配送费', goodsAmount: '商品金额', payStatus: '支付状态',
  orderType: '订单类型', deliveryType: '配送方式', tradeType: '交易类型',
  configName: '配置项', configGroup: '配置分组', value: '当前值',
  updatedBy: '更新人', account: '账号', scope: '数据范围', lastLogin: '最近登录',
  fileType: '文件类型', size: '大小', usage: '使用场景', uploader: '上传人',
}
function formatLabel(key: string): string {
  if (labelMap[key]) return labelMap[key]
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
}
function stringify(v: any): string {
  if (v === null || v === undefined || v === '') return '-'
  if (typeof v === 'object') return v.name || v.label || v.title || JSON.stringify(v)
  if (typeof v === 'boolean') return v ? '是' : '否'
  return String(v)
}
const displayEntries = computed(() => {
  const src = row.value || {}
  return Object.entries(src)
    .filter(([_, v]) => v !== undefined && v !== null && typeof v !== 'function')
    .slice(0, 20)
    .map(([k, v]) => ({ label: formatLabel(k), value: stringify(v) }))
})
</script>
<style scoped>
.drawer-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(226, 232, 240, .6);
}
.drawer-hero .avatar {
  width: 44px;
  height: 44px;
  font-size: 18px;
}
.drawer-tabs {
  margin-top: 4px;
}
.detail-scroll {
  max-height: calc(100vh - 320px);
  overflow-y: auto;
  padding-right: 4px;
}
.detail-grid {
  display: grid;
  gap: 0;
}
.detail-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(226, 232, 240, .5);
  font-size: 13px;
}
.detail-row:last-child {
  border-bottom: 0;
}
.detail-label {
  color: #64748b;
  font-weight: 700;
  flex-shrink: 0;
}
.detail-value {
  color: #1e293b;
  font-weight: 600;
  word-break: break-all;
}
</style>

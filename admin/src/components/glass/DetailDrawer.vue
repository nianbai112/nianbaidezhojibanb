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
      <el-tabs v-model="activeTab" class="drawer-tabs">
        <el-tab-pane v-for="tab in tabs" :key="tab" :label="tab">
          <div v-if="isAdminDetail" class="detail-scroll">
            <div v-if="tab === '账号信息'" class="section-stack">
              <div class="info-card">
                <div class="info-title">账号状态</div>
                <div class="info-grid">
                  <div><span>登录账号</span><strong>{{ adminRaw.username || '-' }}</strong></div>
                  <div><span>管理员名称</span><strong>{{ adminDisplayName }}</strong></div>
                  <div><span>手机号</span><strong>{{ adminRaw.phone || '未填写' }}</strong></div>
                  <div><span>邮箱</span><strong>{{ adminRaw.email || '未填写' }}</strong></div>
                  <div><span>账号状态</span><strong>{{ statusLabel(adminRaw.status) }}</strong></div>
                  <div><span>密码状态</span><strong>{{ adminRaw.passwordResetRequired ? '需要重置密码' : '正常' }}</strong></div>
                </div>
              </div>
              <div class="info-card">
                <div class="info-title">登录安全</div>
                <div class="info-grid">
                  <div><span>最近登录</span><strong>{{ formatTime(adminRaw.lastLoginAt) }}</strong></div>
                  <div><span>最近登录 IP</span><strong>{{ adminRaw.lastLoginIp || '暂无记录' }}</strong></div>
                  <div><span>登录失败次数</span><strong>{{ adminRaw.loginFailCount || 0 }} 次</strong></div>
                  <div><span>锁定状态</span><strong>{{ adminRaw.isLocked ? `锁定至 ${formatTime(adminRaw.lockedUntil)}` : '未锁定' }}</strong></div>
                  <div><span>创建时间</span><strong>{{ formatTime(adminRaw.createdAt) }}</strong></div>
                  <div><span>密码更新时间</span><strong>{{ formatTime(adminRaw.passwordChangedAt) }}</strong></div>
                </div>
              </div>
            </div>
            <div v-else-if="tab === '角色权限'" class="section-stack">
              <div v-for="role in adminRoles" :key="role.id || role.code || role.name" class="role-card">
                <div>
                  <strong>{{ role.name || '未命名角色' }}</strong>
                  <small>{{ role.code || '未配置角色编码' }}</small>
                </div>
                <el-tag v-if="role.regionName" size="small" effect="plain">{{ role.regionName }}</el-tag>
                <el-tag v-else size="small" type="success" effect="plain">全部区域</el-tag>
              </div>
              <el-empty v-if="!adminRoles.length" description="暂无角色权限" />
            </div>
            <div v-else-if="tab === '数据范围'" class="section-stack">
              <div class="scope-card">
                <span>可管理范围</span>
                <strong>{{ adminRaw.dataScope || adminRaw.scope || '全部数据' }}</strong>
                <p>{{ scopeDescription }}</p>
              </div>
              <div v-if="adminRegionRoles.length" class="region-list">
                <div v-for="role in adminRegionRoles" :key="role.id + role.regionId" class="region-item">
                  <span>{{ role.regionName || role.regionId }}</span>
                  <small>{{ role.name }}</small>
                </div>
              </div>
            </div>
            <div v-else-if="tab === '操作日志'" class="section-stack">
              <div v-for="log in adminOperationLogs" :key="log.id" class="log-card">
                <strong>{{ plainLog(log) }}</strong>
                <span>{{ formatTime(log.createdAt) }} · {{ log.ip || '未记录 IP' }}</span>
              </div>
              <el-empty v-if="!adminOperationLogs.length" description="暂无最近操作记录" />
            </div>
          </div>
          <div v-else class="detail-scroll">
            <div class="detail-grid">
              <div v-for="(entry, idx) in displayEntries" :key="idx" class="detail-row">
                <span class="detail-label">{{ entry.label }}</span>
                <el-image
                  v-if="entry.isImage"
                  class="detail-image"
                  :src="entry.value"
                  fit="cover"
                  :preview-src-list="[entry.value]"
                  preview-teleported
                />
                <span v-else class="detail-value">{{ entry.value }}</span>
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
const activeTab = ref('')
defineExpose({ open })
function open(payload:any, options?:{ title?:string; tabs?:string[] }){
  row.value = payload
  tabs.value = options?.tabs || ['基础信息','操作记录']
  activeTab.value = tabs.value[0] || ''
  title.value = options?.title || '详情'
  visible.value = true
}
const avatarLetter = computed(() => {
  const n = displayName.value
  return n ? n.slice(0, 1) : '详'
})
const displayName = computed(() =>
  isAdminDetail.value ? adminDisplayName.value :
  row.value?.user?.name || row.value?.merchant?.name || row.value?.name?.name ||
  row.value?.content?.name || row.value?.activity?.name || row.value?.name || '详情信息'
)
const moduleKey = computed(() => row.value?.__module || row.value?.__raw?.__module || '')
const raw = computed(() => row.value?.__raw || row.value || {})
const isAdminDetail = computed(() => moduleKey.value === 'admins')
const adminRaw = computed(() => raw.value || {})
const adminDisplayName = computed(() => adminRaw.value.realName || adminRaw.value.username || row.value?.admin?.name || '管理员')
const adminRoles = computed(() => Array.isArray(adminRaw.value.roles) ? adminRaw.value.roles : [])
const adminRegionRoles = computed(() => adminRoles.value.filter((role: any) => role.regionId || role.regionName))
const adminOperationLogs = computed(() => Array.isArray(adminRaw.value.operationLogs) ? adminRaw.value.operationLogs : [])
const scopeDescription = computed(() => {
  if (!adminRegionRoles.value.length) return '该管理员当前可查看和处理平台全部区域的数据。'
  const names = adminRegionRoles.value.map((role: any) => role.regionName || role.regionId).filter(Boolean).join('、')
  return `该管理员主要负责：${names || '指定区域'}。`
})
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
  lastLoginAt: '最近登录', lastLoginIp: '最近登录 IP', loginFailCount: '登录失败次数',
  passwordResetRequired: '是否需要重置密码', roleName: '角色', regionName: '负责区域', dataScope: '数据范围',
}
const hiddenKeys = new Set(['__raw', '__module', 'roles', 'operationLogs', 'passwordHash', 'mfaSecret'])
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
function formatTime(value: any) {
  if (!value) return '暂无记录'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}
function statusLabel(value: any) {
  const text = String(value ?? '').toLowerCase()
  if (['1', 'active', 'enabled', 'normal'].includes(text)) return '正常'
  if (['0', 'disabled', 'inactive'].includes(text)) return '禁用'
  if (text === 'deleted') return '已删除'
  return text || '正常'
}
function actionLabel(action: any) {
  const map: Record<string, string> = {
    create: '新增', update: '修改', delete: '删除', audit: '审核', login: '登录',
    logout: '退出登录', enable: '启用', disable: '禁用', grant_membership: '发放会员',
    grant_coupon: '发放优惠券', reset_password: '重置密码', force_password_reset: '强制重置密码',
  }
  const key = String(action || '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
  return map[key] || String(action || '操作')
}
function moduleLabel(module: any) {
  const map: Record<string, string> = {
    admins: '管理员', user: '用户', activity: '活动', popup: '首页权益卡片', region_tabbar: '底部导航',
    system: '系统配置', finance: '财务', order: '订单', content: '内容',
  }
  const key = String(module || '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
  return map[key] || String(module || '业务')
}
function plainLog(log: any) {
  return `${actionLabel(log.action)}了${moduleLabel(log.module)}${log.targetId ? `（${String(log.targetId).slice(0, 10)}）` : ''}`
}
function isImageValue(key: string, value: any) {
  const s = String(value || '')
  const imageKey = /(image|avatar|photo|cert|card|material|url)$/i.test(key)
  const imageUrl = /^https?:\/\//.test(s) || s.startsWith('/') || s.startsWith('wxfile://') || s.startsWith('cloud://')
  return imageKey && imageUrl
}
const displayEntries = computed(() => {
  const src = row.value || {}
  return Object.entries(src)
    .filter(([k, v]) => !hiddenKeys.has(k) && v !== undefined && v !== null && typeof v !== 'function')
    .slice(0, 20)
    .map(([k, v]) => ({ label: formatLabel(k), value: stringify(v), isImage: isImageValue(k, v) }))
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
.detail-image {
  width: 128px;
  height: 88px;
  border-radius: 10px;
  background: #f1f5f9;
}
.section-stack {
  display: grid;
  gap: 12px;
}
.info-card,
.scope-card,
.role-card,
.log-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  padding: 14px;
}
.info-title {
  color: #0f172a;
  font-weight: 800;
  margin-bottom: 12px;
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.info-grid div,
.scope-card,
.log-card {
  display: grid;
  gap: 5px;
}
.info-grid span,
.scope-card span,
.role-card small,
.log-card span,
.region-item small {
  color: #64748b;
  font-size: 12px;
}
.info-grid strong,
.scope-card strong,
.role-card strong,
.log-card strong {
  color: #0f172a;
  font-size: 14px;
  word-break: break-word;
}
.role-card,
.region-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.scope-card p {
  margin: 0;
  color: #64748b;
  line-height: 1.6;
}
.region-list {
  display: grid;
  gap: 8px;
}
.region-item {
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
}
.region-item span {
  color: #0f172a;
  font-weight: 700;
}
</style>

<template>
  <div class="page-shell">
    <GlassPageHeader title="系统设置" subtitle="管理平台配置、权限角色、消息通知、安全策略、存储上传和第三方配置">
      <template #actions><el-button @click="resetBasic">恢复默认</el-button><el-button type="primary" :icon="Check" :loading="saving" @click="saveBasic">保存全部</el-button></template>
    </GlassPageHeader>
    <StatGrid :items="moduleConfigs.system.stats" />
    <div class="settings-layout">
      <div class="glass-card"><div class="card-body side-tabs"><button v-for="t in tabs" :key="t" :class="{active:t===active}" @click="active=t"><el-icon><Setting /></el-icon>{{ t }}</button></div></div>
      <div class="page-shell">
        <div class="glass-card"><div class="card-header"><div class="card-title">{{ active }}</div></div><div class="card-body"><el-form label-position="top"><div class="form-grid three"><el-form-item label="平台名称"><el-input v-model="basic.platformName" /></el-form-item><el-form-item label="客服电话"><el-input v-model="basic.servicePhone" /></el-form-item><el-form-item label="默认区域"><el-select v-model="basic.defaultRegion"><el-option label="东校区" value="东校区" /><el-option label="西校区" value="西校区" /></el-select></el-form-item><el-form-item label="登录验证码"><el-switch v-model="basic.loginCaptcha" active-text="开启" /></el-form-item><el-form-item label="注册审核"><el-switch v-model="basic.registerAudit" active-text="开启" /></el-form-item><el-form-item label="默认抽成"><el-input v-model="basic.defaultCommission"><template #append>%</template></el-input></el-form-item></div></el-form></div></div>
        <div class="glass-card"><div class="card-header"><div class="card-title">短信/消息开关</div></div><div class="card-body"><div class="switch-grid"><div v-for="s in switches" :key="s.key"><span>{{ s.label }}</span><el-switch v-model="basic[s.key]" /></div></div></div></div>
        <OperationModulePage module-key="system" />
      </div>
      <SidePanels chart-title="系统状态概览" side-title="最近操作记录" :metrics="logs" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import SidePanels from '@/components/glass/SidePanels.vue'
import OperationModulePage from '@/components/business/OperationModulePage.vue'
import { moduleConfigs } from '@/data/moduleConfigs'
import { Check, Setting } from '@element-plus/icons-vue'
import { fetchConfigGroup, saveConfigGroup } from '@/api/admin'

const tabs = ['基础设置','权限角色','消息通知','安全策略','存储上传','第三方配置']
const active = ref('基础设置')
const saving = ref(false)
const basic = reactive<Record<string, any>>({
  platformName: '校园本地生活',
  servicePhone: '400-888-0000',
  defaultRegion: '东校区',
  loginCaptcha: true,
  registerAudit: true,
  defaultCommission: 8,
  orderNotice: true,
  merchantNotice: true,
  refundNotice: true,
  reportNotice: true,
  deliveryTimeoutNotice: true,
  systemAlertNotice: true
})
const switches = [
  { key: 'orderNotice', label: '订单支付通知' },
  { key: 'merchantNotice', label: '商家入驻通知' },
  { key: 'refundNotice', label: '退款处理通知' },
  { key: 'reportNotice', label: '内容举报通知' },
  { key: 'deliveryTimeoutNotice', label: '配送超时通知' },
  { key: 'systemAlertNotice', label: '系统告警通知' }
]
const logs = [{title:'修改平台抽成',desc:'张伟 10:32',value:'已完成'},{title:'新增财务角色',desc:'李娜 09:48',value:'已完成'},{title:'开启验证码',desc:'系统 08:12',value:'已完成'}]
function resetBasic() {
  basic.platformName = '校园本地生活'
  basic.servicePhone = '400-888-0000'
  basic.defaultRegion = '东校区'
  basic.loginCaptcha = true
  basic.registerAudit = true
  basic.defaultCommission = 8
}
async function loadBasic() {
  const data: any = await fetchConfigGroup('basic')
  Object.assign(basic, data || {})
}
async function saveBasic() {
  saving.value = true
  try {
    await saveConfigGroup('basic', basic)
    ElMessage.success('系统设置已保存')
  } finally {
    saving.value = false
  }
}
onMounted(() => {
  loadBasic().catch(() => undefined)
})
</script>
<style scoped>.settings-layout{display:grid;grid-template-columns:210px minmax(0,1fr) 320px;gap:18px;align-items:start}.side-tabs{display:grid;gap:8px}.side-tabs button{height:44px;border:0;border-radius:14px;background:transparent;text-align:left;padding:0 12px;font-weight:900;color:#64748b;display:flex;align-items:center;gap:8px}.side-tabs button.active{background:#eff6ff;color:#1f6fff}.switch-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.switch-grid div{display:flex;justify-content:space-between;padding:12px;border-radius:14px;background:#f8fafc}@media(max-width:1300px){.settings-layout{grid-template-columns:1fr}.switch-grid{grid-template-columns:1fr}}</style>

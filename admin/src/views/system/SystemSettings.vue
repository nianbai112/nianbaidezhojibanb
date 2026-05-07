<template>
  <div class="page-shell">
    <GlassPageHeader title="系统设置" subtitle="管理平台配置、权限角色、消息通知、安全策略、存储上传和第三方配置">
      <template #actions><el-button>恢复默认</el-button><el-button type="primary" :icon="Check">保存全部</el-button></template>
    </GlassPageHeader>
    <StatGrid :items="moduleConfigs.system.stats" />
    <div class="settings-layout">
      <div class="glass-card"><div class="card-body side-tabs"><button v-for="t in tabs" :key="t" :class="{active:t===active}" @click="active=t"><el-icon><Setting /></el-icon>{{ t }}</button></div></div>
      <div class="page-shell">
        <div class="glass-card"><div class="card-header"><div class="card-title">{{ active }}</div></div><div class="card-body"><el-form label-position="top"><div class="form-grid three"><el-form-item label="平台名称"><el-input model-value="校园本地生活" /></el-form-item><el-form-item label="客服电话"><el-input model-value="400-888-0000" /></el-form-item><el-form-item label="默认区域"><el-select model-value="东校区"><el-option label="东校区" value="东校区" /></el-select></el-form-item><el-form-item label="登录验证码"><el-switch model-value active-text="开启" /></el-form-item><el-form-item label="注册审核"><el-switch model-value active-text="开启" /></el-form-item><el-form-item label="默认抽成"><el-input model-value="8"><template #append>%</template></el-input></el-form-item></div></el-form></div></div>
        <div class="glass-card"><div class="card-header"><div class="card-title">短信/消息开关</div></div><div class="card-body"><div class="switch-grid"><div v-for="s in switches" :key="s"><span>{{ s }}</span><el-switch model-value /></div></div></div></div>
        <OperationModulePage module-key="system" />
      </div>
      <SidePanels chart-title="系统状态概览" side-title="最近操作记录" :metrics="logs" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import SidePanels from '@/components/glass/SidePanels.vue'
import OperationModulePage from '@/components/business/OperationModulePage.vue'
import { moduleConfigs } from '@/data/moduleConfigs'
import { Check, Setting } from '@element-plus/icons-vue'
const tabs = ['基础设置','权限角色','消息通知','安全策略','存储上传','第三方配置']
const active = ref('基础设置')
const switches = ['订单支付通知','商家入驻通知','退款处理通知','内容举报通知','配送超时通知','系统告警通知']
const logs = [{title:'修改平台抽成',desc:'张伟 10:32',value:'已完成'},{title:'新增财务角色',desc:'李娜 09:48',value:'已完成'},{title:'开启验证码',desc:'系统 08:12',value:'已完成'}]
</script>
<style scoped>.settings-layout{display:grid;grid-template-columns:210px minmax(0,1fr) 320px;gap:18px;align-items:start}.side-tabs{display:grid;gap:8px}.side-tabs button{height:44px;border:0;border-radius:14px;background:transparent;text-align:left;padding:0 12px;font-weight:900;color:#64748b;display:flex;align-items:center;gap:8px}.side-tabs button.active{background:#eff6ff;color:#1f6fff}.switch-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.switch-grid div{display:flex;justify-content:space-between;padding:12px;border-radius:14px;background:#f8fafc}@media(max-width:1300px){.settings-layout{grid-template-columns:1fr}.switch-grid{grid-template-columns:1fr}}</style>

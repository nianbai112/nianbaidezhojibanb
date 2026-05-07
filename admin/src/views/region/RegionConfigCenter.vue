<template>
  <div class="page-shell">
    <GlassPageHeader title="区域配置中心" subtitle="配置区域基础信息、功能、页面布局及显示规则">
      <template #actions><el-button @click="loadRegions">刷新</el-button><el-button type="primary" :icon="Check" :loading="saving" @click="saveRegion">保存配置</el-button></template>
    </GlassPageHeader>
    <div class="config-layout">
      <div class="page-shell">
        <div class="top-config-grid">
          <div class="glass-card"><div class="card-header"><div class="card-title">当前区域</div></div><div class="card-body"><div class="campus-img"></div><h2>{{ form.name || '未选择区域' }} <el-tag type="success">{{ form.status ? '正常运营' : '已停用' }}</el-tag></h2><p class="muted">区域编码：{{ form.code || '-' }}</p><p class="muted">创建时间：{{ form.createdAt || '-' }}</p><el-select v-model="selectedId" style="width:100%;margin-top:12px" placeholder="切换区域" @change="selectRegion"><el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" /></el-select></div></div>
          <ConfigCard title="基本信息"><el-form label-position="top"><div class="form-grid two"><el-form-item label="区域名称"><el-input v-model="form.name" /></el-form-item><el-form-item label="区域简称"><el-input v-model="form.shortName" /></el-form-item><el-form-item label="区域编码"><el-input v-model="form.code" /></el-form-item><el-form-item label="状态"><el-switch v-model="form.status" active-text="正常运营" /></el-form-item></div><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" /></el-form-item></el-form></ConfigCard>
          <ConfigCard title="图片设置"><div class="upload-row"><div class="logo-preview">LOGO</div><div><b>区域LOGO</b><p class="muted">建议 200x200px，大小不超过2MB</p><el-button size="small">更换</el-button></div></div><p><b>区域轮播图（最多5张）</b></p><div class="thumbs"><div v-for="i in 3" :key="i"></div><button>+</button></div></ConfigCard>
          <ConfigCard title="管理员信息"><div class="side-list"><div class="side-item"><div class="side-left"><div class="avatar">张</div><div><div class="name-main">张伟</div><div class="name-sub">138****5678</div></div></div><el-button size="small">更换</el-button></div><div class="side-item"><div class="side-left"><div class="avatar green">李</div><div><div class="name-main">李娜</div><div class="name-sub">156****1234</div></div></div><el-button size="small">更换</el-button></div></div></ConfigCard>
        </div>
        <div class="mid-config-grid">
          <ConfigCard title="位置信息"><el-form label-position="top"><el-form-item label="地理位置"><el-input v-model="form.address" /></el-form-item><div class="map-snippet"><el-icon><Location /></el-icon><span>重新定位</span></div><div class="form-grid three"><el-form-item label="服务半径"><el-input v-model="form.serviceRadius"><template #append>公里</template></el-input></el-form-item><el-form-item label="配送范围"><el-select v-model="form.deliveryRange"><el-option label="校区内部" value="校区内部" /><el-option label="全区域" value="全区域" /></el-select></el-form-item><el-form-item label="时区设置"><el-select v-model="form.timezone"><el-option label="UTC+8 北京时间" value="UTC+8" /></el-select></el-form-item></div></el-form></ConfigCard>
          <ConfigCard title="财务配置"><div class="form-grid two"><el-form-item label="平台抽成比例"><el-input model-value="8.00"><template #append>%</template></el-input></el-form-item><el-form-item label="服务费比例"><el-input model-value="2.00"><template #append>%</template></el-input></el-form-item><el-form-item label="提现手续费"><el-input model-value="1.00"><template #append>%</template></el-input></el-form-item><el-form-item label="结算周期"><el-select model-value="T+1"><el-option label="T+1（次日结算）" value="T+1" /></el-select></el-form-item></div><el-button style="width:100%" type="primary" plain>保存财务配置</el-button></ConfigCard>
          <ConfigCard title="显示设置"><div class="switch-list"><div v-for="s in switches" :key="s"><span>{{ s }}</span><el-switch model-value /></div></div><el-radio-group model-value="是"><el-radio label="是">下单手机号脱敏</el-radio><el-radio label="否">否</el-radio></el-radio-group><el-button style="width:100%;margin-top:12px" type="primary" plain>保存显示设置</el-button></ConfigCard>
        </div>
        <div class="bottom-config-grid">
          <SortableCard title="页面布局设置" :items="['轮播图','快捷入口','公告通知','分类导航','推荐商家','热门活动']" />
          <ConfigCard title="首页榜单配置"><el-switch model-value active-text="榜单显示" /><div style="margin:12px 0"><el-checkbox checked>销量榜</el-checkbox><el-checkbox checked>好评榜</el-checkbox><el-checkbox checked>热门榜</el-checkbox></div><el-form label-position="top"><el-form-item label="展示数量"><el-input model-value="5" /></el-form-item><el-form-item label="刷新周期"><el-select model-value="1小时"><el-option label="1小时" value="1小时" /></el-select></el-form-item></el-form><el-button style="width:100%" type="primary" plain>保存榜单配置</el-button></ConfigCard>
          <ConfigCard title="区域消息导航配置"><el-switch model-value active-text="导航显示" /><el-form label-position="top" style="margin-top:12px"><el-form-item label="导航名称"><el-input model-value="消息" /></el-form-item><el-form-item label="未读消息跳转"><el-select model-value="消息中心"><el-option label="消息中心" value="消息中心" /></el-select></el-form-item></el-form><el-button style="width:100%" type="primary" plain>保存导航配置</el-button></ConfigCard>
          <SortableCard title="我的页面布局配置" :items="['我的订单','我的钱包','优惠券','我的收藏','地址管理','客服与帮助']" />
        </div>
      </div>
      <div class="glass-card preview-card"><div class="card-header"><div class="card-title">效果预览</div></div><div class="card-body"><div class="preview-tabs"><button>首页预览</button><button>我的页面预览</button></div><div class="preview-phone"><div class="phone-status"><span>9:41</span><span>●●●</span></div><b>东校区⌄</b><el-input size="small" placeholder="搜索商家、商品、服务" style="margin-top:10px" /><div class="phone-banner">东校区 美好生活<br/><small>便捷 / 优质 / 安全 / 贴心</small></div><div class="phone-grid"><div class="phone-app" v-for="app in apps" :key="app"><i></i>{{ app }}</div></div><div class="phone-section"><b>公告通知</b><span>更多</span></div><div class="phone-section"><b>推荐商家</b><span>更多</span></div></div></div></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import ConfigCard from '@/views/region/components/ConfigCard.vue'
import SortableCard from '@/views/region/components/SortableCard.vue'
import { Check, Location } from '@element-plus/icons-vue'
import { fetchRegions, updateRegion } from '@/api/admin'

const switches = ['开启同城配送','开启跑腿服务','开启拼团活动','开启积分商城','开启校园头条','开启广告位']
const apps = ['外卖美食','超市便利','校园跑腿','取快递','二手市场','拼团优惠','校园服务','全部分类']
const regions = ref<any[]>([])
const selectedId = ref<string | number>('')
const saving = ref(false)
const form = reactive({
  id: '',
  name: '',
  shortName: '',
  code: '',
  status: true,
  remark: '',
  address: '',
  serviceRadius: 3,
  deliveryRange: '校区内部',
  timezone: 'UTC+8',
  createdAt: ''
})

function fillForm(row: any = {}) {
  form.id = row.id || ''
  form.name = row.name || ''
  form.shortName = row.shortName || row.abbr || ''
  form.code = row.code || row.regionCode || ''
  form.status = ![0, '0', false, 'disabled'].includes(row.status)
  form.remark = row.remark || row.description || ''
  form.address = row.address || row.location || ''
  form.serviceRadius = row.serviceRadius || row.radius || 3
  form.deliveryRange = row.deliveryRange || '校区内部'
  form.timezone = row.timezone || 'UTC+8'
  form.createdAt = row.createdAt || row.createTime || ''
}

function selectRegion(id: string | number) {
  const row = regions.value.find(r => r.id === id)
  fillForm(row)
}

async function loadRegions() {
  regions.value = await fetchRegions()
  if (!selectedId.value && regions.value.length) selectedId.value = regions.value[0].id
  selectRegion(selectedId.value)
}

async function saveRegion() {
  if (!form.id) {
    ElMessage.warning('请先选择区域')
    return
  }
  saving.value = true
  try {
    await updateRegion(form.id, {
      name: form.name,
      shortName: form.shortName,
      code: form.code,
      status: form.status ? 1 : 0,
      remark: form.remark,
      address: form.address,
      serviceRadius: Number(form.serviceRadius),
      deliveryRange: form.deliveryRange,
      timezone: form.timezone
    })
    ElMessage.success('区域配置已保存')
    await loadRegions()
  } finally {
    saving.value = false
  }
}

onMounted(loadRegions)
</script>
<style scoped lang="scss">
.config-layout { display:grid; grid-template-columns:minmax(0,1fr) 342px; gap:18px; align-items:start; }
.top-config-grid { display:grid; grid-template-columns:1.05fr 1.25fr 1.15fr 1.1fr; gap:14px; }
.mid-config-grid { display:grid; grid-template-columns:1.25fr 1fr 1fr; gap:14px; }
.bottom-config-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
.campus-img { height:92px; border-radius:16px; background:linear-gradient(135deg,#bfdbfe,#60a5fa); margin-bottom:12px; }
h2 { display:flex; gap:8px; align-items:center; margin:0 0 12px; }
.upload-row { display:flex; align-items:center; gap:14px; }
.logo-preview { width:70px; height:70px; border-radius:50%; display:grid; place-items:center; border:2px dashed #93c5fd; color:#1f6fff; font-weight:950; }
.thumbs { display:flex; gap:8px; margin-top:10px; }
.thumbs div, .thumbs button { width:58px; height:46px; border-radius:12px; border:1px solid #dbeafe; background:linear-gradient(135deg,#dbeafe,#93c5fd); }
.thumbs button { background:#f8fafc; color:#1f6fff; font-size:24px; }
.map-snippet { height:78px; border-radius:16px; background:linear-gradient(135deg,#dbeafe,#f8fafc); display:flex; align-items:center; justify-content:center; gap:8px; color:#1f6fff; margin-bottom:12px; font-weight:900; }
.switch-list { display:grid; gap:12px; margin-bottom:12px; }
.switch-list div { display:flex; justify-content:space-between; align-items:center; }
.preview-card { position:sticky; top:90px; }
.preview-tabs { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
.preview-tabs button { border:0; border-radius:14px; padding:10px; background:#eff6ff; color:#1f6fff; font-weight:900; }
.phone-section { margin-top:14px; border-radius:14px; padding:12px; background:#f8fafc; display:flex; justify-content:space-between; color:#64748b; }
@media(max-width:1400px){ .config-layout{ grid-template-columns:1fr; } .preview-card{ position:static; } }
@media(max-width:1100px){ .top-config-grid,.mid-config-grid,.bottom-config-grid{ grid-template-columns:1fr; } }
</style>

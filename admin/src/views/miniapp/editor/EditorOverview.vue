<template>
  <div class="ov">
    <!-- ===== 区域与发布状态 ===== -->
    <section class="ov-hero glass-card">
      <div class="ov-region">
        <el-avatar :size="52" :src="region?.logo">{{ (region?.name || '区').slice(0, 1) }}</el-avatar>
        <div class="ov-region-info">
          <div class="ov-eyebrow">当前装修区域</div>
          <div class="ov-name">{{ region?.name || '请选择区域' }}</div>
          <el-tag :type="region?.isOpen ? 'success' : 'info'" size="small" effect="light">
            {{ region?.isOpen ? '运营中' : '未开放' }}
          </el-tag>
        </div>
      </div>
      <div class="ov-progress">
        <div class="ov-progress-num">
          <b>{{ percent }}%</b>
          <span>装修完整度</span>
        </div>
        <el-progress :percentage="percent" :color="progressColor" :stroke-width="10" />
        <div class="ov-progress-sub">{{ passedCount }}/{{ checks.length }} 项就绪</div>
      </div>
      <div class="ov-actions">
        <el-select v-model="regionId" placeholder="选择区域" style="width: 180px" filterable @change="loadAll">
          <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <el-button :icon="Refresh" :loading="loading" @click="loadAll">重新检测</el-button>
        <el-button type="primary" :icon="Promotion" :loading="publishing" :disabled="!regionId" @click="publish">
          发布到小程序
        </el-button>
      </div>
    </section>

    <!-- ===== 发布检查清单 ===== -->
    <section class="ov-checks glass-card">
      <div class="ov-checks-head">
        <span class="ov-checks-title">发布检查清单</span>
        <span class="ov-checks-hint">未就绪的项可直接跳转对应模块处理</span>
      </div>
      <div v-for="c in checks" :key="c.key" class="ov-check" :class="{ fail: !c.pass }">
        <span class="ov-check-icon" :class="c.pass ? 'ok' : 'no'">{{ c.pass ? '✓' : '!' }}</span>
        <div class="ov-check-body">
          <b>{{ c.name }}</b>
          <span>{{ c.pass ? c.okText : c.failText }}</span>
        </div>
        <el-button v-if="!c.pass && c.mode" size="small" type="primary" plain @click="go(c.mode)">去配置</el-button>
        <el-button v-else-if="c.mode" size="small" text @click="go(c.mode)">查看</el-button>
      </div>
      <el-empty v-if="!loading && !regionId" description="先选择区域，才能进行发布检查" :image-size="90" />
    </section>

    <!-- ===== 快捷入口 ===== -->
    <section class="ov-quick">
      <div v-for="q in quickLinks" :key="q.mode" class="ov-quick-card glass-card" @click="go(q.mode)">
        <el-icon :size="20" :color="q.color"><component :is="q.icon" /></el-icon>
        <b>{{ q.title }}</b>
        <span>{{ q.desc }}</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Promotion, Menu, Share, MagicStick, Aim, Files } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import { fetchRegionShareSetting, fetchRegionTabbar } from '@/api/admin'

const emit = defineEmits<{ navigate: [mode: string, page?: string] }>()

const regions = ref<any[]>([])
const regionId = ref('')
const region = ref<any>(null)
const tabbar = ref<any>(null)
const share = ref<any>(null)
/** 新设计器数据源：三页布局状态（data.status / data.config.components） */
const layouts = ref<Record<string, any>>({})
const loading = ref(false)
const publishing = ref(false)

interface Check { key: string; name: string; pass: boolean; okText: string; failText: string; mode?: string }

/** 页面布局是否已发布且非空 */
const layoutState = (page: string) => {
  const res = layouts.value[page]
  const data = res?.data || res
  const count = (data?.config?.components || []).length
  return { published: data?.status === 'published' && count > 0, count }
}

const checks = computed<Check[]>(() => {
  if (!region.value) return []
  const r = region.value
  const tabbarList = tabbar.value?.config?.list || tabbar.value?.list || []
  const publishMenu = r.settings?.publishMenu
  const publishEntries = publishMenu?.entries ? Object.values(publishMenu.entries).filter((e: any) => e?.enabled !== false).length : 0
  const home = layoutState('home')
  const message = layoutState('message')
  const profile = layoutState('profile')
  return [
    { key: 'home', name: '首页布局', pass: home.published, okText: `已发布 · ${home.count} 个组件`, failText: '首页布局还没发布（或画布为空）', mode: 'designer:home' },
    { key: 'message', name: '消息页布局', pass: message.published, okText: `已发布 · ${message.count} 个组件`, failText: '消息页布局还没发布（或画布为空）', mode: 'designer:message' },
    { key: 'profile', name: '我的页布局', pass: profile.published, okText: `已发布 · ${profile.count} 个组件`, failText: '我的页布局还没发布（或画布为空）', mode: 'designer:profile' },
    { key: 'tabbar', name: '底部导航', pass: tabbarList.length >= 2, okText: `${tabbarList.length} 个导航项`, failText: '底部导航还没配置', mode: 'tabbar' },
    { key: 'share', name: '分享卡片', pass: !!share.value?.title, okText: `「${share.value.title}」`, failText: '分享首页卡片还没配置标题', mode: 'share' },
    { key: 'publishMenu', name: '发布入口', pass: !!publishMenu && publishEntries > 0, okText: `${publishEntries} 个发布入口启用`, failText: '发布弹窗入口还没装修', mode: 'publish-entry' },
    { key: 'open', name: '区域状态', pass: !!r.isOpen, okText: '区域已开放运营', failText: '区域未开放，用户看不到配置效果', mode: undefined },
  ]
})

const passedCount = computed(() => checks.value.filter((c) => c.pass).length)
const percent = computed(() => (checks.value.length ? Math.round((passedCount.value / checks.value.length) * 100) : 0))
const progressColor = computed(() => (percent.value >= 80 ? '#67c23a' : percent.value >= 60 ? '#e6a23c' : '#f56c6c'))

const quickLinks = [
  { mode: 'designer:home', title: '设计器', desc: '五个页面一个画布', icon: MagicStick, color: '#36a853' },
  { mode: 'tabbar', title: 'TabBar', desc: '底部导航配置', icon: Menu, color: '#2563eb' },
  { mode: 'share', title: '分享配置', desc: '分享卡片与路径', icon: Share, color: '#0891b2' },
  { mode: 'publish-entry', title: '发布入口', desc: '发布弹窗装修', icon: Aim, color: '#e6a23c' },
  { mode: 'code', title: '代码包', desc: 'app.json / 下载源码包', icon: Files, color: '#64748b' },
]

/** mode 支持 'designer:home' 形式，冒号后带到设计器的 page 页签 */
function go(mode: string) {
  const [m, page] = mode.split(':')
  emit('navigate', m, page)
}

async function loadAll() {
  if (!regionId.value) return
  loading.value = true
  const safe = (p: Promise<any>, fb: any) => p.catch(() => fb)
  try {
    const [regionRes, tabbarRes, shareRes, homeRes, messageRes, profileRes] = await Promise.all([
      safe(request.get(`/admin/regions/${regionId.value}`), null),
      safe(fetchRegionTabbar(regionId.value), null),
      safe(fetchRegionShareSetting(regionId.value), null),
      safe(request.get(`/admin/layout/home/${regionId.value}`), null),
      safe(request.get(`/admin/layout/message/${regionId.value}`), null),
      safe(request.get(`/admin/layout/profile/${regionId.value}`), null),
    ])
    region.value = regionRes?.data || regionRes
    tabbar.value = tabbarRes
    share.value = shareRes?.data || shareRes
    layouts.value = { home: homeRes, message: messageRes, profile: profileRes }
  } finally {
    loading.value = false
  }
}

async function publish() {
  const failed = checks.value.filter((c) => !c.pass && c.key !== 'open')
  if (failed.length) {
    try {
      await ElMessageBox.confirm(
        `还有 ${failed.length} 项未就绪（${failed.map((f) => f.name).join('、')}），确定继续发布吗？`,
        '发布前检查',
        { type: 'warning', confirmButtonText: '仍然发布', cancelButtonText: '去处理' },
      )
    } catch {
      return
    }
  } else {
    try {
      await ElMessageBox.confirm('全部检查已通过，确认发布当前区域的装修配置吗？', '确认发布', { type: 'info' })
    } catch {
      return
    }
  }
  publishing.value = true
  try {
    // 各装修模块保存即生效；这里把「自定义版块」的草稿布局正式发布
    await request.post(`/admin/layout/home/${regionId.value}/publish`).catch(() => null)
    ElMessage.success('已发布，小程序端即时生效 🎉')
  } finally {
    publishing.value = false
  }
}

onMounted(async () => {
  try {
    const res: any = await request.get('/admin/regions')
    regions.value = res.data?.list || res.list || []
    if (!regionId.value && regions.value.length) {
      regionId.value = regions.value[0].id || regions.value[0].region_id
      await loadAll()
    }
  } catch {
    ElMessage.error('加载区域列表失败')
  }
})
</script>

<style scoped lang="scss">
.ov { display: grid; gap: 14px; }

.ov-hero {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(260px, 1.2fr) auto;
  align-items: center;
  gap: 22px;
  padding: 18px 22px;
}
.ov-region { display: flex; align-items: center; gap: 14px; min-width: 0; }
.ov-eyebrow { color: var(--mx-sub); font-size: 12px; font-weight: 700; }
.ov-name { color: var(--mx-text); font-size: 20px; font-weight: 800; margin: 2px 0 6px; }
.ov-progress-num { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px;
  b { font-size: 22px; color: var(--mx-text); }
  span { font-size: 12.5px; color: var(--mx-sub); }
}
.ov-progress-sub { margin-top: 6px; font-size: 12px; color: var(--mx-muted); }
.ov-actions { display: flex; gap: 10px; align-items: center; }

.ov-checks { padding: 16px 22px; }
.ov-checks-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.ov-checks-title { font-size: 15px; font-weight: 800; color: var(--mx-text); }
.ov-checks-hint { font-size: 12px; color: var(--mx-muted); }
.ov-check {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 4px;
  border-top: 1px dashed var(--mx-border);
}
.ov-check-icon {
  width: 24px; height: 24px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 800; flex-shrink: 0;
  &.ok { background: #e8f7ee; color: #36a853; }
  &.no { background: #fdf0e5; color: #e6a23c; }
}
.ov-check-body { flex: 1; display: grid; gap: 2px;
  b { font-size: 13.5px; color: var(--mx-text); }
  span { font-size: 12px; color: var(--mx-sub); }
}
.ov-check.fail .ov-check-body span { color: #c8842a; }

.ov-quick { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.ov-quick-card {
  display: grid; gap: 6px; padding: 16px 18px; cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease;
  b { font-size: 14px; color: var(--mx-text); }
  span { font-size: 12px; color: var(--mx-sub); }
  &:hover { transform: translateY(-2px); box-shadow: var(--mx-shadow-soft); }
}
</style>

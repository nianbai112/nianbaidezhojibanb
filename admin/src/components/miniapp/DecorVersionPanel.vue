<template>
  <el-drawer
    :model-value="modelValue"
    title="版本历史"
    size="560px"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @open="loadList"
  >
    <div class="dvp">
      <div class="dvp-tip">每次「保存并发布」都会自动生成一个版本，可随时回滚。</div>

      <el-empty v-if="!loading && !versions.length" description="还没有发布版本" :image-size="80" />

      <div v-loading="loading" class="dvp-list">
        <div v-for="v in versions" :key="v.version" class="dvp-item">
          <div class="dvp-item-head">
            <span class="dvp-ver">v{{ v.version }}</span>
            <span class="dvp-time">{{ formatTime(v.savedAt) }}</span>
            <span v-if="v.operatorId" class="dvp-operator">操作人：{{ v.operatorId }}</span>
          </div>
          <div v-if="v.note" class="dvp-note">{{ v.note }}</div>
          <div class="dvp-actions">
            <el-button size="small" text type="primary" :loading="diffLoading === v.version" @click="toggleDiff(v)">
              {{ expanded === v.version ? '收起改动' : '查看改动' }}
            </el-button>
            <el-button size="small" text type="danger" :loading="rollbacking === v.version" @click="onRollback(v)">
              回滚到此版
            </el-button>
          </div>
          <div v-if="expanded === v.version" class="dvp-diff">
            <template v-if="diffLabels.length">
              <div class="dvp-diff-title">该版本与当前编辑状态相比，以下字段不同：</div>
              <el-tag v-for="l in diffLabels" :key="l" size="small" class="dvp-diff-tag" type="warning">{{ l }}</el-tag>
            </template>
            <div v-else class="dvp-diff-same">与当前编辑状态一致</div>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'

const props = defineProps<{
  modelValue: boolean
  regionId: string
  /** 当前编辑状态，形状与快照一致：{ regionPayload?, tabbarConfig? } */
  current: Record<string, any>
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'rollback'): void
}>()

interface VersionItem { version: number; savedAt: string; note: string; operatorId: string }

const versions = ref<VersionItem[]>([])
const loading = ref(false)
const expanded = ref(0)
const diffLabels = ref<string[]>([])
const diffLoading = ref(0)
const rollbacking = ref(0)

/** 快照顶层字段 → 中文名（regionPayload 内层字段 + 顶层 tabbar） */
const FIELD_LABELS: Record<string, string> = {
  carousel_images: 'Hero 区 / 轮播图',
  home_nav_layout_config: '金刚区',
  region_tabs: '分类 Tab',
  show_carousel: '轮播图开关',
  show_announcement: '公告开关',
  show_kingkong: '金刚区开关',
  show_hot_list: '热榜开关',
  hot_featured_display: '热榜展示方式',
  message_page_layout: '消息页布局',
  private_message_enabled: '私信开关',
  message_icons: '消息分类入口',
  message_navigation: '系统消息导航卡片',
  profile_page_layout: '我的页布局',
  profile_layout_items: '我的页菜单',
  settings: '我的页视觉 / 设置',
  tabbarConfig: '底部导航',
}

/** 键序无关的稳定序列化：快照经 Postgres jsonb 存取后键序会重排，直接 JSON.stringify 对比会误报差异 */
const stable = (v: any): any => {
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === 'object') {
    const o: Record<string, any> = {}
    for (const k of Object.keys(v).sort()) {
      if (v[k] !== undefined) o[k] = stable(v[k])
    }
    return o
  }
  return v ?? null
}
const eq = (a: any, b: any) => JSON.stringify(stable(a)) === JSON.stringify(stable(b))

function computeDiff(snapshot: any, current: any): string[] {
  const labels: string[] = []
  const rpA = snapshot?.regionPayload || {}
  const rpB = current?.regionPayload || {}
  for (const k of new Set([...Object.keys(rpA), ...Object.keys(rpB)])) {
    if (!eq(rpA[k], rpB[k])) labels.push(FIELD_LABELS[k] || k)
  }
  for (const k of ['tabbarConfig']) {
    if (snapshot?.[k] !== undefined || current?.[k] !== undefined) {
      if (!eq(snapshot?.[k], current?.[k])) labels.push(FIELD_LABELS[k] || k)
    }
  }
  return labels
}

const formatTime = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('zh-CN', { hour12: false })
}

async function loadList() {
  if (!props.regionId) return
  loading.value = true
  expanded.value = 0
  diffLabels.value = []
  try {
    const res: any = await request.get(`/admin/decor-version/${props.regionId}/list`)
    versions.value = res?.data?.list || []
  } catch (e: any) {
    ElMessage.error(e?.message || '版本列表加载失败')
  } finally {
    loading.value = false
  }
}

async function toggleDiff(v: VersionItem) {
  if (expanded.value === v.version) {
    expanded.value = 0
    diffLabels.value = []
    return
  }
  diffLoading.value = v.version
  try {
    const res: any = await request.get(`/admin/decor-version/${props.regionId}/${v.version}`)
    expanded.value = v.version
    diffLabels.value = computeDiff(res?.data?.snapshot, props.current || {})
  } catch (e: any) {
    ElMessage.error(e?.message || '版本详情加载失败')
  } finally {
    diffLoading.value = 0
  }
}

async function onRollback(v: VersionItem) {
  try {
    await ElMessageBox.confirm(
      `将把当前页面配置回滚到 v${v.version}（${formatTime(v.savedAt)}），现有配置会被该版本覆盖。`,
      '确认回滚？',
      { confirmButtonText: '回滚', cancelButtonText: '取消', type: 'warning' },
    )
  } catch { return }
  rollbacking.value = v.version
  try {
    await request.post(`/admin/decor-version/${props.regionId}/rollback`, { version: v.version })
    ElMessage.success(`已回滚到 v${v.version}，编辑器即将刷新`)
    emit('update:modelValue', false)
    emit('rollback')
  } catch (e: any) {
    ElMessage.error(e?.message || '回滚失败')
  } finally {
    rollbacking.value = 0
  }
}
</script>

<style scoped lang="scss">
.dvp { display: flex; flex-direction: column; gap: 12px; }
.dvp-tip { font-size: 12px; color: var(--mx-muted, #6b7280); }
.dvp-list { display: flex; flex-direction: column; gap: 10px; min-height: 60px; }
.dvp-item {
  border: 1px solid var(--mx-border, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dvp-item-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dvp-ver { font-weight: 700; font-size: 14px; color: #1f2937; }
.dvp-time { font-size: 12px; color: var(--mx-muted, #6b7280); }
.dvp-operator { font-size: 12px; color: var(--mx-muted, #6b7280); }
.dvp-note { font-size: 12px; color: #374151; }
.dvp-actions { display: flex; gap: 4px; }
.dvp-diff {
  border-top: 1px dashed var(--mx-border, #e5e7eb);
  padding-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dvp-diff-title { width: 100%; font-size: 12px; color: var(--mx-muted, #6b7280); }
.dvp-diff-same { font-size: 12px; color: #16a34a; }
</style>

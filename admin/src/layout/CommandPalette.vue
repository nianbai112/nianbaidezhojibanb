<template>
  <teleport to="body">
    <div v-if="visible" class="palette-overlay" @click.self="close">
      <div class="palette" role="dialog" aria-modal="true" aria-label="搜索菜单">
        <div class="palette-input-row">
          <el-icon class="palette-search-icon"><Search /></el-icon>
          <input
            ref="inputRef"
            v-model="query"
            class="palette-input"
            type="text"
            placeholder="搜索页面，快速跳转…"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="openActive"
            @keydown.esc.prevent="close"
          />
          <kbd class="kbd">esc</kbd>
        </div>

        <div ref="listRef" class="palette-list">
          <template v-if="sections.length">
            <template v-for="section in sections" :key="section.name">
              <div class="palette-group">{{ section.name }}</div>
              <button
                v-for="entry in section.entries"
                :key="`${section.name}:${entry.item.path}`"
                type="button"
                class="palette-item"
                :class="{ active: entry.index === activeIndex }"
                @click="select(entry.item)"
                @mouseenter="activeIndex = entry.index"
              >
                <el-icon class="item-icon"><component :is="entry.item.icon || 'Menu'" /></el-icon>
                <span class="item-title">{{ entry.item.title }}</span>
                <span class="item-group">{{ entry.item.group }}</span>
              </button>
            </template>
          </template>
          <div v-else class="palette-empty">未找到相关页面</div>
        </div>

        <div class="palette-footer">↑↓ 选择 · ↵ 打开 · esc 关闭</div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import type { MenuGroup } from '@/router/access'

interface PaletteItem {
  title: string
  path: string
  icon?: string
  group: string
}

interface SectionEntry {
  item: PaletteItem
  index: number
}

interface PaletteSection {
  name: string
  entries: SectionEntry[]
}

const RECENT_KEY = 'km-recent-nav'
const RECENT_LIMIT = 5

const props = defineProps<{ groups: MenuGroup[] }>()
const router = useRouter()

const visible = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
let previousBodyOverflow = ''

// 权限过滤后的全量菜单池
const pool = computed<PaletteItem[]>(() =>
  props.groups.flatMap((group) =>
    group.children.map((child) => ({
      title: child.title,
      path: child.path,
      icon: child.icon,
      group: group.title
    }))
  )
)

const poolPaths = computed(() => new Set(pool.value.map((item) => item.path)))

// ── 最近访问（localStorage km-recent-nav，最多 5 条）──
function readRecent(): PaletteItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is PaletteItem => Boolean(item && typeof item.path === 'string' && typeof item.title === 'string')
    )
  } catch {
    return []
  }
}

const recent = ref<PaletteItem[]>(readRecent())

function recordRecent(item: PaletteItem) {
  const next = [item, ...recent.value.filter((entry) => entry.path !== item.path)].slice(0, RECENT_LIMIT)
  recent.value = next
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // 存储不可用时仅影响“最近访问”记忆，不影响跳转
  }
}

// ── 分组结果（空 query：最近访问 + 全部分组；有 query：跨组标题匹配）──
const sections = computed<PaletteSection[]>(() => {
  const keyword = query.value.trim().toLowerCase()
  const result: PaletteSection[] = []
  let index = 0
  const toEntry = (item: PaletteItem): SectionEntry => ({ item, index: index++ })
  const toItem = (groupTitle: string) => (child: MenuGroup['children'][number]): PaletteItem => ({
    title: child.title,
    path: child.path,
    icon: child.icon,
    group: groupTitle
  })

  if (!keyword) {
    const recentItems = recent.value.filter((item) => poolPaths.value.has(item.path))
    if (recentItems.length) {
      result.push({ name: '最近访问', entries: recentItems.map(toEntry) })
    }
    for (const group of props.groups) {
      const items = group.children.map(toItem(group.title))
      if (items.length) result.push({ name: group.title, entries: items.map(toEntry) })
    }
    return result
  }

  for (const group of props.groups) {
    const matched = group.children
      .filter((child) => child.title.toLowerCase().includes(keyword))
      .map(toItem(group.title))
    if (matched.length) result.push({ name: group.title, entries: matched.map(toEntry) })
  }
  return result
})

const flatItems = computed<PaletteItem[]>(() =>
  sections.value.flatMap((section) => section.entries.map((entry) => entry.item))
)

// ── 键盘导航 ──
function move(delta: number) {
  const total = flatItems.value.length
  if (!total) return
  activeIndex.value = (activeIndex.value + delta + total) % total
  nextTick(scrollActiveIntoView)
}

function scrollActiveIntoView() {
  listRef.value?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' })
}

function openActive() {
  const target = flatItems.value[activeIndex.value]
  if (target) select(target)
}

function select(item: PaletteItem) {
  recordRecent(item)
  router.push(item.path)
  close()
}

// ── 开关 ──
function open() {
  if (visible.value) {
    nextTick(() => inputRef.value?.focus())
    return
  }
  visible.value = true
}

function close() {
  if (!visible.value) return
  visible.value = false
}

function toggle() {
  if (visible.value) {
    close()
  } else {
    open()
  }
}

watch(visible, (value) => {
  query.value = ''
  activeIndex.value = 0
  if (value) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    nextTick(() => inputRef.value?.focus())
  } else {
    document.body.style.overflow = previousBodyOverflow
  }
})

watch(query, () => {
  activeIndex.value = 0
  if (listRef.value) listRef.value.scrollTop = 0
})

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    toggle()
    return
  }
  if (visible.value && e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
  if (visible.value) document.body.style.overflow = previousBodyOverflow
})

defineExpose({ open, close, toggle })
</script>

<style scoped lang="scss">
.palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  overflow-y: auto;
  background: rgba(12, 19, 34, .45);
}

.palette {
  width: 560px;
  max-width: 92vw;
  margin: 12vh auto 0;
  background: #fff;
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(12, 19, 34, .28);
  overflow: hidden;
}

.palette-input-row {
  height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--mx-border);
}

.palette-search-icon {
  font-size: 16px;
  color: var(--mx-muted);
  flex: 0 0 auto;
}

.palette-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: var(--mx-text);
}

.palette-input::placeholder {
  color: var(--mx-muted);
}

.palette-list {
  max-height: 340px;
  overflow-y: auto;
  padding: 6px;
}

.palette-group {
  padding: 10px 10px 4px;
  font-size: 11.5px;
  letter-spacing: .04em;
  color: var(--mx-muted);
}

.palette-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  text-align: left;
  color: var(--mx-text);
}

.palette-item.active {
  background: var(--mx-hover);
}

.palette-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  border-radius: 6px;
  background: var(--mx-primary);
}

.item-icon {
  font-size: 16px;
  color: var(--mx-muted);
  flex: 0 0 auto;
}

.palette-item.active .item-icon {
  color: var(--mx-primary);
}

.item-title {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-group {
  font-size: 11.5px;
  color: var(--mx-muted);
  flex: 0 0 auto;
}

.palette-empty {
  height: 96px;
  display: grid;
  place-items: center;
  font-size: 13.5px;
  color: var(--mx-muted);
}

.palette-footer {
  height: 36px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-top: 1px solid var(--mx-border);
  font-size: 12px;
  color: var(--mx-muted);
}
</style>

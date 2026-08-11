<template>
  <div class="section-card glass-card">
    <div class="section-head">
      <div class="card-title">消息分类配置</div>
      <div class="muted">系统/聊天与互动是主入口，其余分类显示在互动内部</div>
    </div>
    <el-form label-position="top">
      <div class="message-category-grid">
        <div v-for="item in categoryItems" :key="item.key" class="message-category-card">
          <div class="message-category-title">{{ item.label }}</div>
          <el-form-item label="名称"><el-input :model-value="item.name" @update:model-value="value => updateCategory(item, { name: value })" /></el-form-item>
          <el-switch :model-value="item.enabled" active-text="显示" inactive-text="隐藏" @update:model-value="value => updateCategory(item, { enabled: value })" />
          <el-form-item label="排序"><el-input-number :model-value="item.sortOrder" :min="0" :max="99" @update:model-value="value => updateCategory(item, { sortOrder: value })" /></el-form-item>
        </div>
      </div>
    </el-form>
  </div>

  <div class="section-card glass-card" style="margin-top:24px">
    <div class="section-head">
      <div>
        <div class="card-title">系统消息导航卡片</div>
        <div class="muted">仅用于系统/聊天页的业务入口，不影响顶部文字分类</div>
      </div>
      <div>
        <el-button size="small" @click="handleReset">恢复默认</el-button>
        <el-button size="small" type="primary" @click="addCard">添加卡片</el-button>
      </div>
    </div>
    <div class="sortable-list">
      <div v-for="(card, idx) in navCards" :key="card.id" class="sortable-item card-item">
        <div class="sortable-grip">☰</div>
        <div class="sortable-content card-fields">
          <el-input v-model="card.title" size="small" placeholder="标题" style="width:120px" />
          <el-input v-model="card.subtitle" size="small" placeholder="副标题" style="width:140px" />
          <el-input v-model="card.icon" size="small" placeholder="图标" style="width:100px" />
          <el-input v-model="card.path" size="small" placeholder="跳转路径" style="width:180px" />
        </div>
        <el-switch v-model="card.enabled" size="small" />
        <div class="sortable-actions">
          <el-button size="small" circle :disabled="idx === 0" @click="moveItem(idx, -1)">
            <el-icon><Top /></el-icon>
          </el-button>
          <el-button size="small" circle :disabled="idx === navCards.length - 1" @click="moveItem(idx, 1)">
            <el-icon><Bottom /></el-icon>
          </el-button>
          <el-button size="small" circle type="danger" @click="removeCard(idx)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <div v-if="!navCards.length" class="empty-hint">暂无导航卡片，点击"添加卡片"或"恢复默认"</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Top, Bottom, Delete } from '@element-plus/icons-vue'

interface MessageCard {
  id: string
  title: string
  subtitle: string
  icon: string
  path: string
  enabled: boolean
  sortOrder: number
}

type MessageCategoryValue = string | {
  name?: string
  enabled?: boolean
  sortOrder?: number
}

type MessageCategoryEvent = 'update:interactionIcon' | 'update:likeIcon' | 'update:followIcon' | 'update:commentIcon' | 'update:messageIcon' | 'update:squatIcon'

interface MessageCategoryItem {
  key: string
  label: string
  event: MessageCategoryEvent
  value?: MessageCategoryValue
  name: string
  enabled: boolean
  sortOrder: number
}

interface Props {
  interactionIcon?: MessageCategoryValue
  likeIcon?: MessageCategoryValue
  followIcon?: MessageCategoryValue
  commentIcon?: MessageCategoryValue
  messageIcon?: MessageCategoryValue
  squatIcon?: MessageCategoryValue
  navCards?: MessageCard[]
  defaultNavCards?: MessageCard[]
}

const props = withDefaults(defineProps<Props>(), {
  navCards: () => [],
  defaultNavCards: () => [
    { id: 'notice', title: '系统通知', subtitle: '平台消息与审核通知', icon: 'notice', path: '/pages/tabbar/news/news', enabled: true, sortOrder: 0 }
  ]
})

const emit = defineEmits([
  'update:likeIcon',
  'update:interactionIcon',
  'update:followIcon',
  'update:commentIcon',
  'update:messageIcon',
  'update:squatIcon',
  'update:navCards'
])

function normalizeCategory(value: MessageCategoryValue | undefined, fallbackName: string) {
  if (typeof value === 'string') {
    return { name: fallbackName, enabled: true, sortOrder: 0 }
  }

  return {
    name: value?.name || fallbackName,
    enabled: value?.enabled !== false,
    sortOrder: Number(value?.sortOrder || 0)
  }
}

const categoryItems = computed<MessageCategoryItem[]>(() => {
  const configs: Array<Omit<MessageCategoryItem, 'name' | 'enabled' | 'sortOrder'>> = [
    { key: 'message', label: '系统/聊天', event: 'update:messageIcon', value: props.messageIcon },
    { key: 'interaction', label: '互动', event: 'update:interactionIcon', value: props.interactionIcon },
    { key: 'comment', label: '评论/回复', event: 'update:commentIcon', value: props.commentIcon },
    { key: 'like', label: '喜欢', event: 'update:likeIcon', value: props.likeIcon },
    { key: 'follow', label: '关注', event: 'update:followIcon', value: props.followIcon },
    { key: 'squat', label: '蹲一蹲', event: 'update:squatIcon', value: props.squatIcon }
  ]

  return configs.map((item) => {
    const normalized = normalizeCategory(item.value, item.label)
    return { ...item, ...normalized }
  })
})

function updateCategory(item: MessageCategoryItem, patch: { name?: string; enabled?: boolean; sortOrder?: number }) {
  emit(item.event, {
    name: patch.name !== undefined ? patch.name : (item.name || item.label),
    enabled: patch.enabled !== undefined ? patch.enabled : item.enabled,
    sortOrder: patch.sortOrder !== undefined ? Number(patch.sortOrder) : item.sortOrder,
  })
}

const navCards = computed({
  get: () => props.navCards,
  set: (val) => emit('update:navCards', val)
})

function moveItem(idx: number, dir: number) {
  const target = idx + dir
  if (target < 0 || target >= navCards.value.length) return

  const newCards = [...navCards.value]
  const tmp = newCards[idx]
  newCards[idx] = newCards[target]
  newCards[target] = tmp
  navCards.value = newCards
}

function addCard() {
  const newCard: MessageCard = {
    id: `card_${Date.now()}`,
    title: '新卡片',
    subtitle: '',
    icon: '',
    path: '',
    enabled: true,
    sortOrder: navCards.value.length
  }
  navCards.value = [...navCards.value, newCard]
}

function removeCard(idx: number) {
  navCards.value = navCards.value.filter((_, i) => i !== idx)
}

function handleReset() {
  navCards.value = JSON.parse(JSON.stringify(props.defaultNavCards))
}
</script>

<style scoped lang="scss">
.section-card {
  padding: 0;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 4px;
}

.section-card :deep(.el-form) {
  padding: 16px 24px 24px;
}

.relaxed {
  gap: 16px 24px;
}

.message-category-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.message-category-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(125, 189, 87, 0.18);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255, 250, 232, 0.82) 0%, rgba(255, 255, 255, 0.92) 100%);
  box-shadow: 0 12px 28px rgba(80, 108, 52, 0.06);
}

.message-category-title {
  color: #1f2a19;
  font-size: 14px;
  font-weight: 700;
}

.sortable-list {
  display: grid;
  gap: 8px;
  padding: 0 24px 24px;
}

.sortable-item {
  display: grid;
  grid-template-columns: 28px 1fr auto 100px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid color-mix(in srgb, var(--mx-border) 60%, transparent);
}

.sortable-grip {
  cursor: grab;
  color: var(--mx-muted);
  font-size: 16px;
  user-select: none;
}

.sortable-content {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.card-fields {
  flex-wrap: wrap;
}

.sortable-actions {
  display: flex;
  gap: 4px;
}

.empty-hint {
  text-align: center;
  color: var(--mx-muted);
  padding: 24px;
  font-size: 13px;
}

.muted {
  color: var(--mx-muted);
  font-size: 12px;
}

@media (max-width: 1280px) {
  .message-category-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .message-category-grid {
    grid-template-columns: 1fr;
  }
}
</style>

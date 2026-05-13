<template>
  <div class="section-card glass-card">
    <div class="section-head">
      <div class="card-title">消息图标配置</div>
      <div class="muted">控制消息页各 Tab 的图标样式</div>
    </div>
    <el-form label-position="top">
      <div class="form-grid four relaxed">
        <el-form-item label="点赞图标">
          <el-input v-model="likeIcon" placeholder="icon-aixin" />
        </el-form-item>
        <el-form-item label="关注图标">
          <el-input v-model="followIcon" placeholder="icon-guanzhu" />
        </el-form-item>
        <el-form-item label="评论图标">
          <el-input v-model="commentIcon" placeholder="icon-pinglun" />
        </el-form-item>
        <el-form-item label="消息图标">
          <el-input v-model="messageIcon" placeholder="icon-xiaoxi" />
        </el-form-item>
      </div>
    </el-form>
  </div>

  <div class="section-card glass-card" style="margin-top:24px">
    <div class="section-head">
      <div class="card-title">消息导航卡片</div>
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

interface Props {
  likeIcon?: string
  followIcon?: string
  commentIcon?: string
  messageIcon?: string
  navCards?: MessageCard[]
  defaultNavCards?: MessageCard[]
}

const props = withDefaults(defineProps<Props>(), {
  likeIcon: '',
  followIcon: '',
  commentIcon: '',
  messageIcon: '',
  navCards: () => [],
  defaultNavCards: () => [
    { id: 'notice', title: '系统通知', subtitle: '平台消息与审核通知', icon: 'notice', path: '/pages/tabbar/news/news', enabled: true, sortOrder: 0 }
  ]
})

const emit = defineEmits<{
  'update:likeIcon': [value: string]
  'update:followIcon': [value: string]
  'update:commentIcon': [value: string]
  'update:messageIcon': [value: string]
  'update:navCards': [value: MessageCard[]]
}>()

const likeIcon = computed({
  get: () => props.likeIcon,
  set: (val) => emit('update:likeIcon', val)
})

const followIcon = computed({
  get: () => props.followIcon,
  set: (val) => emit('update:followIcon', val)
})

const commentIcon = computed({
  get: () => props.commentIcon,
  set: (val) => emit('update:commentIcon', val)
})

const messageIcon = computed({
  get: () => props.messageIcon,
  set: (val) => emit('update:messageIcon', val)
})

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
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(226, 232, 240, 0.6);
}

.sortable-grip {
  cursor: grab;
  color: #94a3b8;
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
  color: #94a3b8;
  padding: 24px;
  font-size: 13px;
}

.muted {
  color: #94a3b8;
  font-size: 12px;
}
</style>

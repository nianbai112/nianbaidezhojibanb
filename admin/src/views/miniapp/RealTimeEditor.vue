<template>
  <div class="editor-shell">
    <div class="page-tabs">
      <button
        v-for="p in pages"
        :key="p.key"
        class="page-tab"
        :class="{ active: page === p.key }"
        @click="page = p.key"
      >
        <el-icon :size="15"><component :is="p.icon" /></el-icon>
        <span>{{ p.name }}</span>
      </button>
    </div>

    <HomeEditor v-if="page === 'home'" key="home" />
    <MessageEditor v-else-if="page === 'message'" key="message" />
    <ProfileEditor v-else-if="page === 'profile'" key="profile" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { HomeFilled, ChatDotRound, User } from '@element-plus/icons-vue'
import HomeEditor from '@/views/miniapp/editor/HomeEditor.vue'
import MessageEditor from '@/views/miniapp/editor/MessageEditor.vue'
import ProfileEditor from '@/views/miniapp/editor/ProfileEditor.vue'

const page = ref('home')

const pages = [
  { key: 'home', name: '首页', icon: HomeFilled },
  { key: 'message', name: '消息页', icon: ChatDotRound },
  { key: 'profile', name: '我的页', icon: User },
]
</script>

<style scoped lang="scss">
.editor-shell {
  display: grid;
  gap: 14px;
}
.page-tabs {
  display: flex;
  gap: 2px;
  width: fit-content;
  padding: 4px;
  background: #fff;
  border: 1px solid var(--mx-border);
  border-radius: 12px;
  box-shadow: var(--mx-shadow-soft);
  position: sticky;
  top: 0;
  z-index: 20;
}
.page-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: 0;
  border-radius: 9px;
  background: none;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--mx-sub);
  transition: background-color .15s ease, color .15s ease;
}
.page-tab:hover {
  color: var(--mx-text);
  background: var(--mx-soft);
}
.page-tab.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 700;
}
</style>

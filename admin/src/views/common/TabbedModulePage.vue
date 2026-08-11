<template>
  <div class="tabbed-module">
    <!-- 模块内 tab 导航：菜单合并后的二级入口 -->
    <div class="module-tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        role="tab"
        class="module-tab"
        :class="{ active: activeKey === tab.key }"
        :aria-selected="activeKey === tab.key"
        @click="switchTab(tab.key)"
      >
        <el-icon v-if="tab.icon" class="tab-icon"><component :is="tab.icon" /></el-icon>
        <span>{{ tab.title }}</span>
      </button>
    </div>

    <div class="module-body">
      <keep-alive>
        <component :is="activeComponent" :key="activeKey" v-if="activeComponent" />
      </keep-alive>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { moduleTabSets } from './moduleTabs'

const route = useRoute()
const router = useRouter()

// tab 配置由 route.meta.tabsKey 索引（避免把组件引用塞进路由表，保持懒加载）
const tabs = computed(() => moduleTabSets[String(route.meta.tabsKey || '')] || [])

/**
 * tab 状态放在 ?sub= 参数里（而不是 ?tab=）：
 * 部分被嵌入的页面（如 AI 治理）自己也在用 ?tab= 做内部 tab，避免撞参数。
 * lastKey 兜底：被嵌入页面整包替换 query 丢掉 sub 时，不把用户拽回第一个 tab。
 */
const lastKey = ref('')

const activeKey = computed(() => {
  const fromQuery = String(route.query.sub || '')
  if (tabs.value.some((tab) => tab.key === fromQuery)) return fromQuery
  if (lastKey.value && tabs.value.some((tab) => tab.key === lastKey.value)) return lastKey.value
  return tabs.value[0]?.key || ''
})

watch(activeKey, (key) => {
  if (key) lastKey.value = key
})

const activeComponent = computed(() => tabs.value.find((tab) => tab.key === activeKey.value)?.component)

function switchTab(key: string) {
  if (key === activeKey.value) return
  router.replace({ query: { ...route.query, sub: key } })
}
</script>

<style scoped lang="scss">
.tabbed-module {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 胶囊式 tab 条：一级白卡，激活态品牌蓝 */
.module-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  width: fit-content;
  max-width: 100%;
  overflow-x: auto;
  padding: 4px;
  background: #fff;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  box-shadow: var(--mx-shadow-soft);
}

.module-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 6px 14px;
  border: 0;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--mx-sub);
  white-space: nowrap;
  transition: background-color .15s ease, color .15s ease;
}

.module-tab:hover {
  color: var(--mx-text);
  background: var(--mx-soft);
}

.module-tab.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.tab-icon {
  font-size: 14px;
}

.module-body {
  min-width: 0;
}
</style>

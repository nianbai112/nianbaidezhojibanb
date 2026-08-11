<template>
  <!-- 首页装修画布里的「活动页」块：按 slug 拉 DSL 实时预览 -->
  <div class="tdp">
    <TmagicItemsView
      :block="block"
      :width="width"
      :background="pageBg"
      :empty-text="slug ? `活动页 ${slug} · 未找到` : '活动页 · 未配置标识'"
      loading-text="活动页加载中…"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { request } from '@/api/request'
import TmagicItemsView from '@/components/layout/renderer/TmagicItemsView.vue'
import { buildTmagicItems, type TmagicBlock } from '@/components/layout/renderer/normalize'

const props = withDefaults(defineProps<{ slug?: string; width?: number }>(), { slug: '', width: 351 })

const block = ref<TmagicBlock>({ status: 'empty', items: [], height: 0 })
const pageBg = ref('')

async function load(slug: string) {
  const s = String(slug || '').trim()
  pageBg.value = ''
  if (!s) {
    block.value = { status: 'empty', items: [], height: 0 }
    return
  }
  block.value = { status: 'loading', items: [], height: 120 }
  try {
    const res: any = await request.get(`/layout/tmagic/${encodeURIComponent(s)}`)
    const dsl = res?.data ?? res ?? null
    block.value = buildTmagicItems(dsl)
    pageBg.value = dsl?.items?.[0]?.style?.background || ''
  } catch (e: any) {
    if (!e?.__silent) console.warn(`[tmagic-decor] 活动页加载失败: ${s}`, e)
    block.value = { status: 'empty', items: [], height: 0 }
  }
}

watch(() => props.slug, (s) => load(s), { immediate: true })
</script>

<style scoped>
.tdp {
  margin: 8px auto;
  border-radius: 12px;
  overflow: hidden;
  width: fit-content;
}
</style>

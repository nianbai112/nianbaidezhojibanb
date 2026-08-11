<template>
  <section class="section-card glass-card">
    <div class="card-title">发布入口装修</div>
    <p class="form-tip">只编辑展示文案和插画，不改变笔记、闲置、跑腿的业务权限。</p>
    <div class="hero-grid">
      <ImageUploadBox :model-value="config.heroImage" scene="region-publish-hero" shape="square" placeholder="上传顶部吉祥物" tip="建议透明 PNG" :max-size="5" @update:model-value="value => updateHeader('heroImage', value)" />
      <div class="fields"><el-input :model-value="config.title" placeholder="标题" @update:model-value="value => updateHeader('title', value)" /><el-input :model-value="config.subtitle" placeholder="副标题" @update:model-value="value => updateHeader('subtitle', value)" /></div>
    </div>
    <el-divider />
    <div v-for="entry in definitions" :key="entry.key" class="entry-card">
      <ImageUploadBox :model-value="config.entries[entry.key].image" :scene="`region-publish-${entry.key}`" shape="square" :placeholder="`上传${entry.label}插图`" tip="建议透明 PNG 或 WebP" :max-size="2" @update:model-value="value => updateEntry(entry.key, 'image', value)" />
      <div class="fields"><b>{{ entry.label }}</b><el-input :model-value="config.entries[entry.key].title" placeholder="入口标题" @update:model-value="value => updateEntry(entry.key, 'title', value)" /><el-input :model-value="config.entries[entry.key].subtitle" placeholder="入口说明" @update:model-value="value => updateEntry(entry.key, 'subtitle', value)" /></div>
      <el-switch :model-value="config.entries[entry.key].enabled" active-text="显示" inactive-text="隐藏" @update:model-value="value => updateEntry(entry.key, 'enabled', value)" />
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
type EntryKey = 'note' | 'secondhand' | 'errand'
const defaults = () => ({ title: '今天想发点什么？', subtitle: '选择你要发布的内容类型', heroImage: '', entries: { note: { enabled: true, title: '发笔记', subtitle: '发布校园生活、经验和新鲜事', image: '' }, secondhand: { enabled: true, title: '出闲置', subtitle: '发布你不再需要的物品', image: '' }, errand: { enabled: true, title: '跑腿任务', subtitle: '发布帮取快递、代买等需求', image: '' } } })
const props = defineProps<{ modelValue?: any }>()
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()
const definitions: Array<{ key: EntryKey; label: string }> = [{ key: 'note', label: '发笔记' }, { key: 'secondhand', label: '出闲置' }, { key: 'errand', label: '跑腿任务' }]
const config = computed(() => { const fallback = defaults(); const value = props.modelValue || {}; return { ...fallback, ...value, entries: { note: { ...fallback.entries.note, ...(value.entries?.note || {}) }, secondhand: { ...fallback.entries.secondhand, ...(value.entries?.secondhand || {}) }, errand: { ...fallback.entries.errand, ...(value.entries?.errand || {}) } } } })
const updateHeader = (field: 'title' | 'subtitle' | 'heroImage', value: string) => emit('update:modelValue', { ...config.value, [field]: String(value || '') })
const updateEntry = (key: EntryKey, field: string, value: string | boolean) => emit('update:modelValue', { ...config.value, entries: { ...config.value.entries, [key]: { ...config.value.entries[key], [field]: field === 'enabled' ? value === true : String(value || '') } } })
</script>
<style scoped>
.section-card{padding:24px}.card-title{font-size:18px;font-weight:800}.form-tip{color:#72806a}.hero-grid,.entry-card{display:grid;grid-template-columns:160px minmax(0,1fr);gap:16px;align-items:center}.fields{display:grid;gap:10px}.entry-card{grid-template-columns:120px minmax(0,1fr) auto;padding:14px;border:1px solid #e5ecd9;border-radius: 14px;background:#fffef8}.entry-card+.entry-card{margin-top:12px}
</style>

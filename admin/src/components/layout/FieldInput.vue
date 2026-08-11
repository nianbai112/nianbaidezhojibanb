<template>
  <div class="field-input">
    <el-input v-if="field.input === 'text'" v-model="model[field.key]" :placeholder="field.placeholder" />
    <el-input v-else-if="field.input === 'textarea'" v-model="model[field.key]" type="textarea" :rows="3" :placeholder="field.placeholder" />
    <el-input-number v-else-if="field.input === 'number'" v-model="model[field.key]" :min="field.min" :max="field.max" :step="field.step" />
    <el-switch v-else-if="field.input === 'switch'" v-model="model[field.key]" />
    <el-color-picker v-else-if="field.input === 'color'" v-model="model[field.key]" />
    <el-select v-else-if="field.input === 'select'" v-model="model[field.key]" style="width: 100%">
      <el-option v-for="o in field.options || []" :key="o.value" :label="o.label" :value="o.value" />
    </el-select>
    <ImageUploadBox v-else-if="field.input === 'image'" v-model="model[field.key]" :shape="field.shape || 'wide'" />

    <!-- 点击动作：类型 + 目标，存储为协议前缀字符串（与小程序 navigateToUrl 对齐） -->
    <div v-else-if="field.input === 'link'" class="link-input">
      <el-select :model-value="linkParts.type" style="width: 118px" @update:model-value="setLinkType">
        <el-option v-for="t in LINK_TYPES" :key="t.value" :label="t.label" :value="t.value" />
      </el-select>
      <el-input
        v-if="!['none', 'publish'].includes(linkParts.type)"
        :model-value="linkParts.value"
        :placeholder="linkPlaceholders[linkParts.type]"
        @update:model-value="setLinkValue"
      />
    </div>

    <!-- items：子项列表（一层递归） -->
    <div v-else-if="field.input === 'items'" class="sub-list">
      <div v-for="(item, i) in list" :key="i" class="sub-item">
        <div class="sub-item-bar">
          <span class="sub-item-no">#{{ i + 1 }}</span>
          <el-button size="small" text :icon="Top" :disabled="i === 0" title="上移" @click="moveItem(i, -1)" />
          <el-button size="small" text :icon="Bottom" :disabled="i === list.length - 1" title="下移" @click="moveItem(i, 1)" />
          <el-button size="small" type="danger" circle class="sub-del" @click="list.splice(i, 1)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <template v-for="sf in field.itemFields || []" :key="sf.key">
          <FieldInput :field="sf" :model="item" />
        </template>
      </div>
      <el-button size="small" @click="addItem">{{ field.addText || '+ 添加' }}</el-button>
    </div>

    <div v-if="field.desc" class="field-desc">{{ field.desc }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Delete, Top, Bottom } from '@element-plus/icons-vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import type { WidgetField } from '@/views/layout/layoutSchemas'

const props = defineProps<{ field: WidgetField; model: Record<string, any> }>()

// items 类型时确保是数组
const list = computed<any[]>({
  get: () => {
    if (!Array.isArray(props.model[props.field.key])) {
      props.model[props.field.key] = []
    }
    return props.model[props.field.key]
  },
  set: (v) => { props.model[props.field.key] = v },
})

const addItem = () => {
  list.value = [...list.value, JSON.parse(JSON.stringify(props.field.itemDefaults || {}))]
}

/** 子项上移/下移 */
const moveItem = (i: number, d: number) => {
  const j = i + d
  if (j < 0 || j >= list.value.length) return
  const arr = [...list.value]
  const [m] = arr.splice(i, 1)
  arr.splice(j, 0, m)
  list.value = arr
}

// ============ 点击动作（协议前缀字符串 ↔ 类型+目标，与小程序 navigateToUrl 对齐） ============
const LINK_TYPES = [
  { label: '无动作', value: 'none' },
  { label: '跳转页面', value: 'internal' },
  { label: '重定向', value: 'redirect' },
  { label: '切换 Tab', value: 'switchtab' },
  { label: '重启应用栈', value: 'relaunch' },
  { label: '打开外链', value: 'web' },
  { label: '打开小程序', value: 'miniapp' },
  { label: '预览图片', value: 'img' },
  { label: '复制文本', value: 'copy' },
  { label: '拨打电话', value: 'tel' },
  { label: '打开地图', value: 'map' },
  { label: '发布弹窗', value: 'publish' },
]
/** 需要协议前缀的类型（web/internal 存原始值） */
const PREFIXED: Record<string, string> = {
  redirect: 'redirect:',
  switchtab: 'switchtab:',
  relaunch: 'relaunch:',
  miniapp: 'miniapp:',
  img: 'img:',
  copy: 'copy:',
  tel: 'tel:',
  map: 'map:',
  publish: 'publish:',
}
const linkPlaceholders: Record<string, string> = {
  none: '',
  internal: '页面路径，如 pagesB/post/post',
  redirect: '页面路径（关闭当前页再打开）',
  switchtab: 'Tab 页面路径，如 pages/tabbar/news/news',
  relaunch: '页面路径（清空页面栈后打开）',
  web: 'https://example.com',
  miniapp: 'appId|页面路径',
  img: '图片地址 https://…',
  copy: '要复制的文本内容',
  tel: '电话号码',
  map: '纬度,经度,名称，如 30.52,114.36,图书馆',
  publish: '',
}
const linkParts = computed(() => {
  const raw = String(props.model[props.field.key] || '')
  if (!raw) return { type: 'none', value: '' }
  for (const [type, prefix] of Object.entries(PREFIXED)) {
    if (raw.startsWith(prefix)) return { type, value: raw.slice(prefix.length) }
  }
  if (/^https?:\/\//.test(raw)) return { type: 'web', value: raw }
  return { type: 'internal', value: raw }
})
const setLinkType = (type: string) => {
  if (type === 'none') {
    props.model[props.field.key] = ''
    return
  }
  if (type === 'publish') {
    props.model[props.field.key] = 'publish:'
    return
  }
  setLinkRaw(type, linkParts.value.value)
}
const setLinkValue = (v: string) => setLinkRaw(linkParts.value.type, v)
const setLinkRaw = (type: string, v: string) => {
  if (type === 'none' || !v) {
    props.model[props.field.key] = ''
  } else if (PREFIXED[type]) {
    props.model[props.field.key] = `${PREFIXED[type]}${v}`
  } else {
    props.model[props.field.key] = v
  }
}
</script>

<style scoped>
.field-input {
  width: 100%;
}
.sub-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.sub-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--mx-border, #e3e9f2);
  border-radius: 8px;
  background: var(--mx-soft, #f7f9fc);
}
.sub-item-bar {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sub-item-no {
  margin-right: auto;
  font-size: 11px;
  font-weight: 700;
  color: var(--mx-muted, #7d8ba3);
  font-variant-numeric: tabular-nums;
}
.sub-del {
  margin-left: 4px;
}
.link-input {
  display: flex;
  gap: 6px;
  width: 100%;
}
.field-desc {
  margin-top: 4px;
  color: var(--mx-muted, #7d8ba3);
  font-size: 11.5px;
  line-height: 1.5;
}
</style>

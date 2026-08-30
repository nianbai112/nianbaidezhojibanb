<template>
  <section class="section-card glass-card">
    <div class="section-head">
      <div>
        <div class="card-title">我的页九宫格入口</div>
        <div class="form-tip">可按需保留、删除或新增入口；新入口可输入小程序内部页面路径。</div>
      </div>
      <el-button type="primary" plain @click="addCustom">新增入口</el-button>
      <el-tag type="success">当前显示 {{ visibleCount }} 个</el-tag>
    </div>
    <div class="action-list">
      <div v-for="(item, index) in model.items" :key="item.key" class="action-row">
        <div class="action-order">{{ index + 1 }}</div>
        <el-input v-model="item.title" maxlength="8" show-word-limit placeholder="入口名称" />
        <el-select v-model="item.icon" placeholder="选择图标">
          <el-option v-for="icon in icons" :key="icon.value" :label="icon.label" :value="icon.value">
            <span class="icon-option"><i :class="['txtIcon', icon.value]"></i>{{ icon.label }}</span>
          </el-option>
        </el-select>
        <el-select v-model="item.tone" placeholder="颜色"><el-option v-for="tone in tones" :key="tone.value" :label="tone.label" :value="tone.value" /></el-select>
        <el-select v-model="item.permission"><el-option label="所有用户" value="all" /><el-option label="商家" value="merchant" /><el-option label="骑手" value="rider" /><el-option label="区域管理员" value="manager" /></el-select>
        <el-select v-model="item.type" placeholder="跳转方式"><el-option label="小程序内部页面" value="internal" /><el-option label="我的页内容 Tab" value="profile_tab" /></el-select>
        <el-select v-if="item.type === 'profile_tab'" v-model="item.tabIndex" placeholder="选择 Tab"><el-option label="我的发布" :value="0" /><el-option label="我的收藏" :value="1" /><el-option label="浏览记录" :value="2" /><el-option label="收到的评论" :value="3" /></el-select>
        <el-input v-else v-model="item.path" placeholder="路径，如 /pagesA/Rider/Rider" />
        <el-switch v-model="item.enabled" active-text="显示" inactive-text="隐藏" />
        <el-button size="small" :disabled="index === 0" @click="move(index, -1)">上移</el-button>
        <el-button size="small" :disabled="index === model.items.length - 1" @click="move(index, 1)">下移</el-button>
        <el-button size="small" type="danger" plain @click="remove(index)">删除</el-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ modelValue: any }>()
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()
const model = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const icons = [{ label: '发布笔记', value: 'icon-bianji' }, { label: '订单', value: 'icon-dingdan2' }, { label: '跑腿', value: 'icon-qishoupeisong' }, { label: '票券', value: 'icon-bill' }, { label: '收藏', value: 'icon-aixin4' }, { label: '浏览记录', value: 'icon-eye' }, { label: '评论', value: 'icon-comment-circle-o' }, { label: '账号认证', value: 'icon-user-o' }, { label: '我的称号', value: 'icon-huangguan' }]
const tones = [{ label: '草绿', value: 'green' }, { label: '橙色', value: 'orange' }, { label: '蓝色', value: 'blue' }, { label: '黄色', value: 'yellow' }, { label: '浅绿', value: 'green-soft' }, { label: '紫色', value: 'purple' }, { label: '金色', value: 'gold' }]
const visibleCount = computed(() => model.value.items.filter((item: any) => item.enabled !== false).length)

function addCustom() {
  const items = [...model.value.items, {
    key: `custom_${Date.now()}`,
    title: '骑手中心',
    icon: 'icon-qishoupeisong',
    tone: 'green',
    permission: 'all',
    type: 'internal',
    path: '',
    enabled: true,
    sortOrder: model.value.items.length,
  }]
  emit('update:modelValue', { ...model.value, items })
}

function remove(index: number) {
  const items = model.value.items.filter((_: any, itemIndex: number) => itemIndex !== index)
  items.forEach((item: any, itemIndex: number) => { item.sortOrder = itemIndex })
  emit('update:modelValue', { ...model.value, items })
}

function move(index: number, direction: number) {
  const target = index + direction
  if (target < 0 || target >= model.value.items.length) return
  const items = [...model.value.items]
  ;[items[index], items[target]] = [items[target], items[index]]
  items.forEach((item, itemIndex) => { item.sortOrder = itemIndex })
  emit('update:modelValue', { ...model.value, items })
}
</script>

<style scoped>
.section-card{padding:24px}.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.card-title{font-size:18px;font-weight:800}.form-tip{color:var(--mx-muted);font-size:12px;margin-top:5px}.action-list{display:grid;gap:10px;margin-top:16px}.action-row{display:grid;grid-template-columns:30px minmax(90px,1fr) minmax(130px,1fr) 100px 115px 140px minmax(190px,1.5fr) auto auto auto auto;gap:8px;align-items:center;padding:12px;border:1px solid #e5ecd9;border-radius:14px;background:#fbfdf8}.action-order{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#eaf7db;color:#5ba642;font-size:12px;font-weight:800}.icon-option{display:flex;align-items:center;gap:8px}.icon-option .txtIcon{width:18px;text-align:center}@media (max-width:1300px){.action-row{grid-template-columns:30px 1fr 1fr 1fr}.action-row :deep(.el-switch),.action-row :deep(.el-button){justify-self:start}}</style>

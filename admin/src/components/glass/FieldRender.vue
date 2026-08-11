<template>
  <span v-if="type === 'money'" class="money">{{ formatMoney(value) }}</span>
  <el-tag v-else-if="type === 'tag'" :type="tagType(value)" effect="light" size="small">{{ value || '-' }}</el-tag>
  <div v-else-if="type === 'avatar'" class="user-line">
    <div :class="['avatar', avatarClass]">{{ avatarText(value) }}</div>
    <div style="min-width:0"><div class="name-main">{{ obj(value).name || value || '-' }}</div><div class="name-sub">{{ obj(value).sub || '' }}</div></div>
  </div>
  <el-image
    v-else-if="type === 'image' && isImageUrl(value)"
    class="field-image"
    :src="value"
    fit="cover"
    :preview-src-list="[value]"
    preview-teleported
  />
  <div v-else-if="type === 'image'" class="empty-image">暂无</div>
  <span v-else-if="type === 'number'" class="num-cell">{{ formatNum(value) }}</span>
  <el-rate v-else-if="type === 'rating'" :model-value="Number(value || 4.8)" disabled show-score text-color="#f59e0b" score-template="{value}" size="small" />
  <el-progress v-else-if="type === 'progress'" :percentage="Number(value || 0)" :stroke-width="6" :format="(p: number) => p + '%'" />
  <span v-else class="text-cell">{{ value || '-' }}</span>
</template>
<script setup lang="ts">
defineProps<{ value:any; type?:string; avatarClass?:string }>()
function obj(v:any){ return typeof v === 'object' && v ? v : { name: v } }
function avatarText(v:any){ const o = obj(v); return String(o.avatar || o.name || '').slice(0,1) || '图' }
function isImageUrl(v:any){ const s = String(v || ''); return /^https?:\/\//.test(s) || s.startsWith('/') || s.startsWith('wxfile://') || s.startsWith('cloud://') }
function formatMoney(v:any){ const n = Number(v || 0); if(n === 0) return '¥ 0'; return '¥ ' + n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) }
function formatNum(v:any){ const n = Number(v || 0); return n === 0 ? '0' : n.toLocaleString() }
function tagType(v:any){ const s = String(v); if(['正常','已认证','已支付','已完成','已结算','营业中','进行中'].includes(s)) return 'success'; if(['待审核','待付款','待结算','退款中','配送中','待自提'].includes(s)) return 'warning'; if(['禁用','异常','已取消','已退款','拒绝'].includes(s)) return 'danger'; return 'info' }
</script>
<style scoped>
.num-cell {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.text-cell {
  color: #334155;
}
.field-image {
  width: 42px;
  height: 42px;
  border-radius: 6px;
  background: #f1f5f9;
  display: block;
}
.empty-image {
  color: #94a3b8;
  font-size: 12px;
}
</style>

<template>
  <span v-if="type === 'money'" class="money">{{ formatMoney(value) }}</span>
  <el-tag v-else-if="type === 'tag'" :type="tagType(value)" effect="light">{{ value }}</el-tag>
  <div v-else-if="type === 'avatar'" class="user-line">
    <div :class="['avatar', avatarClass]">{{ avatarText(value) }}</div>
    <div style="min-width:0"><div class="name-main">{{ obj(value).name || value }}</div><div class="name-sub">{{ obj(value).sub || '' }}</div></div>
  </div>
  <div v-else-if="type === 'image'" class="avatar green">{{ avatarText(value) }}</div>
  <span v-else-if="type === 'number'">{{ Number(value || 0).toLocaleString() }}</span>
  <el-rate v-else-if="type === 'rating'" :model-value="Number(value || 4.8)" disabled show-score text-color="#f59e0b" score-template="{value}" />
  <el-progress v-else-if="type === 'progress'" :percentage="Number(value || 0)" :stroke-width="8" />
  <span v-else>{{ value }}</span>
</template>
<script setup lang="ts">
defineProps<{ value:any; type?:string; avatarClass?:string }>()
function obj(v:any){ return typeof v === 'object' && v ? v : { name: v } }
function avatarText(v:any){ const o = obj(v); return String(o.avatar || o.name || '').slice(0,1) || '图' }
function formatMoney(v:any){ const n = Number(v || 0); return '¥ ' + n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) }
function tagType(v:any){ const s = String(v); if(['正常','已认证','已支付','已完成','已结算','营业中','进行中'].includes(s)) return 'success'; if(['待审核','待付款','待结算','退款中','配送中','待自提'].includes(s)) return 'warning'; if(['禁用','异常','已取消','已退款','拒绝'].includes(s)) return 'danger'; return 'info' }
</script>

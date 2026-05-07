<template><div class="glass-card"><div class="card-header"><div class="card-title">{{ title }}</div></div><div class="card-body"><div class="sort-list"><div v-for="(it,i) in items" :key="it"><span>☷ {{ i+1 }}</span><b>{{ it }}</b><el-icon><View /></el-icon></div></div><el-button style="width:100%;margin-top:12px" type="primary" plain>保存配置</el-button></div></div></template>
<script setup lang="ts">
import { View } from '@element-plus/icons-vue'
defineProps<{ title:string; items:string[] }>()
</script>
<style scoped>.sort-list{display:grid;gap:8px}.sort-list div{height:36px;border-radius:12px;background:rgba(248,250,252,.84);border:1px solid rgba(226,232,240,.7);display:grid;grid-template-columns:48px 1fr 28px;align-items:center;padding:0 10px;color:#64748b}.sort-list b{color:#1e293b}</style>

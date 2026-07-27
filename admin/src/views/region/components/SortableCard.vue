<template>
  <div class="sort-wrap">
    <div class="sort-list">
      <div v-for="(it,i) in items" :key="it">
        <span class="sort-idx">{{ i+1 }}</span>
        <b>{{ it }}</b>
        <el-icon class="sort-grip"><View /></el-icon>
      </div>
    </div>
    <el-button style="width:100%;margin-top:14px" type="primary" plain size="small">保存配置</el-button>
  </div>
</template>
<script setup lang="ts">
import { View } from '@element-plus/icons-vue'
defineProps<{ title:string; items:string[] }>()
</script>
<style scoped>
.sort-wrap {
  padding: 16px 24px 24px;
}
.sort-list {
  display: grid;
  gap: 8px;
}
.sort-list div {
  height: 40px;
  border-radius: 10px;
  background: rgba(248, 250, 252, .84);
  border: 1px solid rgba(226, 232, 240, .7);
  display: grid;
  grid-template-columns: 40px 1fr 28px;
  align-items: center;
  padding: 0 12px;
  color: var(--mx-sub);
  transition: .15s ease;
}
.sort-list div:hover {
  background: rgba(239, 246, 255, .7);
  border-color: rgba(147, 197, 253, .5);
}
.sort-idx {
  font-weight: 800;
  font-size: 12px;
  color: var(--mx-muted);
}
.sort-list b {
  color: var(--mx-text);
  font-size: 13px;
}
.sort-grip {
  opacity: .4;
  cursor: grab;
}
</style>

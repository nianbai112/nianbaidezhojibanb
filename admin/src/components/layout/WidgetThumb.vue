<template>
  <div class="wt" :style="{ '--wc': color, '--wb': bg }">
    <!-- 内容型组件的迷你示意 -->
    <template v-if="type === 'navbar'">
      <div class="wt-bar" /><div class="wt-line w60" /><div class="wt-line w40" />
    </template>
    <template v-else-if="type === 'search'">
      <div class="wt-pill" /><div class="wt-line w60" /><div class="wt-line w40" />
    </template>
    <template v-else-if="type === 'banner'">
      <div class="wt-img"><i /></div>
    </template>
    <template v-else-if="type === 'grid-menu'">
      <div class="wt-grid"><i v-for="n in 8" :key="n" /></div>
    </template>
    <template v-else-if="type === 'announcement'">
      <div class="wt-notice" /><div class="wt-line w60" />
    </template>
    <template v-else-if="type === 'text'">
      <div class="wt-line w80" /><div class="wt-line w60" /><div class="wt-line w40" />
    </template>
    <template v-else-if="type === 'image'">
      <div class="wt-img wt-img-plain"><i /></div>
    </template>
    <template v-else-if="type === 'button'">
      <div class="wt-btn" />
    </template>
    <template v-else-if="type === 'divider'">
      <div class="wt-divider" />
    </template>
    <!-- 业务模块：图标卡 -->
    <template v-else>
      <div class="wt-dyn">
        <span class="wt-dyn-icon"><el-icon :size="15"><component :is="icon" /></el-icon></span>
        <span class="wt-dyn-lines"><i class="wt-line w60" /><i class="wt-line w40" /></span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
defineProps<{ type: string; icon: any; color: string; bg: string }>()
</script>

<style scoped>
.wt {
  width: 100%;
  height: 56px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--mx-border, #e3e9f2);
  padding: 7px 9px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  box-sizing: border-box;
  overflow: hidden;
}
.wt-line {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: #e2e8f0;
}
.w80 { width: 80%; }
.w60 { width: 60%; }
.w40 { width: 40%; }
.wt-bar {
  height: 9px;
  border-radius: 3px;
  background: var(--wc);
  opacity: .85;
}
.wt-pill {
  height: 10px;
  border-radius: 999px;
  background: #eef2f7;
  border: 1px solid #e2e8f0;
}
.wt-img {
  flex: 1;
  border-radius: 5px;
  background: linear-gradient(135deg, var(--wb), var(--wc));
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 4px;
}
.wt-img i {
  width: 18px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, .9);
}
.wt-img-plain { background: #eef2f7; }
.wt-img-plain i { background: var(--wc); }
.wt-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  flex: 1;
}
.wt-grid i {
  border-radius: 4px;
  background: var(--wb);
}
.wt-notice {
  height: 11px;
  border-radius: 4px;
  background: #fff3d6;
  border: 1px solid #f5e3b3;
}
.wt-btn {
  height: 14px;
  border-radius: 999px;
  background: var(--wc);
}
.wt-divider {
  height: 2px;
  background: #e2e8f0;
  margin: 0 4px;
}
.wt-dyn {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
}
.wt-dyn-icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: var(--wb);
  color: var(--wc);
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.wt-dyn-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
</style>

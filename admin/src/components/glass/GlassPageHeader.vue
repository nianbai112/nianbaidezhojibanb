<template>
  <div class="page-head">
    <div>
      <div class="breadcrumb">控制台 / {{ title }}</div>
      <h1>{{ title }}</h1>
      <p>{{ subtitle }}</p>
    </div>
    <div class="head-actions"><slot name="actions" /></div>
  </div>
</template>
<script setup lang="ts">
defineProps<{ title:string; subtitle?:string }>()
</script>
<style scoped lang="scss">
.page-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding:8px 2px 0; }
.breadcrumb { color:#64748b; font-size:13px; font-weight:800; margin-bottom:12px; }
h1 { margin:0; font-size:30px; line-height:1.2; letter-spacing:-1px; font-weight:950; }
p { margin:8px 0 0; color:#64748b; font-weight:600; }
.head-actions { display:flex; gap:10px; align-items:center; }
@media(max-width:720px){ .page-head{ flex-direction:column; } }
</style>

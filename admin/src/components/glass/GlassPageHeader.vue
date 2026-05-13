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
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 18px;
  padding: 2px 2px 2px;
}

.breadcrumb {
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 8px;
}

h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.16;
  letter-spacing: 0;
  font-weight: 950;
  color: #172033;
}

p {
  margin: 8px 0 0;
  color: #64748b;
  font-weight: 680;
  font-size: 15px;
}

.head-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}

@media(max-width:720px) {
  .page-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

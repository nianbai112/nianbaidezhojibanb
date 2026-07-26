<template>
  <div class="page-header glass-card">
    <div class="header-left">
      <div class="header-icon" v-if="icon">
        <el-icon :size="24"><component :is="icon" /></el-icon>
      </div>
      <div class="header-text">
        <h1>{{ title }}</h1>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
    </div>
    <div class="header-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  icon?: string
}>()
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  margin-bottom: 24px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(18px);
  border-radius: 16px;
  border: 1px solid rgba(219, 228, 240, 0.88);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.045);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #2563eb, #0891b2);
  border-radius: 14px;
  color: white;
}

.header-text h1 {
  margin: 0;
  font-size: 23px;
  font-weight: 760;
  color: #0f172a;
  letter-spacing: 0;
}

.header-text p {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 500;
  color: #526174;
}

.header-actions {
  display: flex;
  gap: 8px;
}
</style>

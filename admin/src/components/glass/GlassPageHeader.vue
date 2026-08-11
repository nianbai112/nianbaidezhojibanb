<template>
  <!-- P2：与 common/PageHeader 完全同构，保留旧导入路径兼容 -->
  <PageHeader :title="title" :subtitle="subtitle">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import PageHeader from '../common/PageHeader.vue'

defineProps<{
  title: string
  subtitle?: string
}>()
</script>

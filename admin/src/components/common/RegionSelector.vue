<template>
  <el-select
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    placeholder="选择区域"
    clearable
    filterable
    :style="{ width }"
  >
    <el-option v-if="showAllOption" :label="allOptionLabel" value="" />
    <el-option
      v-for="region in regions"
      :key="region.id"
      :label="region.name"
      :value="region.id"
    />
  </el-select>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '@/api/request'

withDefaults(defineProps<{
  modelValue: string | number | undefined
  width?: string
  showAllOption?: boolean
  allOptionLabel?: string
}>(), {
  width: '160px',
  showAllOption: true,
  allOptionLabel: '全部区域'
})

defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const regions = ref<any[]>([])

onMounted(async () => {
  try {
    const res = await request.get('/admin/regions', { params: { page: 1, pageSize: 100 } })
    regions.value = Array.isArray(res)
      ? res
      : (res as any)?.list || (res as any)?.data?.list || (res as any)?.data || []
  } catch (e) {
    regions.value = []
  }
})
</script>

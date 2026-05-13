<template>
  <el-tag :type="tagType" :size="size" :effect="effect">{{ label }}</el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
  size?: 'small' | 'default' | 'large'
  effect?: 'dark' | 'light' | 'plain'
}>()

const statusMap: Record<string, { type: string; label: string }> = {
  active: { type: 'success', label: '正常' },
  enabled: { type: 'success', label: '启用' },
  approved: { type: 'success', label: '已通过' },
  completed: { type: 'success', label: '已完成' },
  paid: { type: 'success', label: '已支付' },
  online: { type: 'success', label: '在线' },
  PUBLISHED: { type: 'success', label: '已发布' },
  resolved: { type: 'success', label: '已处理' },

  pending: { type: 'warning', label: '待处理' },
  PENDING: { type: 'warning', label: '待审核' },
  processing: { type: 'warning', label: '处理中' },
  reviewing: { type: 'warning', label: '审核中' },
  shipping: { type: 'warning', label: '配送中' },

  inactive: { type: 'info', label: '禁用' },
  disabled: { type: 'info', label: '禁用' },
  offline: { type: 'info', label: '离线' },
  closed: { type: 'info', label: '已关闭' },
  hidden: { type: 'info', label: '已隐藏' },
  dissolved: { type: 'info', label: '已解散' },

  banned: { type: 'danger', label: '封禁' },
  rejected: { type: 'danger', label: '已拒绝' },
  REJECTED: { type: 'danger', label: '已驳回' },
  failed: { type: 'danger', label: '失败' },
  cancelled: { type: 'danger', label: '已取消' },
  refunded: { type: 'danger', label: '已退款' },
  expired: { type: 'danger', label: '已过期' },
  deleted: { type: 'danger', label: '已删除' },
  DELETED: { type: 'danger', label: '已删除' },
}

const tagType = computed(() => statusMap[props.status]?.type || 'info')
const label = computed(() => statusMap[props.status]?.label || props.status)
</script>

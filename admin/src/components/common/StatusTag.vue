<template>
  <a-tag :color="color" :style="{ borderRadius: '4px' }">
    <slot>{{ text }}</slot>
  </a-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  status: string
  type?: 'audit' | 'order' | 'user' | 'delivery' | 'payment' | 'general'
}>(), {
  type: 'general',
})

const color = computed(() => {
  if (props.type === 'audit') {
    const map: Record<string, string> = {
      pending: 'orange', approved: 'green', rejected: 'red',
    }
    return map[props.status] || 'default'
  }
  if (props.type === 'order') {
    const map: Record<string, string> = {
      pending_pay: 'orange', pending_deliver: 'blue',
      delivering: 'cyan', delivered: 'geekblue',
      completed: 'green', cancelled: 'default',
      refunding: 'purple', refunded: 'red',
    }
    return map[props.status] || 'default'
  }
  if (props.type === 'user') {
    const map: Record<string, string> = {
      active: 'green', disabled: 'default', banned: 'red',
    }
    return map[props.status] || 'default'
  }
  if (props.type === 'delivery') {
    const map: Record<string, string> = {
      waiting_accept: 'orange', accepted: 'blue',
      picked_up: 'cyan', delivering: 'geekblue',
      completed: 'green', cancelled: 'default',
      transferred: 'purple', refunded: 'red',
    }
    return map[props.status] || 'default'
  }
  if (props.type === 'payment') {
    const map: Record<string, string> = {
      pending: 'orange', paid: 'blue', success: 'green',
      failed: 'red', refunding: 'purple', refunded: 'default', closed: 'default',
    }
    return map[props.status] || 'default'
  }
  return 'default'
})

const text = computed(() => {
  const commonMap: Record<string, string> = {
    active: '正常', disabled: '禁用', banned: '封禁',
    pending: '待审核', approved: '已通过', rejected: '已拒绝',
    draft: '草稿', on: '上架', off: '下架',
    none: '未认证',
  }
  if (commonMap[props.status]) return commonMap[props.status]

  const orderMap: Record<string, string> = {
    pending_pay: '待支付', pending_deliver: '待发货',
    delivering: '配送中', delivered: '已送达',
    completed: '已完成', cancelled: '已取消',
    refunding: '退款中', refunded: '已退款',
  }
  if (orderMap[props.status]) return orderMap[props.status]

  const deliveryMap: Record<string, string> = {
    waiting_accept: '待接单', accepted: '已接单',
    picked_up: '已取件', delivering: '配送中',
    completed: '已完成', cancelled: '已取消',
    transferred: '已转单', refunded: '已退款',
  }
  if (deliveryMap[props.status]) return deliveryMap[props.status]

  return props.status
})
</script>

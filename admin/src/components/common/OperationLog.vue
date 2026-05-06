<template>
  <div class="operation-log">
    <a-timeline>
      <a-timeline-item
        v-for="log in logs"
        :key="log.id"
        :color="getLogColor(log.action)"
      >
        <div class="log-item">
          <div class="log-header">
            <span class="log-operator">{{ log.username }}</span>
            <span class="log-action">{{ log.action }}</span>
            <span class="log-target">{{ log.target }}</span>
          </div>
          <div class="log-detail" v-if="log.detail">{{ log.detail }}</div>
          <div class="log-meta">
            <span class="log-time">{{ formatTime(log.createdAt) }}</span>
            <span class="log-ip">{{ log.ip }}</span>
          </div>
        </div>
      </a-timeline-item>
    </a-timeline>
    <a-empty v-if="!logs.length" description="暂无操作记录" :image-style="{ height: '60px' }" />
  </div>
</template>

<script setup lang="ts">
import { formatTime } from '@/utils/format'
import type { OperationLog } from '@/types/system'

defineProps<{
  logs: OperationLog[]
}>()

function getLogColor(action: string): string {
  if (action.includes('approve') || action.includes('通过')) return 'green'
  if (action.includes('reject') || action.includes('拒绝')) return 'red'
  if (action.includes('create') || action.includes('新建')) return 'blue'
  if (action.includes('delete') || action.includes('删除')) return 'red'
  if (action.includes('update') || action.includes('编辑')) return 'orange'
  return 'gray'
}
</script>

<style lang="less" scoped>
.operation-log {
  padding: 8px 0;

  .log-item {
    .log-header {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 13px;

      .log-operator { font-weight: 500; color: #1f2937; }
      .log-action { color: #6b7280; }
      .log-target { color: #3B82F6; }
    }

    .log-detail {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 4px;
    }

    .log-meta {
      font-size: 11px;
      color: #d1d5db;
      margin-top: 4px;
      display: flex;
      gap: 12px;
    }
  }
}
</style>

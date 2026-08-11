<template>
  <section class="availability-panel">
    <div class="availability-heading">
      <div>
        <strong>学校地图开通状态</strong>
        <span>草稿可以暂存，发布未开通状态前必须填写说明</span>
      </div>
      <div class="availability-tags">
        <el-tag :type="status === 'open' ? 'success' : 'warning'" effect="light">
          草稿：{{ statusLabel(status) }}
        </el-tag>
        <el-tag :type="publishedTagType" effect="plain">
          已发布：{{ statusLabel(publishedStatus) }}
        </el-tag>
      </div>
    </div>

    <div class="availability-controls">
      <el-radio-group
        :model-value="status"
        @update:model-value="emit('update:status', $event as 'open' | 'unopened')"
      >
        <el-radio-button value="open">已开通</el-radio-button>
        <el-radio-button value="unopened">未开通</el-radio-button>
      </el-radio-group>
      <el-input
        v-if="status === 'unopened'"
        :model-value="unavailableMessage"
        type="textarea"
        :rows="2"
        maxlength="200"
        show-word-limit
        placeholder="例如：校园地图资料正在校准，预计 9 月开放"
        @input="emit('update:unavailableMessage', String($event).slice(0, 200))"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: 'open' | 'unopened'
  unavailableMessage: string
  publishedStatus: 'open' | 'unopened' | 'unconfigured'
}>()

const emit = defineEmits<{
  'update:status': [value: 'open' | 'unopened']
  'update:unavailableMessage': [value: string]
}>()

const publishedTagType = computed(() => {
  if (props.publishedStatus === 'open') return 'success'
  if (props.publishedStatus === 'unopened') return 'warning'
  return 'info'
})

function statusLabel(status: string) {
  if (status === 'open') return '已开通'
  if (status === 'unopened') return '未开通'
  return '未配置'
}
</script>

<style scoped>
.availability-panel {
  display: grid;
  gap: 14px;
  margin-bottom: 14px;
  padding: 16px 18px;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  background: linear-gradient(135deg, #f8fbff, #fff);
}

.availability-heading,
.availability-tags,
.availability-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.availability-heading {
  justify-content: space-between;
}

.availability-heading > div:first-child {
  display: grid;
  gap: 4px;
}

.availability-heading strong {
  color: var(--mx-text);
  font-size: 14px;
}

.availability-heading span {
  color: var(--mx-sub);
  font-size: 12px;
}

.availability-controls :deep(.el-textarea) {
  flex: 1;
}

@media (max-width: 760px) {
  .availability-heading,
  .availability-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .availability-tags {
    flex-wrap: wrap;
  }
}
</style>

<template>
  <div class="page-shell">
    <PageHeader title="上线检查" subtitle="检查系统各模块是否就绪，确保上线质量" icon="Finished">
      <template #actions>
        <el-button type="primary" @click="runCheck" :loading="loading">重新检查</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never" class="score-card">
      <div class="score-row">
        <div class="score-circle" :style="{ borderColor: scoreColor }">
          <span class="score-number" :style="{ color: scoreColor }">{{ result.score ?? '-' }}</span>
          <span class="score-unit">分</span>
        </div>
        <div class="score-info">
          <el-tag :type="statusTagMap[result.status]" size="large" effect="dark">
            {{ statusLabelMap[result.status] || '检查中...' }}
          </el-tag>
          <p class="score-desc">
            {{ result.status === 'pass' ? '系统已就绪，可以上线' : result.status === 'warning' ? '部分配置缺失，建议修复后上线' : '存在严重问题，请修复后再上线' }}
          </p>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table :data="result.items || []" v-loading="loading" stripe>
        <el-table-column prop="name" label="检查项" min-width="200" />
        <el-table-column prop="level" label="重要性" width="100">
          <template #default="{ row }">
            <el-tag :type="levelTagMap[row.level]" size="small">{{ levelLabelMap[row.level] || row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagMap[row.status]" size="small">{{ statusLabelMap[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="说明" min-width="250" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const result = ref<any>({ score: 0, status: 'pending', items: [] })

const statusLabelMap: Record<string, string> = { pass: '通过', warning: '警告', failed: '未通过', pending: '检查中' }
const statusTagMap: Record<string, string> = { pass: 'success', warning: 'warning', failed: 'danger', pending: 'info' }
const levelLabelMap: Record<string, string> = { required: '必须', recommended: '建议', optional: '可选' }
const levelTagMap: Record<string, string> = { required: 'danger', recommended: 'warning', optional: 'info' }

const scoreColor = computed(() => {
  const s = result.value.score ?? 0
  if (s >= 90) return '#67c23a'
  if (s >= 70) return '#e6a23c'
  return '#f56c6c'
})

async function runCheck() {
  loading.value = true
  try {
    const res: any = await request.get('/admin/ops/launch-check')
    result.value = res
  } catch {
    result.value = { score: 0, status: 'failed', items: [] }
  } finally {
    loading.value = false
  }
}

onMounted(runCheck)
</script>

<style scoped>
.page-shell { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.score-card { text-align: center; }
.score-row { display: flex; align-items: center; justify-content: center; gap: 32px; padding: 16px 0; }
.score-circle { width: 100px; height: 100px; border-radius: 50%; border: 4px solid; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.score-number { font-size: 36px; font-weight: 800; line-height: 1; }
.score-unit { font-size: 12px; color: #999; }
.score-info { text-align: left; }
.score-desc { margin-top: 8px; color: #666; font-size: 14px; }
</style>

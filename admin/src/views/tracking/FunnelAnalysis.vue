<template>
  <div class="page-container">
    <div class="page-header">
      <h2>漏斗分析</h2>
      <el-button type="primary" :loading="loading" @click="loadFunnel(true)">刷新</el-button>
    </div>

    <div class="glass-card" style="padding: 20px;">
      <div class="funnel-steps">
        <el-input v-model="stepsInput" placeholder="事件步骤，用逗号分隔，如：page_view,content_click,order_create,order_pay" style="width: 100%; margin-bottom: 16px;" />
        <el-button type="primary" :loading="loading" @click="loadFunnel(false)">分析漏斗</el-button>
      </div>

      <div v-if="funnelData.length" class="funnel-result">
        <div v-for="(step, index) in funnelData" :key="index" class="funnel-step">
          <div class="step-bar" :style="{ width: getBarWidth(step.count) + '%' }">
            <span class="step-name">{{ step.eventName }}</span>
            <span class="step-count">{{ step.count }} ({{ step.uniqueUsers }} 人)</span>
          </div>
          <div v-if="index > 0" class="step-rate">
            转化率: {{ getConversionRate(index) }}%
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const stepsInput = ref('page_view,content_click,order_create,order_pay')
const funnelData = ref([])
const loading = ref(false)
const unwrap = (res: any) => res?.data ?? res ?? {}

const maxCount = () => Math.max(...funnelData.value.map((s: any) => s.count), 1)
const getBarWidth = (count: number) => Math.max(20, (count / maxCount()) * 100)
const getConversionRate = (index: number) => {
  if (index === 0) return 100
  const prev = funnelData.value[index - 1]?.count || 1
  const curr = funnelData.value[index]?.count || 0
  return ((curr / prev) * 100).toFixed(1)
}

const loadFunnel = async (showSuccess = false) => {
  loading.value = true
  try {
    const res = await request.get('/admin/tracking/funnel', { params: { steps: stepsInput.value } })
    funnelData.value = unwrap(res)?.funnel || []
    if (showSuccess) ElMessage.success('漏斗分析已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载漏斗分析失败')
    funnelData.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => loadFunnel())
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; }
.funnel-result { margin-top: 24px; }
.funnel-step { margin-bottom: 16px; position: relative; }
.step-bar { background: linear-gradient(90deg, #3b82f6, #60a5fa); color: white; padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; min-width: 200px; transition: width 0.3s; }
.step-name { font-weight: 600; }
.step-count { font-size: 14px; }
.step-rate { position: absolute; right: -120px; top: 50%; transform: translateY(-50%); font-size: 12px; color: #666; }
</style>

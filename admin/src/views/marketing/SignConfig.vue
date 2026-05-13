<template>
  <div class="page-container">
    <div class="page-header">
      <h2>签到配置</h2>
      <el-button type="primary" @click="saveConfig" :loading="saving">保存配置</el-button>
    </div>

    <div class="config-grid">
      <div class="glass-card">
        <h3>基础配置</h3>
        <el-form label-position="top">
          <el-form-item label="启用签到">
            <el-switch v-model="config.enabled" />
          </el-form-item>
          <el-form-item label="每日签到奖励">
            <el-input-number v-model="config.dailyReward" :min="0" />
          </el-form-item>
          <el-form-item label="最大连续天数">
            <el-input-number v-model="config.maxContinuousDays" :min="1" :max="30" />
          </el-form-item>
        </el-form>
      </div>

      <div class="glass-card">
        <h3>连续签到奖励</h3>
        <div class="reward-list">
          <div v-for="(reward, index) in config.continuousRewards" :key="index" class="reward-item">
            <span>第 {{ index + 1 }} 天</span>
            <el-input-number v-model="config.continuousRewards[index]" :min="0" size="small" />
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card">
      <h3>签到记录</h3>
      <el-table :data="records" v-loading="loadingRecords">
        <el-table-column prop="user.nickname" label="用户" />
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column prop="rewardValue" label="奖励" width="100" />
        <el-table-column prop="createdAt" label="时间" width="180" />
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const saving = ref(false)
const loadingRecords = ref(false)
const config = reactive({
  enabled: true,
  dailyReward: 10,
  maxContinuousDays: 7,
  continuousRewards: [20, 30, 50, 80, 100, 120, 150],
})
const records = ref<any[]>([])

const loadConfig = async () => {
  try {
    const res = await request.get('/admin/marketing/sign/config')
    if (res.data?.data) {
      Object.assign(config, res.data.data)
    }
  } catch (error) {
    console.error('加载配置失败', error)
    ElMessage.warning('加载签到配置失败')
  }
}

const loadRecords = async () => {
  loadingRecords.value = true
  try {
    const res = await request.get('/admin/marketing/sign/records')
    records.value = res.data?.list || []
  } catch (error) {
    console.error('加载记录失败', error)
    ElMessage.warning('加载签到记录失败')
  } finally {
    loadingRecords.value = false
  }
}

const saveConfig = async () => {
  saving.value = true
  try {
    await request.put('/admin/marketing/sign/config', config)
    ElMessage.success('配置已保存')
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadConfig()
  loadRecords()
})
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
.glass-card h3 { margin-bottom: 16px; }
.reward-list { display: flex; flex-direction: column; gap: 12px; }
.reward-item { display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #f5f7fa; border-radius: 8px; }
</style>

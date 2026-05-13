<template>
  <div class="page-container">
    <div class="page-header">
      <h2>AI配置</h2>
      <el-button type="primary" @click="saveConfig" :loading="saving">保存配置</el-button>
    </div>

    <div class="config-grid">
      <div class="glass-card">
        <h3>基础配置</h3>
        <el-form label-position="top">
          <el-form-item label="启用AI运营">
            <el-switch v-model="config.enabled" />
          </el-form-item>
          <el-form-item label="自动发帖">
            <el-switch v-model="config.postGenerateEnabled" />
          </el-form-item>
          <el-form-item label="自动评论">
            <el-switch v-model="config.commentGenerateEnabled" />
          </el-form-item>
          <el-form-item label="自动互动">
            <el-switch v-model="config.interactionEnabled" />
          </el-form-item>
          <el-form-item label="内容冷启动">
            <el-switch v-model="config.coldStartEnabled" />
          </el-form-item>
        </el-form>
      </div>

      <div class="glass-card">
        <h3>风控配置</h3>
        <el-form label-position="top">
          <el-form-item label="每日最大发帖数">
            <el-input-number v-model="config.riskControl.maxPostsPerDay" :min="0" />
          </el-form-item>
          <el-form-item label="每日最大评论数">
            <el-input-number v-model="config.riskControl.maxCommentsPerDay" :min="0" />
          </el-form-item>
          <el-form-item label="每日最大点赞数">
            <el-input-number v-model="config.riskControl.maxLikesPerDay" :min="0" />
          </el-form-item>
          <el-form-item label="最小间隔(秒)">
            <el-input-number v-model="config.riskControl.minInterval" :min="0" />
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const saving = ref(false)
const config = reactive({
  enabled: false,
  postGenerateEnabled: true,
  commentGenerateEnabled: true,
  interactionEnabled: true,
  coldStartEnabled: true,
  riskControl: {
    maxPostsPerDay: 50,
    maxCommentsPerDay: 200,
    maxLikesPerDay: 500,
    minInterval: 30,
  },
})

const loadConfig = async () => {
  try {
    const res = await request.get('/admin/ai/config')
    if (res.data?.data) {
      Object.assign(config, res.data.data)
      if (!config.riskControl) {
        config.riskControl = { maxPostsPerDay: 50, maxCommentsPerDay: 200, maxLikesPerDay: 500, minInterval: 30 }
      }
    }
  } catch (error) {
    console.error('加载配置失败', error)
    ElMessage.warning('加载AI配置失败')
  }
}

const saveConfig = async () => {
  saving.value = true
  try {
    await request.put('/admin/ai/config', config)
    ElMessage.success('配置已保存')
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => { loadConfig() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
.glass-card h3 { margin-bottom: 16px; }
</style>

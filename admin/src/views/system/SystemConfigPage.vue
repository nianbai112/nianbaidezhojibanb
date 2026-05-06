<template>
  <div class="detail-page">
    <div class="detail-header">
      <div><span class="page-title">系统配置</span>
        <p class="page-desc">按分组管理系统的核心配置参数，敏感字段以 *** 显示</p>
      </div>
      <a-button type="primary" :loading="saving" @click="handleSave">保存配置</a-button>
    </div>

    <div class="detail-section">
      <a-tabs v-model:active-key="activeGroup" @change="loadGroup">
        <a-tab-pane key="system" tab="系统配置" />
        <a-tab-pane key="basic" tab="基础配置" />
        <a-tab-pane key="upload" tab="上传配置" />
        <a-tab-pane key="ai" tab="AI 配置" />
        <a-tab-pane key="robot" tab="机器人配置" />
        <a-tab-pane key="sensitive_word" tab="敏感词配置" />
      </a-tabs>

      <a-spin :spinning="loading">
        <a-form :label-col="{ flex: '160px' }" :wrapper-col="{ flex: '480px' }" layout="horizontal">
          <a-empty v-if="!loading && Object.keys(configs).length === 0" description="此分组暂无配置项" />
          <template v-for="(value, key) in configs" :key="key">
            <a-form-item :label="formatLabel(String(key))">
              <!-- Boolean -->
              <a-switch v-if="typeof value === 'boolean'" :checked="value" @change="(v: boolean) => configs[key] = v" />
              <!-- Number -->
              <a-input-number
                v-else-if="typeof value === 'number'"
                v-model:value="configs[key]"
                :min="0"
                style="width:200px"
              />
              <!-- Masked secret -->
              <a-input-password
                v-else-if="isMasked(value)"
                v-model:value="configs[key]"
                placeholder="不修改请留空"
              />
              <!-- Long text -->
              <a-textarea
                v-else-if="typeof value === 'string' && (String(key).includes('content') || String(key).includes('html') || String(key).includes('desc') || String(value).length > 80)"
                v-model:value="configs[key]"
                :rows="3"
              />
              <!-- Default string -->
              <a-input v-else v-model:value="configs[key]" />
              <span v-if="isSensitiveKey(String(key))" class="hint-tag">敏感字段</span>
            </a-form-item>
          </template>
        </a-form>
      </a-spin>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { systemApi } from '@/api/system'

const loading = ref(false)
const saving = ref(false)
const activeGroup = ref('system')
const configs = reactive<Record<string, any>>({})

const maskedVal = '******'

onMounted(() => loadGroup())

function isMasked(val: any) {
  return val === maskedVal
}

function isSensitiveKey(key: string) {
  return /secret|key|password|token|private|cert/i.test(key)
}

function formatLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
}

async function loadGroup() {
  loading.value = true
  try {
    const res = await systemApi.getConfigGroup(activeGroup.value)
    const data = (res.data?.data || res.data || {}) as Record<string, any>
    // Reset
    for (const k of Object.keys(configs)) delete configs[k]
    Object.assign(configs, data)
  } catch {
    message.warning('加载配置失败')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    // Filter out unchanged masked values
    const payload: Record<string, any> = {}
    for (const [k, v] of Object.entries(configs)) {
      if (v === maskedVal && isSensitiveKey(k)) continue
      payload[k] = v
    }
    await systemApi.saveConfigGroup(activeGroup.value, payload)
    message.success('配置已保存')
    await loadGroup()
  } catch (err: any) {
    message.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="less">
.detail-page {
  padding: 24px;
}
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}
.page-desc {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 13px;
}
.detail-section {
  background: #fff;
  border-radius: 8px;
  padding: 16px 24px 24px;
}
.hint-tag {
  margin-left: 8px;
  color: #fa8c16;
  font-size: 11px;
  background: #fff7e6;
  padding: 1px 6px;
  border-radius: 3px;
}
</style>

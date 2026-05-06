<template>
  <a-card title="AI服务配置" :bordered="false">
    <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 14 }">
      <a-form-item label="启用AI">
        <a-switch v-model:checked="form.enabled" />
        <span class="form-hint">开启后启用AI自动生成内容功能</span>
      </a-form-item>
      <a-form-item label="AI供应商">
        <a-select v-model:value="form.provider" placeholder="请选择AI供应商" style="width: 240px">
          <a-select-option value="openai">OpenAI</a-select-option>
          <a-select-option value="deepseek">DeepSeek</a-select-option>
          <a-select-option value="zhipu">智谱AI</a-select-option>
          <a-select-option value="custom">自定义</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="API Key">
        <a-space>
          <template v-if="!apiKeyRevealed">
            <a-tag v-if="form.apiKey" color="green">已配置</a-tag>
            <a-tag v-else>未配置</a-tag>
            <a-button size="small" type="link" @click="apiKeyRevealed = true">查看</a-button>
          </template>
          <a-input-password
            v-else
            v-model:value="form.apiKey"
            placeholder="请输入API Key"
            style="width: 280px"
          />
          <a-button v-if="apiKeyRevealed" size="small" type="link" @click="apiKeyRevealed = false">隐藏</a-button>
        </a-space>
      </a-form-item>
      <a-form-item label="API Endpoint">
        <a-input v-model:value="form.apiEndpoint" placeholder="如：https://api.openai.com/v1" style="width: 360px" />
      </a-form-item>
      <a-form-item label="模型">
        <a-input v-model:value="form.model" placeholder="如：gpt-4o, deepseek-chat" style="width: 280px" />
      </a-form-item>
      <a-form-item label="Temperature">
        <a-row :gutter="12" style="width: 360px">
          <a-col :flex="1">
            <a-slider v-model:value="form.temperature" :min="0" :max="2" :step="0.1" />
          </a-col>
          <a-col>
            <span class="slider-value">{{ form.temperature.toFixed(1) }}</span>
          </a-col>
        </a-row>
        <span class="form-hint">控制生成内容的随机性，0为确定性输出，2为最大随机性</span>
      </a-form-item>
      <a-form-item label="最大Token数">
        <a-input-number v-model:value="form.maxTokens" :min="100" :max="128000" style="width: 180px" />
        <span class="form-hint">单次生成的最大Token数量</span>
      </a-form-item>
      <a-form-item :wrapper-col="{ offset: 5, span: 14 }">
        <a-space>
          <a-button type="primary" :loading="saving" @click="onSave">保存配置</a-button>
          <a-button :loading="testing" @click="onTestConnection">测试连接</a-button>
          <a-popconfirm title="确定重置为默认值？" ok-text="确定" cancel-text="取消" @confirm="onReset">
            <a-button :loading="resetting">恢复默认</a-button>
          </a-popconfirm>
        </a-space>
      </a-form-item>

      <a-form-item v-if="testResult" :wrapper-col="{ offset: 5, span: 14 }">
        <a-alert
          :type="testResult.success ? 'success' : 'error'"
          :message="testResult.success ? '连接成功' : '连接失败'"
          :description="testResult.message"
          show-icon
          closable
          @close="testResult = null"
        />
      </a-form-item>
    </a-form>
  </a-card>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { configApi } from '@/api/config'
import type { AIConfig } from '@/types/robot'

const form = reactive<AIConfig>({
  enabled: false,
  provider: 'openai',
  apiKey: '',
  apiEndpoint: '',
  model: '',
  temperature: 0.7,
  maxTokens: 4096,
})

const apiKeyRevealed = ref(false)
const saving = ref(false)
const testing = ref(false)
const resetting = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

async function loadConfig() {
  try {
    const res = await configApi.getAIConfig()
    const data = (res.data?.data || res.data) as AIConfig
    if (data) {
      form.enabled = data.enabled ?? false
      form.provider = data.provider || 'openai'
      form.apiKey = data.apiKey || ''
      form.apiEndpoint = data.apiEndpoint || ''
      form.model = data.model || ''
      form.temperature = data.temperature ?? 0.7
      form.maxTokens = data.maxTokens ?? 4096
    }
  } catch {
    /* loaded defaults */
  }
}

loadConfig()

async function onSave() {
  saving.value = true
  try {
    await configApi.saveAIConfig({
      enabled: form.enabled,
      provider: form.provider,
      apiKey: form.apiKey,
      apiEndpoint: form.apiEndpoint,
      model: form.model,
      temperature: form.temperature,
      maxTokens: form.maxTokens,
    })
    message.success('保存成功')
    apiKeyRevealed.value = false
    testResult.value = null
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function onTestConnection() {
  testing.value = true
  testResult.value = null
  try {
    const res = await configApi.testAIConnection()
    const data = (res.data?.data || res.data) as { success: boolean; message: string }
    testResult.value = {
      success: data?.success ?? true,
      message: data?.message || '连接正常',
    }
  } catch {
    testResult.value = { success: false, message: '无法连接到AI服务，请检查配置' }
  } finally {
    testing.value = false
  }
}

async function onReset() {
  resetting.value = true
  try {
    await configApi.reset('ai')
    apiKeyRevealed.value = false
    testResult.value = null
    await loadConfig()
    message.success('已重置为默认值')
  } catch {
    message.error('重置失败')
  } finally {
    resetting.value = false
  }
}
</script>

<style lang="less" scoped>
.form-hint {
  margin-left: 12px;
  font-size: 13px;
  color: #9ca3af;
}

.slider-value {
  font-size: 14px;
  font-weight: 500;
  color: #3b82f6;
  min-width: 32px;
  text-align: center;
}
</style>

<template>
  <a-card title="审核配置" :bordered="false">
    <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 14 }">
      <a-form-item label="自动审核">
        <a-switch v-model:checked="form.autoAudit" />
        <span class="form-hint">开启后系统自动审核通过无敏感内容</span>
      </a-form-item>
      <a-form-item label="自动拒绝关键词">
        <a-textarea
          v-model:value="form.autoAuditKeywords"
          placeholder="多个关键词用逗号分隔，如：赌博,色情,诈骗"
          :rows="3"
        />
        <span class="form-hint">包含这些关键词的内容将被自动拒绝</span>
      </a-form-item>
      <a-form-item label="审核超时(小时)">
        <a-input-number v-model:value="form.auditTimeout" :min="1" :max="168" style="width: 180px" />
        <span class="form-hint">超过此时间未审核的内容将自动通过</span>
      </a-form-item>
      <a-form-item label="超时提醒(小时)">
        <a-input-number v-model:value="form.remindBeforeTimeout" :min="0" :max="168" style="width: 180px" />
        <span class="form-hint">距离超时剩余多少小时时提醒审核员</span>
      </a-form-item>
      <a-form-item label="严格图片审核">
        <a-switch v-model:checked="form.strictImageCheck" />
        <span class="form-hint">开启后对所有图片进行深度内容安全检测</span>
      </a-form-item>
      <a-form-item :wrapper-col="{ offset: 5, span: 14 }">
        <a-space>
          <a-button type="primary" :loading="saving" @click="onSave">保存配置</a-button>
          <a-popconfirm title="确定重置为默认值？" ok-text="确定" cancel-text="取消" @confirm="onReset">
            <a-button :loading="resetting">恢复默认</a-button>
          </a-popconfirm>
        </a-space>
      </a-form-item>
    </a-form>
  </a-card>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { configApi } from '@/api/config'

const form = reactive({
  autoAudit: false,
  autoAuditKeywords: '',
  auditTimeout: 24,
  remindBeforeTimeout: 2,
  strictImageCheck: false,
})

const saving = ref(false)
const resetting = ref(false)

onMounted(async () => {
  try {
    const res = await configApi.getByGroup('audit')
    const items = (res.data?.data || res.data || []) as { key: string; value: string }[]
    items.forEach((item) => {
      if (item.key in form) {
        const target = form as Record<string, unknown>
        if (typeof target[item.key] === 'boolean') {
          target[item.key] = item.value === 'true' || item.value === '1'
        } else if (typeof target[item.key] === 'number') {
          target[item.key] = Number(item.value)
        } else {
          target[item.key] = item.value
        }
      }
    })
  } catch {
    /* loaded defaults */
  }
})

async function onSave() {
  saving.value = true
  try {
    const configs = Object.entries(form).map(([key, value]) => ({
      key,
      value: typeof value === 'boolean' ? String(value) : String(value),
    }))
    await configApi.save(configs)
    message.success('保存成功')
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function onReset() {
  resetting.value = true
  try {
    await configApi.reset('audit')
    const res = await configApi.getByGroup('audit')
    const items = (res.data?.data || res.data || []) as { key: string; value: string }[]
    items.forEach((item) => {
      if (item.key in form) {
        const target = form as Record<string, unknown>
        if (typeof target[item.key] === 'boolean') {
          target[item.key] = item.value === 'true' || item.value === '1'
        } else if (typeof target[item.key] === 'number') {
          target[item.key] = Number(item.value)
        } else {
          target[item.key] = item.value
        }
      }
    })
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
</style>

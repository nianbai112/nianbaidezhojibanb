<template>
  <a-card title="分享配置" :bordered="false">
    <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 14 }">
      <a-form-item label="默认分享标题">
        <a-input v-model:value="form.defaultShareTitle" placeholder="分享时默认显示的标题" style="width: 360px" />
      </a-form-item>
      <a-form-item label="默认分享图片">
        <UploadImage v-model="form.defaultShareImage" :max-count="1" scene="config" />
        <span class="form-hint">分享时默认显示的缩略图</span>
      </a-form-item>
      <a-form-item label="分享奖励">
        <a-switch v-model:checked="form.shareRewardEnabled" />
        <span class="form-hint">开启后用户分享可获得积分奖励</span>
      </a-form-item>
      <a-form-item label="每次分享奖励积分">
        <a-input-number v-model:value="form.shareRewardPoints" :min="0" :max="9999" style="width: 180px" />
        <span class="form-hint">单次分享获得的积分数</span>
      </a-form-item>
      <a-form-item label="每日奖励上限">
        <a-input-number v-model:value="form.shareRewardDailyLimit" :min="0" :max="999" style="width: 180px" />
        <span class="form-hint">每个用户每日通过分享最多获得的积分，0为不限</span>
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
import UploadImage from '@/components/common/UploadImage.vue'

const form = reactive({
  defaultShareTitle: '',
  defaultShareImage: '',
  shareRewardEnabled: false,
  shareRewardPoints: 10,
  shareRewardDailyLimit: 100,
})

const saving = ref(false)
const resetting = ref(false)

onMounted(async () => {
  try {
    const res = await configApi.getByGroup('share')
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
    await configApi.reset('share')
    const res = await configApi.getByGroup('share')
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

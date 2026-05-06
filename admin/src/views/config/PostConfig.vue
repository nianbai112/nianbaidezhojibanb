<template>
  <a-card title="发帖配置" :bordered="false">
    <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 14 }">
      <a-form-item label="发帖审核">
        <a-switch v-model:checked="form.postAudit" />
        <span class="form-hint">开启后用户发帖需经审核才能展示</span>
      </a-form-item>
      <a-form-item label="最大图片数量">
        <a-input-number v-model:value="form.maxImages" :min="0" :max="20" style="width: 180px" />
        <span class="form-hint">单次发帖最多可上传的图片数量</span>
      </a-form-item>
      <a-form-item label="最大视频大小(MB)">
        <a-input-number v-model:value="form.maxVideoSize" :min="0" :max="500" style="width: 180px" />
        <span class="form-hint">单次发帖视频文件最大体积</span>
      </a-form-item>
      <a-form-item label="最大文字长度">
        <a-input-number v-model:value="form.maxTextLength" :min="1" :max="50000" style="width: 180px" />
        <span class="form-hint">帖子正文最大字符数</span>
      </a-form-item>
      <a-form-item label="允许投票">
        <a-switch v-model:checked="form.allowVote" />
        <span class="form-hint">开启后用户发帖时可创建投票</span>
      </a-form-item>
      <a-form-item label="允许共创">
        <a-switch v-model:checked="form.allowCocreate" />
        <span class="form-hint">开启后用户可邀请他人共创帖子</span>
      </a-form-item>
      <a-form-item label="发帖间隔(秒)">
        <a-input-number v-model:value="form.postInterval" :min="0" :max="3600" style="width: 180px" />
        <span class="form-hint">两次发帖之间的最小间隔时间</span>
      </a-form-item>
      <a-form-item label="每日发帖上限">
        <a-input-number v-model:value="form.dailyPostLimit" :min="0" :max="999" style="width: 180px" />
        <span class="form-hint">单个用户每日最多发帖数量，0为不限</span>
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
  postAudit: false,
  maxImages: 9,
  maxVideoSize: 100,
  maxTextLength: 5000,
  allowVote: true,
  allowCocreate: true,
  postInterval: 30,
  dailyPostLimit: 50,
})

const saving = ref(false)
const resetting = ref(false)

onMounted(async () => {
  try {
    const res = await configApi.getByGroup('post')
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
    await configApi.reset('post')
    const res = await configApi.getByGroup('post')
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

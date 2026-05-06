<template>
  <a-card title="上传配置" :bordered="false">
    <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 14 }">
      <a-form-item label="存储类型">
        <a-select v-model:value="form.type" placeholder="请选择存储类型" style="width: 240px">
          <a-select-option value="local">本地存储</a-select-option>
          <a-select-option value="aliyun_oss">阿里云OSS</a-select-option>
          <a-select-option value="tencent_cos">腾讯云COS</a-select-option>
          <a-select-option value="qiniu">七牛云</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item v-if="form.type !== 'local'" label="Endpoint">
        <a-input v-model:value="form.endpoint" placeholder="如：oss-cn-hangzhou.aliyuncs.com" style="width: 360px" />
      </a-form-item>
      <a-form-item v-if="form.type !== 'local'" label="Bucket">
        <a-input v-model:value="form.bucket" placeholder="存储空间名称" style="width: 360px" />
      </a-form-item>
      <a-form-item v-if="form.type !== 'local'" label="AccessKey">
        <a-space>
          <template v-if="!accessKeyRevealed">
            <a-tag v-if="form.accessKey" color="green">已配置</a-tag>
            <a-tag v-else>未配置</a-tag>
            <a-button size="small" type="link" @click="accessKeyRevealed = true">查看</a-button>
          </template>
          <a-input
            v-else
            v-model:value="form.accessKey"
            placeholder="请输入AccessKey"
            style="width: 280px"
          />
          <a-button v-if="accessKeyRevealed" size="small" type="link" @click="accessKeyRevealed = false">隐藏</a-button>
        </a-space>
      </a-form-item>
      <a-form-item v-if="form.type !== 'local'" label="SecretKey">
        <a-space>
          <template v-if="!secretKeyRevealed">
            <a-tag v-if="form.secretKey" color="green">已配置</a-tag>
            <a-tag v-else>未配置</a-tag>
            <a-button size="small" type="link" @click="secretKeyRevealed = true">查看</a-button>
          </template>
          <a-input-password
            v-else
            v-model:value="form.secretKey"
            placeholder="请输入SecretKey"
            style="width: 280px"
          />
          <a-button v-if="secretKeyRevealed" size="small" type="link" @click="secretKeyRevealed = false">隐藏</a-button>
        </a-space>
      </a-form-item>
      <a-form-item v-if="form.type !== 'local'" label="CDN域名">
        <a-input v-model:value="form.cdnDomain" placeholder="如：https://cdn.example.com" style="width: 360px" />
      </a-form-item>
      <a-form-item label="最大上传大小(MB)">
        <a-input-number v-model:value="form.maxSize" :min="1" :max="500" style="width: 180px" />
        <span class="form-hint">单个文件最大上传体积</span>
      </a-form-item>
      <a-form-item label="允许文件类型">
        <a-textarea
          v-model:value="form.allowedTypes"
          placeholder="逗号分隔的扩展名，如：jpg,png,gif,mp4,pdf"
          :rows="2"
          style="width: 360px"
        />
      </a-form-item>
      <a-form-item :wrapper-col="{ offset: 5, span: 14 }">
        <a-space>
          <a-button type="primary" :loading="saving" @click="onSave">保存配置</a-button>
          <a-button :loading="testing" @click="onTest">测试连接</a-button>
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
import { systemApi } from '@/api/system'

const form = reactive({
  type: 'local',
  endpoint: '',
  bucket: '',
  accessKey: '',
  secretKey: '',
  cdnDomain: '',
  maxSize: 10,
  allowedTypes: 'jpg,jpeg,png,gif,webp,mp4,pdf',
})

const accessKeyRevealed = ref(false)
const secretKeyRevealed = ref(false)
const saving = ref(false)
const resetting = ref(false)
const testing = ref(false)

function fillForm(data: Record<string, any>) {
  Object.entries(data || {}).forEach(([key, value]) => {
    if (key in form) {
      const target = form as Record<string, unknown>
      if (typeof target[key] === 'number') {
        target[key] = Number(value)
      } else {
        target[key] = value
      }
    }
  })
}

onMounted(async () => {
  try {
    const res = await systemApi.getStorageConfig()
    fillForm(res.data?.data || res.data || {})
  } catch {
    /* loaded defaults */
  }
})

async function onSave() {
  saving.value = true
  try {
    await systemApi.saveStorageConfig({ ...form })
    message.success('保存成功')
    accessKeyRevealed.value = false
    secretKeyRevealed.value = false
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function onTest() {
  testing.value = true
  try {
    const res = await systemApi.testStorageConfig({ ...form })
    message.success(res.data?.data?.message || res.data?.message || 'COS 连接成功')
  } catch {
    /* backend/interceptor will show the concrete failure reason */
  } finally {
    testing.value = false
  }
}

async function onReset() {
  resetting.value = true
  try {
    await systemApi.saveStorageConfig({
      type: 'local',
      endpoint: '',
      bucket: '',
      accessKey: '',
      secretKey: '',
      cdnDomain: '',
      maxSize: 10,
      allowedTypes: 'jpg,jpeg,png,gif,webp,mp4,pdf',
    })
    accessKeyRevealed.value = false
    secretKeyRevealed.value = false
    const res = await systemApi.getStorageConfig()
    fillForm(res.data?.data || res.data || {})
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

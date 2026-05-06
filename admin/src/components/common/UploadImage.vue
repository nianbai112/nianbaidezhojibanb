<template>
  <a-upload
    v-model:file-list="fileList"
    list-type="picture-card"
    :max-count="maxCount"
    :before-upload="beforeUpload"
    :custom-request="customRequest"
    :accept="accept"
    @preview="onPreview"
    @remove="onRemove"
  >
    <div v-if="fileList.length < maxCount">
      <plus-outlined />
      <div style="margin-top:8px;font-size:12px">上传</div>
    </div>
  </a-upload>

  <!-- 预览 -->
  <a-modal :open="previewVisible" :footer="null" @cancel="previewVisible = false">
    <img :src="previewImage" style="width:100%" />
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { uploadApi } from '@/api/upload'
import type { UploadFile } from 'ant-design-vue'

const props = withDefaults(defineProps<{
  modelValue?: string | string[]
  maxCount?: number
  accept?: string
  /** 业务场景 */
  scene?: string
  /** 最大文件大小（MB） */
  maxSizeMb?: number
}>(), {
  modelValue: () => [],
  maxCount: 9,
  accept: 'image/*',
  scene: 'admin',
  maxSizeMb: 10,
})

const emit = defineEmits<{
  (e: 'update:modelValue', val: string | string[]): void
  (e: 'update:uploading', val: boolean): void
}>()

const fileList = ref<UploadFile[]>([])
const previewVisible = ref(false)
const previewImage = ref('')
const uploadingCount = ref(0)

const isUploading = computed(() => uploadingCount.value > 0)
watch(isUploading, (val) => {
  emit('update:uploading', val)
})

/** 将外部 modelValue 同步到 fileList */
watch(
  () => props.modelValue,
  (val) => {
    const urls = Array.isArray(val) ? val : val ? [val] : []
    // 只在 fileList 为空或全部为 done 状态时才重置，避免上传中途被清空
    const allDone = fileList.value.every((f) => f.status === 'done' || f.status === 'error')
    if (fileList.value.length === 0 || allDone) {
      fileList.value = urls.map((url, i) => ({
        uid: `init-${i}`,
        name: url.split('/').pop() || `image-${i}`,
        status: 'done',
        url,
      }))
    }
  },
  { immediate: true },
)

/** 从 fileList 提取 done 状态的 url 并 emit */
function emitValue() {
  const urls = fileList.value
    .filter((f) => f.status === 'done' && f.url)
    .map((f) => f.url!)
  if (props.maxCount === 1) {
    emit('update:modelValue', urls[0] || '')
  } else {
    emit('update:modelValue', urls)
  }
}

function beforeUpload(file: File) {
  const isImage = file.type.startsWith('image/')
  if (!isImage) {
    message.error('只能上传图片文件')
    return false
  }
  const maxBytes = props.maxSizeMb * 1024 * 1024
  if (file.size > maxBytes) {
    message.error(`图片大小不能超过 ${props.maxSizeMb}MB`)
    return false
  }
  return true
}

async function customRequest({ file, onProgress, onSuccess, onError }: any) {
  uploadingCount.value++
  try {
    const result = await uploadApi.upload(file, {
      scene: props.scene,
      onProgress: (percent) => onProgress?.({ percent }),
    })

    // 更新 fileList 中对应项
    const target = fileList.value.find((f) => f.uid === file.uid)
    if (target) {
      target.status = 'done'
      target.url = result.url
      target.response = result.raw
    }

    onSuccess?.(result.raw)
    emitValue()
  } catch (err: any) {
    // 移除失败项
    const idx = fileList.value.findIndex((f) => f.uid === file.uid)
    if (idx > -1) {
      fileList.value.splice(idx, 1)
    }

    // 显示真实错误
    let msg = '上传失败'
    if (err?.response?.status === 401) {
      msg = '登录已失效，请重新登录'
    } else if (err?.response?.status === 413) {
      msg = '文件过大'
    } else if (err?.response?.data?.message) {
      msg = err.response.data.message
    } else if (err?.message) {
      msg = `上传失败：${err.message}`
    }

    // 检测 COS 配置缺失
    const errStr = String(msg).toLowerCase()
    if (errStr.includes('cos') && (errStr.includes('未配置') || errStr.includes('不完整'))) {
      msg = 'COS 配置不完整，请先到「系统设置 / 文件存储」填写'
    }

    message.error(msg)
    onError?.(err)
  } finally {
    uploadingCount.value--
  }
}

function onPreview(file: UploadFile) {
  previewImage.value = file.url || ''
  previewVisible.value = true
}

function onRemove(file: UploadFile) {
  const idx = fileList.value.findIndex((f) => f.uid === file.uid)
  if (idx > -1) {
    fileList.value.splice(idx, 1)
    emitValue()
  }
}
</script>

<template>
  <div class="image-upload-box" :class="{ 'is-square': shape === 'square', 'is-wide': shape === 'wide' }">
    <div
      v-if="!imageUrl"
      class="upload-trigger"
      @click="triggerUpload"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <el-icon class="upload-icon"><Plus /></el-icon>
      <div class="upload-text">{{ placeholder || '点击或拖拽上传' }}</div>
      <div v-if="tip" class="upload-tip">{{ tip }}</div>
    </div>
    <div v-else class="preview-container">
      <img :src="imageUrl" alt="" class="preview-image" />
      <div class="preview-actions">
        <el-button size="small" type="primary" :icon="RefreshRight" @click.stop="triggerUpload">替换</el-button>
        <el-button size="small" :icon="View" @click.stop="previewImage">预览</el-button>
        <el-button size="small" type="danger" :icon="Delete" @click.stop="removeImage">删除</el-button>
      </div>
      <div class="preview-meta">
        <span>已上传</span>
        <button type="button" @click.stop="triggerUpload">替换</button>
        <button type="button" class="danger" @click.stop="removeImage">删除</button>
      </div>
    </div>
    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      style="display: none"
      @change="onFileChange"
    />
    <div v-if="uploading" class="upload-loading">
      <el-icon class="loading-icon"><Loading /></el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Plus, Delete, RefreshRight, Loading, View } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { uploadImage } from '@/api/admin'

const props = defineProps<{
  modelValue?: string
  scene?: string
  placeholder?: string
  tip?: string
  accept?: string
  maxSize?: number
  shape?: 'square' | 'wide' | 'default'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const fileInput = ref<HTMLInputElement>()
const imageUrl = ref(props.modelValue || '')
const uploading = ref(false)

watch(() => props.modelValue, (val) => {
  imageUrl.value = val || ''
})

function triggerUpload() {
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    handleFile(file)
  }
  input.value = ''
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    handleFile(file)
  }
}

async function handleFile(file: File) {
  if (props.maxSize && file.size > props.maxSize * 1024 * 1024) {
    ElMessage.warning(`图片大小不能超过 ${props.maxSize}MB`)
    return
  }

  uploading.value = true
  try {
    const res: any = await uploadImage(file, props.scene || 'default')
    const url = res?.data?.url || res?.url || res?.data
    if (url) {
      imageUrl.value = url
      emit('update:modelValue', url)
      ElMessage.success('上传成功')
    } else {
      ElMessage.error('上传失败：未获取到图片地址')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function removeImage() {
  try {
    await ElMessageBox.confirm('删除后将清空当前图片，保存配置后生效。确定删除吗？', '删除图片', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    imageUrl.value = ''
    emit('update:modelValue', '')
    ElMessage.success('图片已移除，记得保存配置')
  } catch {
    // 用户取消
  }
}

function previewImage() {
  if (!imageUrl.value) return
  window.open(imageUrl.value, '_blank')
}
</script>

<style scoped>
.image-upload-box {
  position: relative;
  width: 100%;
  border: 1px dashed #cbd7e6;
  border-radius: 14px;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow .2s, background .2s;
  background: #f8fafc;
}

.image-upload-box:hover {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .08);
  background: #fff;
}

.upload-trigger {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  cursor: pointer;
  min-height: 120px;
}

.upload-icon {
  font-size: 28px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.upload-text {
  font-size: 14px;
  color: #334155;
  font-weight: 850;
}

.upload-tip {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

.preview-container {
  position: relative;
  width: 100%;
  background: #f8fafc;
}

.preview-image {
  width: 100%;
  display: block;
}

.is-square .preview-image {
  aspect-ratio: 1;
  object-fit: cover;
}

.is-wide .preview-image {
  aspect-ratio: 750 / 350;
  object-fit: cover;
}

.preview-actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(15, 23, 42, 0.48);
  opacity: 0;
  transition: opacity 0.2s;
}

.preview-container:hover .preview-actions {
  opacity: 1;
}

.preview-meta {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 11px;
  background: rgba(255, 255, 255, .9);
  box-shadow: 0 8px 18px rgba(15, 23, 42, .08);
}

.preview-meta span {
  margin-right: auto;
  color: #16a34a;
  font-size: 12px;
  font-weight: 900;
}

.preview-meta button {
  border: 0;
  background: #eff6ff;
  color: #2563eb;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.preview-meta button.danger {
  background: #fef2f2;
  color: #dc2626;
}

.upload-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
}

.loading-icon {
  font-size: 24px;
  color: #409eff;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

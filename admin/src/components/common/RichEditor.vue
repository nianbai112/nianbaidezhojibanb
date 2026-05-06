<template>
  <div class="rich-editor-wrapper">
    <!-- 简易富文本编辑器，生产环境可替换为 Tiptap / Quill / WangEditor -->
    <div class="editor-toolbar">
      <a-button-group size="small">
        <a-button @click="execCmd('bold')"><strong>B</strong></a-button>
        <a-button @click="execCmd('italic')"><em>I</em></a-button>
        <a-button @click="execCmd('underline')"><u>U</u></a-button>
      </a-button-group>
      <a-divider type="vertical" />
      <a-button-group size="small">
        <a-button @click="execCmd('insertUnorderedList')">列表</a-button>
        <a-button @click="execCmd('insertOrderedList')">编号</a-button>
        <a-button @click="execCmd('formatBlock', '<blockquote>')">引用</a-button>
      </a-button-group>
      <a-divider type="vertical" />
      <a-button size="small" @click="onUploadImage">图片</a-button>
      <input
        ref="imageInputRef"
        type="file"
        accept="image/*"
        style="display:none"
        @change="onImageSelected"
      />
    </div>

    <div
      ref="editorRef"
      class="editor-content"
      contenteditable="true"
      @input="onInput"
      @paste="onPaste"
      v-html="innerHtml"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import { uploadApi } from '@/api/upload'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const editorRef = ref<HTMLDivElement>()
const imageInputRef = ref<HTMLInputElement>()
const innerHtml = ref(props.modelValue || '')

watch(() => props.modelValue, (val) => {
  if (val !== innerHtml.value && editorRef.value) {
    innerHtml.value = val
  }
})

function onInput() {
  const html = editorRef.value?.innerHTML || ''
  innerHtml.value = html
  emit('update:modelValue', html)
}

function execCmd(command: string, value?: string) {
  document.execCommand(command, false, value)
  editorRef.value?.focus()
  onInput()
}

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}

function onUploadImage() {
  imageInputRef.value?.click()
}

async function onImageSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // 校验图片类型
  if (!file.type.startsWith('image/')) {
    message.error('只能上传图片文件')
    input.value = ''
    return
  }

  // 校验大小（富文本图片默认 10MB）
  const maxBytes = 10 * 1024 * 1024
  if (file.size > maxBytes) {
    message.error('图片大小不能超过 10MB')
    input.value = ''
    return
  }

  try {
    const result = await uploadApi.upload(file, { scene: 'admin' })
    document.execCommand('insertImage', false, result.url)
    editorRef.value?.focus()
    onInput()
  } catch (err: any) {
    let msg = '图片上传失败'
    if (err?.response?.data?.message) {
      msg = err.response.data.message
    } else if (err?.message) {
      msg = `图片上传失败：${err.message}`
    }
    const errStr = String(msg).toLowerCase()
    if (errStr.includes('cos') && (errStr.includes('未配置') || errStr.includes('不完整'))) {
      msg = 'COS 配置不完整，请先到「系统设置 / 文件存储」填写'
    }
    message.error(msg)
  }

  input.value = ''
}
</script>

<style lang="less" scoped>
.rich-editor-wrapper {
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.2s;

  &:focus-within {
    border-color: #3B82F6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}

.editor-content {
  padding: 12px;
  min-height: 200px;
  max-height: 500px;
  overflow-y: auto;
  outline: none;
  line-height: 1.6;
  font-size: 14px;

  &:empty::before {
    content: attr(data-placeholder);
    color: #bfbfbf;
  }

  img {
    max-width: 100%;
    border-radius: 4px;
  }

  blockquote {
    border-left: 3px solid #3B82F6;
    padding-left: 12px;
    color: #6b7280;
    margin: 8px 0;
  }
}
</style>

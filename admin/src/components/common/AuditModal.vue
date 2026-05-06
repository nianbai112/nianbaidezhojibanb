<template>
  <a-modal
    :open="visible"
    :title="title"
    :confirm-loading="loading"
    @ok="onSubmit"
    @cancel="$emit('update:visible', false)"
    :width="520"
  >
    <a-form :model="form" layout="vertical">
      <a-form-item label="审核结果" required>
        <a-radio-group v-model:value="form.action">
          <a-radio-button value="approve" style="color: #10b981">
            <check-outlined /> 通过
          </a-radio-button>
          <a-radio-button value="reject" style="color: #ef4444">
            <close-outlined /> 拒绝
          </a-radio-button>
        </a-radio-group>
      </a-form-item>

      <a-form-item
        :label="form.action === 'approve' ? '通过备注' : '拒绝原因'"
        :required="form.action === 'reject'"
      >
        <a-textarea
          v-model:value="form.remark"
          :rows="4"
          :placeholder="form.action === 'approve' ? '可选，填写通过备注' : '请填写拒绝原因'"
          :maxlength="500"
          show-count
        />
      </a-form-item>

      <!-- 图片预览区 -->
      <div v-if="safeImages.length" class="audit-images">
        <div class="audit-images-title">相关图片</div>
        <div class="audit-images-grid">
          <img
            v-for="(img, i) in safeImages"
            :key="i"
            :src="img"
            class="audit-image"
            @click="previewIndex = i"
          />
        </div>
      </div>
    </a-form>

    <!-- 图片预览 -->
    <a-image
      v-model:visible="previewVisible"
      :src="safeImages[previewIndex]"
      :preview="false"
    />
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue'
import { CheckOutlined, CloseOutlined } from '@ant-design/icons-vue'

const props = defineProps<{
  visible: boolean
  title?: string
  images?: string[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'submit', action: 'approve' | 'reject', remark: string): void
}>()

const form = reactive({
  action: 'approve' as 'approve' | 'reject',
  remark: '',
})

const previewVisible = ref(false)
const previewIndex = ref(0)
const safeImages = computed(() => props.images || [])

watch(() => props.visible, (val) => {
  if (val) {
    form.action = 'approve'
    form.remark = ''
  }
})

function onSubmit() {
  if (form.action === 'reject' && !form.remark.trim()) {
    return
  }
  emit('submit', form.action, form.remark)
}
</script>

<style lang="less" scoped>
.audit-images {
  margin-top: 12px;

  .audit-images-title {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 8px;
  }

  .audit-images-grid {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .audit-image {
    width: 80px;
    height: 80px;
    object-fit: cover;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid #f0f0f0;
    transition: transform 0.2s;

    &:hover {
      transform: scale(1.05);
    }
  }
}
</style>

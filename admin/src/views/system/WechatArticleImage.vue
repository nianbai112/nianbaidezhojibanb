<template>
  <div class="detail-page">
    <div class="detail-header">
      <div><span class="page-title">微信文章图片提取</span>
        <p class="page-desc">输入微信公众号文章链接，提取文章中的所有图片</p>
      </div>
    </div>

    <div class="detail-section">
      <a-form layout="horizontal" :label-col="{ flex: '100px' }">
        <a-form-item label="文章链接">
          <a-search
            v-model:value="articleUrl"
            placeholder="https://mp.weixin.qq.com/s/..."
            enter-button="提取图片"
            size="large"
            style="max-width:640px"
            :loading="extracting"
            @search="handleExtract"
          />
        </a-form-item>
      </a-form>

      <a-divider v-if="result.title || result.images.length" />

      <div v-if="result.title || result.images.length" class="result-section">
        <a-descriptions v-if="result.title" :column="1" bordered size="small" class="mb-4">
          <a-descriptions-item label="文章标题">{{ result.title }}</a-descriptions-item>
          <a-descriptions-item label="图片数量">{{ result.total }}</a-descriptions-item>
        </a-descriptions>

        <div v-if="result.images.length" class="images-grid">
          <div v-for="(img, i) in result.images" :key="i" class="image-card">
            <img :src="img" class="preview-img" @click="previewUrl = img; previewVisible = true" />
            <div class="image-actions">
              <a class="text-small" :href="img" target="_blank">打开原图</a>
              <a class="text-small" @click="copyUrl(img)">复制链接</a>
            </div>
          </div>
        </div>
      </div>

      <a-empty v-if="!extracting && !result.title && !result.images.length && searched" description="未提取到图片" />
    </div>

    <!-- 预览弹窗 -->
    <a-modal v-model:open="previewVisible" :footer="null" width="auto" title="图片预览">
      <img :src="previewUrl" style="max-width:80vw;max-height:80vh" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { systemApi } from '@/api/system'

const articleUrl = ref('')
const extracting = ref(false)
const searched = ref(false)

const previewVisible = ref(false)
const previewUrl = ref('')

const result = reactive({
  title: '',
  total: 0,
  images: [] as string[],
})

async function handleExtract() {
  if (!articleUrl.value) return message.warning('请输入文章链接')
  extracting.value = true
  searched.value = true
  try {
    const res = await systemApi.extractWechatArticleImages(articleUrl.value)
    const data = (res.data?.data || res.data || {}) as any
    result.title = data.title || ''
    result.total = data.total || 0
    result.images = data.images || []
    if (result.images.length === 0) {
      message.info('未从文章中提取到图片')
    } else {
      message.success(`成功提取 ${result.images.length} 张图片`)
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '提取失败，请检查链接是否正确')
    result.title = ''
    result.total = 0
    result.images = []
  } finally {
    extracting.value = false
  }
}

function copyUrl(url: string) {
  navigator.clipboard.writeText(url).then(() => message.success('已复制'))
    .catch(() => message.warning('复制失败'))
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
  padding: 24px;
}
.result-section {
  .images-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }
  .image-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background: #fafafa;
  }
  .preview-img {
    width: 100%;
    height: 160px;
    object-fit: cover;
    cursor: pointer;
    transition: opacity 0.2s;
    &:hover { opacity: 0.85; }
  }
  .image-actions {
    padding: 8px;
    display: flex;
    justify-content: space-between;
  }
}
.mb-4 { margin-bottom: 16px; }
</style>

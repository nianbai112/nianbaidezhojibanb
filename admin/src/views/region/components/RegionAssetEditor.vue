<template>
  <div class="section-card glass-card">
    <div class="section-head">
      <div class="card-title">视觉素材</div>
    </div>
    <el-form label-position="top">
      <div class="form-grid two relaxed">
        <el-form-item label="区域 Logo">
          <ImageUploadBox v-model="logo" scene="region-logo" shape="square" tip="建议尺寸 200x200px" :max-size="2" />
        </el-form-item>
        <el-form-item label="区域封面">
          <ImageUploadBox v-model="coverImage" scene="region-cover" shape="wide" tip="建议尺寸 750x350px" :max-size="5" />
        </el-form-item>
        <el-form-item label="轮播图" class="span-2">
          <div class="carousel-editor">
            <div v-for="(item, idx) in carouselItems" :key="idx" class="carousel-card">
              <div class="carousel-card-preview">
                <ImageUploadBox v-model="item.image" :scene="`carousel-${idx}`" shape="wide" tip="建议尺寸 750x300px" :max-size="5" />
              </div>
              <div class="carousel-card-fields">
                <el-input v-model="item.title" placeholder="标题（可选）" size="small" />
                <el-select v-model="item.linkType" size="small" style="width: 100%">
                  <el-option label="不跳转" value="none" />
                  <el-option label="小程序页面" value="page" />
                  <el-option label="H5链接" value="h5" />
                  <el-option label="商家" value="merchant" />
                  <el-option label="商品" value="product" />
                  <el-option label="活动" value="activity" />
                </el-select>
                <el-input v-if="item.linkType !== 'none'" v-model="item.linkValue" placeholder="跳转值" size="small" />
                <div class="carousel-card-actions">
                  <el-switch v-model="item.enabled" size="small" active-text="启用" />
                  <el-button size="small" circle :disabled="idx === 0" @click="moveCarouselItem(idx, -1)">
                    <el-icon><Top /></el-icon>
                  </el-button>
                  <el-button size="small" circle :disabled="idx === carouselItems.length - 1" @click="moveCarouselItem(idx, 1)">
                    <el-icon><Bottom /></el-icon>
                  </el-button>
                  <el-button size="small" circle type="danger" @click="removeCarouselItem(idx)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
            <el-button type="primary" plain @click="addCarouselItem">添加轮播图</el-button>
          </div>
        </el-form-item>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { Top, Bottom, Delete } from '@element-plus/icons-vue'

interface CarouselItem {
  image: string
  title: string
  linkType: string
  linkValue: string
  sortOrder: number
  enabled: boolean
}

interface Props {
  logo?: string
  coverImage?: string
  carouselItems?: CarouselItem[]
}

const props = withDefaults(defineProps<Props>(), {
  logo: '',
  coverImage: '',
  carouselItems: () => []
})

const emit = defineEmits<{
  'update:logo': [value: string]
  'update:coverImage': [value: string]
  'update:carouselItems': [value: CarouselItem[]]
}>()

const logo = computed({
  get: () => props.logo,
  set: (val) => emit('update:logo', val)
})

const coverImage = computed({
  get: () => props.coverImage,
  set: (val) => emit('update:coverImage', val)
})

const carouselItems = computed({
  get: () => props.carouselItems,
  set: (val) => emit('update:carouselItems', val)
})

function addCarouselItem() {
  const newItem: CarouselItem = {
    image: '',
    title: '',
    linkType: 'none',
    linkValue: '',
    sortOrder: carouselItems.value.length,
    enabled: true
  }
  carouselItems.value = [...carouselItems.value, newItem]
}

function moveCarouselItem(idx: number, dir: number) {
  const target = idx + dir
  if (target < 0 || target >= carouselItems.value.length) return

  const newItems = [...carouselItems.value]
  const tmp = newItems[idx]
  newItems[idx] = newItems[target]
  newItems[target] = tmp
  carouselItems.value = newItems
}

function removeCarouselItem(idx: number) {
  const newItems = carouselItems.value.filter((_, i) => i !== idx)
  carouselItems.value = newItems
}
</script>

<style scoped lang="scss">
.section-card {
  padding: 0;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 4px;
}

.section-card :deep(.el-form) {
  padding: 16px 24px 24px;
}

.relaxed {
  gap: 16px 24px;
}

.span-2 {
  grid-column: span 2;
}

.carousel-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.carousel-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--mx-border) 60%, transparent);
}

.carousel-card-preview {
  width: 120px;
  flex-shrink: 0;
}

.carousel-card-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.carousel-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}

@media (max-width: 768px) {
  .carousel-card {
    flex-direction: column;
  }

  .carousel-card-preview {
    width: 100%;
  }
}
</style>

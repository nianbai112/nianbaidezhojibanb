<template>
  <div class="page-shell region-page">
    <GlassPageHeader title="分享设置" subtitle="配置小程序微信分享卡片，包括分享给朋友和发朋友圈时展示的标题、图片和跳转路径">
      <template #actions>
        <el-button @click="loadRegions">刷新</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="saveShareConfig">保存配置</el-button>
      </template>
    </GlassPageHeader>

    <section class="region-hero glass-card">
      <div class="region-identity">
        <div class="campus-cover" :style="regionLogo ? {backgroundImage: `url(${regionLogo})`, backgroundSize: 'cover'} : {}"></div>
        <div>
          <div class="eyebrow">当前区域</div>
          <h1>{{ currentRegionName || '未选择区域' }}</h1>
          <div class="meta-row">
            <el-tag :type="form.enabled ? 'success' : 'info'">{{ form.enabled ? '分享已启用' : '分享已禁用' }}</el-tag>
            <span>编码：{{ currentRegionCode || '-' }}</span>
          </div>
        </div>
      </div>
      <div class="region-hero-actions">
        <el-select v-model="selectedId" class="region-switcher" placeholder="选择区域" @change="selectRegion" filterable>
          <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
      </div>
    </section>

    <div class="section-grid">
      <!-- 基本配置 -->
      <div class="section-card glass-card">
        <div class="section-head">
          <div class="card-title">分享卡片配置</div>
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="禁用" />
        </div>
        <el-form label-position="top">
          <div class="form-grid two relaxed">
            <el-form-item label="分享标题" required>
              <el-input v-model="form.title" placeholder="如：灵萌圈友 - 校园生活圈" maxlength="30" show-word-limit />
              <div class="form-tip">分享给朋友时显示的标题</div>
            </el-form-item>
            <el-form-item label="分享类型">
              <el-select v-model="form.shareType" style="width:100%">
                <el-option label="小程序页面" value="page" />
                <el-option label="自定义链接" value="link" />
              </el-select>
            </el-form-item>
            <el-form-item label="分享路径" class="span-2">
              <el-input v-model="form.path" placeholder="如：/pages/index/index?regionId=xxx" />
              <div class="form-tip">用户点击分享卡片后跳转的页面路径，可带参数</div>
            </el-form-item>
            <el-form-item label="分享图片" class="span-2">
              <el-input v-model="form.imageUrl" placeholder="分享卡片封面图片 URL" />
              <div class="form-tip">建议尺寸 5:4，如 500x400 像素</div>
              <div v-if="form.imageUrl" class="img-preview wide">
                <img :src="form.imageUrl" alt="分享图片" />
              </div>
            </el-form-item>
            <el-form-item label="分享描述" class="span-2">
              <el-input v-model="form.description" type="textarea" :rows="3" placeholder="分享给朋友时显示的描述文案" maxlength="50" show-word-limit />
            </el-form-item>
          </div>
        </el-form>
      </div>

      <!-- 朋友圈配置 -->
      <div class="section-card glass-card">
        <div class="section-head">
          <div class="card-title">朋友圈分享配置</div>
          <el-switch v-model="form.momentsEnabled" active-text="启用" inactive-text="禁用" />
        </div>
        <el-form label-position="top">
          <div class="form-grid two relaxed">
            <el-form-item label="朋友圈标题" class="span-2">
              <el-input v-model="form.momentsTitle" placeholder="如：校园生活就在这里" maxlength="30" show-word-limit />
              <div class="form-tip">发朋友圈时显示的标题</div>
            </el-form-item>
            <el-form-item label="朋友圈图片" class="span-2">
              <el-input v-model="form.momentsImageUrl" placeholder="朋友圈分享图片 URL" />
              <div class="form-tip">建议尺寸 1:1，如 500x500 像素</div>
              <div v-if="form.momentsImageUrl" class="img-preview wide">
                <img :src="form.momentsImageUrl" alt="朋友圈图片" />
              </div>
            </el-form-item>
            <el-form-item label="朋友圈描述" class="span-2">
              <el-input v-model="form.momentsDescription" type="textarea" :rows="3" placeholder="朋友圈分享的描述文案" maxlength="50" show-word-limit />
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>

    <!-- 预览区域 -->
    <div class="section-card glass-card">
      <div class="section-head">
        <div class="card-title">分享预览</div>
      </div>
      <div class="preview-container">
        <div class="phone-preview">
          <div class="phone-header">
            <div class="phone-notch"></div>
          </div>
          <div class="phone-content">
            <div class="share-card">
              <div class="share-card-body">
                <div class="share-card-text">
                  <div class="share-card-title">{{ form.title || '分享标题' }}</div>
                  <div class="share-card-desc">{{ form.description || '分享描述' }}</div>
                </div>
                <div class="share-card-thumb">
                  <img v-if="form.imageUrl" :src="form.imageUrl" alt="" />
                  <div v-else class="share-card-thumb-placeholder">
                    <el-icon><Picture /></el-icon>
                  </div>
                </div>
              </div>
              <div class="share-card-footer">
                <div class="share-card-mini-icon">
                  <img src="" alt="" />
                </div>
                <span>{{ currentRegionName || '小程序名称' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import { Check, Picture } from '@element-plus/icons-vue'
import { fetchRegions, fetchRegionDetail, fetchRegionShareSetting, saveRegionShareSetting } from '@/api/admin'

const route = useRoute()
const regions = ref<any[]>([])
const selectedId = ref<string | number>('')
const saving = ref(false)
const currentRegionName = ref('')
const currentRegionCode = ref('')
const regionLogo = ref('')

const form = reactive({
  enabled: true,
  title: '',
  shareType: 'page',
  path: '',
  imageUrl: '',
  description: '',
  momentsEnabled: true,
  momentsTitle: '',
  momentsImageUrl: '',
  momentsDescription: ''
})

function fillForm(row: any) {
  currentRegionName.value = row.name || ''
  currentRegionCode.value = row.code || ''
  regionLogo.value = row.logo || row.coverImage || ''

  const shareConfig = row.shareConfig || row
  let extra: any = {}
  try {
    extra = typeof shareConfig.activityRules === 'string'
      ? JSON.parse(shareConfig.activityRules || '{}')
      : (shareConfig.activityRules || {})
  } catch {
    extra = {}
  }
  form.enabled = shareConfig.enabled !== false
  form.enabled = shareConfig.isEnabled ?? form.enabled
  form.title = shareConfig.title || shareConfig.activityTitle || ''
  form.shareType = shareConfig.shareType || extra.shareType || 'page'
  form.path = shareConfig.path || extra.path || ''
  form.imageUrl = shareConfig.imageUrl || shareConfig.activityImage || ''
  form.description = shareConfig.description || extra.description || ''
  form.momentsEnabled = shareConfig.momentsEnabled ?? extra.momentsEnabled ?? true
  form.momentsTitle = shareConfig.momentsTitle || extra.momentsTitle || ''
  form.momentsImageUrl = shareConfig.momentsImageUrl || extra.momentsImageUrl || ''
  form.momentsDescription = shareConfig.momentsDescription || extra.momentsDescription || ''
}

async function selectRegion(id: string | number) {
  try {
    const detail: any = await fetchRegionDetail(id)
    fillForm(detail)
    try {
      const setting: any = await fetchRegionShareSetting(id)
      fillForm({ ...detail, ...setting })
    } catch {
      // 未配置过分享设置时沿用区域默认信息。
    }
  } catch {
    const row = regions.value.find(r => r.id === id)
    if (row) fillForm(row)
  }
}

async function loadRegions() {
  regions.value = await fetchRegions()
  const preferredId = String(
    route.query.regionId ||
    localStorage.getItem('LM_SELECTED_REGION_ID') ||
    localStorage.getItem('selectedRegionId') ||
    ''
  )
  if (preferredId && regions.value.some(r => String(r.id) === preferredId)) {
    selectedId.value = preferredId
  } else if (!selectedId.value && regions.value.length) {
    selectedId.value = regions.value[0].id
  }
  if (selectedId.value) {
    await selectRegion(selectedId.value)
  }
}

async function saveShareConfig() {
  if (!selectedId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  if (!form.title.trim()) {
    ElMessage.warning('请输入分享标题')
    return
  }
  saving.value = true
  try {
    await saveRegionShareSetting(selectedId.value, {
      isEnabled: form.enabled,
      activityTitle: form.title,
      activityImage: form.imageUrl,
      activityRules: JSON.stringify({
        shareType: form.shareType,
        path: form.path,
        description: form.description,
        momentsEnabled: form.momentsEnabled,
        momentsTitle: form.momentsTitle,
        momentsImageUrl: form.momentsImageUrl,
        momentsDescription: form.momentsDescription
      })
    })
    ElMessage.success('分享配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadRegions)
</script>

<style scoped lang="scss">
.region-page { gap: 24px; }
.region-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  padding: 24px;
}
.region-identity {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
}
.region-hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.campus-cover {
  width: 80px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #bfdbfe, #60a5fa);
  flex-shrink: 0;
  background-position: center;
}
.eyebrow {
  color: #64748b;
  font-weight: 900;
  font-size: 12px;
  margin-bottom: 4px;
}
h1 { margin: 0; font-size: 24px; line-height: 1.15; }
.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: #64748b;
  font-size: 13px;
}
.region-switcher { width: 200px; }

.section-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}
.section-card { padding: 0; }
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 4px;
}
.section-card :deep(.el-form) { padding: 16px 24px 24px; }
.relaxed { gap: 16px 24px; }
.span-2 { grid-column: span 2; }
.form-tip { color: #94a3b8; font-size: 12px; margin-top: 4px; }

.img-preview {
  margin-top: 8px;
  width: 60px;
  height: 60px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, .6);
}
.img-preview.wide { width: 120px; height: 60px; }
.img-preview img { width: 100%; height: 100%; object-fit: cover; }

.preview-container {
  display: flex;
  justify-content: center;
  padding: 32px 24px;
}

.phone-preview {
  width: 320px;
  background: #fff;
  border-radius: 36px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .1);
  overflow: hidden;
  border: 8px solid #1a1a1a;
}

.phone-header {
  background: #f8f8f8;
  padding: 12px 0 0;
  position: relative;
}
.phone-notch {
  width: 120px;
  height: 28px;
  background: #1a1a1a;
  margin: 0 auto;
  border-radius: 0 0 16px 16px;
}

.phone-content {
  padding: 16px;
  min-height: 200px;
}

.share-card {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
  overflow: hidden;
}

.share-card-body {
  display: flex;
  padding: 12px;
  gap: 12px;
}
.share-card-text {
  flex: 1;
  min-width: 0;
}
.share-card-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.share-card-desc {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.share-card-thumb {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f5f5f5;
}
.share-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.share-card-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 24px;
}

.share-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f8f8f8;
  font-size: 12px;
  color: #666;
}
.share-card-mini-icon {
  width: 16px;
  height: 16px;
  background: #07c160;
  border-radius: 4px;
}

@media (max-width: 1050px) {
  .section-grid { grid-template-columns: 1fr; }
  .region-hero { flex-direction: column; align-items: flex-start; }
  .region-hero-actions { width: 100%; }
  .region-switcher { flex: 1; }
}
</style>

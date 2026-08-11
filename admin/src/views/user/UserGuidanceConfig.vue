<template>
  <div class="guidance-page">
    <PageHeader title="用户引导配置" subtitle="配置新用户登录后的基础资料强制完善流程" icon="Guide">
      <template #actions>
        <el-button @click="loadAll" :loading="loading">刷新</el-button>
        <el-button type="primary" @click="saveAll" :loading="saving">保存配置</el-button>
      </template>
    </PageHeader>

    <section class="toolbar">
      <div class="toolbar-left">
        <span class="label">运营区域</span>
        <el-select v-model="selectedRegionId" filterable placeholder="请选择区域" @change="loadAll">
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <span>全站强制用户引导</span>
        <el-switch v-model="forceGuidance" />
      </div>
    </section>

    <el-alert
      class="notice"
      type="info"
      show-icon
      :closable="false"
      title="该开关为平台总开关，不再按区域配置；用户引导只负责基础资料完善，区域学生认证仍由区域准入规则控制。"
    />

    <main class="content-grid" v-loading="loading">
      <section class="editor">
        <el-tabs v-model="activeStep">
          <el-tab-pane label="性别生日" name="gender">
            <div class="form-grid two">
              <el-form label-position="top">
                <el-form-item label="标题">
                  <el-input v-model="steps.gender.page_title" />
                </el-form-item>
                <el-form-item label="副标题">
                  <el-input v-model="steps.gender.page_subtitle" />
                </el-form-item>
                <el-form-item label="生日设置">
                  <el-switch v-model="steps.gender.enable_birthday_setting" active-text="显示生日选择" />
                </el-form-item>
              </el-form>
              <div class="image-grid">
                <div>
                  <div class="image-label">男生图片</div>
                  <ImageUploadBox v-model="steps.gender.male_image_url" scene="user-guidance" shape="square" placeholder="上传男生图片" :max-size="5" />
                </div>
                <div>
                  <div class="image-label">女生图片</div>
                  <ImageUploadBox v-model="steps.gender.female_image_url" scene="user-guidance" shape="square" placeholder="上传女生图片" :max-size="5" />
                </div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="头像昵称" name="profile">
            <div class="form-grid two">
              <el-form label-position="top">
                <el-form-item label="标题">
                  <el-input v-model="steps.profile.page_title" />
                </el-form-item>
                <el-form-item label="副标题">
                  <el-input v-model="steps.profile.page_subtitle" />
                </el-form-item>
                <el-form-item label="头像提示">
                  <el-input v-model="steps.profile.avatar_tip" />
                </el-form-item>
                <el-form-item label="昵称输入">
                  <div class="inline-row">
                    <el-input v-model="steps.profile.nickname_label" placeholder="标签" />
                    <el-input v-model="steps.profile.nickname_placeholder" placeholder="占位提示" />
                    <el-input-number v-model="steps.profile.nickname_max_length" :min="8" :max="30" />
                  </div>
                </el-form-item>
                <el-form-item label="年级/身份标题">
                  <el-input v-model="steps.profile.grade_title" placeholder="填“不显示”可隐藏年级选择" />
                </el-form-item>
              </el-form>
              <div>
                <div class="image-label">默认头像/占位图</div>
                <ImageUploadBox v-model="steps.profile.default_avatar_url" scene="user-guidance" shape="square" placeholder="上传默认头像" :max-size="5" />
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="兴趣标签" name="tags">
            <el-form label-position="top">
              <div class="form-grid two">
                <el-form-item label="标题">
                  <el-input v-model="steps.tags.page_title" />
                </el-form-item>
                <el-form-item label="最多选择">
                  <el-input-number v-model="steps.tags.max_tags" :min="1" :max="20" />
                </el-form-item>
              </div>
              <el-form-item label="副标题">
                <el-input v-model="steps.tags.page_subtitle" />
              </el-form-item>
              <el-form-item label="展示标签">
                <el-checkbox-group v-model="steps.tags.selected_tag_ids" class="option-grid">
                  <el-checkbox v-for="tag in tagOptions" :key="tag.id" :label="tag.id">
                    <span class="tag-dot" :style="{ background: tag.tagColor || tag.textColor || '#111' }"></span>
                    {{ tag.tagName }}
                  </el-checkbox>
                </el-checkbox-group>
              </el-form-item>
            </el-form>
          </el-tab-pane>

        </el-tabs>
      </section>

      <aside class="preview">
        <div class="phone">
          <div class="phone-top"></div>
          <div class="phone-body">
            <template v-if="activeStep === 'gender'">
              <h3>{{ steps.gender.page_title }}</h3>
              <p>{{ steps.gender.page_subtitle }}</p>
              <div class="gender-preview">
                <img :src="steps.gender.male_image_url || fallbackImage" />
                <img :src="steps.gender.female_image_url || fallbackImage" />
              </div>
            </template>
            <template v-else-if="activeStep === 'profile'">
              <h3>{{ steps.profile.page_title }}</h3>
              <p>{{ steps.profile.page_subtitle }}</p>
              <el-avatar :src="steps.profile.default_avatar_url || fallbackImage" :size="86" />
              <div class="preview-input">{{ steps.profile.nickname_placeholder }}</div>
            </template>
            <template v-else-if="activeStep === 'tags'">
              <h3>{{ steps.tags.page_title }}</h3>
              <p>{{ steps.tags.page_subtitle }}</p>
              <div class="preview-tags">
                <span v-for="tag in selectedTagPreview" :key="tag.id">{{ tag.tagName }}</span>
                <em v-if="!selectedTagPreview.length">未指定时展示区域可用标签</em>
              </div>
              <button>跳过</button>
            </template>
          </div>
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { request } from '@/api/request'
import { fetchRegions } from '@/api/admin'

const fallbackImage = '/static/logo.jpg'

const regions = ref<any[]>([])
const selectedRegionId = ref('')
const forceGuidance = ref(false)
const loading = ref(false)
const saving = ref(false)
const activeStep = ref('gender')
const pageRecords = ref<any[]>([])
const tagOptions = ref<any[]>([])

const steps = reactive({
  gender: {
    page_no: 1,
    page_title: '你是男生还是女生？(选择后不可更改)',
    page_subtitle: '介绍一下自己的性别',
    enable_birthday_setting: true,
    male_image_url: '',
    female_image_url: '',
  },
  profile: {
    page_no: 2,
    page_title: '设置头像和昵称',
    page_subtitle: '让大家更好地认识你',
    avatar_tip: '点击更换头像',
    default_avatar_url: '',
    nickname_label: '昵称',
    nickname_placeholder: '请输入昵称',
    nickname_max_length: 20,
    grade_title: '您当前是大几？或者您的身份',
  },
  tags: {
    page_no: 3,
    page_title: '选择你的标签',
    page_subtitle: '最多选择5个标签，也可以先跳过',
    max_tags: 5,
    allow_skip: true,
    selected_tag_ids: [] as string[],
    selected_tag_count_text: '已选择 {count}/{max} 个标签',
  },
})

const selectedTagPreview = computed(() => {
  const ids = new Set(steps.tags.selected_tag_ids.map(String))
  return tagOptions.value.filter((item: any) => ids.has(String(item.id))).slice(0, 8)
})

function listOf(res: any) {
  if (Array.isArray(res)) return res
  return res?.list || res?.data?.list || res?.items || res?.data || []
}

function parseContent(row: any) {
  if (!row?.content) return {}
  if (typeof row.content === 'object') return row.content
  try {
    return JSON.parse(row.content)
  } catch {
    return {}
  }
}

function applyPageConfig(rows: any[]) {
  const map = new Map<number, any>()
  rows.forEach((row: any, index: number) => {
    const content = parseContent(row)
    const pageNo = Number(content.page_no || content.pageNo || row.sortOrder || index + 1)
    map.set(pageNo, { ...content, id: row.id, title: row.title, isShow: row.isShow })
  })
  Object.assign(steps.gender, map.get(1) || {})
  Object.assign(steps.profile, map.get(2) || {})
  Object.assign(steps.tags, map.get(3) || {})
  steps.tags.allow_skip = true
  if (!Array.isArray(steps.tags.selected_tag_ids)) steps.tags.selected_tag_ids = []
}

async function loadRegions() {
  regions.value = await fetchRegions()
  if (!selectedRegionId.value && regions.value.length) {
    selectedRegionId.value = String(regions.value[0].id)
  }
}

async function loadAll() {
  if (!selectedRegionId.value) return
  loading.value = true
  try {
    const [guidanceSettings, pages, tags] = await Promise.all([
      request.get('/admin/user-guidance/settings').catch(() => ({})),
      request.get('/admin/user-guidance', { params: { regionId: selectedRegionId.value, page: 1, pageSize: 20 } }),
      request.get('/admin/user-tag-defs/all', { params: { regionId: selectedRegionId.value } }).catch(() => []),
    ])
    forceGuidance.value = !!(guidanceSettings as any)?.force_guidance_enabled
    pageRecords.value = listOf(pages)
    tagOptions.value = listOf(tags)
    applyPageConfig(pageRecords.value)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载用户引导配置失败')
  } finally {
    loading.value = false
  }
}

function buildPayload(step: any, title: string, sortOrder: number) {
  return {
    regionId: selectedRegionId.value,
    title,
    type: 'guide',
    sortOrder,
    isShow: true,
    content: JSON.stringify({ ...step, page_no: sortOrder }),
  }
}

async function upsertPage(step: any, title: string, sortOrder: number) {
  const existing = pageRecords.value.find((row: any, index: number) => {
    const content = parseContent(row)
    return Number(content.page_no || content.pageNo || row.sortOrder || index + 1) === sortOrder
  })
  const payload = buildPayload(step, title, sortOrder)
  if (existing?.id) {
    await request.put(`/admin/user-guidance/${existing.id}`, payload)
  } else {
    await request.post('/admin/user-guidance', payload)
  }
}

async function saveAll() {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  saving.value = true
  try {
    await request.put('/admin/user-guidance/settings', { force_guidance_enabled: forceGuidance.value })
    await upsertPage(steps.gender, '性别生日', 1)
    await upsertPage(steps.profile, '头像昵称', 2)
    await upsertPage(steps.tags, '兴趣标签', 3)
    ElMessage.success('用户引导配置已保存')
    await loadAll()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存用户引导配置失败')
  } finally {
    saving.value = false
  }
}

watch(selectedRegionId, () => {
  if (selectedRegionId.value) loadAll()
})

onMounted(async () => {
  await loadRegions()
  await loadAll()
})
</script>

<style scoped>
.guidance-page {
  padding: 24px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  margin: 16px 0;
  background: #fff;
  border: 1px solid #e5eaf3;
  border-radius: 6px;
}

.toolbar-left,
.toolbar-right,
.inline-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.label {
  font-weight: 700;
  color: #1f2937;
}

.toolbar-left .el-select {
  width: 260px;
}

.notice {
  margin-bottom: 16px;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
}

.editor,
.preview {
  background: #fff;
  border: 1px solid #e5eaf3;
  border-radius: 6px;
  padding: 18px;
}

.form-grid.two {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 20px;
}

.image-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.image-label {
  font-size: 13px;
  color: #5f6b7a;
  font-weight: 700;
  margin-bottom: 8px;
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px 14px;
  width: 100%;
}

.tag-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.circle-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
  width: 100%;
}

.circle-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  vertical-align: middle;
}

.circle-option small {
  display: block;
  color: #8a95a6;
  margin-top: 2px;
}

.phone {
  width: 260px;
  margin: 0 auto;
  border: 10px solid #111827;
  border-radius: 28px;
  background: #fff;
  overflow: hidden;
}

.phone-top {
  height: 22px;
  background: #111827;
}

.phone-body {
  min-height: 430px;
  padding: 28px 18px;
  text-align: center;
}

.phone-body h3 {
  font-size: 18px;
  line-height: 1.35;
  margin: 0 0 8px;
  color: #111827;
}

.phone-body p {
  margin: 0 0 24px;
  color: #6b7280;
  font-size: 13px;
}

.gender-preview {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.gender-preview img {
  width: 84px;
  height: 84px;
  border-radius: 14px;
  object-fit: cover;
  border: 1px solid #e5e7eb;
}

.preview-input {
  margin: 24px auto 0;
  height: 38px;
  line-height: 38px;
  width: 180px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  color: #9ca3af;
  font-size: 13px;
}

.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.preview-tags span {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #111827;
  font-size: 12px;
}

.preview-circles {
  display: grid;
  gap: 10px;
  text-align: left;
}

.preview-circles div {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.phone-body em {
  color: #9ca3af;
  font-style: normal;
  font-size: 12px;
}

.phone-body button {
  width: 100%;
  height: 38px;
  border: 0;
  border-radius: 14px;
  color: #fff;
  background: #111827;
  margin-top: 24px;
}
</style>

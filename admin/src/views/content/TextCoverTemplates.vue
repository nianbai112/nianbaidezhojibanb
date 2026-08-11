<template>
  <div class="page-container">
    <PageHeader title="文字封面模板" subtitle="纯文字笔记自动生成封面，有图笔记继续使用用户上传图片" icon="Brush">
      <template #actions>
        <el-button @click="loadTemplates" :loading="loading">刷新</el-button>
        <el-button type="primary" @click="openDialog()">新增模板</el-button>
      </template>
    </PageHeader>

    <SearchPanel @search="loadTemplates" @reset="resetFilters">
      <el-input v-model="filters.keyword" placeholder="搜索模板名称" clearable style="width: 220px" />
      <RegionSelector v-model="filters.regionId" width="180px" />
    </SearchPanel>

    <div class="glass-card table-card">
      <el-table :data="templates" v-loading="loading" border>
        <el-table-column label="预览" width="180">
          <template #default="{ row }">
            <TextCoverPreview :template="row" />
          </template>
        </el-table-column>
        <el-table-column label="模板" min-width="180">
          <template #default="{ row }">
            <div class="name-cell">
              <strong>{{ row.name }}</strong>
              <div class="muted">{{ row.regionId ? '区域模板' : '全局兜底模板' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="背景" width="120">
          <template #default="{ row }">{{ backgroundTypeText(row.backgroundType) }}</template>
        </el-table-column>
        <el-table-column label="文字收纳" width="180">
          <template #default="{ row }">
            <div class="muted">标题 {{ row.maxTitleChars }} 字</div>
            <div class="muted">摘要 {{ row.maxSummaryChars }} 字 / {{ row.maxLines }} 行</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="150">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '禁用' }}</el-tag>
            <el-tag v-if="row.isDefault" type="warning" style="margin-left: 6px;">默认</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="90" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="removeTemplate(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadTemplates"
          @size-change="loadTemplates"
        />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑文字封面模板' : '新增文字封面模板'" width="860px">
      <div class="dialog-grid">
        <el-form label-width="104px" class="template-form">
          <el-form-item label="模板名称" required>
            <el-input v-model="form.name" maxlength="40" show-word-limit />
          </el-form-item>
          <el-form-item label="适用区域">
            <RegionSelector v-model="form.regionId" width="100%" />
            <div class="form-tip">不选区域时作为全局兜底模板。</div>
          </el-form-item>
          <el-form-item label="状态">
            <el-switch v-model="form.enabled" active-text="启用" inactive-text="禁用" />
            <el-checkbox v-model="form.isDefault" style="margin-left: 18px;">设为默认</el-checkbox>
          </el-form-item>
          <el-form-item label="背景类型">
            <el-segmented v-model="form.backgroundType" :options="backgroundOptions" />
          </el-form-item>
          <el-form-item v-if="form.backgroundType === 'image'" label="背景图片">
            <ImageUploadBox v-model="form.backgroundImage" scene="text-cover" shape="wide" placeholder="上传文字封面背景" tip="建议 750x520，可替换和删除" :max-size="5" />
          </el-form-item>
          <el-form-item v-if="form.backgroundType === 'color'" label="背景颜色">
            <el-color-picker v-model="form.backgroundColor" />
            <el-input v-model="form.backgroundColor" style="width: 130px; margin-left: 10px;" />
          </el-form-item>
          <el-form-item v-if="form.backgroundType === 'gradient'" label="渐变颜色">
            <el-color-picker v-model="form.gradientStart" />
            <el-color-picker v-model="form.gradientEnd" style="margin-left: 10px;" />
          </el-form-item>
          <el-form-item label="文字颜色">
            <el-color-picker v-model="form.textColor" />
            <span class="inline-label">强调色</span>
            <el-color-picker v-model="form.accentColor" />
          </el-form-item>
          <el-form-item label="字号">
            <el-input-number v-model="form.titleFontSize" :min="20" :max="44" />
            <span class="inline-label">正文</span>
            <el-input-number v-model="form.bodyFontSize" :min="18" :max="34" />
          </el-form-item>
          <el-form-item label="文字收纳">
            <el-input-number v-model="form.maxTitleChars" :min="8" :max="60" />
            <span class="inline-label">摘要字数</span>
            <el-input-number v-model="form.maxSummaryChars" :min="24" :max="180" />
          </el-form-item>
          <el-form-item label="高度/行数">
            <el-input-number v-model="form.coverHeight" :min="240" :max="520" />
            <span class="inline-label">最多行</span>
            <el-input-number v-model="form.maxLines" :min="3" :max="10" />
          </el-form-item>
          <el-form-item label="展示信息">
            <el-checkbox v-model="form.showTopic">话题</el-checkbox>
            <el-checkbox v-model="form.showCircle">圈子/来源</el-checkbox>
          </el-form-item>
          <el-form-item label="优先级">
            <el-input-number v-model="form.priority" :min="-999" :max="999" />
          </el-form-item>
        </el-form>
        <div class="preview-panel">
          <div class="preview-title">小程序封面预览</div>
          <TextCoverPreview :template="form" large />
          <div class="preview-note">用户发纯文字时使用该封面；用户上传图片时仍然显示图片。</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTemplate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import RegionSelector from '@/components/common/RegionSelector.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { request } from '@/api/request'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editingId = ref('')
const templates = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({ keyword: '', regionId: '' })

const backgroundOptions = [
  { label: '纯色', value: 'color' },
  { label: '渐变', value: 'gradient' },
  { label: '图片', value: 'image' }
]

const defaultForm = () => ({
  name: '校园便签风',
  regionId: '',
  enabled: true,
  isDefault: false,
  backgroundType: 'gradient',
  backgroundColor: '#F7F3EA',
  gradientStart: '#FFF6E8',
  gradientEnd: '#F8E7FF',
  backgroundImage: '',
  textColor: '#222222',
  accentColor: '#FF4D5A',
  titleFontSize: 30,
  bodyFontSize: 24,
  maxTitleChars: 24,
  maxSummaryChars: 72,
  maxLines: 6,
  coverHeight: 350,
  showTopic: true,
  showCircle: true,
  priority: 0
})

const form = reactive<any>(defaultForm())

function resetForm(row?: any) {
  Object.assign(form, defaultForm(), row || {})
}

function backgroundTypeText(type: string) {
  return type === 'image' ? '背景图' : type === 'gradient' ? '渐变' : '纯色'
}

async function loadTemplates() {
  loading.value = true
  try {
    const res: any = await request.get('/admin/posts/text-cover-templates', {
      params: { page: page.value, pageSize: pageSize.value, ...filters }
    })
    templates.value = res.list || res.data?.list || []
    total.value = res.total || res.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.regionId = ''
  page.value = 1
  loadTemplates()
}

function openDialog(row?: any) {
  editingId.value = row?.id || ''
  resetForm(row)
  dialogVisible.value = true
}

async function saveTemplate() {
  if (!String(form.name || '').trim()) {
    ElMessage.warning('请填写模板名称')
    return
  }
  saving.value = true
  try {
    const payload = { ...form, regionId: form.regionId || null }
    if (editingId.value) {
      await request.put(`/admin/posts/text-cover-templates/${editingId.value}`, payload)
    } else {
      await request.post('/admin/posts/text-cover-templates', payload)
    }
    ElMessage.success('已保存')
    dialogVisible.value = false
    loadTemplates()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function removeTemplate(row: any) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.name}」吗？`, '删除模板', { type: 'warning' })
    await request.delete(`/admin/posts/text-cover-templates/${row.id}`)
    ElMessage.success('已删除')
    loadTemplates()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '删除失败')
  }
}

const TextCoverPreview = defineComponent({
  name: 'TextCoverPreview',
  props: { template: { type: Object, required: true }, large: { type: Boolean, default: false } },
  setup(props) {
    const style = computed(() => {
      const tpl: any = props.template || {}
      const base: Record<string, string> = {
        color: tpl.textColor || '#222',
        minHeight: props.large ? '260px' : '130px',
      }
      if (tpl.backgroundType === 'image' && tpl.backgroundImage) {
        base.backgroundImage = `linear-gradient(rgba(255,255,255,.12), rgba(255,255,255,.72)), url(${tpl.backgroundImage})`
        base.backgroundSize = 'cover'
        base.backgroundPosition = 'center'
      } else if (tpl.backgroundType === 'gradient') {
        base.background = `linear-gradient(135deg, ${tpl.gradientStart || '#FFF6E8'}, ${tpl.gradientEnd || '#F8E7FF'})`
      } else {
        base.background = tpl.backgroundColor || '#F7F3EA'
      }
      return base
    })
    return () => h('div', { class: ['text-cover-preview', props.large ? 'large' : ''], style: style.value }, [
      h('div', { class: 'preview-mark', style: { background: (props.template as any).accentColor || '#FF4D5A' } }),
      h('div', { class: 'preview-heading', style: { fontSize: `${props.large ? (props.template as any).titleFontSize || 30 : 18}px` } }, '做了一个小程序，不知道怎么推广'),
      h('div', { class: 'preview-summary', style: { fontSize: `${props.large ? (props.template as any).bodyFontSize || 24 : 13}px` } }, '云阳本地学生论坛，想听听大家的建议和想法...'),
      h('div', { class: 'preview-meta' }, [(props.template as any).showTopic ? '#校园生活' : '', (props.template as any).showCircle ? '广场' : ''].filter(Boolean).join(' · '))
    ])
  }
})

onMounted(loadTemplates)
</script>

<style scoped>
.page-container { padding: 24px; }
.table-card { padding: 0; }
.table-footer { display: flex; justify-content: flex-end; padding: 16px; }
.name-cell strong { font-size: 14px; color: #172033; }
.muted, .form-tip, .preview-note { color: #708098; font-size: 12px; line-height: 1.7; }
.dialog-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 22px; }
.template-form { min-width: 0; }
.inline-label { margin: 0 10px 0 18px; color: #64748b; font-size: 13px; }
.preview-panel { border: 1px solid #e5edf7; border-radius: 10px; padding: 14px; background: #f8fafc; }
.preview-title { font-weight: 700; margin-bottom: 12px; color: #172033; }
.text-cover-preview { position: relative; overflow: hidden; border-radius: 10px; padding: 18px; box-sizing: border-box; box-shadow: inset 0 0 0 1px rgba(255,255,255,.36); }
.text-cover-preview.large { border-radius: 14px; padding: 24px; }
.preview-mark { width: 34px; height: 6px; border-radius: 999px; margin-bottom: 18px; }
.preview-heading { font-weight: 800; line-height: 1.25; letter-spacing: 0; }
.preview-summary { margin-top: 12px; line-height: 1.45; opacity: .78; }
.preview-meta { position: absolute; left: 18px; bottom: 14px; color: inherit; opacity: .62; font-size: 12px; }
</style>

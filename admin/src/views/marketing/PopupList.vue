<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 首页权益卡片</p>
        <h2>首页权益卡片</h2>
        <p>按运营区域配置首页固定权益卡片，支持图片上传、时间控制和跳转配置。</p>
      </div>
      <div class="header-actions">
        <el-button @click="fillSample">套用示范</el-button>
        <el-button type="primary" @click="openCreate">创建首页权益卡片</el-button>
      </div>
    </div>

    <div class="filter-card">
      <el-select v-model="filters.regionId" clearable filterable placeholder="区域">
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-select v-model="filters.status" clearable placeholder="状态">
        <el-option label="启用" :value="1" />
        <el-option label="禁用" :value="0" />
      </el-select>
      <el-button type="primary" @click="loadPopups">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="data-card">
      <el-table :data="popups" v-loading="loading" empty-text="暂无首页权益卡片数据">
        <el-table-column label="卡片" min-width="260">
          <template #default="{ row }">
            <div class="media-cell">
              <el-image v-if="row.image" :src="row.image" fit="cover" class="thumb" />
              <div v-else class="thumb placeholder">权</div>
              <div>
                <strong>{{ row.name || row.title }}</strong>
                <p>{{ row.linkType || 'none' }} · {{ row.linkValue || row.link || '无跳转' }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="区域" min-width="150">
          <template #default="{ row }">{{ regionName(row.regionId) }}</template>
        </el-table-column>
        <el-table-column label="优先级" prop="priority" width="90" />
        <el-table-column label="曝光/点击" width="150">
          <template #default="{ row }">
            <div>{{ row.viewCount || 0 }} / {{ row.clickCount || 0 }}</div>
            <div class="muted">点击率 {{ clickRate(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="Number(row.status) === 1 ? 'success' : 'info'" size="small">
              {{ Number(row.status) === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="有效期" min-width="240">
          <template #default="{ row }">{{ formatTime(row.startTime || row.startAt) }} 至 {{ formatTime(row.endTime || row.endAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editPopup(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deletePopup(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadPopups"
          @size-change="loadPopups"
        />
      </div>
    </div>

    <el-dialog v-model="showDialog" :title="editingPopup ? '编辑首页权益卡片' : '创建首页权益卡片'" width="880px">
      <div class="popup-editor">
        <el-form :model="form" label-width="100px">
          <el-form-item label="标题" required>
            <el-input v-model="form.name" placeholder="卡片标题" />
          </el-form-item>
          <el-form-item label="图片" required>
            <ImageUploadBox v-model="form.image" scene="marketing-popup" shape="wide" placeholder="上传卡片图片" tip="可上传自定义图片，也可直接套用右侧示范图。建议 750x900px，最大 5MB" :max-size="5" />
          </el-form-item>
          <div class="dialog-grid">
            <el-form-item label="所属区域" required>
              <el-select v-model="form.regionId" filterable placeholder="请选择卡片投放区域" style="width: 100%">
                <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="跳转类型">
              <el-select v-model="form.linkType" style="width: 100%">
                <el-option label="无跳转" value="none" />
                <el-option label="小程序页面" value="page" />
                <el-option label="H5 页面" value="webview" />
                <el-option label="帖子" value="post" />
                <el-option label="商品/团购" value="product" />
              </el-select>
            </el-form-item>
            <el-form-item label="优先级">
              <el-input-number v-model="form.priority" :min="0" />
            </el-form-item>
            <el-form-item label="状态">
              <el-switch v-model="form.enabled" active-text="启用" inactive-text="禁用" />
            </el-form-item>
            <el-form-item label="跳转值">
              <el-input v-model="form.linkValue" placeholder="页面路径、URL 或资源 ID" />
            </el-form-item>
          </div>
          <el-form-item label="有效期">
            <el-date-picker
              v-model="form.dateRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始"
              end-placeholder="结束"
              style="width: 100%"
            />
          </el-form-item>
        </el-form>
        <aside class="sample-panel">
          <div class="sample-phone">
            <img :src="form.image || sampleImage" alt="首页权益卡片示范图" />
          </div>
          <strong>示范图</strong>
          <p>小程序首页只在用户进入对应区域后展示。建议图片承载主视觉，标题、权益和按钮保持清晰克制。</p>
          <el-button size="small" @click="fillSample">套用示范文案</el-button>
        </aside>
      </div>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submitPopup" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { fetchRegions } from '@/api/admin'
import { request } from '@/api/request'
import sampleImage from '@/assets/marketing-popup-sample.svg'
import { cleanPayload, errorMessage, formatTime, unwrapPage } from './utils'

const loading = ref(false)
const submitting = ref(false)
const showDialog = ref(false)
const editingPopup = ref<any>(null)
const popups = ref<any[]>([])
const regions = ref<any[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const filters = reactive<{ status: number | '', regionId: string }>({ status: '', regionId: '' })
const sampleImageValue = '/api/uploads/admin/marketing-popup-sample.svg'

const form = reactive({
  regionId: '',
  name: '',
  image: '',
  linkType: 'none',
  linkValue: '',
  priority: 0,
  enabled: true,
  dateRange: null as any,
})

function showRequestError(error: any, fallback: string) {
  if (error?.userMessage) return
  ElMessage.error(errorMessage(error, fallback))
}

function resetForm() {
  Object.assign(form, {
    regionId: filters.regionId || '',
    name: '',
    image: '',
    linkType: 'none',
    linkValue: '',
    priority: 0,
    enabled: true,
    dateRange: null,
  })
}

function openCreate() {
  editingPopup.value = null
  resetForm()
  showDialog.value = true
}

function fillSample() {
  if (!showDialog.value) openCreate()
  Object.assign(form, {
    regionId: form.regionId || filters.regionId || regions.value[0]?.id || '',
    name: form.name || '新用户首单礼包',
    image: form.image || sampleImageValue,
    linkType: form.linkType === 'none' ? 'page' : form.linkType,
    linkValue: form.linkValue || '/pagesA/coupon/coupon',
    priority: form.priority || 10,
    enabled: true,
  })
  ElMessage.success('已套用示范文案和示范图，可直接保存或继续调整')
}

async function loadPopups() {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/popups', {
      params: { page: pagination.page, pageSize: pagination.pageSize, status: filters.status, regionId: filters.regionId || undefined },
    })
    const page = unwrapPage(res)
    popups.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    showRequestError(error, '加载卡片失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.status = ''
  filters.regionId = ''
  pagination.page = 1
  loadPopups()
}

function regionName(regionId: string) {
  if (!regionId) return '未配置'
  const region = regions.value.find(item => String(item.id) === String(regionId))
  return region?.name || regionId
}

function clickRate(row: any) {
  const views = Number(row?.viewCount || 0)
  const clicks = Number(row?.clickCount || 0)
  return views > 0 ? `${((clicks / views) * 100).toFixed(1)}%` : '0.0%'
}

function editPopup(popup: any) {
  editingPopup.value = popup
  const start = popup.startTime || popup.startAt
  const end = popup.endTime || popup.endAt
  Object.assign(form, {
    regionId: popup.regionId || '',
    name: popup.name || popup.title || '',
    image: popup.image || '',
    linkType: popup.linkType || 'none',
    linkValue: popup.linkValue || popup.link || '',
    priority: Number(popup.priority || 0),
    enabled: Number(popup.status) === 1,
    dateRange: start && end ? [new Date(start), new Date(end)] : null,
  })
  showDialog.value = true
}

function isLocalPreviewImage(value: string) {
  return /(^\/src\/|^\/assets\/)/.test(value)
}

function validatePopupForm() {
  const title = form.name.trim()
  const regionId = String(form.regionId || '').trim()
  const image = String(form.image || '').trim()
  const linkValue = String(form.linkValue || '').trim()
  if (!regionId) return '区域没选：请先选择这张卡片要投放的运营区域'
  if (!title) return '标题没填：请填写卡片标题后再保存'
  if (title.length > 80) return '标题太长：请控制在 80 个字以内'
  if (!image) return '图片没选：请上传卡片图片，或点击右侧“套用示范文案”使用示范图'
  if (isLocalPreviewImage(image)) return '图片地址不是正式可访问地址：请重新上传图片，或点击右侧“套用示范文案”使用示范图'
  if (image.length > 1000) return '图片地址太长：请重新上传图片，或检查存储返回的图片地址是否异常'
  if (form.linkType !== 'none' && !linkValue) return '跳转值没填：当前选择了跳转类型，请填写要跳转的页面路径、URL 或资源 ID'
  if (form.linkType === 'page' && !/^\/[A-Za-z0-9_/-]+(\?[A-Za-z0-9_=&%.-]+)?$/.test(linkValue)) {
    return '小程序页面路径格式不对：请用 /pagesA/coupon/coupon 这种以 / 开头的页面路径'
  }
  if (form.linkType === 'webview' && !/^https?:\/\/.+/i.test(linkValue)) {
    return 'H5 页面地址格式不对：请填写 http:// 或 https:// 开头的完整网址'
  }
  if (linkValue.length > 500) return '跳转值太长：请缩短页面路径、URL 或资源 ID'
  const start = form.dateRange?.[0] ? new Date(form.dateRange[0]) : null
  const end = form.dateRange?.[1] ? new Date(form.dateRange[1]) : null
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
    return '有效期格式不对：请重新选择开始和结束时间'
  }
  if (start && end && end.getTime() < start.getTime()) return '有效期不对：结束时间不能早于开始时间'
  return ''
}

async function submitPopup() {
  const formError = validatePopupForm()
  if (formError) {
    ElMessage.warning(formError)
    return
  }
  submitting.value = true
  try {
    const payload = cleanPayload({
      regionId: String(form.regionId || '').trim(),
      name: form.name.trim(),
      image: String(form.image || '').trim(),
      linkType: form.linkType,
      linkValue: String(form.linkValue || '').trim(),
      priority: form.priority,
      status: form.enabled ? 1 : 0,
      startAt: form.dateRange?.[0]?.toISOString(),
      endAt: form.dateRange?.[1]?.toISOString(),
    })
    if (editingPopup.value) {
      await request.put(`/admin/marketing/popups/${editingPopup.value.id}`, payload)
      ElMessage.success('卡片已更新')
    } else {
      await request.post('/admin/marketing/popups', payload)
      ElMessage.success('卡片已创建')
    }
    showDialog.value = false
    await loadPopups()
  } catch (error: any) {
    showRequestError(error, '保存卡片失败')
  } finally {
    submitting.value = false
  }
}

async function deletePopup(popup: any) {
  try {
    await ElMessageBox.confirm(`确定删除「${popup.name || popup.title}」吗？`, '确认删除', { type: 'warning' })
    await request.delete(`/admin/marketing/popups/${popup.id}`)
    ElMessage.success('卡片已删除')
    await loadPopups()
  } catch (error: any) {
    if (error !== 'cancel') showRequestError(error, '删除失败')
  }
}

onMounted(async () => {
  try {
    regions.value = await fetchRegions()
    const preferred = String(localStorage.getItem('LM_SELECTED_REGION_ID') || localStorage.getItem('selectedRegionId') || '')
    if (preferred && regions.value.some(region => String(region.id) === preferred)) {
      filters.regionId = preferred
    }
    await loadPopups()
  } catch (error: any) {
    showRequestError(error, '加载区域失败')
  }
})
</script>

<style scoped>
.marketing-page { padding: 24px; }
.marketing-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.header-actions { display: flex; gap: 10px; }
.filter-card,
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 14px; box-shadow: 0 14px 36px rgba(37,99,235,.08); }
.filter-card { display: grid; grid-template-columns: 220px 180px auto auto; gap: 12px; padding: 16px; margin-bottom: 18px; }
.data-card { padding: 18px; }
.media-cell { display: flex; align-items: center; gap: 12px; }
.media-cell strong { color: #0f172a; }
.media-cell p { margin: 4px 0 0; color: #64748b; }
.muted { margin-top: 4px; color: #94a3b8; font-size: 12px; }
.thumb { width: 60px; height: 46px; border-radius: 10px; object-fit: cover; background: #eff6ff; flex: none; }
.placeholder { display: grid; place-items: center; color: #2563eb; font-weight: 900; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.popup-editor { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 18px; align-items: start; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.sample-panel { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; background: #f8fafc; color: #334155; }
.sample-panel strong { display: block; margin: 10px 0 4px; color: #0f172a; }
.sample-panel p { margin: 0 0 12px; line-height: 1.6; font-size: 12px; color: #64748b; }
.sample-phone { overflow: hidden; border-radius: 14px; aspect-ratio: 5 / 6; background: #111827; box-shadow: inset 0 0 0 1px rgba(255,255,255,.1); }
.sample-phone img { display: block; width: 100%; height: 100%; object-fit: cover; }
@media (max-width: 900px) {
  .filter-card { grid-template-columns: 1fr; }
  .popup-editor { grid-template-columns: 1fr; }
  .dialog-grid { grid-template-columns: 1fr; }
}
</style>

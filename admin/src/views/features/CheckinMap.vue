<template>
  <div class="page-shell">
    <PageHeader title="打卡地图" subtitle="管理打卡地点、分类、记录和区域配置" icon="Location" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="地点管理" name="locations">
        <div class="tab-toolbar">
          <el-select v-model="locFilters.regionId" clearable placeholder="区域" style="width:180px" @change="loadLocations">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-input v-model="locFilters.keyword" placeholder="搜索地点" clearable style="width:180px" @keyup.enter="loadLocations" />
          <el-select v-model="locFilters.categoryId" clearable placeholder="分类" style="width:140px" @change="loadLocations">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-button type="primary" @click="openLocationDialog()">新增地点</el-button>
          <el-button @click="loadLocations" :loading="locLoading">刷新</el-button>
        </div>

        <el-table :data="locations" v-loading="locLoading" stripe>
          <el-table-column label="地点" min-width="220">
            <template #default="{ row }">
              <div class="media-cell">
                <el-image v-if="row.coverImage" :src="row.coverImage" fit="cover" class="thumb" />
                <div v-else class="thumb thumb-empty">图</div>
                <div>
                  <div class="cell-title">{{ row.name }}</div>
                  <div class="cell-sub">{{ row.address || '未设置地址' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="分类" width="120">
            <template #default="{ row }">{{ row.categoryName || row.category?.name || '-' }}</template>
          </el-table-column>
          <el-table-column label="坐标" width="190">
            <template #default="{ row }">
              {{ row.latitude && row.longitude ? `${row.latitude}, ${row.longitude}` : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="打卡数" width="90">
            <template #default="{ row }">{{ row.recordCount ?? row._count?.records ?? 0 }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'PUBLISHED' ? 'success' : 'info'" size="small">
                {{ row.status === 'PUBLISHED' ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openLocationDialog(row)">编辑</el-button>
              <el-popconfirm title="确定删除？" @confirm="deleteLocation(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="locPage"
            v-model:page-size="locPageSize"
            :total="locTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @change="loadLocations"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="分类管理" name="categories">
        <div class="tab-toolbar">
          <el-button type="primary" @click="openCategoryDialog()">新增分类</el-button>
          <el-button @click="loadCategories" :loading="catLoading">刷新</el-button>
        </div>
        <el-table :data="categories" v-loading="catLoading" stripe>
          <el-table-column label="分类" min-width="220">
            <template #default="{ row }">
              <div class="media-cell">
                <el-image v-if="row.icon" :src="row.icon" fit="cover" class="icon-thumb" />
                <div v-else class="icon-thumb thumb-empty">图</div>
                <span class="cell-title">{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="90" />
          <el-table-column label="地点数" width="90">
            <template #default="{ row }">{{ row.locationCount ?? row._count?.locations ?? 0 }}</template>
          </el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openCategoryDialog(row)">编辑</el-button>
              <el-popconfirm title="确定删除？" @confirm="deleteCategory(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="打卡记录" name="records">
        <div class="tab-toolbar">
          <el-input v-model="recFilters.keyword" placeholder="搜索用户、地点或内容" clearable style="width:220px" @keyup.enter="loadRecords" />
          <el-button @click="loadRecords" :loading="recLoading">刷新</el-button>
        </div>
        <el-table :data="records" v-loading="recLoading" stripe>
          <el-table-column label="用户" width="140">
            <template #default="{ row }">{{ row.User?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column label="打卡地点" width="160">
            <template #default="{ row }">{{ row.location?.name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="content" label="内容" min-width="220" show-overflow-tooltip />
          <el-table-column prop="createdAt" label="打卡时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-popconfirm title="确定删除？" @confirm="deleteRecord(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="recPage"
            v-model:page-size="recPageSize"
            :total="recTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @change="loadRecords"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="评论管理" name="comments">
        <div class="tab-toolbar">
          <el-button @click="loadComments" :loading="comLoading">刷新</el-button>
        </div>
        <el-table :data="punchComments" v-loading="comLoading" stripe>
          <el-table-column label="用户" width="140">
            <template #default="{ row }">{{ row.User?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="content" label="评论内容" min-width="260" show-overflow-tooltip />
          <el-table-column prop="createdAt" label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-popconfirm title="确定删除？" @confirm="deleteComment(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="comPage"
            v-model:page-size="comPageSize"
            :total="comTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @change="loadComments"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="区域配置" name="configs">
        <div class="tab-toolbar">
          <el-select v-model="configRegionId" placeholder="选择区域" style="width:220px" @change="loadConfig">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-button type="primary" @click="saveConfig" :loading="configSaving" :disabled="!configRegionId">保存配置</el-button>
        </div>
        <el-form v-if="configRegionId" :model="configForm" label-width="130px" style="max-width:640px">
          <el-form-item label="启用打卡"><el-switch v-model="configForm.isEnabled" /></el-form-item>
          <el-form-item label="每日打卡上限"><el-input-number v-model="configForm.maxDailyCheckins" :min="1" /></el-form-item>
          <el-form-item label="打卡范围(米)"><el-input-number v-model="configForm.locationVerifyRadius" :min="100" /></el-form-item>
        </el-form>
        <EmptyState v-else description="请先选择区域" />
      </el-tab-pane>

      <el-tab-pane label="数据统计" name="stats">
        <div class="tab-toolbar">
          <el-button @click="loadStats" :loading="statsLoading">刷新</el-button>
        </div>
        <el-descriptions :column="3" border v-loading="statsLoading">
          <el-descriptions-item label="总打卡数">{{ stats.totalRecords ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="今日打卡">{{ stats.todayRecords ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="活跃用户">{{ stats.totalUsers ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="总地点数">{{ stats.totalLocations ?? '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showLocDialog" :title="editingLoc ? '编辑地点' : '新增地点'" width="720px" destroy-on-close>
      <el-form :model="locForm" label-width="100px">
        <el-form-item label="所属区域" required>
          <el-select v-model="locForm.regionId" placeholder="选择区域" style="width:100%">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="地点名称" required><el-input v-model="locForm.name" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="locForm.categoryId" clearable style="width:100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="封面">
          <ImageUploadBox
            v-model="locForm.coverImage"
            scene="punch-location-cover"
            shape="wide"
            placeholder="上传地点封面"
            tip="建议 750x350，用于小程序地点列表和详情展示"
          />
        </el-form-item>
        <el-form-item label="地址">
          <div class="inline-field">
            <el-input v-model="locForm.address" placeholder="点击选择地图位置" readonly />
            <el-button type="primary" @click="openMapPicker">选择位置</el-button>
          </div>
        </el-form-item>
        <el-form-item label="经纬度">
          <el-input :model-value="coordinateText" readonly placeholder="地图选择后自动填入" />
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="locForm.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="locForm.isEnabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLocDialog = false">取消</el-button>
        <el-button type="primary" @click="saveLocation" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <AmapLocationPicker
      v-model:visible="showMapPicker"
      :default-center="mapDefaultCenter"
      :service-radius="configForm.locationVerifyRadius"
      @confirm="onMapConfirm"
      @cancel="showMapPicker = false"
    />

    <el-dialog v-model="showCatDialog" :title="editingCat ? '编辑分类' : '新增分类'" width="460px" destroy-on-close>
      <el-form :model="catForm" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="catForm.name" /></el-form-item>
        <el-form-item label="图标">
          <ImageUploadBox
            v-model="catForm.icon"
            scene="punch-category-icon"
            shape="square"
            placeholder="上传分类图标"
            tip="建议透明 PNG 或 200x200 方图"
          />
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="catForm.sortOrder" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCatDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCategory" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import AmapLocationPicker from '@/components/common/AmapLocationPicker.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const activeTab = ref('locations')
const saving = ref(false)
const formatDate = (d: string) => (d ? new Date(d).toLocaleString('zh-CN') : '-')

const categories = ref<any[]>([])
const catLoading = ref(false)
const regions = ref<any[]>([])

const locations = ref<any[]>([])
const locLoading = ref(false)
const locPage = ref(1)
const locPageSize = ref(20)
const locTotal = ref(0)
const locFilters = reactive({ keyword: '', categoryId: '', regionId: '' })
const showLocDialog = ref(false)
const editingLoc = ref<any>(null)
const locForm = reactive({
  regionId: '',
  name: '',
  categoryId: '',
  address: '',
  latitude: 0,
  longitude: 0,
  coverImage: '',
  description: '',
  isEnabled: true,
})
const showMapPicker = ref(false)

const showCatDialog = ref(false)
const editingCat = ref<any>(null)
const catForm = reactive({ name: '', icon: '', sortOrder: 0 })

const records = ref<any[]>([])
const recLoading = ref(false)
const recPage = ref(1)
const recPageSize = ref(20)
const recTotal = ref(0)
const recFilters = reactive({ keyword: '' })

const punchComments = ref<any[]>([])
const comLoading = ref(false)
const comPage = ref(1)
const comPageSize = ref(20)
const comTotal = ref(0)

const configRegionId = ref('')
const configForm = reactive({ isEnabled: true, maxDailyCheckins: 3, locationVerifyRadius: 500 })
const configSaving = ref(false)

const stats = ref<any>({})
const statsLoading = ref(false)

const coordinateText = computed(() => {
  if (!locForm.latitude || !locForm.longitude) return ''
  return `${locForm.latitude}, ${locForm.longitude}`
})

const mapDefaultCenter = computed<[number, number] | undefined>(() => {
  if (!locForm.longitude || !locForm.latitude) return undefined
  return [Number(locForm.longitude), Number(locForm.latitude)]
})

function unwrapList(res: any) {
  if (Array.isArray(res)) return { list: res, total: res.length }
  return { list: res?.list || res?.data?.list || [], total: res?.total || res?.data?.total || 0 }
}

async function loadCategories() {
  catLoading.value = true
  try {
    const res: any = await request.get('/admin/punch/categories')
    categories.value = unwrapList(res).list
  } catch (e: any) {
    ElMessage.error(e?.message || '加载分类失败')
    categories.value = []
  } finally {
    catLoading.value = false
  }
}

async function loadRegions() {
  try {
    const res: any = await request.get('/admin/regions', { params: { page: 1, pageSize: 100 } })
    regions.value = unwrapList(res).list
    const firstRegionId = regions.value[0]?.id || ''
    if (!locFilters.regionId) locFilters.regionId = firstRegionId
    if (!configRegionId.value) configRegionId.value = firstRegionId
  } catch (e: any) {
    ElMessage.error(e?.message || '加载区域失败')
    regions.value = []
  }
}

async function loadLocations() {
  locLoading.value = true
  try {
    const params = { page: locPage.value, pageSize: locPageSize.value, ...locFilters }
    const res: any = await request.get('/admin/punch/locations', { params })
    const pageData = unwrapList(res)
    locations.value = pageData.list
    locTotal.value = pageData.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载地点失败')
    locations.value = []
  } finally {
    locLoading.value = false
  }
}

function openLocationDialog(row?: any) {
  editingLoc.value = row || null
  if (row) {
    Object.assign(locForm, {
      regionId: row.regionId || locFilters.regionId || regions.value[0]?.id || '',
      name: row.name || '',
      categoryId: row.categoryId || '',
      address: row.address || '',
      latitude: Number(row.latitude) || 0,
      longitude: Number(row.longitude) || 0,
      coverImage: row.coverImage || '',
      description: row.description || '',
      isEnabled: row.status === 'PUBLISHED',
    })
  } else {
    Object.assign(locForm, {
      regionId: locFilters.regionId || regions.value[0]?.id || '',
      name: '',
      categoryId: '',
      address: '',
      latitude: 0,
      longitude: 0,
      coverImage: '',
      description: '',
      isEnabled: true,
    })
  }
  showLocDialog.value = true
}

function openMapPicker() {
  showMapPicker.value = true
}

function onMapConfirm(location: any) {
  locForm.longitude = Number(location.longitude) || 0
  locForm.latitude = Number(location.latitude) || 0
  locForm.address = location.address || location.poiName || ''
  showMapPicker.value = false
}

async function saveLocation() {
  if (!locForm.regionId) {
    ElMessage.warning('请选择所属区域')
    return
  }
  if (!locForm.name.trim()) {
    ElMessage.warning('请输入地点名称')
    return
  }

  saving.value = true
  try {
    const payload = {
      regionId: locForm.regionId,
      name: locForm.name.trim(),
      categoryId: locForm.categoryId || undefined,
      address: locForm.address || undefined,
      latitude: locForm.latitude || undefined,
      longitude: locForm.longitude || undefined,
      coverImage: locForm.coverImage || undefined,
      description: locForm.description || undefined,
      status: locForm.isEnabled ? 'PUBLISHED' : 'DRAFT',
    }
    if (editingLoc.value) {
      await request.put(`/admin/punch/locations/${editingLoc.value.id}`, payload)
    } else {
      await request.post('/admin/punch/locations', payload)
    }
    ElMessage.success('保存成功')
    showLocDialog.value = false
    loadLocations()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存地点失败')
  } finally {
    saving.value = false
  }
}

async function deleteLocation(id: string) {
  try {
    await request.delete(`/admin/punch/locations/${id}`)
    ElMessage.success('已删除')
    loadLocations()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除地点失败')
  }
}

function openCategoryDialog(row?: any) {
  editingCat.value = row || null
  Object.assign(
    catForm,
    row ? { name: row.name, icon: row.icon || '', sortOrder: row.sortOrder || 0 } : { name: '', icon: '', sortOrder: 0 },
  )
  showCatDialog.value = true
}

async function saveCategory() {
  if (!catForm.name.trim()) {
    ElMessage.warning('请输入分类名称')
    return
  }
  saving.value = true
  try {
    const payload = { name: catForm.name.trim(), icon: catForm.icon || undefined, sortOrder: catForm.sortOrder || 0 }
    if (editingCat.value) {
      await request.put(`/admin/punch/categories/${editingCat.value.id}`, payload)
    } else {
      await request.post('/admin/punch/categories', payload)
    }
    ElMessage.success('保存成功')
    showCatDialog.value = false
    loadCategories()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存分类失败')
  } finally {
    saving.value = false
  }
}

async function deleteCategory(id: string) {
  try {
    await request.delete(`/admin/punch/categories/${id}`)
    ElMessage.success('已删除')
    loadCategories()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除分类失败')
  }
}

async function loadRecords() {
  recLoading.value = true
  try {
    const params = { page: recPage.value, pageSize: recPageSize.value, ...recFilters }
    const res: any = await request.get('/admin/punch/records', { params })
    const pageData = unwrapList(res)
    records.value = pageData.list
    recTotal.value = pageData.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载打卡记录失败')
    records.value = []
  } finally {
    recLoading.value = false
  }
}

async function deleteRecord(id: string) {
  try {
    await request.delete(`/admin/punch/records/${id}`)
    ElMessage.success('已删除')
    loadRecords()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除记录失败')
  }
}

async function loadComments() {
  comLoading.value = true
  try {
    const params = { page: comPage.value, pageSize: comPageSize.value }
    const res: any = await request.get('/admin/punch/comments', { params })
    const pageData = unwrapList(res)
    punchComments.value = pageData.list
    comTotal.value = pageData.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载评论失败')
    punchComments.value = []
  } finally {
    comLoading.value = false
  }
}

async function deleteComment(id: string) {
  try {
    await request.delete(`/admin/punch/comments/${id}`)
    ElMessage.success('已删除')
    loadComments()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除评论失败')
  }
}

async function loadConfig() {
  if (!configRegionId.value) return
  try {
    const res: any = await request.get(`/admin/punch/configs/${configRegionId.value}`)
    if (res) {
      configForm.isEnabled = res.isEnabled ?? true
      configForm.maxDailyCheckins = res.maxDailyCheckins ?? 3
      configForm.locationVerifyRadius = res.locationVerifyRadius ?? 500
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载配置失败')
  }
}

async function saveConfig() {
  if (!configRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  configSaving.value = true
  try {
    await request.put(`/admin/punch/configs/${configRegionId.value}`, configForm)
    ElMessage.success('保存成功')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存配置失败')
  } finally {
    configSaving.value = false
  }
}

async function loadStats() {
  statsLoading.value = true
  try {
    stats.value = (await request.get('/admin/punch/stats/overview')) || {}
  } catch (e: any) {
    ElMessage.error(e?.message || '加载统计失败')
    stats.value = {}
  } finally {
    statsLoading.value = false
  }
}

function handleTabChange() {
  const loaders: Record<string, () => void> = {
    locations: loadLocations,
    categories: loadCategories,
    records: loadRecords,
    comments: loadComments,
    configs: loadConfig,
    stats: loadStats,
  }
  loaders[activeTab.value]?.()
}

onMounted(async () => {
  await Promise.all([loadCategories(), loadRegions()])
  await Promise.all([loadLocations(), loadConfig()])
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.media-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.thumb { width: 56px; height: 40px; border-radius: 6px; flex-shrink: 0; background: var(--el-color-primary-light-9); }
.icon-thumb { width: 34px; height: 34px; border-radius: 6px; flex-shrink: 0; background: var(--el-color-primary-light-9); }
.thumb-empty { display: flex; align-items: center; justify-content: center; color: var(--mx-muted); font-size: 12px; }
.cell-title { font-weight: 600; color: var(--mx-text); }
.cell-sub { max-width: 360px; margin-top: 4px; color: var(--mx-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inline-field { display: flex; width: 100%; gap: 8px; }
.inline-field .el-input { flex: 1; }
</style>

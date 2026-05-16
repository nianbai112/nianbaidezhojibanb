<template>
  <div class="page-shell">
    <PageHeader title="评分系统" subtitle="管理评分分类、项目、记录和回复审核" icon="Star" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="概览" name="dashboard">
        <div class="stat-cards">
          <el-card v-for="s in dashStats" :key="s.label" shadow="hover" class="stat-card">
            <div class="stat-value">{{ s.value ?? '-' }}</div>
            <div class="stat-label">{{ s.label }}</div>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane label="区域设置" name="settings">
        <div class="tab-toolbar">
          <el-select v-model="settingRegionId" placeholder="选择区域" style="width:200px" @change="loadSetting">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-button type="primary" @click="saveSetting" :loading="settingSaving" :disabled="!settingRegionId">保存</el-button>
        </div>
        <el-form v-if="settingRegionId" :model="settingForm" label-width="140px" style="max-width:600px">
          <el-form-item label="启用评分"><el-switch v-model="settingForm.enableRating" /></el-form-item>
          <el-form-item label="启用动态"><el-switch v-model="settingForm.enableDynamic" /></el-form-item>
          <el-form-item label="评分需登录"><el-switch v-model="settingForm.requireLoginToRate" /></el-form-item>
        </el-form>
        <el-empty v-else description="请先选择区域" />
      </el-tab-pane>

      <el-tab-pane label="分类管理" name="categories">
        <div class="tab-toolbar">
          <el-select v-model="catFilters.regionId" clearable filterable placeholder="区域" style="width:180px" @change="loadCategories">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-button type="primary" @click="openCategoryDialog()">新增分类</el-button>
          <el-button @click="loadCategories" :loading="catLoading">刷新</el-button>
        </div>
        <el-table :data="categories" v-loading="catLoading" stripe>
          <el-table-column prop="icon" label="图标" width="80">
            <template #default="{ row }">
              <el-image v-if="row.icon" :src="row.icon" style="width:36px;height:36px;border-radius:8px" fit="cover" />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="分类名称" width="200" />
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column prop="sortOrder" label="排序" width="80" />
          <el-table-column label="评分数" width="80">
            <template #default="{ row }">{{ row._count?.items ?? 0 }}</template>
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

      <el-tab-pane label="评分项目" name="items">
        <div class="tab-toolbar">
          <el-input v-model="itemFilters.keyword" clearable placeholder="搜索项目" style="width:180px" @keyup.enter="loadItems" />
          <el-select v-model="itemFilters.regionId" clearable filterable placeholder="区域" style="width:180px" @change="loadItems">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-select v-model="itemFilters.categoryId" clearable filterable placeholder="分类" style="width:180px" @change="loadItems">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-select v-model="itemFilters.status" clearable placeholder="状态" style="width:120px" @change="loadItems">
            <el-option label="启用" value="enabled" />
            <el-option label="禁用" value="disabled" />
          </el-select>
          <el-button type="primary" @click="openItemDialog()">新增项目</el-button>
          <el-button @click="loadItems" :loading="itemLoading">刷新</el-button>
        </div>
        <el-table :data="items" v-loading="itemLoading" stripe>
          <el-table-column prop="cover" label="封面" width="80">
            <template #default="{ row }">
              <el-image v-if="row.cover" :src="row.cover" style="width:42px;height:42px;border-radius:8px" fit="cover" />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="项目名称" width="180" />
          <el-table-column prop="category.name" label="分类" width="120">
            <template #default="{ row }">{{ row.category?.name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column prop="avgScore" label="均分" width="80" />
          <el-table-column prop="ratingCount" label="评分数" width="80" />
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status !== 'disabled' ? 'success' : 'info'" size="small">{{ row.status !== 'disabled' ? '启用' : '禁用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openItemDialog(row)">编辑</el-button>
              <el-popconfirm title="确定删除？" @confirm="deleteItem(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="itemPage" v-model:page-size="itemPageSize" :total="itemTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadItems" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="评分记录" name="records">
        <div class="tab-toolbar">
          <el-button @click="loadRecords" :loading="recLoading">刷新</el-button>
        </div>
        <el-table :data="records" v-loading="recLoading" stripe>
          <el-table-column prop="User.nickname" label="用户" width="120">
            <template #default="{ row }">{{ row.User?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="item.name" label="评分项目" width="150">
            <template #default="{ row }">{{ row.item?.name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="score" label="评分" width="80">
            <template #default="{ row }">
              <el-rate :model-value="row.score" disabled show-score text-color="#ff9900" />
            </template>
          </el-table-column>
          <el-table-column prop="content" label="评价内容" min-width="200" show-overflow-tooltip />
          <el-table-column prop="createdAt" label="时间" width="170">
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
          <el-pagination v-model:current-page="recPage" v-model:page-size="recPageSize" :total="recTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadRecords" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="回复审核" name="replies">
        <div class="tab-toolbar">
          <el-select v-model="replyFilters.status" clearable placeholder="状态" style="width:120px" @change="loadReplies">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
          </el-select>
          <el-button @click="loadReplies" :loading="replyLoading">刷新</el-button>
        </div>
        <el-table :data="replies" v-loading="replyLoading" stripe>
          <el-table-column prop="user.nickname" label="用户" width="120">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="content" label="回复内容" min-width="250" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'" size="small">
                {{ row.status === 'approved' ? '已通过' : row.status === 'rejected' ? '已拒绝' : '待审核' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button size="small" type="success" link @click="auditReply(row.id, 'approved')">通过</el-button>
                <el-button size="small" type="danger" link @click="auditReply(row.id, 'rejected')">拒绝</el-button>
              </template>
              <el-popconfirm title="确定删除？" @confirm="deleteReply(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="replyPage" v-model:page-size="replyPageSize" :total="replyTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadReplies" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showCatDialog" :title="editingCat ? '编辑分类' : '新增分类'" width="500px" destroy-on-close>
      <el-form :model="catForm" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="catForm.name" /></el-form-item>
        <el-form-item label="区域">
          <el-select v-model="catForm.regionId" clearable filterable placeholder="不选则为全部区域" style="width:100%">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="图标">
          <ImageUploadBox v-model="catForm.icon" scene="rating-category-icon" shape="square" placeholder="上传分类图标" tip="建议 160x160" />
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="catForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="catForm.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="catForm.isActive" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCatDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCategory" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showItemDialog" :title="editingItem ? '编辑项目' : '新增项目'" width="500px" destroy-on-close>
      <el-form :model="itemForm" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="itemForm.name" /></el-form-item>
        <el-form-item label="区域">
          <el-select v-model="itemForm.regionId" clearable filterable placeholder="不选则为全部区域" style="width:100%">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="itemForm.categoryId" style="width:100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="封面">
          <ImageUploadBox v-model="itemForm.cover" scene="rating-item-cover" shape="wide" placeholder="上传项目封面" tip="建议 750x350，用于评分项目展示" />
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="itemForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="itemForm.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch :model-value="itemForm.status !== 'disabled'" @update:model-value="itemForm.status = $event ? 'enabled' : 'disabled'" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showItemDialog = false">取消</el-button>
        <el-button type="primary" @click="saveItem" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

const activeTab = ref('dashboard')
const saving = ref(false)
const formatDate = (d: string) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const regions = ref<any[]>([])
const dashStats = ref<any[]>([])

const categories = ref<any[]>([])
const catLoading = ref(false)
const showCatDialog = ref(false)
const editingCat = ref<any>(null)
const catFilters = reactive({ regionId: '' })
const catForm = reactive({ name: '', regionId: '', icon: '', description: '', sortOrder: 0, isActive: true })

const items = ref<any[]>([])
const itemLoading = ref(false)
const itemPage = ref(1)
const itemPageSize = ref(20)
const itemTotal = ref(0)
const showItemDialog = ref(false)
const editingItem = ref<any>(null)
const itemFilters = reactive({ keyword: '', regionId: '', categoryId: '', status: '' })
const itemForm = reactive({ name: '', categoryId: '', regionId: '', cover: '', description: '', sortOrder: 0, status: 'enabled' })

const records = ref<any[]>([])
const recLoading = ref(false)
const recPage = ref(1)
const recPageSize = ref(20)
const recTotal = ref(0)

const replies = ref<any[]>([])
const replyLoading = ref(false)
const replyPage = ref(1)
const replyPageSize = ref(20)
const replyTotal = ref(0)
const replyFilters = reactive({ status: '' })

const settingRegionId = ref('')
const settingForm = reactive({ enableRating: true, enableDynamic: false, requireLoginToRate: false })
const settingSaving = ref(false)

function cleanPayload(payload: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  )
}

async function loadDashboard() {
  try {
    const res: any = await request.get('/admin/ratings/dashboard')
    const d = res || {}
    dashStats.value = [
      { label: '总评分数', value: d.totalRatings ?? 0 },
      { label: '平均分', value: d.avgScore ?? '-' },
      { label: '评分项目数', value: d.totalItems ?? 0 },
      { label: '评分分类数', value: d.totalCategories ?? 0 },
    ]
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); dashStats.value = [] }
}

async function loadRegions() {
  try {
    const res: any = await request.get('/admin/regions')
    regions.value = res.list || res.data?.list || (Array.isArray(res) ? res : [])
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); regions.value = [] }
}

async function loadSetting() {
  if (!settingRegionId.value) return
  try {
    const res: any = await request.get(`/admin/ratings/settings/${settingRegionId.value}`)
    if (res) Object.assign(settingForm, res)
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function saveSetting() {
  settingSaving.value = true
  try {
    const payload = {
      enableRating: settingForm.enableRating,
      enableDynamic: settingForm.enableDynamic,
      requireLoginToRate: settingForm.requireLoginToRate,
    }
    await request.put(`/admin/ratings/settings/${settingRegionId.value}`, payload)
    ElMessage.success('保存成功')
  } catch (e: any) { ElMessage.error(e?.message || '保存失败') }
  finally { settingSaving.value = false }
}

async function loadCategories() {
  catLoading.value = true
  try {
    const res: any = await request.get('/admin/ratings/categories', { params: cleanPayload(catFilters) })
    categories.value = Array.isArray(res) ? res : res.list || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); categories.value = [] }
  finally { catLoading.value = false }
}

function openCategoryDialog(row?: any) {
  editingCat.value = row || null
  Object.assign(catForm, row
    ? { name: row.name, regionId: row.regionId || '', icon: row.icon || '', description: row.description || '', sortOrder: row.sortOrder || 0, isActive: row.isActive ?? true }
    : { name: '', regionId: catFilters.regionId || '', icon: '', description: '', sortOrder: 0, isActive: true })
  showCatDialog.value = true
}

async function saveCategory() {
  saving.value = true
  try {
    const payload = cleanPayload(catForm)
    if (editingCat.value) {
      await request.put(`/admin/ratings/categories/${editingCat.value.id}`, payload)
    } else {
      await request.post('/admin/ratings/categories', payload)
    }
    ElMessage.success('保存成功')
    showCatDialog.value = false
    loadCategories()
  } catch (e: any) { ElMessage.error(e?.message || '保存失败') }
  finally { saving.value = false }
}

async function deleteCategory(id: string) {
  try {
    await request.delete(`/admin/ratings/categories/${id}`)
    ElMessage.success('已删除')
    loadCategories()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadItems() {
  itemLoading.value = true
  try {
    const params = cleanPayload({ page: itemPage.value, limit: itemPageSize.value, ...itemFilters })
    const res: any = await request.get('/admin/ratings/items', { params })
    items.value = res.list || res.data?.list || []
    itemTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); items.value = [] }
  finally { itemLoading.value = false }
}

function openItemDialog(row?: any) {
  editingItem.value = row || null
  Object.assign(itemForm, row
    ? { name: row.name, categoryId: row.categoryId, regionId: row.regionId || '', cover: row.cover || '', description: row.description || '', sortOrder: row.sortOrder || 0, status: row.status || 'enabled' }
    : { name: '', categoryId: itemFilters.categoryId || '', regionId: itemFilters.regionId || catFilters.regionId || '', cover: '', description: '', sortOrder: 0, status: 'enabled' })
  showItemDialog.value = true
}

async function saveItem() {
  saving.value = true
  try {
    const payload = cleanPayload(itemForm)
    if (editingItem.value) {
      await request.put(`/admin/ratings/items/${editingItem.value.id}`, payload)
    } else {
      await request.post('/admin/ratings/items', payload)
    }
    ElMessage.success('保存成功')
    showItemDialog.value = false
    loadItems()
  } catch (e: any) { ElMessage.error(e?.message || '保存失败') }
  finally { saving.value = false }
}

async function deleteItem(id: string) {
  try {
    await request.delete(`/admin/ratings/items/${id}`)
    ElMessage.success('已删除')
    loadItems()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadRecords() {
  recLoading.value = true
  try {
    const params = { page: recPage.value, limit: recPageSize.value }
    const res: any = await request.get('/admin/ratings/records', { params })
    records.value = res.list || res.data?.list || []
    recTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); records.value = [] }
  finally { recLoading.value = false }
}

async function deleteRecord(id: string) {
  try {
    await request.delete(`/admin/ratings/records/${id}`)
    ElMessage.success('已删除')
    loadRecords()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadReplies() {
  replyLoading.value = true
  try {
    const params = { page: replyPage.value, limit: replyPageSize.value, ...replyFilters }
    const res: any = await request.get('/admin/ratings/replies', { params })
    replies.value = res.list || res.data?.list || []
    replyTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); replies.value = [] }
  finally { replyLoading.value = false }
}

async function auditReply(id: string, status: string) {
  try {
    await request.put(`/admin/ratings/replies/${id}/audit`, { status })
    ElMessage.success('审核成功')
    loadReplies()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function deleteReply(id: string) {
  try {
    await request.delete(`/admin/ratings/replies/${id}`)
    ElMessage.success('已删除')
    loadReplies()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

function handleTabChange() {
  const loaders: Record<string, () => void> = {
    dashboard: loadDashboard, settings: () => {}, categories: loadCategories,
    items: loadItems, records: loadRecords, replies: loadReplies,
  }
  loaders[activeTab.value]?.()
}

onMounted(() => {
  loadDashboard()
  loadRegions()
  loadCategories()
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.stat-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.stat-card { text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: #409eff; }
.stat-label { font-size: 13px; color: #666; margin-top: 4px; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

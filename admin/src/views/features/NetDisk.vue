<template>
  <div class="page-shell">
    <PageHeader title="网盘资源" subtitle="管理网盘资源、分类、平台、评论和收益" icon="Cloud" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="资源列表" name="resources">
        <div class="tab-toolbar">
          <el-input v-model="resFilters.keyword" placeholder="搜索资源" clearable style="width:200px" @keyup.enter="loadResources" />
          <el-select v-model="resFilters.categoryId" clearable placeholder="分类" style="width:140px" @change="loadResources">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-select v-model="resFilters.status" clearable placeholder="状态" style="width:120px" @change="loadResources">
            <el-option label="上架中" value="active" />
            <el-option label="已下架" value="inactive" />
            <el-option label="待审核" value="pending" />
          </el-select>
          <el-button type="primary" @click="openResourceDialog()">新增资源</el-button>
          <el-button @click="loadResources" :loading="resLoading">刷新</el-button>
        </div>
        <el-table :data="resources" v-loading="resLoading" stripe>
          <el-table-column prop="title" label="资源名称" min-width="200" show-overflow-tooltip />
          <el-table-column prop="category.name" label="分类" width="100">
            <template #default="{ row }">{{ row.category?.name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="platform.name" label="平台" width="100">
            <template #default="{ row }">{{ row.platform?.name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="downloadCount" label="下载量" width="80" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : row.status === 'pending' ? 'warning' : 'info'" size="small">
                {{ row.status === 'active' ? '上架中' : row.status === 'pending' ? '待审核' : '已下架' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openResourceDialog(row)">编辑</el-button>
              <el-button v-if="row.status !== 'active'" size="small" type="success" link @click="setResourceStatus(row.id, 'active')">上架</el-button>
              <el-button v-if="row.status === 'active'" size="small" type="warning" link @click="setResourceStatus(row.id, 'inactive')">下架</el-button>
              <el-popconfirm title="确定删除？" @confirm="deleteResource(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="resPage" v-model:page-size="resPageSize" :total="resTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadResources" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="分类管理" name="categories">
        <div class="tab-toolbar">
          <el-button type="primary" @click="openCategoryDialog()">新增分类</el-button>
        </div>
        <el-table :data="categories" v-loading="catLoading" stripe>
          <el-table-column prop="name" label="分类名称" width="200" />
          <el-table-column prop="sortOrder" label="排序" width="80" />
          <el-table-column label="资源数" width="80">
            <template #default="{ row }">{{ row._count?.resources ?? 0 }}</template>
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

      <el-tab-pane label="平台管理" name="platforms">
        <div class="tab-toolbar">
          <el-button type="primary" @click="openPlatformDialog()">新增平台</el-button>
        </div>
        <el-table :data="platforms" v-loading="platLoading" stripe>
          <el-table-column prop="name" label="平台名称" width="200" />
          <el-table-column prop="icon" label="图标" width="80" />
          <el-table-column prop="sortOrder" label="排序" width="80" />
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openPlatformDialog(row)">编辑</el-button>
              <el-popconfirm title="确定删除？" @confirm="deletePlatform(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="评论审核" name="comments">
        <div class="tab-toolbar">
          <el-select v-model="commentFilters.status" clearable placeholder="状态" style="width:120px" @change="loadComments">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
          </el-select>
          <el-button @click="loadComments" :loading="commentLoading">刷新</el-button>
        </div>
        <el-table :data="comments" v-loading="commentLoading" stripe>
          <el-table-column prop="user.nickname" label="用户" width="120">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="resource.title" label="资源" width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.resource?.title || '-' }}</template>
          </el-table-column>
          <el-table-column prop="content" label="评论内容" min-width="200" show-overflow-tooltip />
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
                <el-button size="small" type="success" link @click="setCommentStatus(row.id, 'approved')">通过</el-button>
                <el-button size="small" type="danger" link @click="setCommentStatus(row.id, 'rejected')">拒绝</el-button>
              </template>
              <el-popconfirm title="确定删除？" @confirm="deleteComment(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="commentPage" v-model:page-size="commentPageSize" :total="commentTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadComments" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="下载记录" name="downloads">
        <div class="tab-toolbar">
          <el-button @click="loadDownloads" :loading="dlLoading">刷新</el-button>
        </div>
        <el-table :data="downloads" v-loading="dlLoading" stripe>
          <el-table-column prop="user.nickname" label="用户" width="120">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="resource.title" label="资源" width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.resource?.title || '-' }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" label="下载时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="dlPage" v-model:page-size="dlPageSize" :total="dlTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadDownloads" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="收益配置" name="profit">
        <div class="tab-toolbar">
          <el-select v-model="profitRegionId" placeholder="选择区域" style="width:180px" @change="loadProfitConfig">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-button type="primary" @click="saveProfitConfig" :loading="profitSaving">保存配置</el-button>
        </div>
        <el-form :model="profitForm" label-width="140px" style="max-width:600px">
          <el-form-item label="平台佣金(%)"><el-input-number v-model="profitForm.platformCommission" :min="0" :max="100" /></el-form-item>
          <el-form-item label="区域佣金(%)"><el-input-number v-model="profitForm.regionCommission" :min="0" :max="100" /></el-form-item>
          <el-form-item label="作者分成(%)"><el-input-number v-model="profitForm.authorShare" :min="0" :max="100" /></el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="举报处理" name="reports">
        <div class="tab-toolbar">
          <el-button @click="loadNetReports" :loading="netReportLoading">刷新</el-button>
        </div>
        <el-table :data="netReports" v-loading="netReportLoading" stripe>
          <el-table-column prop="reporter.nickname" label="举报人" width="120">
            <template #default="{ row }">{{ row.reporter?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="举报原因" min-width="200" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'pending' ? 'warning' : 'success'" size="small">
                {{ row.status === 'pending' ? '待处理' : '已处理' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'pending'" size="small" type="primary" link @click="resolveNetReport(row.id)">处理</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showResDialog" :title="editingRes ? '编辑资源' : '新增资源'" width="600px" destroy-on-close>
      <el-form :model="resForm" label-width="100px">
        <el-form-item label="资源名称" required><el-input v-model="resForm.title" /></el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="resForm.categoryId" style="width:100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="resForm.platformId" clearable style="width:100%">
            <el-option v-for="p in platforms" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="链接"><el-input v-model="resForm.url" /></el-form-item>
        <el-form-item label="提取码"><el-input v-model="resForm.extractCode" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="resForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showResDialog = false">取消</el-button>
        <el-button type="primary" @click="saveResource" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showCatDialog" :title="editingCat ? '编辑分类' : '新增分类'" width="400px" destroy-on-close>
      <el-form :model="catForm" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="catForm.name" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="catForm.sortOrder" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCatDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCategory" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPlatDialog" :title="editingPlat ? '编辑平台' : '新增平台'" width="400px" destroy-on-close>
      <el-form :model="platForm" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="platForm.name" /></el-form-item>
        <el-form-item label="图标"><el-input v-model="platForm.icon" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="platForm.sortOrder" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPlatDialog = false">取消</el-button>
        <el-button type="primary" @click="savePlatform" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const activeTab = ref('resources')
const saving = ref(false)
const formatDate = (d: string) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const regions = ref<any[]>([])
const categories = ref<any[]>([])
const platforms = ref<any[]>([])
const catLoading = ref(false)
const platLoading = ref(false)

const resources = ref<any[]>([])
const resLoading = ref(false)
const resPage = ref(1)
const resPageSize = ref(20)
const resTotal = ref(0)
const resFilters = reactive({ keyword: '', categoryId: '', status: '' })
const showResDialog = ref(false)
const editingRes = ref<any>(null)
const resForm = reactive({ title: '', categoryId: '', platformId: '', url: '', extractCode: '', description: '' })

const showCatDialog = ref(false)
const editingCat = ref<any>(null)
const catForm = reactive({ name: '', sortOrder: 0 })

const showPlatDialog = ref(false)
const editingPlat = ref<any>(null)
const platForm = reactive({ name: '', icon: '', sortOrder: 0 })

const comments = ref<any[]>([])
const commentLoading = ref(false)
const commentPage = ref(1)
const commentPageSize = ref(20)
const commentTotal = ref(0)
const commentFilters = reactive({ status: '' })

const downloads = ref<any[]>([])
const dlLoading = ref(false)
const dlPage = ref(1)
const dlPageSize = ref(20)
const dlTotal = ref(0)

const profitForm = reactive({ platformCommission: 0, regionCommission: 0, authorShare: 0 })
const profitSaving = ref(false)
const profitRegionId = ref('')

const netReports = ref<any[]>([])
const netReportLoading = ref(false)

async function loadCategories() {
  catLoading.value = true
  try {
    const res: any = await request.get('/admin/netdisk/categories')
    categories.value = Array.isArray(res) ? res : res.list || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); categories.value = [] }
  finally { catLoading.value = false }
}

async function loadPlatforms() {
  platLoading.value = true
  try {
    const res: any = await request.get('/admin/netdisk/platforms')
    platforms.value = Array.isArray(res) ? res : res.list || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); platforms.value = [] }
  finally { platLoading.value = false }
}

async function loadRegions() {
  try {
    const res: any = await request.get('/admin/regions', { params: { page: 1, pageSize: 100 } })
    regions.value = res.list || res.data?.list || (Array.isArray(res) ? res : [])
    if (!profitRegionId.value && regions.value[0]?.id) profitRegionId.value = regions.value[0].id
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); regions.value = [] }
}

async function loadResources() {
  resLoading.value = true
  try {
    const params = { page: resPage.value, pageSize: resPageSize.value, ...resFilters }
    const res: any = await request.get('/admin/netdisk/resources', { params })
    resources.value = res.list || res.data?.list || []
    resTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); resources.value = [] }
  finally { resLoading.value = false }
}

function openResourceDialog(row?: any) {
  editingRes.value = row || null
  if (row) {
    Object.assign(resForm, { title: row.title, categoryId: row.categoryId, platformId: row.platformId || '', url: row.url || '', extractCode: row.extractCode || '', description: row.description || '' })
  } else {
    Object.assign(resForm, { title: '', categoryId: '', platformId: '', url: '', extractCode: '', description: '' })
  }
  showResDialog.value = true
}

async function saveResource() {
  saving.value = true
  try {
    if (editingRes.value) {
      await request.put(`/admin/netdisk/resources/${editingRes.value.id}`, resForm)
    } else {
      await request.post('/admin/netdisk/resources', resForm)
    }
    ElMessage.success('保存成功')
    showResDialog.value = false
    loadResources()
  } finally { saving.value = false }
}

async function setResourceStatus(id: string, status: string) {
  try {
    await request.put(`/admin/netdisk/resources/${id}/status`, { status })
    ElMessage.success('操作成功')
    loadResources()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function deleteResource(id: string) {
  try {
    await request.delete(`/admin/netdisk/resources/${id}`)
    ElMessage.success('已删除')
    loadResources()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

function openCategoryDialog(row?: any) {
  editingCat.value = row || null
  Object.assign(catForm, row ? { name: row.name, sortOrder: row.sortOrder || 0 } : { name: '', sortOrder: 0 })
  showCatDialog.value = true
}

async function saveCategory() {
  saving.value = true
  try {
    if (editingCat.value) {
      await request.put(`/admin/netdisk/categories/${editingCat.value.id}`, catForm)
    } else {
      await request.post('/admin/netdisk/categories', catForm)
    }
    ElMessage.success('保存成功')
    showCatDialog.value = false
    loadCategories()
  } finally { saving.value = false }
}

async function deleteCategory(id: string) {
  try {
    await request.delete(`/admin/netdisk/categories/${id}`)
    ElMessage.success('已删除')
    loadCategories()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

function openPlatformDialog(row?: any) {
  editingPlat.value = row || null
  Object.assign(platForm, row ? { name: row.name, icon: row.icon || '', sortOrder: row.sortOrder || 0 } : { name: '', icon: '', sortOrder: 0 })
  showPlatDialog.value = true
}

async function savePlatform() {
  saving.value = true
  try {
    if (editingPlat.value) {
      await request.put(`/admin/netdisk/platforms/${editingPlat.value.id}`, platForm)
    } else {
      await request.post('/admin/netdisk/platforms', platForm)
    }
    ElMessage.success('保存成功')
    showPlatDialog.value = false
    loadPlatforms()
  } finally { saving.value = false }
}

async function deletePlatform(id: string) {
  try {
    await request.delete(`/admin/netdisk/platforms/${id}`)
    ElMessage.success('已删除')
    loadPlatforms()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadComments() {
  commentLoading.value = true
  try {
    const params = { page: commentPage.value, pageSize: commentPageSize.value, ...commentFilters }
    const res: any = await request.get('/admin/netdisk/comments', { params })
    comments.value = res.list || res.data?.list || []
    commentTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); comments.value = [] }
  finally { commentLoading.value = false }
}

async function setCommentStatus(id: string, status: string) {
  try {
    await request.put(`/admin/netdisk/comments/${id}/status`, { status })
    ElMessage.success('操作成功')
    loadComments()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function deleteComment(id: string) {
  try {
    await request.delete(`/admin/netdisk/comments/${id}`)
    ElMessage.success('已删除')
    loadComments()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadDownloads() {
  dlLoading.value = true
  try {
    const params = { page: dlPage.value, pageSize: dlPageSize.value }
    const res: any = await request.get('/admin/netdisk/downloads', { params })
    downloads.value = res.list || res.data?.list || []
    dlTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); downloads.value = [] }
  finally { dlLoading.value = false }
}

async function loadProfitConfig() {
  if (!profitRegionId.value) {
    await loadRegions()
  }
  if (!profitRegionId.value) {
    ElMessage.warning('请先创建或选择区域')
    return
  }
  try {
    const res: any = await request.get('/admin/netdisk/profit-config', { params: { regionId: profitRegionId.value } })
    if (res) Object.assign(profitForm, res)
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function saveProfitConfig() {
  if (!profitRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  profitSaving.value = true
  try {
    await request.put('/admin/netdisk/profit-config', profitForm, { params: { regionId: profitRegionId.value } })
    ElMessage.success('保存成功')
  } finally { profitSaving.value = false }
}

async function loadNetReports() {
  netReportLoading.value = true
  try {
    const res: any = await request.get('/admin/netdisk/reports')
    netReports.value = res.list || res.data?.list || (Array.isArray(res) ? res : [])
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); netReports.value = [] }
  finally { netReportLoading.value = false }
}

async function resolveNetReport(id: string) {
  try {
    await request.put(`/admin/netdisk/reports/${id}`, { status: 'resolved' })
    ElMessage.success('已处理')
    loadNetReports()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

function handleTabChange() {
  const loaders: Record<string, () => void> = {
    resources: loadResources, categories: loadCategories, platforms: loadPlatforms,
    comments: loadComments, downloads: loadDownloads, profit: loadProfitConfig, reports: loadNetReports,
  }
  loaders[activeTab.value]?.()
}

onMounted(() => {
  loadRegions()
  loadCategories()
  loadPlatforms()
  loadResources()
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

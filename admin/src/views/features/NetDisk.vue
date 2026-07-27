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
          <el-button v-if="hasEditPermission" type="primary" @click="openResourceDialog()">新增资源</el-button>
          <el-button @click="loadResources" :loading="resLoading">刷新</el-button>
        </div>
        <el-table :data="resources" v-loading="resLoading" stripe>
          <el-table-column label="资源" min-width="280">
            <template #default="{ row }">
              <div class="media-cell">
                <el-image v-if="row.cover" :src="row.cover" fit="cover" class="thumb" />
                <div v-else class="thumb thumb-empty">资</div>
                <div class="media-main">
                  <div class="cell-title">{{ row.title }}</div>
                  <div class="cell-sub">{{ row.description || row.url || '暂无描述' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="分类" width="120">
            <template #default="{ row }">{{ row.category?.name || '-' }}</template>
          </el-table-column>
          <el-table-column label="平台" width="120">
            <template #default="{ row }">{{ row.platform?.name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="downloadCount" label="下载量" width="90" />
          <el-table-column label="状态" width="90">
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
              <el-button v-if="hasEditPermission" size="small" type="primary" link @click="openResourceDialog(row)">编辑</el-button>
              <el-button v-if="hasEditPermission && row.status !== 'active'" size="small" type="success" link @click="setResourceStatus(row.id, 'active')">上架</el-button>
              <el-button v-if="hasEditPermission && row.status === 'active'" size="small" type="warning" link @click="setResourceStatus(row.id, 'inactive')">下架</el-button>
              <el-popconfirm v-if="hasEditPermission" title="确定删除？" @confirm="deleteResource(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="resPage"
            v-model:page-size="resPageSize"
            :total="resTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @change="loadResources"
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
                <div v-else class="icon-thumb thumb-empty">类</div>
                <span class="cell-title">{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="90" />
          <el-table-column label="资源数" width="90">
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
          <el-button @click="loadPlatforms" :loading="platLoading">刷新</el-button>
        </div>
        <el-table :data="platforms" v-loading="platLoading" stripe>
          <el-table-column label="平台" min-width="220">
            <template #default="{ row }">
              <div class="media-cell">
                <el-image v-if="row.icon" :src="row.icon" fit="cover" class="icon-thumb" />
                <div v-else class="icon-thumb thumb-empty">盘</div>
                <div>
                  <div class="cell-title">{{ row.name }}</div>
                  <div class="cell-sub">{{ row.baseUrl || '未配置域名' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="90" />
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
            <el-option label="正常" value="active" />
            <el-option label="已隐藏" value="deleted" />
          </el-select>
          <el-button @click="loadComments" :loading="commentLoading">刷新</el-button>
        </div>
        <el-table :data="comments" v-loading="commentLoading" stripe>
          <el-table-column label="用户" width="140">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column label="资源" width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.resource?.title || '-' }}</template>
          </el-table-column>
          <el-table-column prop="content" label="评论内容" min-width="220" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                {{ row.status === 'active' ? '正常' : '已隐藏' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status !== 'active'" size="small" type="success" link @click="setCommentStatus(row.id, 'active')">恢复</el-button>
              <el-button v-if="row.status !== 'deleted'" size="small" type="warning" link @click="setCommentStatus(row.id, 'deleted')">隐藏</el-button>
              <el-popconfirm title="确定删除？" @confirm="deleteComment(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="commentPage"
            v-model:page-size="commentPageSize"
            :total="commentTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @change="loadComments"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="下载记录" name="downloads">
        <div class="tab-toolbar">
          <el-button @click="loadDownloads" :loading="dlLoading">刷新</el-button>
        </div>
        <el-table :data="downloads" v-loading="dlLoading" stripe>
          <el-table-column label="用户" width="140">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column label="资源" width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.resource?.title || '-' }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" label="下载时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="dlPage"
            v-model:page-size="dlPageSize"
            :total="dlTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @change="loadDownloads"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="收益配置" name="profit">
        <div class="tab-toolbar">
          <el-select v-model="profitRegionId" placeholder="选择区域" style="width:200px" @change="loadProfitConfig">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-button type="primary" @click="saveProfitConfig" :loading="profitSaving">保存配置</el-button>
        </div>
        <el-form :model="profitForm" label-width="140px" style="max-width:640px">
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
          <el-table-column label="举报人" width="140">
            <template #default="{ row }">{{ row.reporter?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="举报原因" min-width="220" show-overflow-tooltip />
          <el-table-column label="状态" width="100">
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

    <el-dialog v-model="showResDialog" :title="editingRes ? '编辑资源' : '新增资源'" width="720px" destroy-on-close>
      <el-form :model="resForm" label-width="100px">
        <el-form-item label="资源名称" required><el-input v-model="resForm.title" /></el-form-item>
        <el-form-item label="封面">
          <ImageUploadBox v-model="resForm.cover" scene="netdisk-cover" shape="wide" placeholder="上传资源封面" tip="建议 750x350" />
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="resForm.categoryId" clearable style="width:100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="resForm.platformId" clearable style="width:100%">
            <el-option v-for="p in platforms" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="链接" required><el-input v-model="resForm.url" /></el-form-item>
        <el-form-item label="资源信息">
          <div class="inline-field">
            <el-select v-model="resForm.type" style="width:160px">
              <el-option label="文件" value="file" />
              <el-option label="文件夹" value="folder" />
            </el-select>
            <el-input-number v-model="resForm.size" :min="0" placeholder="大小/字节" />
            <el-input-number v-model="resForm.price" :min="0" :precision="2" placeholder="价格" />
          </div>
        </el-form-item>
        <el-form-item label="提取码"><el-input v-model="resForm.extractCode" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="resForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showResDialog = false">取消</el-button>
        <el-button type="primary" @click="saveResource" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showCatDialog" :title="editingCat ? '编辑分类' : '新增分类'" width="460px" destroy-on-close>
      <el-form :model="catForm" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="catForm.name" /></el-form-item>
        <el-form-item label="图标">
          <ImageUploadBox v-model="catForm.icon" scene="netdisk-category-icon" shape="square" placeholder="上传分类图标" tip="建议 200x200" />
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="catForm.sortOrder" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCatDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCategory" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPlatDialog" :title="editingPlat ? '编辑平台' : '新增平台'" width="460px" destroy-on-close>
      <el-form :model="platForm" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="platForm.name" /></el-form-item>
        <el-form-item label="图标">
          <ImageUploadBox v-model="platForm.icon" scene="netdisk-platform-icon" shape="square" placeholder="上传平台图标" tip="建议 200x200" />
        </el-form-item>
        <el-form-item label="域名"><el-input v-model="platForm.baseUrl" placeholder="如 https://pan.baidu.com" /></el-form-item>
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
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('netdisk:view') || auth.permissions.includes('netdisk:edit'))

const activeTab = ref('resources')
const saving = ref(false)
const formatDate = (d: string) => (d ? new Date(d).toLocaleString('zh-CN') : '-')

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
const resForm = reactive({
  title: '',
  cover: '',
  categoryId: '',
  platformId: '',
  url: '',
  extractCode: '',
  description: '',
  type: 'file',
  size: 0,
  price: 0,
})

const showCatDialog = ref(false)
const editingCat = ref<any>(null)
const catForm = reactive({ name: '', icon: '', sortOrder: 0 })

const showPlatDialog = ref(false)
const editingPlat = ref<any>(null)
const platForm = reactive({ name: '', icon: '', baseUrl: '', sortOrder: 0 })

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

function unwrapPage(res: any) {
  if (Array.isArray(res)) return { list: res, total: res.length }
  return { list: res?.list || res?.data?.list || [], total: res?.total || res?.data?.total || 0 }
}

async function loadCategories() {
  catLoading.value = true
  try {
    categories.value = unwrapPage(await request.get('/admin/netdisk/categories')).list
  } catch (e: any) {
    ElMessage.error(e?.message || '加载分类失败')
    categories.value = []
  } finally {
    catLoading.value = false
  }
}

async function loadPlatforms() {
  platLoading.value = true
  try {
    platforms.value = unwrapPage(await request.get('/admin/netdisk/platforms')).list
  } catch (e: any) {
    ElMessage.error(e?.message || '加载平台失败')
    platforms.value = []
  } finally {
    platLoading.value = false
  }
}

async function loadRegions() {
  try {
    const res: any = await request.get('/admin/regions', { params: { page: 1, pageSize: 100 } })
    regions.value = unwrapPage(res).list
    if (!profitRegionId.value && regions.value[0]?.id) profitRegionId.value = regions.value[0].id
  } catch (e: any) {
    ElMessage.error(e?.message || '加载区域失败')
    regions.value = []
  }
}

async function loadResources() {
  resLoading.value = true
  try {
    const params = { page: resPage.value, pageSize: resPageSize.value, ...resFilters }
    const pageData = unwrapPage(await request.get('/admin/netdisk/resources', { params }))
    resources.value = pageData.list
    resTotal.value = pageData.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载资源失败')
    resources.value = []
  } finally {
    resLoading.value = false
  }
}

function openResourceDialog(row?: any) {
  editingRes.value = row || null
  Object.assign(
    resForm,
    row
      ? {
          title: row.title || '',
          cover: row.cover || '',
          categoryId: row.categoryId || '',
          platformId: row.platformId || '',
          url: row.url || '',
          extractCode: row.extractCode || '',
          description: row.description || '',
          type: row.type || 'file',
          size: Number(row.size) || 0,
          price: Number(row.price) || 0,
        }
      : { title: '', cover: '', categoryId: '', platformId: '', url: '', extractCode: '', description: '', type: 'file', size: 0, price: 0 },
  )
  showResDialog.value = true
}

function buildResourcePayload() {
  return {
    title: resForm.title.trim(),
    cover: resForm.cover || undefined,
    categoryId: resForm.categoryId || undefined,
    platformId: resForm.platformId || undefined,
    url: resForm.url.trim(),
    extractCode: resForm.extractCode || undefined,
    description: resForm.description || undefined,
    type: resForm.type || 'file',
    size: Number(resForm.size) || 0,
    price: Number(resForm.price) || 0,
  }
}

async function saveResource() {
  if (!resForm.title.trim()) {
    ElMessage.warning('请输入资源名称')
    return
  }
  if (!resForm.url.trim()) {
    ElMessage.warning('请输入资源链接')
    return
  }
  saving.value = true
  try {
    const payload = buildResourcePayload()
    if (editingRes.value) {
      await request.put(`/admin/netdisk/resources/${editingRes.value.id}`, payload)
    } else {
      await request.post('/admin/netdisk/resources', payload)
    }
    ElMessage.success('保存成功')
    showResDialog.value = false
    loadResources()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存资源失败')
  } finally {
    saving.value = false
  }
}

async function setResourceStatus(id: string, status: string) {
  try {
    await request.put(`/admin/netdisk/resources/${id}/status`, { status })
    ElMessage.success('操作成功')
    loadResources()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

async function deleteResource(id: string) {
  try {
    await request.delete(`/admin/netdisk/resources/${id}`)
    ElMessage.success('已删除')
    loadResources()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除资源失败')
  }
}

function openCategoryDialog(row?: any) {
  editingCat.value = row || null
  Object.assign(catForm, row ? { name: row.name, icon: row.icon || '', sortOrder: row.sortOrder || 0 } : { name: '', icon: '', sortOrder: 0 })
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
      await request.put(`/admin/netdisk/categories/${editingCat.value.id}`, payload)
    } else {
      await request.post('/admin/netdisk/categories', payload)
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
    await request.delete(`/admin/netdisk/categories/${id}`)
    ElMessage.success('已删除')
    loadCategories()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除分类失败')
  }
}

function openPlatformDialog(row?: any) {
  editingPlat.value = row || null
  Object.assign(
    platForm,
    row
      ? { name: row.name, icon: row.icon || '', baseUrl: row.baseUrl || '', sortOrder: row.sortOrder || 0 }
      : { name: '', icon: '', baseUrl: '', sortOrder: 0 },
  )
  showPlatDialog.value = true
}

async function savePlatform() {
  if (!platForm.name.trim()) {
    ElMessage.warning('请输入平台名称')
    return
  }
  saving.value = true
  try {
    const payload = { name: platForm.name.trim(), icon: platForm.icon || undefined, baseUrl: platForm.baseUrl || undefined, sortOrder: platForm.sortOrder || 0 }
    if (editingPlat.value) {
      await request.put(`/admin/netdisk/platforms/${editingPlat.value.id}`, payload)
    } else {
      await request.post('/admin/netdisk/platforms', payload)
    }
    ElMessage.success('保存成功')
    showPlatDialog.value = false
    loadPlatforms()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存平台失败')
  } finally {
    saving.value = false
  }
}

async function deletePlatform(id: string) {
  try {
    await request.delete(`/admin/netdisk/platforms/${id}`)
    ElMessage.success('已删除')
    loadPlatforms()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除平台失败')
  }
}

async function loadComments() {
  commentLoading.value = true
  try {
    const params = { page: commentPage.value, pageSize: commentPageSize.value, ...commentFilters }
    const pageData = unwrapPage(await request.get('/admin/netdisk/comments', { params }))
    comments.value = pageData.list
    commentTotal.value = pageData.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载评论失败')
    comments.value = []
  } finally {
    commentLoading.value = false
  }
}

async function setCommentStatus(id: string, status: string) {
  try {
    await request.put(`/admin/netdisk/comments/${id}/status`, { status })
    ElMessage.success('操作成功')
    loadComments()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

async function deleteComment(id: string) {
  try {
    await request.delete(`/admin/netdisk/comments/${id}`)
    ElMessage.success('已删除')
    loadComments()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除评论失败')
  }
}

async function loadDownloads() {
  dlLoading.value = true
  try {
    const params = { page: dlPage.value, pageSize: dlPageSize.value }
    const pageData = unwrapPage(await request.get('/admin/netdisk/downloads', { params }))
    downloads.value = pageData.list
    dlTotal.value = pageData.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载下载记录失败')
    downloads.value = []
  } finally {
    dlLoading.value = false
  }
}

async function loadProfitConfig() {
  if (!profitRegionId.value) await loadRegions()
  if (!profitRegionId.value) {
    ElMessage.warning('请先创建或选择区域')
    return
  }
  try {
    const res: any = await request.get('/admin/netdisk/profit-config', { params: { regionId: profitRegionId.value } })
    if (res) Object.assign(profitForm, res)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载收益配置失败')
  }
}

async function saveProfitConfig() {
  if (!profitRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  profitSaving.value = true
  try {
    const payload = {
      platformCommission: profitForm.platformCommission,
      regionCommission: profitForm.regionCommission,
      authorShare: profitForm.authorShare,
    }
    await request.put('/admin/netdisk/profit-config', payload, { params: { regionId: profitRegionId.value } })
    ElMessage.success('保存成功')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存收益配置失败')
  } finally {
    profitSaving.value = false
  }
}

async function loadNetReports() {
  netReportLoading.value = true
  try {
    netReports.value = unwrapPage(await request.get('/admin/netdisk/reports')).list
  } catch (e: any) {
    ElMessage.error(e?.message || '加载举报失败')
    netReports.value = []
  } finally {
    netReportLoading.value = false
  }
}

async function resolveNetReport(id: string) {
  try {
    await request.put(`/admin/netdisk/reports/${id}`, { status: 'resolved' })
    ElMessage.success('已处理')
    loadNetReports()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

function handleTabChange() {
  const loaders: Record<string, () => void> = {
    resources: loadResources,
    categories: loadCategories,
    platforms: loadPlatforms,
    comments: loadComments,
    downloads: loadDownloads,
    profit: loadProfitConfig,
    reports: loadNetReports,
  }
  loaders[activeTab.value]?.()
}

onMounted(async () => {
  await Promise.all([loadRegions(), loadCategories(), loadPlatforms()])
  await loadResources()
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.media-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.media-main { min-width: 0; }
.thumb { width: 58px; height: 42px; border-radius: 6px; flex-shrink: 0; background: #eef5ff; }
.icon-thumb { width: 34px; height: 34px; border-radius: 6px; flex-shrink: 0; background: #eef5ff; }
.thumb-empty { display: flex; align-items: center; justify-content: center; color: #8aa4c7; font-size: 12px; }
.cell-title { font-weight: 600; color: #1f2d3d; }
.cell-sub { max-width: 440px; margin-top: 4px; color: #8a98ac; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inline-field { display: flex; width: 100%; gap: 10px; align-items: center; flex-wrap: wrap; }
</style>

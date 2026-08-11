<template>
  <div class="page-container">
    <PageHeader title="表情包管理" subtitle="管理官方基础表情，审核用户上传表情；未审核的个人表情也不能发送" icon="Picture">
      <template #actions>
        <el-button @click="openCategoryDialog">分类管理</el-button>
        <el-button type="primary" @click="openStickerDialog()">上传官方表情</el-button>
        <el-button @click="loadAll">刷新</el-button>
      </template>
    </PageHeader>

    <StatGrid :items="statItems" />

    <SearchPanel @search="loadStickers" @reset="resetFilters">
      <el-input v-model="filters.keyword" placeholder="搜索表情名称/说明" clearable style="width: 220px" />
      <el-select v-model="filters.status" placeholder="审核状态" clearable style="width: 140px">
        <el-option label="待审核" value="pending" />
        <el-option label="可发送" value="active" />
        <el-option label="已拒绝" value="rejected" />
        <el-option label="已禁用" value="banned" />
      </el-select>
      <el-select v-model="filters.source" placeholder="来源" clearable style="width: 150px">
        <el-option label="官方基础表情" value="official" />
        <el-option label="用户上传表情" value="user" />
      </el-select>
      <el-select v-model="filters.categoryId" placeholder="分类" clearable style="width: 160px">
        <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
    </SearchPanel>

    <div class="table-card">
      <el-table :data="stickers" v-loading="loading" empty-text="暂无表情包">
        <el-table-column label="表情" width="120">
          <template #default="{ row }">
            <div class="sticker-preview">
              <img :src="row.thumbnail_url || row.sticker_url" alt="" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="190">
          <template #default="{ row }">
            <div class="name-cell">
              <b>{{ row.name || row.title || '未命名表情' }}</b>
              <span>{{ row.description || row.auditReason || '暂无说明' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="130">
          <template #default="{ row }">
            <el-tag :type="row.is_official ? 'success' : 'info'" size="small">
              {{ row.is_official ? '官方基础' : '用户上传' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="130">
          <template #default="{ row }">{{ row.category?.name || categoryName(row.categoryId) || '未分类' }}</template>
        </el-table-column>
        <el-table-column label="共享" width="90">
          <template #default="{ row }">{{ row.is_shared ? '共享' : '个人' }}</template>
        </el-table-column>
        <el-table-column label="审核状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="上传者" width="140">
          <template #default="{ row }">{{ row.is_official ? '管理员' : row.user?.nickname || '用户' }}</template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }"><TimeText :time="row.createdAt" /></template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="openStickerDialog(row)">编辑</el-button>
            <el-button v-if="row.status !== 'active'" size="small" link type="success" @click="updateStatus(row, 'active')">通过</el-button>
            <el-button v-if="row.status === 'pending'" size="small" link type="warning" @click="rejectSticker(row)">拒绝</el-button>
            <el-button v-if="row.status === 'active'" size="small" link type="warning" @click="updateStatus(row, 'banned', '管理员禁用')">禁用</el-button>
            <el-button size="small" link type="danger" @click="deleteSticker(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          :total="total"
          @current-change="loadStickers"
          @size-change="loadStickers"
        />
      </div>
    </div>

    <el-dialog v-model="stickerDialogVisible" :title="editingSticker ? '编辑表情' : '上传官方表情'" width="620px">
      <el-form :model="stickerForm" label-position="top">
        <el-form-item label="表情图片" required>
          <ImageUploadBox
            v-model="stickerForm.url"
            scene="sticker"
            shape="square"
            accept="image/png,image/jpeg,image/webp,image/gif"
            :max-size="8"
            placeholder="上传静态图或 GIF 动图"
            tip="支持 PNG / JPG / WebP / GIF，用户端未审核前不可发送"
          />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="表情名称" required>
            <el-input v-model="stickerForm.name" maxlength="30" placeholder="例如：校园小猫开心" />
          </el-form-item>
          <el-form-item label="分类">
            <el-select v-model="stickerForm.categoryId" clearable placeholder="选择分类" style="width: 100%">
              <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="说明">
          <el-input v-model="stickerForm.description" type="textarea" :rows="3" maxlength="120" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stickerDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSticker">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="categoryDialogVisible" title="表情分类管理" width="720px">
      <div class="category-toolbar">
        <el-input v-model="categoryForm.name" placeholder="分类名称" style="width: 180px" />
        <el-input v-model="categoryForm.icon" placeholder="图标/封面地址，可选" style="width: 220px" />
        <el-input-number v-model="categoryForm.sortOrder" :min="0" :max="999" />
        <el-button type="primary" @click="saveCategory">{{ editingCategory ? '保存分类' : '新增分类' }}</el-button>
        <el-button v-if="editingCategory" @click="resetCategoryForm">取消编辑</el-button>
      </div>
      <el-table :data="categories" v-loading="categoryLoading" empty-text="暂无分类">
        <el-table-column prop="name" label="分类名称" />
        <el-table-column prop="sortOrder" label="排序" width="90" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170">
          <template #default="{ row }">
            <el-button size="small" link @click="editCategory(row)">编辑</el-button>
            <el-button size="small" link :type="row.isActive ? 'warning' : 'success'" @click="toggleCategory(row)">
              {{ row.isActive ? '停用' : '启用' }}
            </el-button>
            <el-button size="small" link type="danger" @click="deleteCategory(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import TimeText from '@/components/common/TimeText.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import StatGrid from '@/components/glass/StatGrid.vue'

const loading = ref(false)
const categoryLoading = ref(false)
const saving = ref(false)
const stickers = ref<any[]>([])
const categories = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const stickerDialogVisible = ref(false)
const categoryDialogVisible = ref(false)
const editingSticker = ref<any>(null)
const editingCategory = ref<any>(null)

const stats = reactive({ total: 0, pending: 0, active: 0, rejected: 0, banned: 0 })

const statItems = computed(() => [
  { label: '表情总数', value: stats.total, icon: 'Picture' },
  { label: '待审核', value: stats.pending, tone: 'orange' as const, icon: 'Clock' },
  { label: '可发送', value: stats.active, tone: 'green' as const, icon: 'CircleCheck' },
  { label: '已拒绝/禁用', value: stats.rejected + stats.banned, tone: 'red' as const, icon: 'CircleClose' },
])
const filters = reactive({ keyword: '', status: '', source: '', categoryId: '' })
const stickerForm = reactive({ name: '', description: '', url: '', categoryId: '' })
const categoryForm = reactive({ name: '', icon: '', sortOrder: 0, isActive: true })

const pickPage = (res: any) => res?.data || res || { list: [], total: 0 }
const statusLabel = (status: string) => ({ pending: '待审核', active: '可发送', rejected: '已拒绝', banned: '已禁用', deleted: '已删除' }[status] || status || '-')
const statusType = (status: string) => ({ pending: 'warning', active: 'success', rejected: 'danger', banned: 'info' }[status] || 'info')
const categoryName = (id: string) => categories.value.find((item) => item.id === id)?.name || ''

const loadCategories = async () => {
  categoryLoading.value = true
  try {
    const res: any = await request.get('/admin/sticker-categories', { params: { page: 1, pageSize: 200 } })
    const pageData = pickPage(res)
    categories.value = pageData.list || []
  } finally {
    categoryLoading.value = false
  }
}

const loadStickers = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/stickers', {
      params: { page: page.value, pageSize: pageSize.value, ...filters }
    })
    const pageData = pickPage(res)
    stickers.value = pageData.list || []
    total.value = pageData.total || 0
    Object.assign(stats, { total: 0, pending: 0, active: 0, rejected: 0, banned: 0 }, pageData.stats || {})
  } catch (error: any) {
    ElMessage.error(error?.message || '加载表情包失败')
  } finally {
    loading.value = false
  }
}

const loadAll = async () => {
  await Promise.all([loadCategories(), loadStickers()])
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '', source: '', categoryId: '' })
  page.value = 1
  loadStickers()
}

const openStickerDialog = (row?: any) => {
  editingSticker.value = row || null
  Object.assign(stickerForm, {
    name: row?.name || '',
    description: row?.description || '',
    url: row?.sticker_url || row?.url || '',
    categoryId: row?.categoryId || row?.category_id || ''
  })
  stickerDialogVisible.value = true
}

const saveSticker = async () => {
  if (!stickerForm.url) {
    ElMessage.warning('请先上传表情图片')
    return
  }
  saving.value = true
  try {
    const payload = { ...stickerForm, isOfficial: true, isShared: true }
    if (editingSticker.value) {
      await request.put(`/admin/stickers/${editingSticker.value.id}`, payload)
      ElMessage.success('表情已更新')
    } else {
      await request.post('/admin/stickers', payload)
      ElMessage.success('官方表情已上线')
    }
    stickerDialogVisible.value = false
    await loadStickers()
  } finally {
    saving.value = false
  }
}

const updateStatus = async (row: any, status: string, reason?: string) => {
  await request.put(`/admin/stickers/${row.id}/status`, { status, reason })
  ElMessage.success(status === 'active' ? '已通过，用户可以发送' : '状态已更新')
  await loadStickers()
}

const rejectSticker = async (row: any) => {
  const { value } = await ElMessageBox.prompt('请填写拒绝原因，用户上传表情将不能发送', '拒绝表情', {
    confirmButtonText: '拒绝',
    cancelButtonText: '取消',
    inputPlaceholder: '例如：图片含违规内容'
  })
  await updateStatus(row, 'rejected', value || '审核不通过')
}

const deleteSticker = async (row: any) => {
  await ElMessageBox.confirm('删除后小程序将不再展示这个表情，确定删除吗？', '删除表情', { type: 'warning' })
  await request.delete(`/admin/stickers/${row.id}`)
  ElMessage.success('表情已删除')
  await loadStickers()
}

const openCategoryDialog = () => {
  resetCategoryForm()
  categoryDialogVisible.value = true
}

const resetCategoryForm = () => {
  editingCategory.value = null
  Object.assign(categoryForm, { name: '', icon: '', sortOrder: 0, isActive: true })
}

const editCategory = (row: any) => {
  editingCategory.value = row
  Object.assign(categoryForm, {
    name: row.name || '',
    icon: row.icon || '',
    sortOrder: row.sortOrder || 0,
    isActive: row.isActive !== false
  })
}

const saveCategory = async () => {
  if (!categoryForm.name.trim()) {
    ElMessage.warning('分类名称不能为空')
    return
  }
  if (editingCategory.value) {
    await request.put(`/admin/sticker-categories/${editingCategory.value.id}`, categoryForm)
    ElMessage.success('分类已更新')
  } else {
    await request.post('/admin/sticker-categories', categoryForm)
    ElMessage.success('分类已创建')
  }
  resetCategoryForm()
  await loadCategories()
}

const toggleCategory = async (row: any) => {
  await request.put(`/admin/sticker-categories/${row.id}`, { ...row, isActive: !row.isActive })
  ElMessage.success(row.isActive ? '分类已停用' : '分类已启用')
  await loadCategories()
}

const deleteCategory = async (row: any) => {
  await ElMessageBox.confirm('删除分类不会删除表情，但表情会变成未分类。确定删除吗？', '删除分类', { type: 'warning' })
  await request.delete(`/admin/sticker-categories/${row.id}`)
  ElMessage.success('分类已删除')
  await loadCategories()
}

onMounted(loadAll)
</script>

<style scoped>
.page-container {
  padding: 28px;
  color: #10213d;
}

.table-card {
  border: 1px solid rgba(190, 207, 230, .72);
  border-radius: 14px;
  background: rgba(255, 255, 255, .82);
  box-shadow: 0 18px 44px rgba(69, 108, 168, .12);
}

.table-card {
  padding: 16px;
}

.sticker-preview {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  background: #f1f5f9;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.sticker-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.name-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name-cell b {
  color: #172033;
}

.name-cell span {
  color: #7a8aa2;
  font-size: 12px;
}

.table-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.category-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .category-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>

<template>
  <div class="assistant-page">
    <div class="assistant-header">
      <div>
        <p class="eyebrow">营销增长 / 消息助手</p>
        <h2>官方助手消息</h2>
        <p>统一管理小程序里的校园通知、系统通知和官方客服卡片。</p>
      </div>
      <el-button v-if="hasEditPermission" type="primary" @click="openCreate">新增消息</el-button>
    </div>

    <div class="filter-card">
      <el-input v-model="filters.keyword" clearable placeholder="搜索标题或内容" @keyup.enter="loadMessages" />
      <el-select v-model="filters.category" clearable placeholder="消息分类">
        <el-option label="校园通知" value="campus" />
        <el-option label="系统通知" value="system" />
        <el-option label="官方客服" value="service" />
      </el-select>
      <el-select v-model="filters.status" clearable placeholder="状态">
        <el-option label="已发布" value="published" />
        <el-option label="草稿" value="draft" />
        <el-option label="已下线" value="offline" />
      </el-select>
      <el-select v-model="filters.regionId" clearable filterable placeholder="区域">
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-button @click="loadMessages">查询</el-button>
    </div>

    <div class="data-card">
      <el-table :data="messages" v-loading="loading" empty-text="暂无官方助手消息">
        <el-table-column label="消息" min-width="300">
          <template #default="{ row }">
            <div class="message-cell">
              <img :src="row.iconUrl || row.imageUrl || '/logo.png'" alt="" />
              <div>
                <div class="title-line">
                  <strong>{{ row.title }}</strong>
                  <el-tag size="small" :type="categoryTagType(row.category)">{{ row.categoryLabel }}</el-tag>
                </div>
                <p>{{ row.content }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="区域" width="180">
          <template #default="{ row }">{{ regionName(row.regionId) || '全局' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="90" />
        <el-table-column label="发布时间" width="190">
          <template #default="{ row }">{{ formatTime(row.publishedAt || row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button v-if="hasEditPermission" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="hasEditPermission" link type="danger" @click="removeMessage(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadMessages"
          @size-change="loadMessages"
        />
      </div>
    </div>

    <el-drawer v-model="drawerVisible" :title="editingId ? '编辑官方助手消息' : '新增官方助手消息'" size="560px">
      <el-form :model="form" label-width="96px">
        <el-form-item label="分类" required>
          <el-segmented v-model="form.category" :options="categoryOptions" />
        </el-form-item>
        <el-form-item label="投放区域">
          <el-select v-model="form.regionId" clearable filterable placeholder="不选则全局可见" style="width: 100%">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio-button label="published">发布</el-radio-button>
            <el-radio-button label="draft">草稿</el-radio-button>
            <el-radio-button label="offline">下线</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="40" show-word-limit placeholder="例如：校园活动周上线啦" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="form.content" type="textarea" :rows="4" maxlength="240" show-word-limit placeholder="写给用户看的正文内容" />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="form.summary" maxlength="60" show-word-limit placeholder="列表或卡片上的补充描述" />
        </el-form-item>
        <el-form-item label="主图">
          <el-input v-model="form.imageUrl" placeholder="图片 URL，可为空" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.iconUrl" placeholder="图标 URL，可为空" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="标签文案">
            <el-input v-model="form.tagText" placeholder="如：活动通知" />
          </el-form-item>
          <el-form-item label="优先级">
            <el-input-number v-model="form.priority" :min="0" :max="999" controls-position="right" style="width: 100%" />
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item label="按钮文案">
            <el-input v-model="form.actionText" placeholder="如：查看详情" />
          </el-form-item>
          <el-form-item label="动作类型">
            <el-select v-model="form.actionType" style="width: 100%">
              <el-option label="小程序页面" value="miniapp" />
              <el-option label="网页" value="web" />
              <el-option label="客服动作" value="service" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="动作值">
          <el-input v-model="form.actionValue" placeholder="小程序路径、网页 URL 或动作标识" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="drawerVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveMessage">保存</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('marketing:view') || auth.permissions.includes('system:config'))

const categoryOptions = [
  { label: '校园通知', value: 'campus' },
  { label: '系统通知', value: 'system' },
  { label: '官方客服', value: 'service' }
]

const loading = ref(false)
const saving = ref(false)
const drawerVisible = ref(false)
const editingId = ref('')
const messages = ref<any[]>([])
const regions = ref<any[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const filters = reactive({ keyword: '', category: '', status: '', regionId: '' })
const form = reactive({
  category: 'campus',
  regionId: '',
  status: 'published',
  title: '',
  content: '',
  summary: '',
  imageUrl: '',
  iconUrl: '',
  tagText: '',
  priority: 0,
  actionText: '',
  actionType: 'miniapp',
  actionValue: ''
})

function listOf(data: any) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.list)) return data.list
  if (Array.isArray(data?.rows)) return data.rows
  if (Array.isArray(data?.data)) return data.data
  return []
}

function totalOf(data: any) {
  return Number(data?.total ?? data?.count ?? listOf(data).length)
}

function resetForm() {
  Object.assign(form, {
    category: 'campus',
    regionId: '',
    status: 'published',
    title: '',
    content: '',
    summary: '',
    imageUrl: '',
    iconUrl: '',
    tagText: '',
    priority: 0,
    actionText: '',
    actionType: 'miniapp',
    actionValue: ''
  })
}

function regionName(regionId: string) {
  if (!regionId) return ''
  return regions.value.find(item => item.id === regionId)?.name || regionId
}

function statusText(status: string) {
  return { published: '已发布', draft: '草稿', offline: '已下线' }[status] || status
}

function statusTagType(status: string) {
  return status === 'published' ? 'success' : status === 'draft' ? 'warning' : 'info'
}

function categoryTagType(category: string) {
  return category === 'system' ? 'warning' : category === 'service' ? 'info' : 'success'
}

function formatTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

async function loadRegions() {
  try {
    const res = await request.get('/admin/regions')
    regions.value = listOf(res)
  } catch {
    regions.value = []
  }
}

async function loadMessages() {
  loading.value = true
  try {
    const res = await request.get('/admin/official-assistant/messages', {
      params: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        keyword: filters.keyword || undefined,
        category: filters.category || undefined,
        status: filters.status || undefined,
        regionId: filters.regionId || undefined
      }
    })
    messages.value = listOf(res)
    pagination.total = totalOf(res)
  } catch (error: any) {
    ElMessage.error(error?.message || '加载官方助手消息失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = ''
  resetForm()
  drawerVisible.value = true
}

function openEdit(row: any) {
  editingId.value = row.id
  const action = Array.isArray(row.actions) ? row.actions[0] : null
  Object.assign(form, {
    category: row.category || 'campus',
    regionId: row.regionId || '',
    status: row.status || 'published',
    title: row.title || '',
    content: row.content || '',
    summary: row.summary || '',
    imageUrl: row.imageUrl || '',
    iconUrl: row.iconUrl || '',
    tagText: row.tagText || '',
    priority: Number(row.priority || 0),
    actionText: action?.text || '',
    actionType: action?.type || 'miniapp',
    actionValue: action?.value || ''
  })
  drawerVisible.value = true
}

function buildPayload() {
  return {
    category: form.category,
    regionId: form.regionId || null,
    status: form.status,
    title: form.title.trim(),
    content: form.content.trim(),
    summary: form.summary.trim(),
    imageUrl: form.imageUrl.trim(),
    iconUrl: form.iconUrl.trim(),
    tagText: form.tagText.trim(),
    priority: form.priority,
    actionText: form.actionText.trim(),
    actionType: form.actionType,
    actionValue: form.actionValue.trim()
  }
}

async function saveMessage() {
  if (!form.title.trim() || !form.content.trim()) {
    ElMessage.warning('请填写标题和内容')
    return
  }
  saving.value = true
  try {
    const payload = buildPayload()
    if (editingId.value) {
      await request.put(`/admin/official-assistant/messages/${editingId.value}`, payload)
    } else {
      await request.post('/admin/official-assistant/messages', payload)
    }
    ElMessage.success('已保存')
    drawerVisible.value = false
    await loadMessages()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function removeMessage(row: any) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.title}」吗？`, '删除官方助手消息', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  await request.delete(`/admin/official-assistant/messages/${row.id}`)
  ElMessage.success('已删除')
  await loadMessages()
}

onMounted(() => {
  loadRegions()
  loadMessages()
})
</script>

<style scoped>
.assistant-page { padding: 24px; }
.assistant-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.assistant-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.assistant-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #4daa32 !important; font-size: 13px; }
.filter-card { display: grid; grid-template-columns: 1.5fr 150px 150px 180px auto; gap: 12px; margin-bottom: 16px; padding: 16px; background: #fff; border: 1px solid #dbe7d4; border-radius: 14px; }
.data-card { background: rgba(255,255,255,0.9); border: 1px solid #dbe7d4; border-radius: 14px; box-shadow: 0 14px 36px rgba(77,170,50,.08); padding: 18px; }
.message-cell { display: flex; align-items: center; gap: 12px; }
.message-cell img { width: 46px; height: 46px; border-radius: 10px; object-fit: cover; background: #f1f9e9; }
.message-cell p { margin: 6px 0 0; color: #64748b; line-height: 1.4; }
.title-line { display: flex; align-items: center; gap: 8px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
@media (max-width: 1000px) {
  .filter-card { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>

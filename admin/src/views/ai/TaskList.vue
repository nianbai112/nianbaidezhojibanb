<template>
  <div class="ai-page">
    <div class="page-head">
      <div>
        <div class="breadcrumb">AI 运营中心 / AI 任务</div>
        <h1>AI 任务</h1>
        <p>创建和管理自动发帖、评论、冷启动和互动任务，所有任务都必须绑定具体机器人。</p>
      </div>
      <el-button v-if="hasEditPermission" type="primary" :icon="Plus" @click="openCreate">创建任务</el-button>
    </div>

    <div class="filter-card">
      <el-select v-model="query.type" clearable placeholder="任务类型">
        <el-option label="自动发帖" value="post" />
        <el-option label="自动评论" value="comment" />
        <el-option label="内容冷启动" value="cold_start" />
        <el-option label="自动互动" value="interaction" />
      </el-select>
      <el-select v-model="query.status" clearable placeholder="状态">
        <el-option label="待执行" value="pending" />
        <el-option label="已审核" value="approved" />
        <el-option label="运行中" value="running" />
        <el-option label="已完成" value="completed" />
        <el-option label="失败" value="failed" />
      </el-select>
      <el-select v-model="query.regionId" clearable filterable placeholder="区域">
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="loadTasks">查询</el-button>
      <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
    </div>

    <div class="table-card">
      <el-table :data="tasks" v-loading="loading" empty-text="暂无AI任务">
        <el-table-column label="任务内容" min-width="260">
          <template #default="{ row }">
            <div class="task-cell">
              <b>{{ row.name }}</b>
              <span>{{ row.content || row.failReason || '暂无描述' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="机器人" width="150">
          <template #default="{ row }">{{ row.botName || '-' }}</template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="目标帖子" width="190">
          <template #default="{ row }">
            <div v-if="row.targetPostId" class="target-post-cell">
              <code>{{ row.targetPostId }}</code>
              <el-button size="small" link type="primary" @click="copyPostId(row.targetPostId)">复制</el-button>
              <el-button size="small" link type="success" @click="openTargetPost(row.targetPostId)">查看</el-button>
            </div>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="330" fixed="right">
          <template #default="{ row }">
            <el-button v-if="hasEditPermission" size="small" @click="editTask(row)">编辑</el-button>
            <el-button
              v-if="hasEditPermission"
              size="small"
              type="primary"
              plain
              :loading="actionLoading === `draft:${row.id}`"
              @click="generateDraft(row)"
            >
              生成草稿
            </el-button>
            <el-button
              v-if="hasEditPermission"
              size="small"
              type="success"
              :disabled="['completed', 'cancelled', 'running'].includes(row.status)"
              :loading="actionLoading === `run:${row.id}`"
              @click="runTask(row)"
            >
              立即执行
            </el-button>
            <el-button v-if="hasEditPermission" size="small" :type="row.status === 'running' ? 'warning' : 'success'" @click="toggleStatus(row)">
              {{ row.status === 'running' ? '暂停' : '启动' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <span>共 {{ total }} 个任务</span>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          layout="sizes, prev, pager, next"
          :total="total"
          :page-sizes="[10, 20, 50]"
          @change="loadTasks"
        />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingTask ? '编辑任务' : '创建任务'" width="720px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="任务名称" required>
            <el-input v-model="form.title" placeholder="例如：东校区新生生活冷启动" />
          </el-form-item>
          <el-form-item label="任务类型" required>
            <el-select v-model="form.type" style="width: 100%">
              <el-option label="自动发帖" value="post" />
              <el-option label="自动评论" value="comment" />
              <el-option label="内容冷启动" value="cold_start" />
              <el-option label="自动互动" value="interaction" />
            </el-select>
          </el-form-item>
          <el-form-item label="执行机器人" required>
            <el-select v-model="form.botId" style="width: 100%" filterable placeholder="选择启用中的机器人">
              <el-option
                v-for="bot in activeBots"
                :key="bot.botAccountId"
                :label="`${bot.nickname} / ${bot.personaName || '未绑定人设'}`"
                :value="bot.botAccountId"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="区域">
            <el-select v-model="form.regionId" style="width: 100%" clearable filterable placeholder="不选则为全局">
              <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="isPostTask" label="发布到圈子">
            <el-select v-model="form.circleId" style="width: 100%" clearable filterable placeholder="不选则发布到普通信息流">
              <el-option v-for="circle in activeCircles" :key="circle.id" :label="circle.name" :value="circle.id" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="isCommentTask" label="目标帖子ID" required>
            <el-input v-model="form.targetPostId" placeholder="从帖子管理复制帖子ID后粘贴到这里">
              <template #append>
                <el-button @click="openPostsForCopy">找帖子</el-button>
              </template>
            </el-input>
            <div class="form-tip">用于指定机器人要评论或互动的帖子；帖子管理列表和详情里可以一键复制。</div>
          </el-form-item>
        </div>
        <el-form-item label="任务内容 / 生成提示词">
          <el-input v-model="form.content" type="textarea" :rows="5" placeholder="写清楚生成方向、语气、场景、是否需要配图等。" />
        </el-form-item>
        <el-form-item v-if="isPostTask" label="任务配图（可选）">
          <div class="media-picker">
            <ImageUploadBox
              :model-value="mediaUploadValue"
              scene="ai-task"
              shape="wide"
              :max-size="5"
              placeholder="上传任务配图"
              tip="上传后会自动追加到下方配图列表"
              @update:model-value="appendMediaUrl"
            />
            <el-input
              v-model="form.mediaUrlsText"
              type="textarea"
              :rows="3"
              placeholder="已上传的配图会显示在这里；也可粘贴历史图片路径，一行一个。"
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitTask" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('ai:edit'))
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const editingTask = ref<any>(null)
const tasks = ref<any[]>([])
const regions = ref<any[]>([])
const circles = ref<any[]>([])
const bots = ref<any[]>([])
const total = ref(0)
const actionLoading = ref('')
const mediaUploadValue = ref('')

const query = reactive({
  page: 1,
  pageSize: 20,
  type: '',
  status: '',
  regionId: '',
})

const form = reactive<any>({
  title: '',
  type: 'post',
  botId: '',
  regionId: '',
  content: '',
  targetPostId: '',
  circleId: '',
  mediaUrlsText: '',
})

const activeBots = computed(() => bots.value.filter((bot) => bot.botStatus === 'active' || bot.status === 'active'))
const isPostTask = computed(() => ['post', 'cold_start'].includes(form.type))
const isCommentTask = computed(() => ['comment', 'interaction'].includes(form.type))
const activeCircles = computed(() => {
  const regionId = form.regionId
  return circles.value.filter((circle) => {
    if (!regionId) return true
    return !circle.regionId || circle.regionId === regionId
  })
})
const pickPage = (res: any) => res?.data || res || { list: [], total: 0 }
const routeParam = (key: string) => {
  const value = route.query[key]
  return Array.isArray(value) ? String(value[0] || '') : String(value || '')
}

const loadTasks = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/ai/tasks', { params: query })
    const page = pickPage(res)
    tasks.value = page.list || []
    total.value = page.total || 0
  } catch (error: any) {
    ElMessage.error(error?.message || '加载AI任务失败')
  } finally {
    loading.value = false
  }
}

const loadRegions = async () => {
  try {
    const res: any = await request.get('/admin/regions')
    regions.value = (res?.data || res)?.list || []
  } catch (error: any) {
    ElMessage.warning(error?.message || '加载区域列表失败')
  }
}

const loadBots = async () => {
  try {
    const res: any = await request.get('/admin/ai/bots', { params: { pageSize: 200, status: 'active' } })
    bots.value = (res?.data || res)?.list || []
  } catch (error: any) {
    ElMessage.warning(error?.message || '加载机器人列表失败')
  }
}

const loadCircles = async () => {
  try {
    const res: any = await request.get('/admin/circles', { params: { pageSize: 500, status: 'active' } })
    circles.value = (res?.data || res)?.list || []
  } catch (error: any) {
    ElMessage.warning(error?.message || '加载圈子列表失败')
  }
}

const resetForm = () => Object.assign(form, {
  title: '',
  type: 'post',
  botId: '',
  regionId: '',
  content: '',
  targetPostId: '',
  circleId: '',
  mediaUrlsText: '',
})

const appendMediaUrl = async (url: string) => {
  const imageUrl = String(url || '').trim()
  if (!imageUrl) return
  const urls = String(form.mediaUrlsText || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (!urls.includes(imageUrl)) {
    urls.push(imageUrl)
  }
  form.mediaUrlsText = urls.join('\n')
  mediaUploadValue.value = imageUrl
  await nextTick()
  mediaUploadValue.value = ''
}

const openCreate = () => {
  editingTask.value = null
  resetForm()
  dialogVisible.value = true
}

const openCreateFromRoute = () => {
  const targetPostId = routeParam('targetPostId')
  if (!targetPostId) return
  editingTask.value = null
  resetForm()
  form.type = ['comment', 'interaction'].includes(routeParam('type')) ? routeParam('type') : 'comment'
  form.targetPostId = targetPostId
  form.regionId = routeParam('regionId')
  dialogVisible.value = true
  ElMessage.success('已带入目标帖子ID，请选择机器人后保存任务')
}

const editTask = (task: any) => {
  const mediaUrls = Array.isArray(task.mediaUrls)
    ? task.mediaUrls
    : String(task.mediaUrls || '').split(/\n|,/).filter(Boolean)
  editingTask.value = task
  Object.assign(form, {
    title: task.name || '',
    type: task.type || 'post',
    botId: task.botId || '',
    regionId: task.regionId || '',
    content: task.content || '',
    targetPostId: task.targetPostId || '',
    circleId: task.circleId || '',
    mediaUrlsText: mediaUrls.join('\n'),
  })
  dialogVisible.value = true
}

const submitTask = async () => {
  if (!form.title?.trim()) {
    ElMessage.warning('请填写任务名称')
    return
  }
  if (!form.botId) {
    ElMessage.warning('请选择执行机器人')
    return
  }
  if (isCommentTask.value && !form.targetPostId?.trim()) {
    ElMessage.warning('评论/互动任务需要填写目标帖子ID')
    return
  }
  submitting.value = true
  try {
    const isPost = isPostTask.value
    const isComment = isCommentTask.value
    const payload = {
      ...form,
      targetPostId: isComment ? form.targetPostId : '',
      circleId: isPost ? form.circleId : '',
      mediaUrls: isPost ? String(form.mediaUrlsText || '')
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean) : [],
    }
    delete (payload as any).mediaUrlsText
    if (editingTask.value) {
      await request.put(`/admin/ai/tasks/${editingTask.value.id}`, payload)
      ElMessage.success('任务已更新')
    } else {
      await request.post('/admin/ai/tasks', payload)
      ElMessage.success('任务已创建')
    }
    dialogVisible.value = false
    await loadTasks()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存任务失败')
  } finally {
    submitting.value = false
  }
}

const toggleStatus = async (task: any) => {
  try {
    await request.put(`/admin/ai/tasks/${task.id}/status`, {
      status: task.status === 'running' ? 'paused' : 'running',
    })
    ElMessage.success('任务状态已更新')
    await loadTasks()
  } catch (error: any) {
    ElMessage.error(error?.message || '更新任务状态失败')
  }
}

const generateDraft = async (task: any) => {
  actionLoading.value = `draft:${task.id}`
  try {
    await request.post(`/admin/ai/tasks/${task.id}/generate-draft`)
    ElMessage.success('AI草稿已生成')
    await loadTasks()
  } catch (error: any) {
    ElMessage.error(error?.message || '生成AI草稿失败')
  } finally {
    actionLoading.value = ''
  }
}

const runTask = async (task: any) => {
  actionLoading.value = `run:${task.id}`
  try {
    await request.post(`/admin/ai/tasks/${task.id}/run`)
    ElMessage.success('任务已执行')
    await loadTasks()
  } catch (error: any) {
    ElMessage.error(error?.message || '执行AI任务失败')
  } finally {
    actionLoading.value = ''
  }
}

const copyText = async (value: string) => {
  const text = String(value || '').trim()
  if (!text) return
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const copyPostId = async (postId: string) => {
  try {
    await copyText(postId)
    ElMessage.success('帖子ID已复制')
  } catch {
    ElMessage.error('复制失败，请手动选中帖子ID复制')
  }
}

const openTargetPost = (postId: string) => {
  router.push({ path: '/content/posts', query: { id: postId } })
}

const openPostsForCopy = () => {
  router.push({ path: '/content/posts' })
}

const resetQuery = () => {
  Object.assign(query, { page: 1, type: '', status: '', regionId: '' })
  loadTasks()
}

const typeLabel = (type: string) => ({ post: '自动发帖', comment: '自动评论', cold_start: '内容冷启动', interaction: '自动互动' }[type] || type || '-')
const statusLabel = (status: string) => ({ pending: '待执行', approved: '已审核', running: '运行中', paused: '已暂停', completed: '已完成', failed: '失败', cancelled: '已取消' }[status] || status || '-')
const statusType = (status: string) => ({ pending: 'info', approved: 'warning', running: 'primary', paused: 'warning', completed: 'success', failed: 'danger', cancelled: 'info' }[status] || 'info')
const formatTime = (value: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'

onMounted(() => {
  loadTasks()
  loadRegions()
  loadCircles()
  loadBots()
  openCreateFromRoute()
})
</script>

<style scoped>
.ai-page {
  padding: 28px;
  color: var(--mx-text);
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.breadcrumb {
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 8px;
}

.page-head h1 {
  margin: 0;
  font-size: 32px;
}

.page-head p {
  margin: 8px 0 0;
  color: var(--mx-sub);
  font-size: 15px;
  font-weight: 700;
}

.filter-card,
.table-card {
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  background: var(--mx-card);
  box-shadow: var(--mx-shadow);
  backdrop-filter: blur(14px);
}

.filter-card {
  display: grid;
  grid-template-columns: 180px 180px minmax(220px, 1fr) auto auto;
  gap: 12px;
  padding: 16px;
  margin-bottom: 18px;
}

.table-card {
  padding: 16px;
}

.task-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-cell b {
  color: var(--mx-text);
}

.task-cell span {
  overflow: hidden;
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-post-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.target-post-cell code {
  overflow: hidden;
  max-width: 96px;
  color: var(--el-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted,
.form-tip {
  color: var(--mx-sub);
  font-size: 12px;
}

.form-tip {
  margin-top: 6px;
  line-height: 1.5;
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 800;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.media-picker {
  display: grid;
  grid-template-columns: minmax(220px, 320px) 1fr;
  gap: 14px;
  width: 100%;
}

@media (max-width: 1100px) {
  .filter-card,
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }

  .media-picker {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .ai-page { padding: 18px; }
  .page-head { flex-direction: column; }
  .filter-card,
  .form-grid { grid-template-columns: 1fr; }
}
</style>

<template>
  <div class="page-container">
    <a-alert
      v-if="!aiConfigured"
      message="AI 服务未配置，请先在配置中心配置 AI Key"
      type="warning"
      show-icon
      closable
      style="margin-bottom:16px"
    />

    <!-- 创建任务 -->
    <div class="page-card">
      <div class="section-title">创建评论任务</div>
      <a-form layout="vertical" :model="createForm">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="帖子 ID" required>
              <a-input-group compact>
                <a-input-number v-model:value="createForm.postId" placeholder="输入帖子ID" style="width:calc(100% - 80px)" :min="1" />
                <a-button type="default" :loading="loadingPost" @click="onLoadPost" style="width:80px">加载帖子</a-button>
              </a-input-group>
            </a-form-item>
          </a-col>
          <a-col :span="16">
            <a-form-item label="帖子预览" v-if="postPreview">
              <div class="post-preview">
                <strong>{{ postPreview.title || '(无标题)' }}</strong>
                <span class="post-meta">作者: {{ postPreview.userNickname || '-' }} | {{ postPreview.createdAt || '' }}</span>
              </div>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="选择机器人" required>
              <a-select
                v-model:value="createForm.robotIds"
                mode="multiple"
                placeholder="选择用于评论的机器人"
                :loading="robotLoading"
                show-search
                :filter-option="false"
                @search="onRobotSearch"
              >
                <a-select-option v-for="r in robotOptions" :key="r.id" :value="r.id">{{ r.nickname }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="评论方向" required>
              <a-input v-model:value="createForm.direction" placeholder="如：夸赞、质疑、补充信息、幽默吐槽" :maxlength="100" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="每个机器人评论条数">
              <a-input-number v-model:value="createForm.count" :min="1" :max="10" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="评论间隔（秒）">
              <a-input-number v-model:value="createForm.intervalSeconds" :min="5" :max="3600" style="width:100%" placeholder="默认随机" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="定时执行（可选）">
              <a-date-picker
                v-model:value="createForm.scheduledAt"
                show-time
                placeholder="定时执行时间"
                style="width:100%"
                :disabled-date="(d: any) => d && d.valueOf() < Date.now() - 86400000"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item>
          <a-button
            type="primary"
            :loading="generatingComments"
            :disabled="!createForm.postId || !createForm.robotIds.length || !createForm.direction.trim()"
            @click="onGenerateComments"
          >
            AI 生成评论
          </a-button>
          <span v-if="generatingComments" style="margin-left:12px;color:#6b7280">AI 正在生成评论...</span>
        </a-form-item>
        <template v-if="generatedComments.length">
          <a-form-item label="生成的评论（可编辑）">
            <div class="comment-list">
              <div v-for="(item, idx) in generatedComments" :key="idx" class="comment-item">
                <a-tag size="small" color="blue" style="margin-bottom:4px">
                  {{ robotOptions.find((r) => r.id === item.robotId)?.nickname || `机器人#${item.robotId}` }}
                </a-tag>
                <a-textarea v-model:value="item.content" :rows="2" :maxlength="500" show-count />
              </div>
            </div>
          </a-form-item>
          <a-form-item>
            <a-button type="primary" :loading="submittingTask" @click="submitCommentTask" :disabled="!generatedComments.length">
              提交评论任务
            </a-button>
          </a-form-item>
        </template>
      </a-form>
    </div>

    <!-- 任务列表 -->
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">评论任务列表</span>
      </div>
      <DataTable
        :columns="taskColumns"
        :data-source="taskList"
        :loading="taskLoading"
        :total="taskTotal"
        v-model:page="taskPage"
        v-model:page-size="taskPageSize"
        @change="onTaskTableChange"
      >
        <template #robotNicknames="{ record }">
          <a-space v-if="record.robotNicknames && record.robotNicknames.length" :size="4" wrap>
            <a-tag v-for="(name, idx) in record.robotNicknames.slice(0, 3)" :key="idx" size="small">{{ name }}</a-tag>
            <a-tag v-if="record.robotNicknames.length > 3" size="small" color="default">+{{ record.robotNicknames.length - 3 }}</a-tag>
          </a-space>
          <span v-else>-</span>
        </template>
        <template #status="{ record }">
          <a-tag :color="taskStatusColor[record.status] || 'default'" size="small">
            {{ taskStatusLabel[record.status] || record.status }}
          </a-tag>
        </template>
        <template #count="{ record }">
          {{ record.generatedCount || 0 }} / {{ record.totalCount || 0 }}
        </template>
        <template #action="{ record }">
          <a-space>
            <a-button type="link" size="small" @click="openTaskDetail(record)">详情</a-button>
            <a-popconfirm
              v-if="record.status === 'pending'"
              title="确定取消该任务?"
              @confirm="onCancelTask(record.id)"
            >
              <a-button type="link" size="small" danger>取消</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 任务详情抽屉 -->
    <a-drawer
      v-model:open="detailDrawerVisible"
      title="评论任务详情"
      :width="520"
    >
      <template v-if="detailTask">
        <a-descriptions :column="1" size="small" bordered>
          <a-descriptions-item label="帖子">{{ detailTask.postTitle || `#${detailTask.postId}` }}</a-descriptions-item>
          <a-descriptions-item label="机器人">
            <a-space :size="4" wrap>
              <a-tag v-for="(name, idx) in detailTask.robotNicknames" :key="idx" size="small">{{ name }}</a-tag>
            </a-space>
          </a-descriptions-item>
          <a-descriptions-item label="方向">{{ detailTask.direction }}</a-descriptions-item>
          <a-descriptions-item label="进度">{{ detailTask.generatedCount || 0 }} / {{ detailTask.totalCount || 0 }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="taskStatusColor[detailTask.status] || 'default'" size="small">{{ taskStatusLabel[detailTask.status] || detailTask.status }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="错误信息" v-if="detailTask.errorMessage">
            <span style="color:#ef4444">{{ detailTask.errorMessage }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="间隔">{{ detailTask.intervalSeconds || '-' }} 秒</a-descriptions-item>
          <a-descriptions-item label="定时执行">{{ detailTask.scheduledAt || '-' }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ detailTask.createdAt }}</a-descriptions-item>
        </a-descriptions>
        <div v-if="detailTask.results && detailTask.results.length" style="margin-top:16px">
          <div class="section-title">评论列表</div>
          <div v-for="(r, idx) in detailTask.results" :key="idx" class="comment-item">
            <a-tag size="small" :color="r.status === 'posted' ? 'green' : r.status === 'failed' ? 'red' : 'orange'">
              {{ r.status === 'posted' ? '已发布' : r.status === 'failed' ? '失败' : '待发布' }}
            </a-tag>
            <span style="margin-left:8px;font-size:13px">{{ r.content }}</span>
          </div>
        </div>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { robotApi } from '@/api/robot'
import { configApi } from '@/api/config'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import type { RobotCommentTask } from '@/types/robot'

const aiConfigured = ref(true)

const robotLoading = ref(false)
const robotOptions = ref<{ id: number; nickname: string }[]>([])
let robotSearchTimer: ReturnType<typeof setTimeout> | null = null

const loadingPost = ref(false)
const postPreview = ref<any>(null)

const generatingComments = ref(false)
const submittingTask = ref(false)

const createForm = reactive({
  postId: null as number | null,
  robotIds: [] as number[],
  direction: '',
  count: 1,
  intervalSeconds: undefined as number | undefined,
  scheduledAt: null as any,
})

const generatedComments = ref<{ robotId: number; content: string }[]>([])

const taskLoading = ref(false)
const taskList = ref<RobotCommentTask[]>([])
const taskTotal = ref(0)
const taskPage = ref(1)
const taskPageSize = ref(20)

const detailDrawerVisible = ref(false)
const detailTask = ref<RobotCommentTask | null>(null)

const taskStatusColor: Record<string, string> = {
  pending: 'orange',
  running: 'blue',
  success: 'green',
  failed: 'red',
  cancelled: 'default',
}
const taskStatusLabel: Record<string, string> = {
  pending: '待执行',
  running: '执行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
}

const taskColumns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '帖子', dataIndex: 'postTitle', width: 140, ellipsis: true },
  { title: '机器人', dataIndex: 'robotNicknames', width: 160, slot: 'robotNicknames' },
  { title: '方向', dataIndex: 'direction', width: 100, ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '进度', dataIndex: 'count', width: 80, slot: 'count' },
  { title: '定时', dataIndex: 'scheduledAt', width: 160 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

onMounted(async () => {
  try {
    const cfg = await configApi.getAIConfig()
    aiConfigured.value = !!(cfg.data?.data?.enabled || cfg.data?.enabled)
  } catch {
    aiConfigured.value = false
  }
  fetchTasks()
})

function onRobotSearch(val: string) {
  if (robotSearchTimer) clearTimeout(robotSearchTimer)
  robotSearchTimer = setTimeout(async () => {
    robotLoading.value = true
    try {
      const res = await robotApi.getList({ page: 1, pageSize: 50, keyword: val || undefined, status: 1 })
      robotOptions.value = (res.data?.data?.list || res.data?.list || []) as { id: number; nickname: string }[]
    } catch {
      // ignore
    } finally {
      robotLoading.value = false
    }
  }, 300)
}
onRobotSearch('')

async function onLoadPost() {
  if (!createForm.postId) return
  loadingPost.value = true
  try {
    const { contentApi } = await import('@/api/content')
    const res = await contentApi.getPostDetail(createForm.postId)
    postPreview.value = res.data?.data || res.data
  } catch {
    message.warning('加载帖子失败，请确认帖子ID正确')
    postPreview.value = null
  } finally {
    loadingPost.value = false
  }
}

async function onGenerateComments() {
  if (!createForm.postId || !createForm.robotIds.length || !createForm.direction.trim()) return
  generatingComments.value = true
  try {
    const res = await robotApi.generateComments({
      postId: createForm.postId,
      robotIds: createForm.robotIds,
      direction: createForm.direction.trim(),
      count: createForm.count || 1,
    })
    const data = res.data?.data || res.data
    if (data && data.comments) {
      generatedComments.value = data.comments.map((c: any) => ({
        robotId: c.robotId,
        content: c.content || '',
      }))
    }
    message.success(`AI 生成了 ${generatedComments.value.length} 条评论`)
  } catch {
    message.error('AI 生成失败，请检查 AI 配置或重试')
  } finally {
    generatingComments.value = false
  }
}

async function submitCommentTask() {
  if (!createForm.postId || !generatedComments.value.length) return
  submittingTask.value = true
  try {
    await robotApi.createCommentTask({
      postId: createForm.postId,
      robotIds: createForm.robotIds,
      comments: generatedComments.value.map((c) => ({ robotId: c.robotId, content: c.content })),
      intervalSeconds: createForm.intervalSeconds,
      scheduledAt: createForm.scheduledAt ? new Date(createForm.scheduledAt).toISOString() : undefined,
    })
    message.success('评论任务已提交')
    generatedComments.value = []
    createForm.direction = ''
    createForm.postId = null
    createForm.robotIds = []
    createForm.scheduledAt = null
    postPreview.value = null
    fetchTasks()
  } catch {
    message.error('提交任务失败')
  } finally {
    submittingTask.value = false
  }
}

async function fetchTasks() {
  taskLoading.value = true
  try {
    const res = await robotApi.getCommentTasks({ page: taskPage.value, pageSize: taskPageSize.value })
    taskList.value = (res.data?.data?.list || res.data?.list || []) as RobotCommentTask[]
    taskTotal.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    message.error('加载任务列表失败')
  } finally {
    taskLoading.value = false
  }
}

function onTaskTableChange() { fetchTasks() }

function openTaskDetail(record: RobotCommentTask) {
  detailTask.value = record
  detailDrawerVisible.value = true
}

async function onCancelTask(id: number) {
  try {
    await robotApi.cancelTask(id, 'comment')
    message.success('已取消任务')
    fetchTasks()
  } catch {
    message.error('取消失败')
  }
}
</script>

<style lang="less" scoped>
.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}
.post-preview {
  background: #f9fafb;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  .post-meta {
    display: block;
    margin-top: 4px;
    color: #9ca3af;
    font-size: 12px;
  }
}
.comment-list {
  .comment-item {
    margin-bottom: 12px;
    padding: 10px;
    background: #f9fafb;
    border-radius: 6px;
    border: 1px solid #f0f0f0;
  }
}
</style>

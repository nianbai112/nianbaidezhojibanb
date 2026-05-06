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
      <div class="section-title">创建发帖任务</div>
      <a-form layout="vertical" :model="createForm">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="选择机器人" required>
              <a-select
                v-model:value="createForm.robotId"
                placeholder="选择机器人"
                :loading="robotLoading"
                show-search
                :filter-option="false"
                @search="onRobotSearch"
              >
                <a-select-option v-for="r in robotOptions" :key="r.id" :value="r.id">{{ r.nickname }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="选择圈子（可选）">
              <a-select
                v-model:value="createForm.circleId"
                placeholder="选择圈子"
                allow-clear
                :loading="circleLoading"
                show-search
                :filter-option="false"
                @search="onCircleSearch"
              >
                <a-select-option v-for="c in circleOptions" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="关联话题（可选）">
              <a-select
                v-model:value="createForm.topicIds"
                mode="multiple"
                placeholder="选择话题"
                :loading="circleLoading"
                show-search
                :filter-option="false"
                @search="onCircleSearch"
              >
                <a-select-option v-for="c in circleOptions" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="话题/提示词" required>
          <a-textarea
            v-model:value="createForm.topic"
            placeholder="描述想发的帖子主题，如：分享最近发现的一家宝藏咖啡店"
            :rows="3"
            :maxlength="500"
            show-count
          />
        </a-form-item>
        <a-form-item>
          <a-button
            type="primary"
            :loading="generatingPost"
            :disabled="!createForm.robotId || !createForm.topic.trim()"
            @click="onGeneratePost"
          >
            AI 生成内容
          </a-button>
          <span v-if="generatingPost" style="margin-left:12px;color:#6b7280">AI 正在生成...</span>
        </a-form-item>
        <template v-if="createForm.title || createForm.content">
          <a-form-item label="标题">
            <a-input v-model:value="createForm.title" placeholder="帖子标题（可编辑）" :maxlength="100" show-count />
          </a-form-item>
          <a-form-item label="内容">
            <a-textarea v-model:value="createForm.content" placeholder="帖子内容（可编辑）" :rows="5" :maxlength="5000" show-count />
          </a-form-item>
          <a-form-item label="配图 URL（可选）">
            <div>
              <a-space direction="vertical" style="width:100%">
                <a-input
                  v-for="(img, idx) in createForm.images"
                  :key="idx"
                  v-model:value="createForm.images[idx]"
                  placeholder="图片 URL"
                  style="margin-bottom:8px"
                >
                  <template #suffix>
                    <a-button type="link" size="small" danger @click="createForm.images.splice(idx, 1)">删除</a-button>
                  </template>
                </a-input>
              </a-space>
              <a-button type="dashed" size="small" @click="createForm.images.push('')" style="margin-top:4px">
                + 添加图片
              </a-button>
            </div>
          </a-form-item>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="定时发布（可选）">
                <a-date-picker
                  v-model:value="createForm.scheduledAt"
                  show-time
                  placeholder="选择定时发布时间"
                  style="width:100%"
                  :disabled-date="(d: any) => d && d.valueOf() < Date.now() - 86400000"
                />
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item>
            <a-space>
              <a-button type="default" :loading="submittingTask" @click="submitTask(false)">提交审核</a-button>
              <a-button type="primary" :loading="submittingTask" @click="submitTask(true)">直接发布</a-button>
            </a-space>
          </a-form-item>
        </template>
      </a-form>
    </div>

    <!-- 任务列表 -->
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">发帖任务列表</span>
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
        <template #prompt="{ record }">
          <span :title="record.prompt">{{ (record.prompt || '').length > 30 ? record.prompt.slice(0, 30) + '...' : record.prompt }}</span>
        </template>
        <template #status="{ record }">
          <a-tag :color="taskStatusColor[record.status] || 'default'" size="small">
            {{ taskStatusLabel[record.status] || record.status }}
          </a-tag>
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
      title="任务详情"
      :width="480"
    >
      <template v-if="detailTask">
        <a-descriptions :column="1" size="small" bordered>
          <a-descriptions-item label="机器人">{{ detailTask.robotNickname }}</a-descriptions-item>
          <a-descriptions-item label="圈子">{{ detailTask.circleName || '-' }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="taskStatusColor[detailTask.status] || 'default'" size="small">{{ taskStatusLabel[detailTask.status] || detailTask.status }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="提示词">{{ detailTask.prompt }}</a-descriptions-item>
          <a-descriptions-item label="生成标题">{{ detailTask.resultTitle || '-' }}</a-descriptions-item>
          <a-descriptions-item label="生成内容">{{ detailTask.resultContent || '-' }}</a-descriptions-item>
          <a-descriptions-item label="配图">
            <div v-if="detailTask.resultImages && detailTask.resultImages.length">
              <a-image v-for="(url, i) in detailTask.resultImages" :key="i" :src="url" :width="60" :height="60" style="object-fit:cover;border-radius:4px;margin-right:8px" />
            </div>
            <span v-else>-</span>
          </a-descriptions-item>
          <a-descriptions-item label="错误信息" v-if="detailTask.errorMessage">
            <span style="color:#ef4444">{{ detailTask.errorMessage }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="定时执行">{{ detailTask.scheduledAt || '-' }}</a-descriptions-item>
          <a-descriptions-item label="执行时间">{{ detailTask.executedAt || '-' }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ detailTask.createdAt }}</a-descriptions-item>
        </a-descriptions>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { robotApi } from '@/api/robot'
import { configApi } from '@/api/config'
import { contentApi } from '@/api/content'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import type { RobotAccount, RobotPostTask } from '@/types/robot'

const aiConfigured = ref(true)

const robotLoading = ref(false)
const robotOptions = ref<{ id: number; nickname: string }[]>([])
let robotSearchTimer: ReturnType<typeof setTimeout> | null = null

const circleLoading = ref(false)
const circleOptions = ref<{ id: number; name: string }[]>([])
let circleSearchTimer: ReturnType<typeof setTimeout> | null = null

const generatingPost = ref(false)
const submittingTask = ref(false)

const createForm = reactive({
  robotId: undefined as number | undefined,
  circleId: undefined as number | undefined,
  topicIds: [] as number[],
  topic: '',
  title: '',
  content: '',
  images: [] as string[],
  scheduledAt: null as any,
})

const taskLoading = ref(false)
const taskList = ref<RobotPostTask[]>([])
const taskTotal = ref(0)
const taskPage = ref(1)
const taskPageSize = ref(20)

const detailDrawerVisible = ref(false)
const detailTask = ref<RobotPostTask | null>(null)

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
  { title: '机器人', dataIndex: 'robotNickname', width: 110 },
  { title: '提示词', dataIndex: 'prompt', width: 180, ellipsis: true, slot: 'prompt' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '定时', dataIndex: 'scheduledAt', width: 160 },
  { title: '执行时间', dataIndex: 'executedAt', width: 160 },
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

function onCircleSearch(val: string) {
  if (circleSearchTimer) clearTimeout(circleSearchTimer)
  circleSearchTimer = setTimeout(async () => {
    circleLoading.value = true
    try {
      const res = await contentApi.getTopicList({ page: 1, pageSize: 50, keyword: val || undefined })
      circleOptions.value = (res.data?.data?.list || res.data?.list || []) as { id: number; name: string }[]
    } catch {
      // ignore
    } finally {
      circleLoading.value = false
    }
  }, 300)
}
onCircleSearch('')

async function onGeneratePost() {
  if (!createForm.robotId || !createForm.topic.trim()) return
  generatingPost.value = true
  try {
    const res = await robotApi.generatePost({
      robotId: createForm.robotId,
      topic: createForm.topic.trim(),
      circleId: createForm.circleId,
      topicId: createForm.topicIds?.length ? createForm.topicIds[0] : undefined,
    })
    const data = res.data?.data || res.data
    if (data) {
      createForm.title = data.title || ''
      createForm.content = data.content || ''
      if (!createForm.images.length) createForm.images = ['']
    }
    message.success('AI 内容生成成功，请检查并编辑')
  } catch {
    message.error('AI 生成失败，请检查 AI 配置或重试')
  } finally {
    generatingPost.value = false
  }
}

async function submitTask(autoPublish: boolean) {
  if (!createForm.robotId || !createForm.title.trim() || !createForm.content.trim()) {
    message.warning('请填写完整信息')
    return
  }
  submittingTask.value = true
  try {
    await robotApi.createPostTask({
      robotId: createForm.robotId,
      title: createForm.title.trim(),
      content: createForm.content.trim(),
      images: createForm.images.filter((u) => u.trim()),
      circleId: createForm.circleId,
      topicIds: createForm.topicIds?.filter(Boolean),
      regionId: 0,
      scheduledAt: createForm.scheduledAt ? new Date(createForm.scheduledAt).toISOString() : undefined,
      autoPublish,
    })
    message.success(autoPublish ? '已提交直接发布任务' : '已提交审核任务')
    createForm.title = ''
    createForm.content = ''
    createForm.images = []
    createForm.topic = ''
    createForm.scheduledAt = null
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
    const res = await robotApi.getPostTasks({ page: taskPage.value, pageSize: taskPageSize.value })
    taskList.value = (res.data?.data?.list || res.data?.list || []) as RobotPostTask[]
    taskTotal.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    message.error('加载任务列表失败')
  } finally {
    taskLoading.value = false
  }
}

function onTaskTableChange() { fetchTasks() }

function openTaskDetail(record: RobotPostTask) {
  detailTask.value = record
  detailDrawerVisible.value = true
}

async function onCancelTask(id: number) {
  try {
    await robotApi.cancelTask(id, 'post')
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
</style>

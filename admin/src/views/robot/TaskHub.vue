<template>
  <div class="page-container">
    <a-card :bordered="false">
      <a-tabs v-model:activeKey="activeTab" @change="onTabChange">
        <a-tab-pane key="post" tab="发帖任务">
          <FilterBar @search="onPostSearch" @reset="onPostReset">
            <a-select v-model:value="postFilter.status" placeholder="状态筛选" allow-clear style="width:130px">
              <a-select-option value="pending">待执行</a-select-option>
              <a-select-option value="running">执行中</a-select-option>
              <a-select-option value="success">成功</a-select-option>
              <a-select-option value="failed">失败</a-select-option>
              <a-select-option value="cancelled">已取消</a-select-option>
            </a-select>
          </FilterBar>
          <DataTable
            :columns="postColumns"
            :data-source="postList"
            :loading="postLoading"
            :total="postTotal"
            v-model:page="postPage"
            v-model:page-size="postPageSize"
            @change="onPostTableChange"
          >
            <template #prompt="{ record }">
              <span :title="record.prompt">{{ (record.prompt || '').length > 30 ? record.prompt.slice(0, 30) + '...' : record.prompt }}</span>
            </template>
            <template #status="{ record }">
              <a-tag :color="statusColor[record.status] || 'default'" size="small">
                {{ statusLabel[record.status] || record.status }}
              </a-tag>
            </template>
            <template #errorMessage="{ record }">
              <a-tooltip v-if="record.errorMessage" :title="record.errorMessage">
                <span class="error-text">{{ record.errorMessage.slice(0, 30) }}...</span>
              </a-tooltip>
              <span v-else style="color:#9ca3af">-</span>
            </template>
            <template #action="{ record }">
              <a-space>
                <a-popconfirm
                  v-if="record.status === 'pending' || record.status === 'running'"
                  title="确定取消该任务?"
                  @confirm="onCancelPostTask(record.id)"
                >
                  <a-button type="link" size="small" danger>取消</a-button>
                </a-popconfirm>
                <a-button v-if="record.status === 'failed' && record.errorMessage" type="link" size="small" @click="showError(record.errorMessage)">
                  查看错误
                </a-button>
              </a-space>
            </template>
          </DataTable>
        </a-tab-pane>

        <a-tab-pane key="comment" tab="评论任务">
          <FilterBar @search="onCommentSearch" @reset="onCommentReset">
            <a-select v-model:value="commentFilter.status" placeholder="状态筛选" allow-clear style="width:130px">
              <a-select-option value="pending">待执行</a-select-option>
              <a-select-option value="running">执行中</a-select-option>
              <a-select-option value="success">成功</a-select-option>
              <a-select-option value="failed">失败</a-select-option>
              <a-select-option value="cancelled">已取消</a-select-option>
            </a-select>
          </FilterBar>
          <DataTable
            :columns="commentColumns"
            :data-source="commentList"
            :loading="commentLoading"
            :total="commentTotal"
            v-model:page="commentPage"
            v-model:page-size="commentPageSize"
            @change="onCommentTableChange"
          >
            <template #robotNicknames="{ record }">
              <a-space v-if="record.robotNicknames && record.robotNicknames.length" :size="4" wrap>
                <a-tag v-for="(name, idx) in record.robotNicknames.slice(0, 3)" :key="idx" size="small">{{ name }}</a-tag>
                <a-tag v-if="record.robotNicknames.length > 3" size="small" color="default">+{{ record.robotNicknames.length - 3 }}</a-tag>
              </a-space>
              <span v-else>-</span>
            </template>
            <template #count="{ record }">
              {{ record.generatedCount || 0 }} / {{ record.totalCount || 0 }}
            </template>
            <template #status="{ record }">
              <a-tag :color="statusColor[record.status] || 'default'" size="small">
                {{ statusLabel[record.status] || record.status }}
              </a-tag>
            </template>
            <template #errorMessage="{ record }">
              <a-tooltip v-if="record.errorMessage" :title="record.errorMessage">
                <span class="error-text">{{ record.errorMessage.slice(0, 30) }}...</span>
              </a-tooltip>
              <span v-else style="color:#9ca3af">-</span>
            </template>
            <template #action="{ record }">
              <a-space>
                <a-popconfirm
                  v-if="record.status === 'pending' || record.status === 'running'"
                  title="确定取消该任务?"
                  @confirm="onCancelCommentTask(record.id)"
                >
                  <a-button type="link" size="small" danger>取消</a-button>
                </a-popconfirm>
                <a-button v-if="record.status === 'failed' && record.errorMessage" type="link" size="small" @click="showError(record.errorMessage)">
                  查看错误
                </a-button>
              </a-space>
            </template>
          </DataTable>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <!-- 错误详情弹窗 -->
    <a-modal
      v-model:open="errorVisible"
      title="错误信息"
      :footer="null"
      width="480px"
    >
      <div class="error-detail">{{ errorMessage }}</div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { robotApi } from '@/api/robot'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import type { RobotPostTask, RobotCommentTask } from '@/types/robot'

const activeTab = ref('post')

const statusColor: Record<string, string> = {
  pending: 'orange',
  running: 'blue',
  success: 'green',
  failed: 'red',
  cancelled: 'default',
}
const statusLabel: Record<string, string> = {
  pending: '待执行',
  running: '执行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
}

// ── 发帖任务 ──
const postLoading = ref(false)
const postList = ref<RobotPostTask[]>([])
const postTotal = ref(0)
const postPage = ref(1)
const postPageSize = ref(20)
const postFilter = reactive({ status: undefined as string | undefined })

const postColumns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '机器人', dataIndex: 'robotNickname', width: 110 },
  { title: '提示词', dataIndex: 'prompt', width: 180, ellipsis: true, slot: 'prompt' },
  { title: '定时', dataIndex: 'scheduledAt', width: 160 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '错误', dataIndex: 'errorMessage', width: 120, slot: 'errorMessage' },
  { title: '执行时间', dataIndex: 'executedAt', width: 160 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

async function fetchPostTasks() {
  postLoading.value = true
  try {
    const res = await robotApi.getPostTasks({
      page: postPage.value,
      pageSize: postPageSize.value,
      status: postFilter.status,
    })
    postList.value = (res.data?.data?.list || res.data?.list || []) as RobotPostTask[]
    postTotal.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    message.error('加载发帖任务失败')
  } finally {
    postLoading.value = false
  }
}

function onPostSearch() { postPage.value = 1; fetchPostTasks() }
function onPostReset() { postFilter.status = undefined; onPostSearch() }
function onPostTableChange() { fetchPostTasks() }

async function onCancelPostTask(id: number) {
  try {
    await robotApi.cancelTask(id, 'post')
    message.success('已取消任务')
    fetchPostTasks()
  } catch {
    message.error('取消失败')
  }
}

// ── 评论任务 ──
const commentLoading = ref(false)
const commentList = ref<RobotCommentTask[]>([])
const commentTotal = ref(0)
const commentPage = ref(1)
const commentPageSize = ref(20)
const commentFilter = reactive({ status: undefined as string | undefined })

const commentColumns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '帖子', dataIndex: 'postTitle', width: 140, ellipsis: true },
  { title: '机器人', dataIndex: 'robotNicknames', width: 160, slot: 'robotNicknames' },
  { title: '方向', dataIndex: 'direction', width: 100, ellipsis: true },
  { title: '进度', dataIndex: 'count', width: 80, slot: 'count' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '错误', dataIndex: 'errorMessage', width: 120, slot: 'errorMessage' },
  { title: '定时', dataIndex: 'scheduledAt', width: 160 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

async function fetchCommentTasks() {
  commentLoading.value = true
  try {
    const res = await robotApi.getCommentTasks({
      page: commentPage.value,
      pageSize: commentPageSize.value,
      status: commentFilter.status,
    })
    commentList.value = (res.data?.data?.list || res.data?.list || []) as RobotCommentTask[]
    commentTotal.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    message.error('加载评论任务失败')
  } finally {
    commentLoading.value = false
  }
}

function onCommentSearch() { commentPage.value = 1; fetchCommentTasks() }
function onCommentReset() { commentFilter.status = undefined; onCommentSearch() }
function onCommentTableChange() { fetchCommentTasks() }

async function onCancelCommentTask(id: number) {
  try {
    await robotApi.cancelTask(id, 'comment')
    message.success('已取消任务')
    fetchCommentTasks()
  } catch {
    message.error('取消失败')
  }
}

// ── 错误弹窗 ──
const errorVisible = ref(false)
const errorMessage = ref('')

function showError(msg: string) {
  errorMessage.value = msg
  errorVisible.value = true
}

// ── Tab 切换 ──
function onTabChange(key: string) {
  if (key === 'post') fetchPostTasks()
  else fetchCommentTasks()
}

fetchPostTasks()
</script>

<style lang="less" scoped>
.error-text {
  color: #ef4444;
  cursor: pointer;
  font-size: 12px;
}
.error-detail {
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 13px;
  color: #374151;
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
  background: #fef2f2;
  border-radius: 6px;
  border: 1px solid #fecaca;
}
</style>

<template>
  <div class="ai-page">
    <div class="page-head">
      <div>
        <div class="breadcrumb">AI 运营中心 / AI 日志</div>
        <h1>AI 日志</h1>
        <p>记录机器人发帖、评论、互动和异常，方便追查为什么没有生成、为什么失败。</p>
      </div>
      <el-button :icon="Refresh" @click="loadLogs">刷新</el-button>
    </div>

    <div class="filter-card">
      <el-select v-model="query.botId" clearable filterable placeholder="机器人">
        <el-option
          v-for="bot in bots"
          :key="bot.botAccountId"
          :label="bot.nickname"
          :value="bot.botAccountId"
        />
      </el-select>
      <el-select v-model="query.action" clearable placeholder="动作">
        <el-option label="发布笔记" value="create_post" />
        <el-option label="发表评论" value="create_comment" />
        <el-option label="点赞互动" value="like" />
        <el-option label="执行失败" value="error" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
      />
      <el-button type="primary" :icon="Search" @click="loadLogs">查询</el-button>
      <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
    </div>

    <div class="table-card">
      <el-table :data="logs" v-loading="loading" empty-text="暂无AI日志">
        <el-table-column label="机器人" width="180">
          <template #default="{ row }">
            <div class="bot-cell">
              <el-avatar :size="30">{{ row.botName?.slice(0, 1) }}</el-avatar>
              <b>{{ row.botName || '-' }}</b>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="动作" width="130">
          <template #default="{ row }">
            <el-tag size="small">{{ actionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'failed' ? 'danger' : 'success'" size="small">
              {{ row.status === 'failed' ? '失败' : '成功' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="对象" width="180">
          <template #default="{ row }">{{ row.targetType || '-' }} {{ row.targetId || '' }}</template>
        </el-table-column>
        <el-table-column label="日志内容" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ row.message || stringifyDetail(row.detail) || '-' }}</template>
        </el-table-column>
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <span>共 {{ total }} 条日志</span>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          layout="sizes, prev, pager, next"
          :total="total"
          :page-sizes="[10, 20, 50]"
          @change="loadLogs"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const logs = ref<any[]>([])
const bots = ref<any[]>([])
const total = ref(0)
const dateRange = ref<string[]>([])

const query = reactive<any>({
  page: 1,
  pageSize: 20,
  botId: '',
  action: '',
  startDate: '',
  endDate: '',
})

const loadLogs = async () => {
  loading.value = true
  try {
    query.startDate = dateRange.value?.[0] || ''
    query.endDate = dateRange.value?.[1] || ''
    const res: any = await request.get('/admin/ai/logs', { params: query })
    const page = res?.data || res
    logs.value = page?.list || []
    total.value = page?.total || 0
  } catch (error: any) {
    ElMessage.error(error?.message || '加载AI日志失败')
  } finally {
    loading.value = false
  }
}

const loadBots = async () => {
  try {
    const res: any = await request.get('/admin/ai/bots', { params: { pageSize: 200 } })
    bots.value = (res?.data || res)?.list || []
  } catch (error: any) {
    ElMessage.warning(error?.message || '加载机器人列表失败')
  }
}

const resetQuery = () => {
  Object.assign(query, { page: 1, botId: '', action: '', startDate: '', endDate: '' })
  dateRange.value = []
  loadLogs()
}

const actionLabel = (action: string) => ({
  create_post: '发布笔记',
  create_comment: '发表评论',
  like: '点赞互动',
  login: '登录',
  error: '执行失败',
}[action] || action || '-')

const stringifyDetail = (detail: any) => {
  if (!detail) return ''
  if (typeof detail === 'string') return detail
  return detail.message || detail.error || JSON.stringify(detail)
}

const formatTime = (value: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'

onMounted(() => {
  loadLogs()
  loadBots()
})
</script>

<style scoped>
.ai-page {
  padding: 28px;
  color: #10213d;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.breadcrumb {
  color: #6b7d99;
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
  color: #64748b;
  font-size: 15px;
  font-weight: 700;
}

.filter-card,
.table-card {
  border: 1px solid rgba(190, 207, 230, .72);
  border-radius: 18px;
  background: rgba(255, 255, 255, .78);
  box-shadow: 0 18px 44px rgba(69, 108, 168, .12);
  backdrop-filter: blur(14px);
}

.filter-card {
  display: grid;
  grid-template-columns: 220px 180px minmax(280px, 1fr) auto auto;
  gap: 12px;
  padding: 16px;
  margin-bottom: 18px;
}

.table-card {
  padding: 16px;
}

.bot-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 1100px) {
  .filter-card {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .ai-page { padding: 18px; }
  .page-head { flex-direction: column; }
  .filter-card { grid-template-columns: 1fr; }
}
</style>

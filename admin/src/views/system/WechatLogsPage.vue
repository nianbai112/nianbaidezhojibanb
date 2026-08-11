<template>
  <div class="page-shell wechat-log-page">
    <GlassPageHeader title="微信发送日志" subtitle="查看小程序订阅消息、公众号模板消息的真实发送记录和失败原因">
      <template #actions>
        <el-button :icon="RefreshRight" :loading="loading" @click="loadLogs(true)">刷新</el-button>
      </template>
    </GlassPageHeader>

    <StatGrid :items="statItems" />

    <div class="glass-card filter-card">
      <el-input v-model="filters.userId" clearable placeholder="用户ID" @keyup.enter="loadLogs()" />
      <el-input v-model="filters.templateType" clearable placeholder="模板类型" @keyup.enter="loadLogs()" />
      <el-select v-model="filters.status" placeholder="发送状态" clearable @change="loadLogs()">
        <el-option label="全部状态" value="" />
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
        <el-option label="待发送" value="pending" />
      </el-select>
      <el-select v-model="filters.platformType" placeholder="平台" clearable @change="loadLogs()">
        <el-option label="全部平台" value="" />
        <el-option label="小程序" value="miniprogram" />
        <el-option label="公众号" value="official" />
      </el-select>
      <el-button type="primary" @click="loadLogs()">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="glass-card table-card">
      <el-table :data="logs" v-loading="loading" stripe>
        <el-table-column prop="userId" label="用户ID" width="150" show-overflow-tooltip />
        <el-table-column prop="openid" label="OpenID" width="170" show-overflow-tooltip />
        <el-table-column prop="platformType" label="平台" width="96">
          <template #default="{ row }">
            <el-tag size="small" :type="row.platformType === 'miniprogram' ? 'primary' : 'success'" effect="plain">
              {{ platformText(row.platformType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="templateType" label="模板类型" width="150" show-overflow-tooltip />
        <el-table-column prop="templateId" label="模板ID" min-width="170" show-overflow-tooltip />
        <el-table-column prop="page" label="跳转页面" min-width="180" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="96">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)" effect="plain">
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="errorCode" label="错误码" width="110" show-overflow-tooltip />
        <el-table-column prop="errorMessage" label="错误信息" min-width="220" show-overflow-tooltip />
        <el-table-column prop="sentAt" label="发送时间" width="175">
          <template #default="{ row }">{{ formatTime(row.sentAt) }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="175">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'failed'" type="primary" link size="small" @click="handleRetry(row)">
              重试
            </el-button>
            <span v-else class="empty-text">-</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="filters.page"
          v-model:page-size="filters.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadLogs()"
          @size-change="loadLogs()"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RefreshRight } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import { fetchWechatMessageLogs, retryWechatMessage } from '@/api/admin'

const loading = ref(false)
const logs = ref<any[]>([])
const total = ref(0)

const filters = reactive({
  userId: '',
  templateType: '',
  status: '',
  platformType: '',
  page: 1,
  pageSize: 20,
})

const pageStats = computed(() => ({
  success: logs.value.filter((item) => item.status === 'success').length,
  failed: logs.value.filter((item) => item.status === 'failed').length,
  pending: logs.value.filter((item) => item.status === 'pending').length,
}))

const statItems = computed(() => [
  { label: '当前筛选记录', value: total.value, icon: 'Document' },
  { label: '本页成功', value: pageStats.value.success, tone: 'green' as const, icon: 'CircleCheck' },
  { label: '本页失败', value: pageStats.value.failed, tone: 'red' as const, icon: 'CircleClose' },
  { label: '本页待发送', value: pageStats.value.pending, tone: 'orange' as const, icon: 'Clock' },
])

function formatTime(t: string) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN')
}

function platformText(value: string) {
  if (value === 'miniprogram') return '小程序'
  if (value === 'official') return '公众号'
  return value || '-'
}

function statusText(value: string) {
  const map: Record<string, string> = { success: '成功', failed: '失败', pending: '待发送' }
  return map[value] || value || '-'
}

function statusType(value: string) {
  if (value === 'success') return 'success'
  if (value === 'failed') return 'danger'
  return 'warning'
}

async function loadLogs(showSuccess = false) {
  loading.value = true
  try {
    const res: any = await fetchWechatMessageLogs(filters)
    logs.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
    if (showSuccess) ElMessage.success('微信发送日志已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载微信发送日志失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.userId = ''
  filters.templateType = ''
  filters.status = ''
  filters.platformType = ''
  filters.page = 1
  loadLogs()
}

async function handleRetry(row: any) {
  await ElMessageBox.confirm('确定把这条失败消息标记为待重试？', '重试发送', { type: 'warning' })
  try {
    const res: any = await retryWechatMessage(row.id)
    ElMessage.success(res?.message || '已标记重试')
    await loadLogs()
  } catch (e: any) {
    ElMessage.error(e?.message || '重试失败')
  }
}

onMounted(() => loadLogs())
</script>

<style scoped lang="scss">
.wechat-log-page {
  display: grid;
  gap: 18px;
}
.filter-card {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto auto;
  gap: 12px;
  padding: 16px;
}
.table-card {
  padding: 14px;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.empty-text {
  color: #94a3b8;
}
@media (max-width: 1200px) {
  .filter-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .filter-card {
    grid-template-columns: 1fr;
  }
}
</style>

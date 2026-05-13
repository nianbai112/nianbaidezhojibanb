<template>
  <div class="page-shell">
    <PageHeader title="漂流瓶" subtitle="管理漂流瓶内容和举报" icon="MagicStick" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="漂流瓶列表" name="list">
        <div class="tab-toolbar">
          <el-input v-model="filters.keyword" placeholder="搜索内容" clearable style="width:200px" @keyup.enter="loadList" />
          <el-button @click="loadList" :loading="loading">刷新</el-button>
        </div>
        <el-table :data="items" v-loading="loading" stripe>
          <el-table-column prop="id" label="ID" width="100" show-overflow-tooltip />
          <el-table-column prop="user.nickname" label="发布者" width="120">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
          <el-table-column prop="pickCount" label="拾取次数" width="100" />
          <el-table-column prop="replyCount" label="回复次数" width="100" />
          <el-table-column prop="createdAt" label="发布时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-popconfirm title="确定删除？" @confirm="deleteItem(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadList" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="举报处理" name="reports">
        <div class="tab-toolbar">
          <el-select v-model="reportFilters.status" clearable placeholder="状态" style="width:140px" @change="loadReports">
            <el-option label="待处理" value="pending" />
            <el-option label="已处理" value="handled" />
          </el-select>
          <el-button @click="loadReports" :loading="reportLoading">刷新</el-button>
        </div>
        <el-table :data="reportItems" v-loading="reportLoading" stripe>
          <el-table-column prop="reporter.nickname" label="举报人" width="120">
            <template #default="{ row }">{{ row.reporter?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="detail" label="举报详情" min-width="200" show-overflow-tooltip />
          <el-table-column prop="reason" label="举报原因" width="150" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'pending' ? 'warning' : 'success'" size="small">
                {{ row.status === 'pending' ? '待处理' : '已处理' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="举报时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button size="small" type="success" link @click="handleReport(row.id, 'resolved')">处理</el-button>
                <el-button size="small" type="info" link @click="handleReport(row.id, 'ignored')">忽略</el-button>
              </template>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="reportPage" v-model:page-size="reportPageSize" :total="reportTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadReports" />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const activeTab = ref('list')
const formatDate = (d: string) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const items = ref<any[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '' })

const reportItems = ref<any[]>([])
const reportLoading = ref(false)
const reportPage = ref(1)
const reportPageSize = ref(20)
const reportTotal = ref(0)
const reportFilters = reactive({ status: '' })

async function loadList() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value, ...filters }
    const res: any = await request.get('/admin/drift-bottles', { params })
    items.value = res.list || res.data?.list || []
    total.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); items.value = [] }
  finally { loading.value = false }
}

async function deleteItem(id: string) {
  try {
    await request.delete(`/admin/drift-bottles/${id}`)
    ElMessage.success('已删除')
    loadList()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadReports() {
  reportLoading.value = true
  try {
    const params = { page: reportPage.value, pageSize: reportPageSize.value, ...reportFilters }
    const res: any = await request.get('/admin/drift-bottles/reports', { params })
    reportItems.value = res.list || res.data?.list || []
    reportTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); reportItems.value = [] }
  finally { reportLoading.value = false }
}

async function handleReport(id: string, action: string) {
  try {
    await request.post(`/admin/drift-bottles/reports/${id}/handle`, { action })
    ElMessage.success('已处理')
    loadReports()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

function handleTabChange() {
  if (activeTab.value === 'list') loadList()
  else loadReports()
}

onMounted(() => { loadList() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

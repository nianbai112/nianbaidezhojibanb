<template>
  <div class="page-shell">
    <PageHeader title="黑名单/处罚" subtitle="只展示已封禁、已禁言等处罚用户，正常用户不进入此列表" icon="Lock" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索用户ID/昵称" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="处罚状态" style="width: 140px" @change="loadData">
        <el-option label="全部处罚" value="punished" />
        <el-option label="已封禁" value="BANNED" />
        <el-option label="已禁言" value="INACTIVE" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="nickname" label="用户" width="120">
        <template #default="{ row }">{{ row.nickname || row.userId }}</template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" width="120" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="muteReason" label="封禁原因" min-width="150" show-overflow-tooltip />
      <el-table-column prop="muteEndAt" label="封禁截止" width="170">
        <template #default="{ row }">{{ row.muteEndAt ? new Date(row.muteEndAt).toLocaleString('zh-CN') : '-' }}</template>
      </el-table-column>
      <el-table-column prop="createdAt" label="注册时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="success" @click="restoreUser(row)">解除处罚</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const statusMap: Record<string, string> = {
  active: '正常',
  ACTIVE: '正常',
  banned: '已封禁',
  BANNED: '已封禁',
  disabled: '已禁言',
  inactive: '已禁言',
  INACTIVE: '已禁言',
  deleted: '已删除',
  DELETED: '已删除'
}
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: 'punished' })

const statusLabel = (status: string) => statusMap[status] || status || '-'
const statusTagType = (status: string) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'banned') return 'danger'
  if (normalized === 'disabled' || normalized === 'inactive') return 'warning'
  return 'info'
}

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/users', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: 'punished' })
  loadData()
}

const restoreUser = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定解除「${row.nickname || row.id}」的处罚？`, '解除处罚', {
      type: 'warning',
      confirmButtonText: '解除',
      cancelButtonText: '取消'
    })
    await request.put(`/admin/users/${row.id}/ban`, { banned: false, reason: '后台解除处罚' })
    ElMessage.success('已解除处罚')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '解除失败')
  }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

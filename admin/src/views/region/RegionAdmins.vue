<template>
  <div class="page-shell">
    <PageHeader title="区域管理员" subtitle="管理各区域的管理员账号" icon="User" />
    <div class="filter-bar">
      <el-button type="primary" @click="loadData">刷新</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="user.nickname" label="管理员" width="120">
        <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
      </el-table-column>
      <el-table-column prop="role.name" label="角色" width="120">
        <template #default="{ row }">{{ row.role?.name || row.roleId }}</template>
      </el-table-column>
      <el-table-column prop="region.name" label="所属区域" width="150">
        <template #default="{ row }">{{ row.region?.name || row.regionId || '全局' }}</template>
      </el-table-column>
      <el-table-column prop="createdAt" label="分配时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/admins', { params: { page: page.value, pageSize: pageSize.value } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

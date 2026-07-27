<template>
  <div class="page-shell">
    <PageHeader title="区域管理员" subtitle="管理各区域的管理员账号" icon="User" />
    <div class="filter-bar">
      <el-button type="primary" @click="loadData">刷新</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="adminName" label="负责人" min-width="140">
        <template #default="{ row }">{{ row.adminName || row.username }}</template>
      </el-table-column>
      <el-table-column prop="username" label="后台账号" min-width="140" />
      <el-table-column prop="phone" label="手机号" min-width="120" />
      <el-table-column prop="roleName" label="角色" min-width="120">
        <template #default="{ row }">{{ row.roleName || row.roleCode }}</template>
      </el-table-column>
      <el-table-column prop="regionName" label="负责区域" min-width="160">
        <template #default="{ row }">{{ row.regionName || row.regionId || '全局' }}</template>
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
    const accounts = res?.list || res?.data?.list || []
    list.value = accounts.flatMap((account: any) => {
      const roles = Array.isArray(account.roles) ? account.roles : []
      const regionRoles = roles.filter((role: any) => role.regionId || ['region_manager', 'region_admin', 'REGION_ADMIN'].includes(String(role.code || '')))
      return regionRoles.map((role: any) => ({
        id: `${account.id}_${role.id}_${role.regionId || 'global'}`,
        accountId: account.id,
        username: account.username,
        adminName: account.realName || account.username,
        phone: account.phone || '',
        roleId: role.id,
        roleName: role.name,
        roleCode: role.code,
        regionId: role.regionId || account.regionId || '',
        regionName: role.regionName || account.regionName || '',
        createdAt: account.createdAt
      }))
    })
    total.value = list.value.length
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

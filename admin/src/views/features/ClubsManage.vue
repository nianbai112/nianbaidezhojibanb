<template>
  <div class="page-shell">
    <PageHeader title="社团俱乐部" subtitle="管理社团、成员和社团活动" icon="UserFilled" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="社团列表" name="clubs">
        <div class="tab-toolbar">
          <el-input v-model="clubFilters.keyword" placeholder="搜索社团" clearable style="width:180px" @keyup.enter="loadClubs" />
          <el-select v-model="clubFilters.status" clearable placeholder="状态" style="width:120px" @change="loadClubs">
            <el-option label="正常" value="active" />
            <el-option label="已关闭" value="closed" />
            <el-option label="待审核" value="pending" />
          </el-select>
          <el-button type="primary" @click="openClubDialog()">创建社团</el-button>
          <el-button @click="loadClubs" :loading="clubLoading">刷新</el-button>
        </div>
        <el-table :data="clubs" v-loading="clubLoading" stripe>
          <el-table-column prop="name" label="社团名称" width="180" />
          <el-table-column prop="leaderId" label="社长ID" width="120" />
          <el-table-column prop="memberCount" label="成员数" width="80" />
          <el-table-column prop="description" label="简介" min-width="200" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : row.status === 'closed' ? 'info' : 'warning'" size="small">
                {{ row.status === 'active' ? '正常' : row.status === 'closed' ? '已关闭' : '待审核' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="250" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="viewClub(row)">详情</el-button>
              <el-button size="small" type="primary" link @click="openClubDialog(row)">编辑</el-button>
              <el-button v-if="row.status === 'pending'" size="small" type="success" link @click="setClubStatus(row.id, 'active')">审核通过</el-button>
              <el-button v-if="row.status === 'active'" size="small" type="warning" link @click="setClubStatus(row.id, 'closed')">关闭</el-button>
              <el-popconfirm title="确定删除？" @confirm="deleteClub(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="clubPage" v-model:page-size="clubPageSize" :total="clubTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadClubs" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="成员管理" name="members">
        <div class="tab-toolbar">
          <el-select v-model="memberClubId" placeholder="选择社团" style="width:200px" @change="loadMembers">
            <el-option v-for="c in allClubs" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-button @click="loadMembers" :loading="memberLoading" :disabled="!memberClubId">刷新</el-button>
        </div>
        <el-table :data="members" v-loading="memberLoading" stripe>
          <el-table-column prop="userId" label="用户ID" width="120" />
          <el-table-column prop="role" label="角色" width="100">
            <template #default="{ row }">
              <el-tag :type="row.role === 'owner' ? 'danger' : row.role === 'admin' ? 'warning' : 'info'" size="small">
                {{ row.role === 'owner' ? '社长' : row.role === 'admin' ? '管理员' : '成员' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="加入时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-popconfirm v-if="row.role !== 'owner'" title="确定移除此成员？" @confirm="removeMember(row.id)">
                <template #reference><el-button size="small" type="danger" link>移除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="memberPage" v-model:page-size="memberPageSize" :total="memberTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadMembers" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showClubDialog" :title="editingClub ? '编辑社团' : '创建社团'" width="600px" destroy-on-close>
      <el-form :model="clubForm" label-width="100px">
        <el-form-item label="社团名称" required><el-input v-model="clubForm.name" /></el-form-item>
        <el-form-item label="简介"><el-input v-model="clubForm.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="封面图"><el-input v-model="clubForm.coverImage" /></el-form-item>
        <el-form-item label="最大成员数"><el-input-number v-model="clubForm.maxMembers" :min="1" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showClubDialog = false">取消</el-button>
        <el-button type="primary" @click="saveClub" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDetailDialog" title="社团详情" width="700px">
      <el-descriptions :column="2" border v-if="clubDetail">
        <el-descriptions-item label="社团名称">{{ clubDetail.name }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="clubDetail.status === 'active' ? 'success' : 'info'" size="small">
            {{ clubDetail.status === 'active' ? '正常' : clubDetail.status }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="社长ID">{{ clubDetail.leaderId ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="成员数">{{ clubDetail.memberCount ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="简介" :span="2">{{ clubDetail.description || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(clubDetail.createdAt) }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const activeTab = ref('clubs')
const saving = ref(false)
const formatDate = (d: string) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const clubs = ref<any[]>([])
const allClubs = ref<any[]>([])
const clubLoading = ref(false)
const clubPage = ref(1)
const clubPageSize = ref(20)
const clubTotal = ref(0)
const clubFilters = reactive({ keyword: '', status: '' })

const showClubDialog = ref(false)
const editingClub = ref<any>(null)
const clubForm = reactive({ name: '', description: '', coverImage: '', maxMembers: 200 })

const showDetailDialog = ref(false)
const clubDetail = ref<any>(null)

const members = ref<any[]>([])
const memberLoading = ref(false)
const memberClubId = ref('')
const memberPage = ref(1)
const memberPageSize = ref(20)
const memberTotal = ref(0)

async function loadClubs() {
  clubLoading.value = true
  try {
    const params = { page: clubPage.value, pageSize: clubPageSize.value, ...clubFilters }
    const res: any = await request.get('/admin/clubs', { params })
    clubs.value = res.list || res.data?.list || []
    clubTotal.value = res.total || res.data?.total || 0
    allClubs.value = clubs.value
  } catch (e: any) {
    console.error('加载社团失败', e)
    ElMessage.warning(e?.message || '加载社团列表失败')
    clubs.value = []
  }
  finally { clubLoading.value = false }
}

function openClubDialog(row?: any) {
  editingClub.value = row || null
  if (row) {
    Object.assign(clubForm, { name: row.name, description: row.description || '', coverImage: row.coverImage || '', maxMembers: row.maxMembers || 200 })
  } else {
    Object.assign(clubForm, { name: '', description: '', coverImage: '', maxMembers: 200 })
  }
  showClubDialog.value = true
}

async function saveClub() {
  saving.value = true
  try {
    if (editingClub.value) {
      await request.put(`/admin/clubs/${editingClub.value.id}`, clubForm)
    } else {
      await request.post('/admin/clubs', clubForm)
    }
    ElMessage.success('保存成功')
    showClubDialog.value = false
    loadClubs()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存社团失败')
  } finally { saving.value = false }
}

async function viewClub(row: any) {
  try {
    const res: any = await request.get(`/admin/clubs/${row.id}`)
    clubDetail.value = res || row
  } catch (e: any) {
    console.error('加载社团详情失败', e)
    clubDetail.value = row
    ElMessage.warning('加载社团详情不完整')
  }
  showDetailDialog.value = true
}

async function setClubStatus(id: string, status: string) {
  try {
    await request.put(`/admin/clubs/${id}/status`, { status })
    ElMessage.success('操作成功')
    loadClubs()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

async function deleteClub(id: string) {
  try {
    await request.delete(`/admin/clubs/${id}`)
    ElMessage.success('已删除')
    loadClubs()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败')
  }
}

async function loadMembers() {
  if (!memberClubId.value) return
  memberLoading.value = true
  try {
    const params = { page: memberPage.value, pageSize: memberPageSize.value }
    const res: any = await request.get(`/admin/clubs/${memberClubId.value}/members`, { params })
    members.value = res.list || res.data?.list || []
    memberTotal.value = res.total || res.data?.total || 0
  } catch (e: any) {
    console.error('加载成员失败', e)
    ElMessage.warning(e?.message || '加载成员列表失败')
    members.value = []
  }
  finally { memberLoading.value = false }
}

async function removeMember(id: string) {
  try {
    await request.delete(`/admin/club-members/${id}`)
    ElMessage.success('已移除')
    loadMembers()
  } catch (e: any) {
    ElMessage.error(e?.message || '移除成员失败')
  }
}

function handleTabChange() {
  if (activeTab.value === 'clubs') loadClubs()
  else if (activeTab.value === 'members') {
    if (allClubs.value.length === 0) loadClubs()
    if (memberClubId.value) loadMembers()
  }
}

onMounted(() => { loadClubs() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

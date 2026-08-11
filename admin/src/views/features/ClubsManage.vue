<template>
  <div class="page-shell">
    <PageHeader title="社团俱乐部" subtitle="管理社团、成员和社团活动" icon="UserFilled" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="社团列表" name="clubs">
        <div class="tab-toolbar">
          <el-select v-model="clubFilters.regionId" clearable placeholder="区域" style="width:180px" @change="loadClubs">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-input v-model="clubFilters.keyword" placeholder="搜索社团" clearable style="width:180px" @keyup.enter="loadClubs" />
          <el-select v-model="clubFilters.status" clearable placeholder="状态" style="width:120px" @change="loadClubs">
            <el-option label="正常" value="active" />
            <el-option label="已关闭" value="closed" />
            <el-option label="待审核" value="pending" />
          </el-select>
          <el-button v-if="hasEditPermission" type="primary" @click="openClubDialog()">创建社团</el-button>
          <el-button @click="loadClubs" :loading="clubLoading">刷新</el-button>
        </div>

        <el-table :data="clubs" v-loading="clubLoading" stripe>
          <el-table-column label="社团" min-width="260">
            <template #default="{ row }">
              <div class="club-cell">
                <el-image v-if="row.logo || row.cover" :src="row.logo || row.cover" fit="cover" class="club-logo" />
                <div v-else class="club-logo club-logo-empty">社</div>
                <div class="club-info">
                  <div class="cell-title">{{ row.name }}</div>
                  <div class="cell-sub">{{ row.region?.name || '全部区域' }} · {{ row.description || '暂无简介' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="leaderId" label="社长ID" width="140" show-overflow-tooltip />
          <el-table-column label="成员数" width="90">
            <template #default="{ row }">{{ row.memberCount ?? row._count?.members ?? 0 }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
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
              <el-button v-if="hasEditPermission" size="small" type="primary" link @click="openClubDialog(row)">编辑</el-button>
              <el-button v-if="hasEditPermission && row.status === 'pending'" size="small" type="success" link @click="setClubStatus(row.id, 'active')">审核通过</el-button>
              <el-button v-if="hasEditPermission && row.status === 'active'" size="small" type="warning" link @click="setClubStatus(row.id, 'closed')">关闭</el-button>
              <el-popconfirm v-if="hasDeletePermission" title="确定删除？" @confirm="deleteClub(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="clubPage"
            v-model:page-size="clubPageSize"
            :total="clubTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @change="loadClubs"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="成员管理" name="members">
        <div class="tab-toolbar">
          <el-select v-model="memberClubId" placeholder="选择社团" style="width:240px" @change="loadMembers">
            <el-option v-for="c in allClubs" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-button @click="loadMembers" :loading="memberLoading" :disabled="!memberClubId">刷新</el-button>
        </div>
        <el-table :data="members" v-loading="memberLoading" stripe>
          <el-table-column label="用户" min-width="220">
            <template #default="{ row }">
              <div class="club-cell">
                <el-avatar :src="row.user?.avatar" :size="34">{{ row.user?.nickname?.slice?.(0, 1) || '用' }}</el-avatar>
                <div>
                  <div class="cell-title">{{ row.user?.nickname || row.userId }}</div>
                  <div class="cell-sub">{{ row.userId }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="role" label="角色" width="110">
            <template #default="{ row }">
              <el-tag :type="row.role === 'leader' || row.role === 'owner' ? 'danger' : row.role === 'admin' ? 'warning' : 'info'" size="small">
                {{ row.role === 'leader' || row.role === 'owner' ? '社长' : row.role === 'admin' ? '管理员' : '成员' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="加入时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-popconfirm v-if="row.role !== 'owner' && row.role !== 'leader'" title="确定移除此成员？" @confirm="removeMember(row.id)">
                <template #reference><el-button size="small" type="danger" link>移除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="memberPage"
            v-model:page-size="memberPageSize"
            :total="memberTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @change="loadMembers"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showClubDialog" :title="editingClub ? '编辑社团' : '创建社团'" width="760px" destroy-on-close>
      <el-form :model="clubForm" label-width="100px">
        <el-form-item label="所属区域">
          <el-select v-model="clubForm.regionId" clearable placeholder="不选则全区域可见" style="width:100%">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="社团名称" required><el-input v-model="clubForm.name" /></el-form-item>
        <el-form-item label="社长ID">
          <el-input v-model="clubForm.leaderId" placeholder="可选；不填则用当前管理员作为后台创建人" />
        </el-form-item>
        <el-form-item label="视觉素材">
          <div class="upload-grid">
            <ImageUploadBox v-model="clubForm.logo" scene="club-logo" shape="square" placeholder="上传 Logo" tip="建议 200x200" />
            <ImageUploadBox v-model="clubForm.cover" scene="club-cover" shape="wide" placeholder="上传封面" tip="建议 750x350" />
          </div>
        </el-form-item>
        <el-form-item label="简介"><el-input v-model="clubForm.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="地点/电话">
          <div class="inline-field">
            <el-input v-model="clubForm.location" placeholder="社团活动地点" />
            <el-input v-model="clubForm.phone" placeholder="联系电话" />
          </div>
        </el-form-item>
        <el-form-item label="运营状态">
          <div class="inline-field">
            <el-select v-model="clubForm.status" style="width:180px">
              <el-option label="正常" value="active" />
              <el-option label="待审核" value="pending" />
              <el-option label="已关闭" value="closed" />
            </el-select>
            <el-switch v-model="clubForm.isOfficial" active-text="官方社团" inactive-text="普通社团" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showClubDialog = false">取消</el-button>
        <el-button type="primary" @click="saveClub" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDetailDialog" title="社团详情" width="760px">
      <el-descriptions :column="2" border v-if="clubDetail">
        <el-descriptions-item label="社团名称">{{ clubDetail.name }}</el-descriptions-item>
        <el-descriptions-item label="区域">{{ clubDetail.region?.name || '全部区域' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="clubDetail.status === 'active' ? 'success' : 'info'" size="small">
            {{ clubDetail.status === 'active' ? '正常' : clubDetail.status }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="社长ID">{{ clubDetail.leaderId ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="成员数">{{ clubDetail.memberCount ?? clubDetail.members?.length ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ clubDetail.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="简介" :span="2">{{ clubDetail.description || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(clubDetail.createdAt) }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('club:list') || auth.permissions.includes('club:edit'))
const hasDeletePermission = ref(auth.permissions.includes('club:edit'))

const activeTab = ref('clubs')
const saving = ref(false)
const formatDate = (d: string) => (d ? new Date(d).toLocaleString('zh-CN') : '-')

const regions = ref<any[]>([])
const clubs = ref<any[]>([])
const allClubs = ref<any[]>([])
const clubLoading = ref(false)
const clubPage = ref(1)
const clubPageSize = ref(20)
const clubTotal = ref(0)
const clubFilters = reactive({ keyword: '', status: '', regionId: '' })

const showClubDialog = ref(false)
const editingClub = ref<any>(null)
const clubForm = reactive({
  regionId: '',
  name: '',
  logo: '',
  cover: '',
  description: '',
  leaderId: '',
  phone: '',
  location: '',
  status: 'active',
  isOfficial: false,
  sortOrder: 0,
})

const showDetailDialog = ref(false)
const clubDetail = ref<any>(null)

const members = ref<any[]>([])
const memberLoading = ref(false)
const memberClubId = ref('')
const memberPage = ref(1)
const memberPageSize = ref(20)
const memberTotal = ref(0)

function unwrapPage(res: any) {
  if (Array.isArray(res)) return { list: res, total: res.length }
  return { list: res?.list || res?.data?.list || [], total: res?.total || res?.data?.total || 0 }
}

async function loadRegions() {
  try {
    const res: any = await request.get('/admin/regions', { params: { page: 1, pageSize: 100 } })
    regions.value = unwrapPage(res).list
  } catch (e: any) {
    ElMessage.error(e?.message || '加载区域失败')
    regions.value = []
  }
}

async function loadClubs() {
  clubLoading.value = true
  try {
    const params = { page: clubPage.value, pageSize: clubPageSize.value, ...clubFilters }
    const res: any = await request.get('/admin/clubs', { params })
    const pageData = unwrapPage(res)
    clubs.value = pageData.list
    clubTotal.value = pageData.total
    allClubs.value = pageData.list
  } catch (e: any) {
    ElMessage.error(e?.message || '加载社团列表失败')
    clubs.value = []
  } finally {
    clubLoading.value = false
  }
}

function openClubDialog(row?: any) {
  editingClub.value = row || null
  Object.assign(
    clubForm,
    row
      ? {
          regionId: row.regionId || '',
          name: row.name || '',
          logo: row.logo || '',
          cover: row.cover || row.coverImage || '',
          description: row.description || '',
          leaderId: row.leaderId || '',
          phone: row.phone || '',
          location: row.location || '',
          status: row.status || 'active',
          isOfficial: Boolean(row.isOfficial),
          sortOrder: row.sortOrder || 0,
        }
      : {
          regionId: clubFilters.regionId || '',
          name: '',
          logo: '',
          cover: '',
          description: '',
          leaderId: '',
          phone: '',
          location: '',
          status: 'active',
          isOfficial: false,
          sortOrder: 0,
        },
  )
  showClubDialog.value = true
}

function buildClubPayload() {
  return {
    regionId: clubForm.regionId || undefined,
    name: clubForm.name.trim(),
    logo: clubForm.logo || undefined,
    cover: clubForm.cover || undefined,
    description: clubForm.description || undefined,
    leaderId: clubForm.leaderId || undefined,
    phone: clubForm.phone || undefined,
    location: clubForm.location || undefined,
    status: clubForm.status || 'active',
    isOfficial: clubForm.isOfficial,
    sortOrder: clubForm.sortOrder || 0,
  }
}

async function saveClub() {
  if (!clubForm.name.trim()) {
    ElMessage.warning('请输入社团名称')
    return
  }
  saving.value = true
  try {
    const payload = buildClubPayload()
    if (editingClub.value) {
      await request.put(`/admin/clubs/${editingClub.value.id}`, payload)
    } else {
      await request.post('/admin/clubs', payload)
    }
    ElMessage.success('保存成功')
    showClubDialog.value = false
    loadClubs()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存社团失败')
  } finally {
    saving.value = false
  }
}

async function viewClub(row: any) {
  try {
    clubDetail.value = (await request.get(`/admin/clubs/${row.id}`)) || row
  } catch (e: any) {
    clubDetail.value = row
    ElMessage.warning(e?.message || '加载社团详情不完整')
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
    const pageData = unwrapPage(res)
    members.value = pageData.list
    memberTotal.value = pageData.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载成员列表失败')
    members.value = []
  } finally {
    memberLoading.value = false
  }
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

onMounted(async () => {
  await loadRegions()
  await loadClubs()
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.club-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.club-logo { width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0; background: #eef5ff; }
.club-logo-empty { display: flex; align-items: center; justify-content: center; color: #8aa4c7; font-size: 13px; font-weight: 600; }
.club-info { min-width: 0; }
.cell-title { font-weight: 600; color: #1f2d3d; }
.cell-sub { max-width: 420px; margin-top: 4px; color: #8a98ac; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.upload-grid { display: grid; grid-template-columns: 180px 1fr; gap: 16px; width: 100%; }
.inline-field { display: flex; width: 100%; gap: 10px; align-items: center; }
.inline-field .el-input { flex: 1; }
</style>

<template>
  <div class="page-shell">
    <PageHeader title="爆照评选" subtitle="管理评选活动、作品审核、投票记录和获奖" icon="Camera" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="活动管理" name="contests">
        <div class="tab-toolbar">
          <el-button type="primary" @click="openContestDialog()">新建活动</el-button>
          <el-button @click="loadContests" :loading="contestLoading">刷新</el-button>
        </div>
        <el-table :data="contests" v-loading="contestLoading" stripe>
          <el-table-column prop="title" label="活动标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="regionId" label="区域ID" width="120">
            <template #default="{ row }">{{ row.regionId || '-' }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : row.status === 'ended' ? 'info' : 'warning'" size="small">
                {{ row.status === 'active' ? '进行中' : row.status === 'ended' ? '已结束' : row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="作品数" width="80">
            <template #default="{ row }">{{ row._count?.entries ?? 0 }}</template>
          </el-table-column>
          <el-table-column prop="startAt" label="开始时间" width="170">
            <template #default="{ row }">{{ formatDate(row.startAt) }}</template>
          </el-table-column>
          <el-table-column prop="endAt" label="结束时间" width="170">
            <template #default="{ row }">{{ formatDate(row.endAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openContestDialog(row)">编辑</el-button>
              <el-button size="small" type="warning" link @click="viewWinners(row)">获奖</el-button>
              <el-popconfirm title="确定删除？" @confirm="deleteContest(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="作品审核" name="entries">
        <div class="tab-toolbar">
          <el-select v-model="entryFilters.status" clearable placeholder="状态" style="width:120px" @change="loadEntries">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
          </el-select>
          <el-button @click="loadPendingEntries" :loading="entryLoading">待审核</el-button>
          <el-button @click="loadEntries" :loading="entryLoading">全部</el-button>
        </div>
        <el-table :data="entries" v-loading="entryLoading" stripe>
          <el-table-column prop="user.nickname" label="用户" width="120">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="imageUrl" label="照片" width="100">
            <template #default="{ row }">
              <el-image v-if="row.imageUrl" :src="row.imageUrl" style="width:60px;height:60px;border-radius:8px" fit="cover" :preview-src-list="[row.imageUrl]" />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column prop="contest.title" label="所属活动" width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.contest?.title || '-' }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'" size="small">
                {{ row.status === 'approved' ? '已通过' : row.status === 'rejected' ? '已拒绝' : '待审核' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="voteCount" label="票数" width="70" />
          <el-table-column prop="createdAt" label="提交时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button size="small" type="success" link @click="auditEntry(row.id, 'approved')">通过</el-button>
                <el-button size="small" type="danger" link @click="auditEntry(row.id, 'rejected')">拒绝</el-button>
              </template>
              <el-popconfirm title="确定删除？" @confirm="deleteEntry(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="entryPage" v-model:page-size="entryPageSize" :total="entryTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadEntries" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="投票/评分记录" name="ratings">
        <div class="tab-toolbar">
          <el-button @click="loadRatings" :loading="ratingLoading">刷新</el-button>
        </div>
        <el-table :data="ratings" v-loading="ratingLoading" stripe>
          <el-table-column prop="user.nickname" label="用户" width="120">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="entry.title" label="作品" width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.entry?.title || '-' }}</template>
          </el-table-column>
          <el-table-column prop="rating" label="评分" width="100">
            <template #default="{ row }">
              <el-rate :model-value="row.rating" disabled show-score text-color="#ff9900" />
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'" size="small">
                {{ row.status === 'approved' ? '有效' : row.status === 'rejected' ? '已拒绝' : '待审核' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'pending'" size="small" type="success" link @click="auditRating(row.id, 'approved')">有效</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="ratingPage" v-model:page-size="ratingPageSize" :total="ratingTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadRatings" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="获奖名单" name="winners">
        <div class="tab-toolbar">
          <el-button @click="loadWinners" :loading="winnerLoading">刷新</el-button>
        </div>
        <el-table :data="winners" v-loading="winnerLoading" stripe>
          <el-table-column prop="entry.user.nickname" label="获奖者" width="120">
            <template #default="{ row }">{{ row.entry?.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="entry.imageUrl" label="照片" width="100">
            <template #default="{ row }">
              <el-image v-if="row.entry?.imageUrl" :src="row.entry.imageUrl" style="width:60px;height:60px;border-radius:8px" fit="cover" />
            </template>
          </el-table-column>
          <el-table-column prop="winnerRank" label="名次" width="80" />
          <el-table-column prop="prizeName" label="奖品" width="150" />
          <el-table-column prop="createdAt" label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-popconfirm title="确定删除？" @confirm="deleteWinner(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="区域配置" name="settings">
        <div class="tab-toolbar">
          <el-button type="primary" @click="saveRegionSettings" :loading="settingSaving">保存配置</el-button>
        </div>
        <el-form :model="regionSettingForm" label-width="140px" style="max-width:600px">
          <el-form-item label="启用爆照评选"><el-switch v-model="regionSettingForm.enableContest" /></el-form-item>
          <el-form-item label="每人最大参赛作品数"><el-input-number v-model="regionSettingForm.maxPhotosPerUser" :min="1" /></el-form-item>
          <el-form-item label="每人每天投票上限"><el-input-number v-model="regionSettingForm.maxVotesPerUserDaily" :min="1" /></el-form-item>
          <el-form-item label="需要审核"><el-switch v-model="regionSettingForm.requirePhotoApproval" /></el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showContestDialog" :title="editingContest ? '编辑活动' : '新建活动'" width="600px" destroy-on-close>
      <el-form :model="contestForm" label-width="100px">
        <el-form-item label="活动标题" required><el-input v-model="contestForm.title" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="contestForm.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="开始时间"><el-date-picker v-model="contestForm.startAt" type="datetime" style="width:100%" /></el-form-item>
        <el-form-item label="结束时间"><el-date-picker v-model="contestForm.endAt" type="datetime" style="width:100%" /></el-form-item>
        <el-form-item label="封面图"><el-input v-model="contestForm.cover" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showContestDialog = false">取消</el-button>
        <el-button type="primary" @click="saveContest" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const activeTab = ref('contests')
const saving = ref(false)
const formatDate = (d: string) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const contests = ref<any[]>([])
const contestLoading = ref(false)
const showContestDialog = ref(false)
const editingContest = ref<any>(null)
const contestForm = reactive({ title: '', description: '', startAt: '', endAt: '', cover: '' })

const entries = ref<any[]>([])
const entryLoading = ref(false)
const entryPage = ref(1)
const entryPageSize = ref(20)
const entryTotal = ref(0)
const entryFilters = reactive({ status: '' })

const ratings = ref<any[]>([])
const ratingLoading = ref(false)
const ratingPage = ref(1)
const ratingPageSize = ref(20)
const ratingTotal = ref(0)

const winners = ref<any[]>([])
const winnerLoading = ref(false)
const winnerContestId = ref('')

const regionSettingForm = reactive({ enableContest: true, maxPhotosPerUser: 3, maxVotesPerUserDaily: 10, requirePhotoApproval: true })
const settingSaving = ref(false)

async function loadContests() {
  contestLoading.value = true
  try {
    const res: any = await request.get('/admin/photo-contests')
    contests.value = Array.isArray(res) ? res : res.list || res.data?.list || res.data || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); contests.value = [] }
  finally { contestLoading.value = false }
}

function openContestDialog(row?: any) {
  editingContest.value = row || null
  if (row) {
    Object.assign(contestForm, { title: row.title, description: row.description || '', startAt: row.startAt, endAt: row.endAt, cover: row.cover || '' })
  } else {
    Object.assign(contestForm, { title: '', description: '', startAt: '', endAt: '', cover: '' })
  }
  showContestDialog.value = true
}

async function saveContest() {
  saving.value = true
  try {
    if (editingContest.value) {
      await request.put(`/admin/photo-contests/${editingContest.value.id}`, contestForm)
    } else {
      await request.post('/admin/photo-contests', contestForm)
    }
    ElMessage.success('保存成功')
    showContestDialog.value = false
    loadContests()
  } finally { saving.value = false }
}

async function deleteContest(id: string) {
  try {
    await request.delete(`/admin/photo-contests/${id}`)
    ElMessage.success('已删除')
    loadContests()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function viewWinners(row: any) {
  winnerContestId.value = row.id
  activeTab.value = 'winners'
  await loadWinners()
}

async function loadEntries() {
  entryLoading.value = true
  try {
    const params = { page: entryPage.value, pageSize: entryPageSize.value, ...entryFilters }
    const res: any = await request.get('/admin/photo-contests/entries', { params })
    entries.value = res.list || res.data?.list || []
    entryTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); entries.value = [] }
  finally { entryLoading.value = false }
}

async function loadPendingEntries() {
  entryLoading.value = true
  try {
    const res: any = await request.get('/admin/photo-contests/entries/pending')
    entries.value = res.list || res.data?.list || (Array.isArray(res) ? res : [])
    entryTotal.value = entries.value.length
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); entries.value = [] }
  finally { entryLoading.value = false }
}

async function auditEntry(id: string, status: string) {
  try {
    await request.put(`/admin/photo-contests/entries/${id}/audit`, { status })
    ElMessage.success('审核成功')
    loadEntries()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function deleteEntry(id: string) {
  try {
    await request.delete(`/admin/photo-contests/entries/${id}`)
    ElMessage.success('已删除')
    loadEntries()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadRatings() {
  ratingLoading.value = true
  try {
    const params = { page: ratingPage.value, pageSize: ratingPageSize.value }
    const res: any = await request.get('/admin/photo-contests/ratings', { params })
    ratings.value = res.list || res.data?.list || []
    ratingTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); ratings.value = [] }
  finally { ratingLoading.value = false }
}

async function auditRating(id: string, status: string) {
  try {
    await request.put(`/admin/photo-contests/ratings/${id}/audit`, { status })
    ElMessage.success('操作成功')
    loadRatings()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadWinners() {
  winnerLoading.value = true
  try {
    const url = winnerContestId.value ? `/admin/photo-contests/${winnerContestId.value}/winners` : '/admin/photo-contests/winners'
    const res: any = await request.get(url)
    winners.value = res.list || res.data?.list || (Array.isArray(res) ? res : [])
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); winners.value = [] }
  finally { winnerLoading.value = false }
}

async function deleteWinner(id: string) {
  try {
    await request.delete(`/admin/photo-contests/winners/${id}`)
    ElMessage.success('已删除')
    loadWinners()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadRegionSettings() {
  try {
    const res: any = await request.get('/admin/photo-contests/region-settings')
    if (res) Object.assign(regionSettingForm, res)
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function saveRegionSettings() {
  settingSaving.value = true
  try {
    await request.put('/admin/photo-contests/region-settings', regionSettingForm)
    ElMessage.success('保存成功')
  } finally { settingSaving.value = false }
}

function handleTabChange() {
  const loaders: Record<string, () => void> = {
    contests: loadContests, entries: loadEntries, ratings: loadRatings,
    winners: loadWinners, settings: loadRegionSettings,
  }
  loaders[activeTab.value]?.()
}

onMounted(() => { loadContests() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

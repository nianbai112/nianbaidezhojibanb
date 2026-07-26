<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 活动</p>
        <h2>活动管理</h2>
        <p>管理小程序活动报名、费用、封面和参与数据。</p>
      </div>
      <el-button type="primary" @click="openCreate">创建活动</el-button>
    </div>

    <div class="filter-card">
      <el-input v-model="filters.keyword" clearable placeholder="搜索活动名称" @keyup.enter="loadActivities" />
      <el-select v-model="filters.status" clearable placeholder="状态">
        <el-option label="未开始" value="upcoming" />
        <el-option label="报名中" value="signup" />
        <el-option label="进行中" value="ongoing" />
        <el-option label="已结束" value="ended" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
      <el-button type="primary" @click="loadActivities">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="data-card">
      <el-table :data="activities" v-loading="loading" empty-text="暂无真实活动数据">
        <el-table-column label="活动" min-width="260">
          <template #default="{ row }">
            <div class="media-cell">
              <el-image v-if="row.cover" :src="row.cover" fit="cover" class="thumb" />
              <div v-else class="thumb placeholder">活</div>
              <div>
                <strong>{{ row.title }}</strong>
                <p>{{ row.region?.name || row.location || '未设置区域/地点' }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="费用" width="100">
          <template #default="{ row }">{{ formatMoney(row.fee) }}</template>
        </el-table-column>
        <el-table-column label="参与/上限" width="120">
          <template #default="{ row }">{{ row.joinCount || row._count?.joins || 0 }} / {{ row.maxPeople || '不限' }}</template>
        </el-table-column>
        <el-table-column label="活动时间" min-width="240">
          <template #default="{ row }">{{ formatTime(row.startAt) }} 至 {{ formatTime(row.endAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editActivity(row)">编辑</el-button>
            <el-button size="small" @click="$router.push(`/marketing/activities/${row.id}/orders`)">订单</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadActivities"
          @size-change="loadActivities"
        />
      </div>
    </div>

    <el-dialog v-model="showDialog" :title="editingActivity ? '编辑活动' : '创建活动'" width="760px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="活动名称" required>
          <el-input v-model="form.title" placeholder="活动名称" />
        </el-form-item>
        <el-form-item label="封面图">
          <ImageUploadBox v-model="form.cover" scene="activity-cover" shape="wide" placeholder="上传活动封面" tip="建议 750x350px，可替换和删除" :max-size="5" />
        </el-form-item>
        <div class="dialog-grid">
          <el-form-item label="地点">
            <el-input v-model="form.location" placeholder="活动地点" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="form.status" style="width: 100%">
              <el-option label="未开始" value="upcoming" />
              <el-option label="报名中" value="signup" />
              <el-option label="进行中" value="ongoing" />
              <el-option label="已结束" value="ended" />
              <el-option label="已取消" value="cancelled" />
            </el-select>
          </el-form-item>
          <el-form-item label="最大人数">
            <el-input-number v-model="form.maxPeople" :min="0" />
          </el-form-item>
          <el-form-item label="费用">
            <el-input-number v-model="form.fee" :min="0" :precision="2" />
          </el-form-item>
        </div>
        <el-form-item label="活动时间" required>
          <el-date-picker
            v-model="form.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="活动描述">
          <el-input v-model="form.description" type="textarea" :rows="4" placeholder="活动介绍、报名须知、奖品说明等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submitActivity" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { request } from '@/api/request'
import { cleanPayload, dateRangeFrom, errorMessage, formatMoney, formatTime, unwrapPage } from './utils'

const loading = ref(false)
const submitting = ref(false)
const showDialog = ref(false)
const editingActivity = ref<any>(null)
const activities = ref<any[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const filters = reactive({ keyword: '', status: '' })

const form = reactive({
  title: '',
  description: '',
  cover: '',
  location: '',
  status: 'upcoming',
  dateRange: null as any,
  maxPeople: 0,
  fee: 0,
})

function statusType(status: string) {
  const map: Record<string, string> = { upcoming: 'info', signup: 'warning', ongoing: 'success', ended: '', cancelled: 'danger' }
  return map[status] || ''
}

function statusLabel(status: string) {
  const map: Record<string, string> = { upcoming: '未开始', signup: '报名中', ongoing: '进行中', ended: '已结束', cancelled: '已取消' }
  return map[status] || status || '-'
}

function resetForm() {
  Object.assign(form, {
    title: '',
    description: '',
    cover: '',
    location: '',
    status: 'upcoming',
    dateRange: null,
    maxPeople: 0,
    fee: 0,
  })
}

function openCreate() {
  editingActivity.value = null
  resetForm()
  showDialog.value = true
}

async function loadActivities() {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/activities', {
      params: { page: pagination.page, pageSize: pagination.pageSize, ...filters },
    })
    const page = unwrapPage(res)
    activities.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载活动失败'))
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  pagination.page = 1
  loadActivities()
}

function editActivity(activity: any) {
  editingActivity.value = activity
  Object.assign(form, {
    title: activity.title,
    description: activity.description || '',
    cover: activity.cover || '',
    location: activity.location || '',
    status: activity.status || 'upcoming',
    dateRange: dateRangeFrom(activity),
    maxPeople: Number(activity.maxPeople || 0),
    fee: Number(activity.fee || 0),
  })
  showDialog.value = true
}

async function submitActivity() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写活动名称')
    return
  }
  if (!form.dateRange?.[0] || !form.dateRange?.[1]) {
    ElMessage.warning('请选择活动时间')
    return
  }
  submitting.value = true
  try {
    const payload = cleanPayload({
      title: form.title.trim(),
      description: form.description,
      cover: form.cover,
      location: form.location,
      status: form.status,
      maxPeople: form.maxPeople,
      fee: form.fee,
      startAt: form.dateRange[0].toISOString(),
      endAt: form.dateRange[1].toISOString(),
    })
    if (editingActivity.value) {
      await request.put(`/admin/marketing/activities/${editingActivity.value.id}`, payload)
      ElMessage.success('活动已更新')
    } else {
      await request.post('/admin/marketing/activities', payload)
      ElMessage.success('活动已创建')
    }
    showDialog.value = false
    await loadActivities()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '保存活动失败'))
  } finally {
    submitting.value = false
  }
}

onMounted(loadActivities)
</script>

<style scoped>
.marketing-page { padding: 24px; }
.marketing-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.filter-card,
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 16px; box-shadow: 0 14px 36px rgba(37,99,235,.08); }
.filter-card { display: grid; grid-template-columns: minmax(220px, 1fr) 180px auto auto; gap: 12px; padding: 16px; margin-bottom: 18px; }
.data-card { padding: 18px; }
.media-cell { display: flex; align-items: center; gap: 12px; }
.media-cell strong { color: #0f172a; }
.media-cell p { margin: 4px 0 0; color: #64748b; }
.thumb { width: 52px; height: 52px; border-radius: 12px; object-fit: cover; background: #eff6ff; flex: none; }
.placeholder { display: grid; place-items: center; color: #2563eb; font-weight: 900; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
@media (max-width: 900px) {
  .filter-card { grid-template-columns: 1fr; }
  .dialog-grid { grid-template-columns: 1fr; }
}
</style>

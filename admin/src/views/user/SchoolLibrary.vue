<template>
  <div class="page-shell">
    <PageHeader title="学校库管理" subtitle="管理学校数据，绑定区域" icon="School" />

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">学校总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.enabled }}</div>
        <div class="stat-label">启用学校</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.bound }}</div>
        <div class="stat-label">已绑定区域</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.unbound }}</div>
        <div class="stat-label">未绑定学校</div>
      </div>
    </div>

    <!-- 搜索区 -->
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索学校名称" clearable style="width: 200px" @keyup.enter="loadData" />
      <el-select v-model="filters.type" placeholder="学校类型" clearable style="width: 140px">
        <el-option label="大学" value="university" />
        <el-option label="职院" value="college" />
        <el-option label="中学" value="highschool" />
        <el-option label="小学" value="primary" />
        <el-option label="其他" value="other" />
      </el-select>
      <el-input v-model="filters.city" placeholder="城市" clearable style="width: 120px" @keyup.enter="loadData" />
      <el-select v-model="filters.isEnabled" placeholder="状态" clearable style="width: 100px">
        <el-option label="启用" :value="true" />
        <el-option label="禁用" :value="false" />
      </el-select>
      <el-select v-model="filters.regionId" placeholder="所属区域" clearable style="width: 160px">
        <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
      </el-select>
      <el-button type="primary" @click="loadData">搜索</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <div style="flex:1" />
      <el-button type="primary" @click="openCreate">新增学校</el-button>
      <el-button @click="loadData">刷新</el-button>
    </div>

    <!-- 表格 -->
    <el-table :data="list" v-loading="loading" border stripe style="width: 100%">
      <el-table-column prop="name" label="学校名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="shortName" label="简称" width="100" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="80">
        <template #default="{ row }">{{ typeLabel(row.type) }}</template>
      </el-table-column>
      <el-table-column label="省市区" min-width="150">
        <template #default="{ row }">{{ [row.province, row.city, row.district].filter(Boolean).join(' ') || '-' }}</template>
      </el-table-column>
      <el-table-column prop="campusName" label="校区" width="100" show-overflow-tooltip />
      <el-table-column prop="regionName" label="绑定区域" width="120" show-overflow-tooltip />
      <el-table-column prop="isEnabled" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isEnabled ? 'success' : 'danger'" size="small">{{ row.isEnabled ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="70" />
      <el-table-column prop="studentVerifyCount" label="认证数" width="80" />
      <el-table-column prop="updatedAt" label="更新时间" width="170">
        <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" :type="row.isEnabled ? 'warning' : 'success'" @click="toggleStatus(row)">
            {{ row.isEnabled ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="loadData"
        @size-change="loadData"
      />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="showDialog" :title="editingId ? '编辑学校' : '新增学校'" width="700px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="学校名称" required>
              <el-input v-model="form.name" placeholder="请输入学校名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="学校简称">
              <el-input v-model="form.shortName" placeholder="简称" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="学校类型">
              <el-select v-model="form.type" style="width: 100%">
                <el-option label="大学" value="university" />
                <el-option label="职院" value="college" />
                <el-option label="中学" value="highschool" />
                <el-option label="小学" value="primary" />
                <el-option label="其他" value="other" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="校区名称">
              <el-input v-model="form.campusName" placeholder="如：本部、南校区" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="省份">
              <el-input v-model="form.province" placeholder="省份" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="城市">
              <el-input v-model="form.city" placeholder="城市" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="区县">
              <el-input v-model="form.district" placeholder="区县" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="详细地址">
          <el-input v-model="form.address" placeholder="详细地址" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="经度">
              <el-input-number v-model="form.longitude" :precision="6" :step="0.000001" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="纬度">
              <el-input-number v-model="form.latitude" :precision="6" :step="0.000001" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="绑定区域">
              <el-select v-model="form.regionId" clearable placeholder="选择区域" style="width: 100%">
                <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="排序">
              <el-input-number v-model="form.sortOrder" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="启用">
              <el-switch v-model="form.isEnabled" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="Logo">
          <el-input v-model="form.logo" placeholder="Logo URL" />
        </el-form-item>
        <el-form-item label="封面">
          <el-input v-model="form.cover" placeholder="封面 URL" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { fetchSchools, fetchSchoolStats, createSchool, updateSchool, updateSchoolStatus, deleteSchool, fetchRegions } from '@/api/admin'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const loading = ref(false)
const submitting = ref(false)
const list = ref<any[]>([])
const regions = ref<any[]>([])
const showDialog = ref(false)
const editingId = ref<string | null>(null)

const stats = reactive({ total: 0, enabled: 0, bound: 0, unbound: 0 })

const filters = reactive({
  keyword: '',
  type: '',
  city: '',
  isEnabled: undefined as boolean | undefined,
  regionId: ''
})

const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const form = reactive({
  name: '',
  shortName: '',
  type: 'university',
  province: '',
  city: '',
  district: '',
  address: '',
  longitude: null as number | null,
  latitude: null as number | null,
  campusName: '',
  logo: '',
  cover: '',
  regionId: '',
  isEnabled: true,
  sortOrder: 0,
  remark: ''
})

const typeLabel = (type: string) => {
  const map: Record<string, string> = {
    university: '大学',
    college: '职院',
    highschool: '中学',
    middleschool: '初中',
    primary: '小学',
    other: '其他'
  }
  return map[type] || type
}

const formatDate = (d: string) => {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}

const resetFilters = () => {
  filters.keyword = ''
  filters.type = ''
  filters.city = ''
  filters.isEnabled = undefined
  filters.regionId = ''
  pagination.page = 1
  loadData()
}

const loadData = async () => {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: pagination.page,
      pageSize: pagination.pageSize
    }
    if (filters.keyword) params.keyword = filters.keyword
    if (filters.type) params.type = filters.type
    if (filters.city) params.city = filters.city
    if (filters.isEnabled !== undefined) params.isEnabled = filters.isEnabled
    if (filters.regionId) params.regionId = filters.regionId

    const res: any = await fetchSchools(params)
    list.value = res?.list || []
    pagination.total = res?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const res: any = await fetchSchoolStats()
    if (res) {
      stats.total = res.total || 0
      stats.enabled = res.enabled || 0
      stats.bound = res.bound || 0
      stats.unbound = res.unbound || 0
    }
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

const loadRegions = async () => {
  try {
    const res: any = await fetchRegions()
    regions.value = Array.isArray(res) ? res : (res?.list || [])
    const preferredId = String(
      route.query.regionId ||
      localStorage.getItem('LM_SELECTED_REGION_ID') ||
      localStorage.getItem('selectedRegionId') ||
      ''
    )
    if (preferredId && regions.value.some(r => String(r.id) === preferredId)) {
      filters.regionId = preferredId
      form.regionId = preferredId
      pagination.page = 1
      await loadData()
    }
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

const resetForm = () => {
  editingId.value = null
  form.name = ''
  form.shortName = ''
  form.type = 'university'
  form.province = ''
  form.city = ''
  form.district = ''
  form.address = ''
  form.longitude = null
  form.latitude = null
  form.campusName = ''
  form.logo = ''
  form.cover = ''
  form.regionId = ''
  form.isEnabled = true
  form.sortOrder = 0
  form.remark = ''
}

const openCreate = () => {
  resetForm()
  showDialog.value = true
}

const openEdit = (row: any) => {
  editingId.value = row.id
  form.name = row.name || ''
  form.shortName = row.shortName || ''
  form.type = row.type || 'university'
  form.province = row.province || ''
  form.city = row.city || ''
  form.district = row.district || ''
  form.address = row.address || ''
  form.longitude = row.longitude
  form.latitude = row.latitude
  form.campusName = row.campusName || ''
  form.logo = row.logo || ''
  form.cover = row.cover || ''
  form.regionId = row.regionId || ''
  form.isEnabled = row.isEnabled !== false
  form.sortOrder = row.sortOrder || 0
  form.remark = row.remark || ''
  showDialog.value = true
}

const submitForm = async () => {
  if (!form.name.trim()) {
    ElMessage.warning('请输入学校名称')
    return
  }
  submitting.value = true
  try {
    if (editingId.value) {
      await updateSchool(editingId.value, form)
      ElMessage.success('更新成功')
    } else {
      await createSchool(form)
      ElMessage.success('创建成功')
    }
    showDialog.value = false
    loadData()
    loadStats()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

const toggleStatus = async (row: any) => {
  try {
    await updateSchoolStatus(row.id, !row.isEnabled)
    ElMessage.success(row.isEnabled ? '已禁用' : '已启用')
    loadData()
    loadStats()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定删除学校「${row.name}」？`, '确认', { type: 'warning' })
    const res: any = await deleteSchool(row.id)
    ElMessage.success(res?.message || '删除成功')
    loadData()
    loadStats()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '删除失败')
  }
}

onMounted(() => {
  loadData()
  loadStats()
  loadRegions()
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.stats-row { display: flex; gap: 16px; margin-bottom: 16px; }
.stat-card {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  text-align: center;
}
.stat-value { font-size: 28px; font-weight: 700; color: #303133; }
.stat-label { font-size: 13px; color: #909399; margin-top: 4px; }
.filter-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

<template>
  <div class="page-shell">
    <PageHeader title="商家列表" subtitle="管理平台所有商家" icon="Shop" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索商家名称/联系人/手机号" clearable style="width: 260px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.regionId" placeholder="区域" clearable style="width: 150px" @change="loadData">
        <el-option v-for="r in regionList" :key="r.id" :label="r.name" :value="r.id" />
      </el-select>
      <el-select v-model="filters.categoryId" placeholder="分类" clearable style="width: 150px" @change="loadData">
        <el-option v-for="c in categoryList" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="filters.auditStatus" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待审核" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已拒绝" value="rejected" />
        <el-option label="已关闭" value="closed" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="success" @click="openEdit()">新增商家</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="logo" label="Logo" width="70">
        <template #default="{ row }">
          <el-image v-if="row.logo" :src="row.logo" style="width: 40px; height: 40px; border-radius: 4px;" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="商家名称" min-width="140" show-overflow-tooltip />
      <el-table-column prop="contactPerson" label="联系人" width="100" />
      <el-table-column prop="phone" label="手机号" width="120" />
      <el-table-column prop="regionName" label="区域" width="120" show-overflow-tooltip />
      <el-table-column prop="categoryName" label="分类" width="100" show-overflow-tooltip />
      <el-table-column prop="address" label="地址" min-width="150" show-overflow-tooltip />
      <el-table-column prop="score" label="评分" width="80">
        <template #default="{ row }">{{ row.score || row.rating || '-' }}</template>
      </el-table-column>
      <el-table-column prop="orderCount" label="销量" width="80">
        <template #default="{ row }">{{ row.orderCount || row.saleCount || 0 }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.auditStatus || row.status]" size="small">{{ statusMap[row.auditStatus || row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
          <el-button size="small" type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="row.auditStatus === 'pending'" size="small" type="success" @click="audit(row, 'approved')">通过</el-button>
          <el-button v-if="row.auditStatus === 'pending'" size="small" type="danger" @click="audit(row, 'rejected')">拒绝</el-button>
          <el-button v-if="row.auditStatus === 'approved'" size="small" type="warning" @click="toggleStatus(row)">关闭</el-button>
          <el-button v-if="row.auditStatus === 'closed'" size="small" type="success" @click="toggleStatus(row)">启用</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>

    <el-dialog v-model="editVisible" :title="editingId ? '编辑商家' : '新增商家'" width="650px" :close-on-click-modal="false">
      <el-form :model="form" label-width="100px" :rules="rules" ref="formRef">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="商家名称" prop="name"><el-input v-model="form.name" placeholder="请输入商家名称" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系人" prop="contactPerson"><el-input v-model="form.contactPerson" placeholder="请输入联系人" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="手机号" prop="phone"><el-input v-model="form.phone" placeholder="请输入手机号" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="form.status" placeholder="请选择状态" style="width: 100%">
                <el-option label="待审核" value="pending" />
                <el-option label="已通过" value="approved" />
                <el-option label="已拒绝" value="rejected" />
                <el-option label="已关闭" value="closed" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="区域" prop="regionId">
              <el-select v-model="form.regionId" placeholder="请选择区域" style="width: 100%" filterable>
                <el-option v-for="r in regionList" :key="r.id" :label="r.name" :value="r.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="分类" prop="categoryId">
              <el-select v-model="form.categoryId" placeholder="请选择分类" style="width: 100%" filterable>
                <el-option v-for="c in categoryList" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="地址" prop="address"><el-input v-model="form.address" placeholder="请输入地址" /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="经度"><el-input v-model="form.longitude" placeholder="经度" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="纬度"><el-input v-model="form.latitude" placeholder="纬度" /></el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="营业时间"><el-input v-model="form.businessHours" placeholder="例如 09:00-22:00" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="3" placeholder="商家描述" /></el-form-item>
        <el-form-item label="Logo">
          <ImageUploadBox v-model="form.logo" scene="merchant-logo" shape="square" placeholder="上传商家 Logo" tip="建议 200x200，可替换和删除" :max-size="2" />
        </el-form-item>
        <el-form-item label="封面">
          <ImageUploadBox v-model="form.cover" scene="merchant-cover" shape="wide" placeholder="上传商家封面" tip="建议 750x350，可替换和删除" :max-size="5" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="商家详情" width="600px">
      <el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="商家名称">{{ detail.name }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusMap[detail.status] || detail.status }}</el-descriptions-item>
        <el-descriptions-item label="联系人">{{ detail.contactPerson || '-' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ detail.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="区域">{{ detail.region?.name || detail.regionName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="分类">{{ detail.category?.name || detail.categoryName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="地址" :span="2">{{ detail.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="营业时间">{{ detail.businessHours || '-' }}</el-descriptions-item>
        <el-descriptions-item label="评分">{{ detail.rating || '-' }}</el-descriptions-item>
        <el-descriptions-item label="销量">{{ detail.saleCount || 0 }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(detail.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatDate(detail.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item label="描述" :span="2">{{ detail.description || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { getMerchants, createMerchant, updateMerchant, auditMerchant, updateMerchantStatus, getMerchantDetail } from '@/api/merchant'
import { getCategories } from '@/api/merchant'
import { fetchRegions } from '@/api/admin'
import { ElMessage, ElMessageBox } from 'element-plus'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

const statusMap: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝', closed: '已关闭' }
const statusTypeMap: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'danger', closed: 'info' }

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', regionId: '', categoryId: '', auditStatus: '' })
const regionList = ref<any[]>([])
const categoryList = ref<any[]>([])

const editVisible = ref(false)
const editingId = ref('')
const form = reactive<any>({ name: '', contactPerson: '', phone: '', regionId: '', categoryId: '', address: '', latitude: '', longitude: '', businessHours: '', description: '', logo: '', cover: '', status: 'pending' })
const formRef = ref<any>(null)
const rules = {
  name: [{ required: true, message: '请输入商家名称', trigger: 'blur' }],
  regionId: [{ required: true, message: '请选择区域', trigger: 'change' }],
  categoryId: [{ required: true, message: '请选择分类', trigger: 'change' }],
}

const detailVisible = ref(false)
const detail = ref<any>(null)

const formatDate = (d: any) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getMerchants({ page: page.value, pageSize: pageSize.value, ...filters })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载商家列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', regionId: '', categoryId: '', auditStatus: '' })
  page.value = 1
  loadData()
}

const loadOptions = async () => {
  try {
    regionList.value = await fetchRegions()
    const catRes: any = await getCategories()
    categoryList.value = catRes?.list || catRes?.data?.list || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载选项失败')
  }
}

const openEdit = (row?: any) => {
  editingId.value = row?.id || ''
  if (row) {
    Object.assign(form, {
      name: row.name || '', contactPerson: row.contactPerson || '', phone: row.phone || '',
      regionId: row.regionId || '', categoryId: row.categoryId || '', address: row.address || '',
      latitude: row.latitude || '', longitude: row.longitude || '', businessHours: row.businessHours || '',
      description: row.description || '', logo: row.logo || '', cover: row.cover || '', status: row.auditStatus || row.status || 'pending'
    })
  } else {
    Object.assign(form, { name: '', contactPerson: '', phone: '', regionId: '', categoryId: '', address: '', latitude: '', longitude: '', businessHours: '', description: '', logo: '', cover: '', status: 'pending' })
  }
  editVisible.value = true
}

const submitEdit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const payload = { ...form }
    if (payload.latitude) payload.latitude = Number(payload.latitude)
    if (payload.longitude) payload.longitude = Number(payload.longitude)
    if (editingId.value) {
      await updateMerchant(editingId.value, payload)
      ElMessage.success('更新成功')
    } else {
      await createMerchant(payload)
      ElMessage.success('创建成功')
    }
    editVisible.value = false
    loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  }
}

const audit = async (row: any, status: string) => {
  try {
    const msg = status === 'approved' ? '通过该商家申请？' : '拒绝该商家申请？'
    if (status === 'rejected') {
      const { value: remark } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝商家', { inputPlaceholder: '拒绝原因', type: 'warning' })
      await auditMerchant(row.id, { status, remark })
    } else {
      await ElMessageBox.confirm(msg, '确认', { type: 'warning' })
      await auditMerchant(row.id, { status })
    }
    ElMessage.success('操作成功')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

const toggleStatus = async (row: any) => {
  try {
    const target = row.auditStatus === 'approved' ? 'closed' : 'approved'
    const msg = target === 'closed' ? '关闭该商家？' : '启用该商家？'
    await ElMessageBox.confirm(msg, '确认', { type: 'warning' })
    await updateMerchantStatus(row.id, target)
    ElMessage.success('操作成功')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

const viewDetail = async (row: any) => {
  try {
    const res: any = await getMerchantDetail(row.id)
    detail.value = res?.data ?? res
    detailVisible.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '获取详情失败')
  }
}

onMounted(() => { loadData(); loadOptions() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.upload-wrap { display: flex; align-items: center; }
</style>

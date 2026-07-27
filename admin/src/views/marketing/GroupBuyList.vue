<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 团购</p>
        <h2>团购管理</h2>
        <p>真实读取团购套餐、库存、销量和商家/分类关联。</p>
      </div>
      <el-button type="primary" @click="openCreate">创建团购</el-button>
    </div>

    <div class="filter-card">
      <el-input v-model="filters.keyword" clearable placeholder="搜索团购名称" @keyup.enter="loadGroupBuys" />
      <el-select v-model="filters.status" clearable placeholder="状态">
        <el-option label="进行中" value="active" />
        <el-option label="已停用" value="inactive" />
      </el-select>
      <el-button type="primary" @click="loadGroupBuys">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="data-card">
      <el-table :data="groupBuys" v-loading="loading" empty-text="暂无真实团购数据">
        <el-table-column label="团购" min-width="270">
          <template #default="{ row }">
            <div class="media-cell">
              <el-image v-if="row.cover" :src="row.cover" fit="cover" class="thumb" />
              <div v-else class="thumb placeholder">团</div>
              <div>
                <strong>{{ row.name }}</strong>
                <p>{{ row.merchantName || row.Merchant?.name || '未绑定商家' }} · {{ row.categoryName || row.Category?.name || '未分类' }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="团购价" width="110">
          <template #default="{ row }">{{ formatMoney(row.price) }}</template>
        </el-table-column>
        <el-table-column label="原价" width="110">
          <template #default="{ row }">{{ formatMoney(row.originPrice ?? row.originalPrice) }}</template>
        </el-table-column>
        <el-table-column label="销量/库存" width="120">
          <template #default="{ row }">{{ row.soldCount || 0 }} / {{ row.stock || 0 }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '进行中' : '已停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" min-width="230">
          <template #default="{ row }">{{ formatTime(row.startAt) }} 至 {{ formatTime(row.endAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editGroupBuy(row)">编辑</el-button>
            <el-button size="small" @click="$router.push(`/marketing/group-buys/${row.id}/orders`)">订单</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadGroupBuys"
          @size-change="loadGroupBuys"
        />
      </div>
    </div>

    <el-dialog v-model="showDialog" :title="editingGroupBuy ? '编辑团购' : '创建团购'" width="760px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="团购名称" required>
          <el-input v-model="form.name" placeholder="团购套餐名称" />
        </el-form-item>
        <el-form-item label="封面图">
          <ImageUploadBox v-model="form.cover" scene="group-buy-cover" shape="wide" placeholder="上传团购封面" tip="建议 750x350px，可替换和删除" :max-size="5" />
        </el-form-item>
        <div class="dialog-grid">
          <el-form-item label="团购价">
            <el-input-number v-model="form.price" :min="0" :precision="2" />
          </el-form-item>
          <el-form-item label="原价">
            <el-input-number v-model="form.originPrice" :min="0" :precision="2" />
          </el-form-item>
          <el-form-item label="库存">
            <el-input-number v-model="form.stock" :min="0" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="form.status" style="width: 100%">
              <el-option label="进行中" value="active" />
              <el-option label="停用" value="inactive" />
            </el-select>
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
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="4" placeholder="套餐说明、核销规则、使用须知等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submitGroupBuy" :loading="submitting">保存</el-button>
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
const editingGroupBuy = ref<any>(null)
const groupBuys = ref<any[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const filters = reactive({ keyword: '', status: '' })

const form = reactive({
  name: '',
  cover: '',
  price: 0,
  originPrice: 0,
  stock: 100,
  status: 'active',
  dateRange: null as any,
  description: '',
})

function resetForm() {
  Object.assign(form, {
    name: '',
    cover: '',
    price: 0,
    originPrice: 0,
    stock: 100,
    status: 'active',
    dateRange: null,
    description: '',
  })
}

function openCreate() {
  editingGroupBuy.value = null
  resetForm()
  showDialog.value = true
}

async function loadGroupBuys() {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/group-buys', {
      params: { page: pagination.page, pageSize: pagination.pageSize, ...filters },
    })
    const page = unwrapPage(res)
    groupBuys.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载团购失败'))
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  pagination.page = 1
  loadGroupBuys()
}

function editGroupBuy(groupBuy: any) {
  editingGroupBuy.value = groupBuy
  Object.assign(form, {
    name: groupBuy.name,
    cover: groupBuy.cover || '',
    price: Number(groupBuy.price || 0),
    originPrice: Number(groupBuy.originPrice ?? groupBuy.originalPrice ?? 0),
    stock: Number(groupBuy.stock ?? groupBuy.minPeople ?? 0),
    status: groupBuy.status || 'active',
    dateRange: dateRangeFrom(groupBuy),
    description: groupBuy.description || '',
  })
  showDialog.value = true
}

async function submitGroupBuy() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写团购名称')
    return
  }
  if (!form.dateRange?.[0] || !form.dateRange?.[1]) {
    ElMessage.warning('请选择活动时间')
    return
  }
  submitting.value = true
  try {
    const payload = cleanPayload({
      name: form.name.trim(),
      cover: form.cover,
      price: form.price,
      originPrice: form.originPrice,
      stock: form.stock,
      status: form.status,
      startAt: form.dateRange[0].toISOString(),
      endAt: form.dateRange[1].toISOString(),
      description: form.description,
    })
    if (editingGroupBuy.value) {
      await request.put(`/admin/marketing/group-buys/${editingGroupBuy.value.id}`, payload)
      ElMessage.success('团购已更新')
    } else {
      await request.post('/admin/marketing/group-buys', payload)
      ElMessage.success('团购已创建')
    }
    showDialog.value = false
    await loadGroupBuys()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '保存团购失败'))
  } finally {
    submitting.value = false
  }
}

onMounted(loadGroupBuys)
</script>

<style scoped>
.marketing-page { padding: 24px; }
.marketing-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.filter-card,
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 14px; box-shadow: 0 14px 36px rgba(37,99,235,.08); }
.filter-card { display: grid; grid-template-columns: minmax(220px, 1fr) 180px auto auto; gap: 12px; padding: 16px; margin-bottom: 18px; }
.data-card { padding: 18px; }
.media-cell { display: flex; align-items: center; gap: 12px; }
.media-cell strong { color: #0f172a; }
.media-cell p { margin: 4px 0 0; color: #64748b; }
.thumb { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; background: #eff6ff; flex: none; }
.placeholder { display: grid; place-items: center; color: #2563eb; font-weight: 900; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
@media (max-width: 900px) {
  .filter-card { grid-template-columns: 1fr; }
  .dialog-grid { grid-template-columns: 1fr; }
}
</style>

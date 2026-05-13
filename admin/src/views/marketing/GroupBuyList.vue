<template>
  <div class="page-container">
    <div class="page-header">
      <h2>团购管理</h2>
      <el-button type="primary" @click="showCreateDialog = true">创建团购</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="groupBuys" v-loading="loading">
        <el-table-column prop="name" label="团购名称" />
        <el-table-column prop="price" label="价格" width="100" />
        <el-table-column prop="originalPrice" label="原价" width="100" />
        <el-table-column prop="minPeople" label="成团人数" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '进行中' : '已结束' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="editGroupBuy(row)">编辑</el-button>
            <el-button size="small" @click="$router.push(`/marketing/group-buys/${row.id}/orders`)">订单</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingGroupBuy ? '编辑团购' : '创建团购'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="团购名称" required>
          <el-input v-model="form.name" placeholder="团购名称" />
        </el-form-item>
        <el-form-item label="价格">
          <el-input-number v-model="form.price" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="原价">
          <el-input-number v-model="form.originalPrice" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="成团人数">
          <el-input-number v-model="form.minPeople" :min="2" />
        </el-form-item>
        <el-form-item label="活动时间">
          <el-date-picker v-model="form.dateRange" type="datetimerange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 100%" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitGroupBuy" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const submitting = ref(false)
const showCreateDialog = ref(false)
const editingGroupBuy = ref<any>(null)
const groupBuys = ref<any[]>([])

const form = reactive({
  name: '',
  price: 0,
  originalPrice: 0,
  minPeople: 2,
  dateRange: null as any,
  description: '',
})

const loadGroupBuys = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/group-buys')
    groupBuys.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载团购失败')
  } finally {
    loading.value = false
  }
}

const editGroupBuy = (groupBuy: any) => {
  editingGroupBuy.value = groupBuy
  form.name = groupBuy.name
  form.price = groupBuy.price
  form.originalPrice = groupBuy.originalPrice
  form.minPeople = groupBuy.minPeople
  form.description = groupBuy.description
  showCreateDialog.value = true
}

const submitGroupBuy = async () => {
  submitting.value = true
  try {
    const data = {
      ...form,
      startAt: form.dateRange?.[0]?.toISOString(),
      endAt: form.dateRange?.[1]?.toISOString(),
    }
    if (editingGroupBuy.value) {
      await request.put(`/admin/marketing/group-buys/${editingGroupBuy.value.id}`, data)
      ElMessage.success('团购已更新')
    } else {
      await request.post('/admin/marketing/group-buys', data)
      ElMessage.success('团购已创建')
    }
    showCreateDialog.value = false
    editingGroupBuy.value = null
    loadGroupBuys()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => { loadGroupBuys() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>

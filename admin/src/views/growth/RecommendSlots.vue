<template>
  <div class="page-container">
    <div class="page-header">
      <h2>推荐位配置</h2>
      <el-button type="primary" @click="showCreateDialog = true">添加推荐位</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="slots" v-loading="loading">
        <el-table-column prop="name" label="推荐位名称" />
        <el-table-column prop="position" label="位置" width="120" />
        <el-table-column prop="limit" label="数量限制" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" @click="editSlot(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingSlot ? '编辑推荐位' : '添加推荐位'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="推荐位名称" />
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="form.position" placeholder="如：首页顶部、详情页底部" />
        </el-form-item>
        <el-form-item label="数量限制">
          <el-input-number v-model="form.limit" :min="1" :max="20" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" active-value="active" inactive-value="inactive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitSlot" :loading="submitting">确定</el-button>
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
const editingSlot = ref<any>(null)
const slots = ref<any[]>([])

const form = reactive({
  name: '',
  position: '',
  limit: 5,
  status: 'active',
})

const loadSlots = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/recommend/slots')
    slots.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载推荐位失败')
  } finally {
    loading.value = false
  }
}

const editSlot = (slot: any) => {
  editingSlot.value = slot
  form.name = slot.name
  form.position = slot.position
  form.limit = slot.limit
  form.status = slot.status
  showCreateDialog.value = true
}

const submitSlot = async () => {
  submitting.value = true
  try {
    if (editingSlot.value) {
      await request.put(`/admin/recommend/slots/${editingSlot.value.id}`, form)
      ElMessage.success('推荐位已更新')
    } else {
      await request.post('/admin/recommend/slots', form)
      ElMessage.success('推荐位已创建')
    }
    showCreateDialog.value = false
    editingSlot.value = null
    loadSlots()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => { loadSlots() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>

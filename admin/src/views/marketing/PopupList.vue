<template>
  <div class="page-container">
    <div class="page-header">
      <h2>弹窗广告</h2>
      <el-button type="primary" @click="showCreateDialog = true">创建弹窗</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="popups" v-loading="loading">
        <el-table-column prop="title" label="标题" />
        <el-table-column prop="image" label="图片" width="100">
          <template #default="{ row }">
            <el-image :src="row.image" style="width: 60px; height: 60px" fit="cover" />
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="startAt" label="开始时间" width="180" />
        <el-table-column prop="endAt" label="结束时间" width="180" />
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="editPopup(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deletePopup(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingPopup ? '编辑弹窗' : '创建弹窗'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="弹窗标题" />
        </el-form-item>
        <el-form-item label="图片" required>
          <el-input v-model="form.image" placeholder="图片URL" />
        </el-form-item>
        <el-form-item label="链接">
          <el-input v-model="form.link" placeholder="点击跳转链接" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker v-model="form.dateRange" type="datetimerange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitPopup" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const submitting = ref(false)
const showCreateDialog = ref(false)
const editingPopup = ref<any>(null)
const popups = ref<any[]>([])

const form = reactive({
  title: '',
  image: '',
  link: '',
  dateRange: null as any,
})

const loadPopups = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/popups')
    popups.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载弹窗失败')
  } finally {
    loading.value = false
  }
}

const editPopup = (popup: any) => {
  editingPopup.value = popup
  form.title = popup.title
  form.image = popup.image
  form.link = popup.link
  showCreateDialog.value = true
}

const submitPopup = async () => {
  submitting.value = true
  try {
    const data = {
      ...form,
      startAt: form.dateRange?.[0]?.toISOString(),
      endAt: form.dateRange?.[1]?.toISOString(),
    }
    if (editingPopup.value) {
      await request.put(`/admin/marketing/popups/${editingPopup.value.id}`, data)
      ElMessage.success('弹窗已更新')
    } else {
      await request.post('/admin/marketing/popups', data)
      ElMessage.success('弹窗已创建')
    }
    showCreateDialog.value = false
    editingPopup.value = null
    loadPopups()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

const deletePopup = async (popup: any) => {
  try {
    await ElMessageBox.confirm('确定删除此弹窗吗？', '确认删除', { type: 'warning' })
    await request.delete(`/admin/marketing/popups/${popup.id}`)
    ElMessage.success('弹窗已删除')
    loadPopups()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => { loadPopups() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>

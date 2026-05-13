<template>
  <div class="page-container">
    <div class="page-header">
      <h2>商城分类管理</h2>
      <el-button type="primary" @click="showCreateDialog = true; resetForm()">
        <el-icon><Plus /></el-icon>
        新增分类
      </el-button>
    </div>

    <el-table :data="categories" v-loading="loading" border stripe row-key="id">
      <el-table-column prop="name" label="分类名称" min-width="200" />
      <el-table-column prop="icon" label="图标" width="80">
        <template #default="{ row }">
          <el-image v-if="row.icon" :src="row.icon" style="width: 30px; height: 30px" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column prop="isShow" label="显示" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isShow ? 'success' : 'info'" size="small">
            {{ row.isShow ? '显示' : '隐藏' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="editCategory(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteCategory(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="showCreateDialog" :title="editingCategory ? '编辑分类' : '新增分类'" width="500px">
      <el-form :model="categoryForm" label-width="100px">
        <el-form-item label="分类名称" required>
          <el-input v-model="categoryForm.name" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="图标">
          <div style="display: flex; gap: 12px; align-items: center;">
            <el-image v-if="categoryForm.icon" :src="categoryForm.icon" style="width: 40px; height: 40px" fit="cover" />
            <div>
              <el-upload
                action="/admin/upload/image"
                :headers="uploadHeaders"
                :on-success="(res: any) => { categoryForm.icon = res?.url || res?.data?.url || '' }"
                :show-file-list="false"
                accept="image/*"
              >
                <el-button size="small">上传图标</el-button>
              </el-upload>
              <el-input v-model="categoryForm.icon" placeholder="或输入图标URL" style="margin-top: 4px; width: 250px" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="categoryForm.sortOrder" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="是否显示">
          <el-switch v-model="categoryForm.isShow" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitCategory" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { request } from '@/api/request'

const loading = ref(false)
const submitting = ref(false)
const showCreateDialog = ref(false)
const editingCategory = ref<any>(null)
const categories = ref<any[]>([])

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('LM_ADMIN_TOKEN') || localStorage.getItem('admin_token')}`,
}))

const categoryForm = reactive({
  name: '',
  icon: '',
  sortOrder: 0,
  isShow: true,
})

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const loadCategories = async () => {
  loading.value = true
  try {
    const res = await request.get('/mall/admin/categories', {
      params: { pageSize: 100 },
    })
    const data = (res as any).data || res
    categories.value = data.list || []
  } catch (error) {
    ElMessage.error('加载分类列表失败')
  } finally {
    loading.value = false
  }
}

const editCategory = (category: any) => {
  editingCategory.value = category
  categoryForm.name = category.name
  categoryForm.icon = category.icon || ''
  categoryForm.sortOrder = category.sortOrder
  categoryForm.isShow = category.isShow
  showCreateDialog.value = true
}

const submitCategory = async () => {
  if (!categoryForm.name) {
    ElMessage.warning('请输入分类名称')
    return
  }
  submitting.value = true
  try {
    if (editingCategory.value) {
      await request.put(`/mall/admin/categories/${editingCategory.value.id}`, categoryForm)
      ElMessage.success('分类更新成功')
    } else {
      await request.post('/mall/admin/categories/create', categoryForm)
      ElMessage.success('分类创建成功')
    }
    showCreateDialog.value = false
    editingCategory.value = null
    resetForm()
    loadCategories()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

const deleteCategory = async (category: any) => {
  try {
    await ElMessageBox.confirm('确定删除该分类吗？', '确认删除', { type: 'warning' })
    await request.delete(`/mall/admin/categories/${category.id}`)
    ElMessage.success('删除成功')
    loadCategories()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const resetForm = () => {
  categoryForm.name = ''
  categoryForm.icon = ''
  categoryForm.sortOrder = 0
  categoryForm.isShow = true
}

onMounted(() => {
  loadCategories()
})
</script>

<style scoped>
.page-container {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
</style>

<template>
  <div class="page-shell">
    <PageHeader title="商品分类" subtitle="管理商品分类" icon="Menu" />
    <div class="filter-bar">
      <el-button type="primary" @click="showDialog = true; resetForm()">新增分类</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe row-key="id" default-expand-all>
      <el-table-column prop="name" label="分类名称" min-width="200" />
      <el-table-column prop="icon" label="图标" width="80">
        <template #default="{ row }">
          <el-image v-if="row.icon" :src="row.icon" style="width: 30px; height: 30px; border-radius: 4px;" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column prop="type" label="类型" width="100" />
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status === 'active' ? '显示' : '隐藏' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="edit(row)">编辑</el-button>
          <el-button size="small" :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">
            {{ row.status === 'active' ? '隐藏' : '显示' }}
          </el-button>
          <el-button size="small" type="danger" text @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="showDialog" :title="editing ? '编辑分类' : '新增分类'" width="520px" :close-on-click-modal="false">
      <el-form :model="form" label-width="100px" :rules="rules" ref="formRef">
        <el-form-item label="分类名称" prop="name"><el-input v-model="form.name" placeholder="请输入分类名称" /></el-form-item>
        <el-form-item label="上级分类">
          <el-select v-model="form.parentId" placeholder="不选则为一级分类" clearable style="width: 100%">
            <el-option v-for="c in topCategories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类图标">
          <ImageUploadBox v-model="form.icon" scene="merchant-category-icon" shape="square" placeholder="上传分类图标" tip="建议 160x160，可替换和删除" :max-size="2" />
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="商品" value="product" />
            <el-option label="帖子" value="post" />
            <el-option label="圈子" value="circle" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio label="active">显示</el-radio>
            <el-radio label="hidden">隐藏</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/api/merchant'
import { ElMessage, ElMessageBox } from 'element-plus'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

const loading = ref(false)
const list = ref<any[]>([])
const showDialog = ref(false)
const editing = ref<any>(null)
const form = reactive({ name: '', icon: '', sortOrder: 0, type: 'product', status: 'active', parentId: '' as any })
const formRef = ref<any>(null)
const rules = { name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }] }

const topCategories = computed(() => list.value.filter((c: any) => !c.parentId))

const resetForm = () => {
  form.name = ''; form.icon = ''; form.sortOrder = 0; form.type = 'product'; form.status = 'active'; form.parentId = '';
  editing.value = null
}

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getCategories({ pageSize: 500 })
    list.value = res?.list || res?.data?.list || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载分类失败')
  } finally {
    loading.value = false
  }
}

const edit = (row: any) => {
  editing.value = row
  form.name = row.name
  form.icon = row.icon || ''
  form.sortOrder = row.sortOrder || 0
  form.type = row.type || 'product'
  form.status = row.status || 'active'
  form.parentId = row.parentId || ''
  showDialog.value = true
}

const submit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const payload: any = { name: form.name, icon: form.icon, sortOrder: form.sortOrder, type: form.type, status: form.status }
    if (form.parentId) payload.parentId = form.parentId
    if (editing.value) {
      await updateCategory(editing.value.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createCategory(payload)
      ElMessage.success('创建成功')
    }
    showDialog.value = false
    resetForm()
    loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

const toggleStatus = async (row: any) => {
  try {
    const target = row.status === 'active' ? 'hidden' : 'active'
    await updateCategory(row.id, { status: target })
    ElMessage.success('操作成功')
    loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

const del = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定删除该分类？关联商品可能受影响。', '确认', { type: 'warning' })
    await deleteCategory(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '删除失败')
  }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; }
.upload-wrap { display: flex; align-items: center; }
</style>

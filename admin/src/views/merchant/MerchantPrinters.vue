<template>
  <div class="page-shell">
    <PageHeader title="打印机配置" subtitle="管理商家打印机" icon="Printer" />
    <div class="filter-bar">
      <el-select v-model="filters.merchantId" placeholder="商家" clearable filterable style="width: 200px" @change="loadData">
        <el-option v-for="m in merchantList" :key="m.id" :label="m.name" :value="m.id" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="inactive" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="success" @click="openEdit()">新增打印机</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="brand" label="品牌" width="100" />
      <el-table-column prop="sn" label="SN" width="140" show-overflow-tooltip />
      <el-table-column prop="key" label="密钥" width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="showKeys[row.id]">{{ row.key }}</span>
          <span v-else>********</span>
          <el-button size="small" text @click="showKeys[row.id] = !showKeys[row.id]">
            {{ showKeys[row.id] ? '隐藏' : '显示' }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column prop="autoPrint" label="自动打印" width="90">
        <template #default="{ row }">
          <el-tag :type="row.autoPrint ? 'success' : 'info'" size="small">{{ row.autoPrint ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="isDefault" label="默认" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isDefault ? 'success' : 'info'" size="small">{{ row.isDefault ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="primary" @click="testPrint(row)">测试打印</el-button>
          <el-button size="small" type="danger" text @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>

    <el-dialog v-model="editVisible" :title="editingId ? '编辑打印机' : '新增打印机'" width="520px" :close-on-click-modal="false">
      <el-form :model="form" label-width="100px" :rules="rules" ref="formRef">
        <el-form-item label="所属商家" prop="merchantId">
          <el-select v-model="form.merchantId" placeholder="请选择商家" style="width: 100%" filterable>
            <el-option v-for="m in merchantList" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" prop="name"><el-input v-model="form.name" placeholder="打印机名称" /></el-form-item>
        <el-form-item label="品牌" prop="brand"><el-input v-model="form.brand" placeholder="品牌，如：飞鹅、易联云" /></el-form-item>
        <el-form-item label="SN" prop="sn"><el-input v-model="form.sn" placeholder="设备序列号" /></el-form-item>
        <el-form-item label="密钥" prop="key">
          <el-input v-model="form.key" placeholder="设备密钥" :type="showFormKey ? 'text' : 'password'">
            <template #suffix>
              <el-icon class="cursor-pointer" @click="showFormKey = !showFormKey"><View v-if="showFormKey" /><Hide v-else /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="自动打印"><el-switch v-model="form.autoPrint" /></el-form-item>
        <el-form-item label="默认打印机"><el-switch v-model="form.isDefault" /></el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio label="active">启用</el-radio>
            <el-radio label="inactive">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { getPrinters, createPrinter, updatePrinter, deletePrinter, testPrint as apiTestPrint } from '@/api/merchant'
import { getMerchants } from '@/api/merchant'
import { ElMessage, ElMessageBox } from 'element-plus'
import { View, Hide } from '@element-plus/icons-vue'

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ merchantId: '', status: '' })
const merchantList = ref<any[]>([])
const showKeys = ref<Record<string, boolean>>({})

const editVisible = ref(false)
const editingId = ref('')
const form = reactive({ merchantId: '', name: '', brand: '', sn: '', key: '', autoPrint: true, isDefault: false, status: 'active' })
const formRef = ref<any>(null)
const showFormKey = ref(false)
const rules = {
  merchantId: [{ required: true, message: '请选择商家', trigger: 'change' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  sn: [{ required: true, message: '请输入SN', trigger: 'blur' }],
  key: [{ required: true, message: '请输入密钥', trigger: 'blur' }],
}

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getPrinters({ page: page.value, pageSize: pageSize.value, ...filters })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { merchantId: '', status: '' })
  page.value = 1
  loadData()
}

const loadOptions = async () => {
  try {
    const mRes: any = await getMerchants({ page: 1, pageSize: 500 })
    merchantList.value = mRes?.list || mRes?.data?.list || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载选项失败')
  }
}

const openEdit = (row?: any) => {
  editingId.value = row?.id || ''
  if (row) {
    Object.assign(form, { merchantId: row.merchantId, name: row.name, brand: row.brand, sn: row.sn, key: row.key, autoPrint: !!row.autoPrint, isDefault: !!row.isDefault, status: row.status || 'active' })
  } else {
    Object.assign(form, { merchantId: '', name: '', brand: '', sn: '', key: '', autoPrint: true, isDefault: false, status: 'active' })
  }
  editVisible.value = true
}

const submitEdit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (editingId.value) {
      await updatePrinter(editingId.value, { ...form })
      ElMessage.success('更新成功')
    } else {
      await createPrinter({ ...form })
      ElMessage.success('创建成功')
    }
    editVisible.value = false
    loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  }
}

const testPrint = async (row: any) => {
  try {
    const { value: content } = await ElMessageBox.prompt('请输入测试打印内容', '测试打印', { inputValue: '测试打印\n--------------\n printer test \n--------------\n', confirmButtonText: '打印' })
    const res: any = await apiTestPrint(row.id, content)
    ElMessage.success(res?.message || '测试打印指令已发送')
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '测试打印失败')
  }
}

const del = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定删除该打印机配置？', '确认', { type: 'warning' })
    await deletePrinter(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '删除失败')
  }
}

onMounted(() => { loadData(); loadOptions() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.cursor-pointer { cursor: pointer; }
</style>

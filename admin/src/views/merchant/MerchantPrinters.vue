<template>
  <div class="page-shell">
    <PageHeader title="打印设备" subtitle="仅在协助商家配置或排障时使用；凭证不会回显" icon="Printer" />
    <el-alert v-if="selectedMerchantName" class="merchant-context" type="info" :closable="false" show-icon :title="`当前仅显示「${selectedMerchantName}」的打印设备`" />
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
      <el-button type="primary" @click="openEdit()">新增打印机</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="brand" label="品牌" width="100"><template #default="{ row }">{{ ({ feie: '飞鹅云', yly: '易联云', xpyun: '芯烨云', gprinter: '佳博云' }[row.brand] || row.brand) }}</template></el-table-column>
      <el-table-column prop="connectionMode" label="设备归属" width="110"><template #default="{ row }">{{ row.connectionMode === 'platform_managed' ? '平台托管' : '商家自有' }}</template></el-table-column>
      <el-table-column prop="sn" label="SN" width="140" show-overflow-tooltip />
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
        <el-form-item label="品牌">
          <el-select v-model="form.brand" @change="onBrandChange">
            <el-option label="飞鹅云" value="feie" />
            <el-option label="易联云" value="yly" />
            <el-option label="芯烨云" value="xpyun" />
            <el-option label="佳博云" value="gprinter" />
          </el-select>
        </el-form-item>
        <el-form-item label="SN" prop="sn"><el-input v-model="form.sn" :placeholder="form.brand === 'yly' ? '易联云终端号 / machine_code' : form.brand === 'xpyun' ? '芯烨云设备 PID / SN' : form.brand === 'gprinter' ? '佳博云终端编号 / deviceID' : '飞鹅云已添加设备的机器号'" /></el-form-item>
        <el-form-item label="设备归属">
          <el-radio-group v-model="form.connectionMode">
            <el-radio label="merchant_owned">商家自有</el-radio>
            <el-radio label="platform_managed" :disabled="form.brand !== 'feie'">平台托管</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="form.connectionMode === 'merchant_owned' && form.brand === 'feie'">
          <el-alert type="info" :closable="false" title="商家在飞鹅云开发者账号添加设备后，填写该商家自己的 USER、UKEY 与机器号；凭证会加密保存且不再返回页面。" />
          <el-form-item label="USER"><el-input v-model="form.user" autocomplete="off" /></el-form-item>
          <el-form-item label="UKEY"><el-input v-model="form.ukey" type="password" show-password autocomplete="new-password" placeholder="编辑时留空则保持原凭证" /></el-form-item>
          <el-form-item label="设备密钥"><el-input v-model="form.deviceKey" type="password" show-password autocomplete="new-password" placeholder="可选，编辑时留空则保持原凭证" /></el-form-item>
        </template>
        <template v-else-if="form.connectionMode === 'merchant_owned' && form.brand === 'yly'">
          <el-alert type="info" :closable="false" title="请在易联云开发者账号完成设备绑定后，填写该商家自己的 Client ID、Client Secret 与终端号；凭证会加密保存且不再返回页面。" />
          <el-form-item label="Client ID"><el-input v-model="form.clientId" autocomplete="off" /></el-form-item>
          <el-form-item label="Client Secret"><el-input v-model="form.clientSecret" type="password" show-password autocomplete="new-password" placeholder="编辑时留空则保持原凭证" /></el-form-item>
          <el-form-item label="设备密钥"><el-input v-model="form.deviceKey" type="password" show-password autocomplete="new-password" placeholder="可选，编辑时留空则保持原凭证" /></el-form-item>
        </template>
        <template v-else-if="form.connectionMode === 'merchant_owned' && form.brand === 'xpyun'">
          <el-alert type="info" :closable="false" title="芯烨云设备需先在芯烨云开放平台添加；填写商家自己的开发者 ID、UserKEY 与设备号，凭证会加密保存且不再返回页面。" />
          <el-form-item label="开发者 ID"><el-input v-model="form.xpyUser" autocomplete="off" /></el-form-item>
          <el-form-item label="UserKEY"><el-input v-model="form.xpyUserKey" type="password" show-password autocomplete="new-password" placeholder="编辑时留空则保持原凭证" /></el-form-item>
        </template>
        <template v-else-if="form.connectionMode === 'merchant_owned' && form.brand === 'gprinter'">
          <el-alert type="info" :closable="false" title="佳博云设备需先在佳博云平台绑定；填写商家自己的商户编码、API 密钥与终端编号，凭证会加密保存且不再返回页面。" />
          <el-form-item label="商户编码"><el-input v-model="form.gpMemberCode" autocomplete="off" /></el-form-item>
          <el-form-item label="API 密钥"><el-input v-model="form.gpApiKey" type="password" show-password autocomplete="new-password" placeholder="编辑时留空则保持原凭证" /></el-form-item>
        </template>
        <el-alert v-else type="warning" :closable="false" title="仅飞鹅云支持平台托管：使用“系统设置 → 飞鹅云平台托管设备”中的全局账号；其他品牌均使用商家自有凭证。" />
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
import { computed, ref, reactive, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { getPrinters, createPrinter, updatePrinter, deletePrinter, testPrint as apiTestPrint } from '@/api/merchant'
import { getMerchants } from '@/api/merchant'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const route = useRoute()
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ merchantId: '', status: '' })
const merchantList = ref<any[]>([])
const selectedMerchantName = computed(() => merchantList.value.find((item: any) => item.id === filters.merchantId)?.name || '')

const editVisible = ref(false)
const editingId = ref('')
const form = reactive({ merchantId: '', name: '', brand: 'feie', sn: '', connectionMode: 'merchant_owned', user: '', ukey: '', clientId: '', clientSecret: '', deviceKey: '', xpyUser: '', xpyUserKey: '', gpMemberCode: '', gpApiKey: '', autoPrint: true, isDefault: false, status: 'active' })
const formRef = ref<any>(null)
const rules = {
  merchantId: [{ required: true, message: '请选择商家', trigger: 'change' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  sn: [{ required: true, message: '请输入SN', trigger: 'blur' }],
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
    Object.assign(form, { merchantId: row.merchantId, name: row.name, brand: ['yly', 'xpyun', 'gprinter'].includes(row.brand) ? row.brand : 'feie', sn: row.sn, connectionMode: row.connectionMode || 'merchant_owned', user: '', ukey: '', clientId: '', clientSecret: '', deviceKey: '', xpyUser: '', xpyUserKey: '', gpMemberCode: '', gpApiKey: '', autoPrint: !!row.autoPrint, isDefault: !!row.isDefault, status: row.status || 'active' })
  } else {
    Object.assign(form, { merchantId: filters.merchantId || '', name: '', brand: 'feie', sn: '', connectionMode: 'merchant_owned', user: '', ukey: '', clientId: '', clientSecret: '', deviceKey: '', xpyUser: '', xpyUserKey: '', gpMemberCode: '', gpApiKey: '', autoPrint: true, isDefault: false, status: 'active' })
  }
  editVisible.value = true
}

const onBrandChange = () => {
  if (form.brand !== 'feie') form.connectionMode = 'merchant_owned'
  form.user = ''; form.ukey = ''; form.clientId = ''; form.clientSecret = ''; form.deviceKey = ''; form.xpyUser = ''; form.xpyUserKey = ''; form.gpMemberCode = ''; form.gpApiKey = ''
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

const applyMerchantContext = () => {
  filters.merchantId = typeof route.query.merchantId === 'string' ? route.query.merchantId : ''
}

watch(() => route.query.merchantId, () => {
  applyMerchantContext()
  page.value = 1
  loadData()
})

onMounted(() => { applyMerchantContext(); loadData(); loadOptions() })
</script>

<style scoped>
.merchant-context { margin-bottom: 16px; }
</style>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.cursor-pointer { cursor: pointer; }
</style>

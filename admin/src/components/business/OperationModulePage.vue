<template>
  <div class="page-shell">
    <GlassPageHeader :title="config.title" :subtitle="config.subtitle">
      <template #actions><el-button :icon="Calendar">{{ today }}</el-button><el-button :icon="Refresh" @click="load(lastQuery)">刷新</el-button></template>
    </GlassPageHeader>
    <StatGrid :items="config.stats" />
    <div class="page-two-col">
      <div class="page-shell">
        <SearchPanel :fields="config.search" @search="onSearch" />
        <div class="action-bar">
          <div class="btn-row">
            <el-button v-for="(a,idx) in config.actions" :key="a" :loading="actionLoading === a" :type="idx===0 ? 'primary' : idx > 1 ? 'warning' : 'default'" :icon="idx===0 ? Plus : idx===1 ? Download : Operation" @click="handleTopAction(a)">{{ a }}</el-button>
          </div>
          <div class="muted">{{ loading ? '正在连接真实接口...' : error || ('接口：' + (config.endpoint || '待配置')) }}</div>
        </div>
        <DataTableCard v-loading="loading" :title="config.title.replace('管理','列表')" :columns="config.columns" :rows="rows" :total="total" @detail="openDetail" @edit="openForm('update', $event)" @row-action="handleRowAction" @selection-change="selectedRows = $event" />
      </div>
      <SidePanels :chart-title="config.chartTitle" :side-title="config.sideTitle" :metrics="config.sideMetrics" />
    </div>
    <DetailDrawer ref="drawer" />
    <el-dialog v-model="formVisible" :title="formTitle" width="680px">
      <el-form :model="formModel" label-position="top">
        <div class="form-grid two">
          <el-form-item v-for="field in formFields" :key="field.key" :label="field.label">
            <el-input-number v-if="field.kind === 'number'" v-model="formModel[field.key]" style="width:100%" />
            <el-select v-else-if="field.kind === 'status'" v-model="formModel[field.key]" style="width:100%">
              <el-option label="正常/启用" value="enabled" />
              <el-option label="待审核" value="pending" />
              <el-option label="禁用" value="disabled" />
              <el-option label="已完成" value="completed" />
            </el-select>
            <el-input v-else v-model="formModel[field.key]" :type="field.kind === 'textarea' ? 'textarea' : 'text'" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="formVisible=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="uploadVisible" title="上传文件" width="520px">
      <el-upload drag :http-request="uploadFile" :show-file-list="true" :limit="1">
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽文件到这里，或点击上传</div>
      </el-upload>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, Refresh, Plus, Download, Operation, UploadFilled } from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import SearchPanel from '@/components/glass/SearchPanel.vue'
import DataTableCard from '@/components/glass/DataTableCard.vue'
import SidePanels from '@/components/glass/SidePanels.vue'
import DetailDrawer from '@/components/glass/DetailDrawer.vue'
import { moduleConfigs } from '@/data/moduleConfigs'
import { fetchModulePage, runModuleAction, uploadAdminFile, type ModuleAction } from '@/api/admin'
const props = defineProps<{ moduleKey:string }>()
const config = computed(() => moduleConfigs[props.moduleKey])
const rows = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const actionLoading = ref('')
const selectedRows = ref<any[]>([])
const lastQuery = ref<Record<string, any>>({})
const drawer = ref<InstanceType<typeof DetailDrawer>>()
const formVisible = ref(false)
const uploadVisible = ref(false)
const formMode = ref<'create' | 'update'>('create')
const editingRow = ref<any>(null)
const formModel = reactive<Record<string, any>>({})
const today = new Date().toISOString().slice(0, 10)
const formTitle = computed(() => `${formMode.value === 'create' ? '新增' : '编辑'}${config.value.title}`)
const readonlyProps = new Set(['id', 'createdAt', 'updatedAt', 'posts', 'orders', 'amount', 'gmv', 'userCount', 'merchantCount', 'sales', 'views', 'comments', 'likes', 'settledAt', 'lastLogin'])
const formFields = computed(() => config.value.columns
  .filter(col => !readonlyProps.has(col.prop) && !['image', 'rating', 'progress'].includes(col.type || ''))
  .slice(0, 10)
  .map(col => ({ key: col.prop, label: col.label, kind: col.type === 'number' || col.type === 'money' ? 'number' : col.type === 'tag' ? 'status' : col.minWidth && col.minWidth > 200 ? 'textarea' : 'text' })))

async function load(params: Record<string, any> = {}) {
  loading.value = true
  error.value = ''
  lastQuery.value = params
  try {
    const data = await fetchModulePage(props.moduleKey, params)
    rows.value = data.rows
    total.value = data.total
  } catch (e: any) {
    rows.value = []
    total.value = 0
    error.value = e?.message || '接口连接失败'
  } finally {
    loading.value = false
  }
}
function onSearch(params: Record<string, any>){ load(params) }
function openDetail(row:any){ drawer.value?.open(row, { title: config.value.title + '详情', tabs: config.value.detailTabs }) }
function openForm(mode: 'create' | 'update', row?: any) {
  formMode.value = mode
  editingRow.value = row || null
  Object.keys(formModel).forEach(key => delete formModel[key])
  for (const field of formFields.value) {
    const value = row?.[field.key]
    formModel[field.key] = typeof value === 'object' && value ? value.name : value ?? ''
  }
  formVisible.value = true
}
async function submitForm() {
  saving.value = true
  try {
    await runModuleAction(props.moduleKey, formMode.value, { row: editingRow.value, data: formModel })
    ElMessage.success('保存成功')
    formVisible.value = false
    await load(lastQuery.value)
  } finally {
    saving.value = false
  }
}
async function uploadFile(option: any) {
  saving.value = true
  try {
    await uploadAdminFile(option.file)
    option.onSuccess?.({})
    ElMessage.success('上传成功')
    uploadVisible.value = false
    await load(lastQuery.value)
  } catch (e) {
    option.onError?.(e)
  } finally {
    saving.value = false
  }
}
function rowsForAction(action: ModuleAction, row?: any) {
  if (row) return [row]
  if (selectedRows.value.length) return selectedRows.value
  return rows.value
}
function topAction(label: string): ModuleAction | 'createForm' {
  if (/新增|创建|发布/.test(label)) return 'createForm'
  if (/导出/.test(label)) return 'export'
  if (/批量通过|批量审核|批量同意/.test(label)) return 'batchApprove'
  if (/批量驳回/.test(label)) return 'batchReject'
  if (/批量启用|批量上架/.test(label)) return 'batchEnable'
  if (/批量禁用|批量下架|批量删除|清理/.test(label)) return label.includes('删除') || label.includes('清理') ? 'batchDelete' : 'batchDisable'
  if (/刷新/.test(label)) return 'export'
  return 'export'
}
async function askReason(action: ModuleAction) {
  if (!['reject', 'batchReject', 'cancel'].includes(action)) return ''
  return ElMessageBox.prompt('请输入处理原因', '业务处理', { inputType: 'textarea', confirmButtonText: '确认', cancelButtonText: '取消' }).then(res => res.value)
}
async function execute(action: ModuleAction, row?: any, label = '处理') {
  const targetRows = rowsForAction(action, row)
  if (!targetRows.length) {
    ElMessage.warning('请先选择要处理的数据')
    return
  }
  const danger = ['delete', 'batchDelete', 'disable', 'batchDisable', 'reject', 'batchReject', 'cancel'].includes(action)
  if (danger) await ElMessageBox.confirm(`确认对 ${targetRows.length} 条数据执行「${label}」吗？`, '确认操作', { type: 'warning' })
  const reason = await askReason(action)
  actionLoading.value = label
  try {
    await runModuleAction(props.moduleKey, action, { rows: targetRows, row, reason })
    ElMessage.success('操作成功')
    await load(lastQuery.value)
  } finally {
    actionLoading.value = ''
  }
}
function handleTopAction(label: string) {
  if (/刷新/.test(label)) {
    load(lastQuery.value)
    return
  }
  if (/上传/.test(label)) {
    uploadVisible.value = true
    return
  }
  const action = topAction(label)
  if (action === 'createForm') openForm('create')
  else execute(action, undefined, label)
}
function handleRowAction(action: string, row: any) {
  execute(action as ModuleAction, row, action)
}
onMounted(() => load())
</script>

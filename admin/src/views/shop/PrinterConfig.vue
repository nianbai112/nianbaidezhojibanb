<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="f.merchantId" placeholder="商家" allow-clear style="width:180px" :options="merchantOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="f.brand" placeholder="品牌" allow-clear style="width:120px">
        <a-select-option value="feie">飞鹅</a-select-option>
        <a-select-option value="yly">易联云</a-select-option>
      </a-select>
      <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="active">启用</a-select-option>
        <a-select-option value="deleted">已删除</a-select-option>
      </a-select>
      <template #extra>
        <a-button type="primary" @click="onCreate"><plus-outlined />添加打印机</a-button>
      </template>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">打印机配置</span></div>
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #brand="{ record }">
          <a-tag :color="record.brand === 'feie' ? 'blue' : 'purple'">{{ record.brand === 'feie' ? '飞鹅' : record.brand === 'yly' ? '易联云' : record.brand }}</a-tag>
        </template>
        <template #autoPrint="{ record }">
          <a-tag :color="record.autoPrint ? 'green' : 'default'">{{ record.autoPrint ? '是' : '否' }}</a-tag>
        </template>
        <template #isDefault="{ record }">
          <a-tag :color="record.isDefault ? 'orange' : 'default'">{{ record.isDefault ? '默认' : '-' }}</a-tag>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'active' ? 'green' : 'red'">{{ record.status === 'active' ? '启用' : '已删除' }}</a-tag>
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a @click="onTestPrint(record)">测试打印</a>
            <a-popconfirm title="确定删除该打印机吗？" @confirm="onDelete(record.id)">
              <a style="color:#ff4d4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑打印机' : '添加打印机'" :width="520" :confirm-loading="submitting" @ok="onSubmit">
      <a-form layout="vertical">
        <a-form-item label="商家" required>
          <a-select v-model:value="form.merchantId" placeholder="选择商家" :options="merchantOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
        </a-form-item>
        <a-form-item label="打印机名称" required>
          <a-input v-model:value="form.name" placeholder="例如：收银台打印机" />
        </a-form-item>
        <a-form-item label="品牌">
          <a-select v-model:value="form.brand">
            <a-select-option value="feie">飞鹅</a-select-option>
            <a-select-option value="yly">易联云</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="SN编号" required>
          <a-input v-model:value="form.sn" placeholder="打印机终端号" />
        </a-form-item>
        <a-form-item label="密钥">
          <a-input-password v-model:value="form.key" placeholder="打印机密钥" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="自动打印">
              <a-switch v-model:checked="form.autoPrint" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="设为默认">
              <a-switch v-model:checked="form.isDefault" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <a-modal v-model:open="testPrintVisible" title="测试打印" :width="400" @ok="onTestPrintConfirm">
      <a-form layout="vertical">
        <a-form-item label="打印内容">
          <a-textarea v-model:value="testPrintContent" placeholder="输入打印内容或订单ID" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ merchantId: undefined as string | undefined, brand: undefined as string | undefined, status: undefined as string | undefined })
const merchantOpts = ref<any[]>([])

const cols = [
  { title: '名称', dataIndex: 'name', width: 160 },
  { title: '商家', dataIndex: 'merchantId', width: 120 },
  { title: '品牌', dataIndex: 'brand', width: 80, slot: 'brand' },
  { title: 'SN编号', dataIndex: 'sn', width: 160 },
  { title: '自动打印', dataIndex: 'autoPrint', width: 80, slot: 'autoPrint' },
  { title: '默认', dataIndex: 'isDefault', width: 70, slot: 'isDefault' },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 200, slot: 'action', fixed: 'right' },
]

async function fetchData() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.merchantId) params.merchantId = f.merchantId
    if (f.brand) params.brand = f.brand
    if (f.status) params.status = f.status
    const res = await shopApi.getPrinterList(params)
    list.value = res.data.data?.list || []
    t.value = res.data.data?.total || 0
  } catch { /* handled */ }
  finally { ld.value = false }
}

async function loadMerchants() {
  try {
    const res = await shopApi.getMerchantList({ page: 1, pageSize: 1000 })
    merchantOpts.value = res.data.data?.list || []
  } catch { /* handled */ }
}

function onSearch() { p.value = 1; fetchData() }
function onReset() { f.merchantId = undefined; f.brand = undefined; f.status = undefined; onSearch() }

const modalVisible = ref(false), editingId = ref(''), submitting = ref(false)
const form = reactive({ merchantId: '', name: '', brand: 'feie', sn: '', key: '', autoPrint: true, isDefault: false })

function onCreate() { editingId.value = ''; Object.assign(form, { merchantId: '', name: '', brand: 'feie', sn: '', key: '', autoPrint: true, isDefault: false }); modalVisible.value = true }

function onEdit(r: any) {
  editingId.value = r.id
  Object.assign(form, { merchantId: r.merchantId, name: r.name, brand: r.brand || 'feie', sn: r.sn, key: r.key || '', autoPrint: r.autoPrint, isDefault: r.isDefault })
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    if (editingId.value) {
      await shopApi.updatePrinter(editingId.value, form)
      message.success('已更新')
    } else {
      await shopApi.createPrinter(form)
      message.success('已添加')
    }
    modalVisible.value = false
    fetchData()
  } catch { /* handled */ }
  finally { submitting.value = false }
}

async function onDelete(id: string) {
  await shopApi.deletePrinter(id)
  message.success('已删除')
  fetchData()
}

const testPrintVisible = ref(false), testPrintId = ref(''), testPrintContent = ref('')

function onTestPrint(r: any) { testPrintId.value = r.id; testPrintContent.value = ''; testPrintVisible.value = true }

async function onTestPrintConfirm() {
  await shopApi.testPrint(testPrintId.value, { content: testPrintContent.value })
  message.success('打印任务已提交')
  testPrintVisible.value = false
}

loadMerchants()
fetchData()
</script>

<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="f.type" placeholder="加价类型" allow-clear style="width:130px">
        <a-select-option value="PERCENTAGE">按百分比</a-select-option>
        <a-select-option value="FIXED">固定金额</a-select-option>
      </a-select>
      <a-select v-model:value="f.scope" placeholder="适用范围" allow-clear style="width:130px">
        <a-select-option value="REGION">按区域</a-select-option>
        <a-select-option value="CATEGORY">按类目</a-select-option>
        <a-select-option value="MERCHANT">按商家</a-select-option>
      </a-select>
      <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:110px">
        <a-select-option value="active">启用</a-select-option>
        <a-select-option value="disabled">禁用</a-select-option>
      </a-select>
      <template #extra>
        <a-button type="primary" @click="onCreate"><plus-outlined />添加规则</a-button>
      </template>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">商品加价规则</span></div>
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #type="{ record }">
          <a-tag :color="record.type === 'PERCENTAGE' ? 'blue' : 'orange'">
            {{ record.type === 'PERCENTAGE' ? '百分比' : '固定金额' }}
          </a-tag>
        </template>
        <template #value="{ record }">
          {{ record.type === 'PERCENTAGE' ? record.value + '%' : '¥' + record.value }}
        </template>
        <template #scope="{ record }">
          <a-tag :color="record.scope === 'REGION' ? 'green' : record.scope === 'CATEGORY' ? 'purple' : 'blue'">
            {{ record.scope === 'REGION' ? '区域' : record.scope === 'CATEGORY' ? '类目' : '商家' }}
          </a-tag>
        </template>
        <template #targetName="{ record }">
          {{ record.region?.name || record.category?.name || record.merchant?.name || '-' }}
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'active' ? 'green' : 'default'">{{ record.status === 'active' ? '启用' : '禁用' }}</a-tag>
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a-popconfirm title="确定删除该规则吗？" @confirm="onDelete(record.id)">
              <a style="color:#ff4d4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑加价规则' : '添加加价规则'" :width="560" :confirm-loading="submitting" @ok="onSubmit">
      <a-form layout="vertical">
        <a-form-item label="规则名称" required>
          <a-input v-model:value="form.name" placeholder="例如：华东区域加价10%" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="加价类型">
              <a-radio-group v-model:value="form.type">
                <a-radio value="PERCENTAGE">百分比</a-radio>
                <a-radio value="FIXED">固定金额</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="加价值">
              <a-input-number v-model:value="form.value" :min="0" :max="form.type === 'PERCENTAGE' ? 999 : 99999" :precision="2" style="width:100%">
                <template #addonAfter>{{ form.type === 'PERCENTAGE' ? '%' : '元' }}</template>
              </a-input-number>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="适用范围">
          <a-radio-group v-model:value="form.scope">
            <a-radio value="REGION">按区域</a-radio>
            <a-radio value="CATEGORY">按类目</a-radio>
            <a-radio value="MERCHANT">按商家</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="form.scope === 'REGION'" label="选择区域">
          <a-select v-model:value="form.regionId" placeholder="选择区域" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" allow-clear />
        </a-form-item>
        <a-form-item v-if="form.scope === 'CATEGORY'" label="选择类目">
          <a-select v-model:value="form.categoryId" placeholder="选择类目" :options="categoryOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" allow-clear />
        </a-form-item>
        <a-form-item v-if="form.scope === 'MERCHANT'" label="选择商家">
          <a-select v-model:value="form.merchantId" placeholder="选择商家" :options="merchantOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" allow-clear />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="优先级">
              <a-input-number v-model:value="form.priority" :min="0" :max="999" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="状态">
              <a-switch v-model:checked="form.statusBool" checked-children="启用" un-checked-children="禁用" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="备注">
          <a-textarea v-model:value="form.remark" placeholder="备注说明" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ type: undefined as string | undefined, scope: undefined as string | undefined, status: undefined as string | undefined })
const regionOpts = ref<any[]>([])
const categoryOpts = ref<any[]>([])
const merchantOpts = ref<any[]>([])

const cols = [
  { title: '名称', dataIndex: 'name', width: 160 },
  { title: '类型', dataIndex: 'type', width: 90, slot: 'type' },
  { title: '加价值', dataIndex: 'value', width: 90, slot: 'value' },
  { title: '范围', dataIndex: 'scope', width: 80, slot: 'scope' },
  { title: '目标', dataIndex: 'id', width: 120, slot: 'targetName' },
  { title: '优先级', dataIndex: 'priority', width: 70 },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

async function fetchData() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.type) params.type = f.type
    if (f.scope) params.scope = f.scope
    if (f.status) params.status = f.status
    const res = await shopApi.getPriceAdjustments(params)
    list.value = res.data.data?.list || []
    t.value = res.data.data?.total || 0
  } catch { /* handled */ }
  finally { ld.value = false }
}

async function loadOptions() {
  try {
    const [merchantRes, catRes] = await Promise.all([
      shopApi.getMerchantList({ page: 1, pageSize: 1000 }),
      shopApi.getCategoryTree(),
    ])
    merchantOpts.value = merchantRes.data.data?.list || []
    categoryOpts.value = catRes.data.data || []
  } catch { /* handled */ }
}

function onSearch() { p.value = 1; fetchData() }
function onReset() { f.type = undefined; f.scope = undefined; f.status = undefined; onSearch() }

const modalVisible = ref(false), editingId = ref(''), submitting = ref(false)
const form = reactive({
  name: '', type: 'PERCENTAGE' as string, value: 0, scope: 'REGION' as string,
  regionId: undefined as string | undefined, categoryId: undefined as string | undefined, merchantId: undefined as string | undefined,
  priority: 0, remark: '', statusBool: true,
})

function onCreate() {
  editingId.value = ''
  Object.assign(form, { name: '', type: 'PERCENTAGE', value: 0, scope: 'REGION', regionId: undefined, categoryId: undefined, merchantId: undefined, priority: 0, remark: '', statusBool: true })
  modalVisible.value = true
}

function onEdit(r: any) {
  editingId.value = r.id
  Object.assign(form, {
    name: r.name, type: r.type, value: Number(r.value), scope: r.scope,
    regionId: r.regionId, categoryId: r.categoryId, merchantId: r.merchantId,
    priority: r.priority, remark: r.remark || '', statusBool: r.status === 'active',
  })
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    const data: any = {
      name: form.name, type: form.type, value: form.value, scope: form.scope,
      priority: form.priority, remark: form.remark || undefined, status: form.statusBool ? 'active' : 'disabled',
    }
    if (form.scope === 'REGION') data.regionId = form.regionId
    else if (form.scope === 'CATEGORY') data.categoryId = form.categoryId
    else if (form.scope === 'MERCHANT') data.merchantId = form.merchantId
    else data.regionId = undefined; data.categoryId = undefined; data.merchantId = undefined

    if (editingId.value) {
      await shopApi.updatePriceAdjustment(editingId.value, data)
      message.success('已更新')
    } else {
      await shopApi.createPriceAdjustment(data)
      message.success('已添加')
    }
    modalVisible.value = false
    fetchData()
  } catch { /* handled */ }
  finally { submitting.value = false }
}

async function onDelete(id: string) {
  await shopApi.deletePriceAdjustment(id)
  message.success('已删除')
  fetchData()
}

loadOptions()
fetchData()
</script>

<template>
  <div class="page-container">
    <div class="page-title mb-4">二手区域配置</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="5">
          <a-select v-model:value="f.regionId" placeholder="区域" allow-clear style="width:100%" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" @change="onSearch" />
        </a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="cols" :loading="ld" :pagination="{ current: p, pageSize: ps, total: t }" @change="onTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'enableSecondHand'">
          <a-tag :color="record.enableSecondHand ? 'green' : 'red'">{{ record.enableSecondHand ? '开启' : '关闭' }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'maxListings'">{{ record.maxListings ?? '不限' }}</template>
        <template v-else-if="column.dataIndex === 'requirePhone' || column.dataIndex === 'requireAudit'">
          <a-tag :color="record[column.dataIndex] ? 'green' : 'default'">{{ record[column.dataIndex] ? '是' : '否' }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a @click="openEdit(record)">编辑</a>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="`编辑配置 - ${editingRegionName}`" :width="480" :confirm-loading="submitting" @ok="onSubmit">
      <a-form layout="vertical">
        <a-form-item label="开启二手交易">
          <a-switch v-model:checked="form.enableSecondHand" checked-children="开" un-checked-children="关" />
        </a-form-item>
        <a-form-item label="每人最大发布数">
          <a-input-number v-model:value="form.maxListings" :min="0" :max="999" style="width:100%" placeholder="留空表示不限制" />
        </a-form-item>
        <a-form-item label="需要手机号">
          <a-switch v-model:checked="form.requirePhone" />
        </a-form-item>
        <a-form-item label="发布需要审核">
          <a-switch v-model:checked="form.requireAudit" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { secondHandApi } from '@/api/secondHand'
import { areaApi } from '@/api/area'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const regionOpts = ref<any[]>([])
const f = reactive({ regionId: undefined as string | undefined })

const cols = [
  { title: '区域', dataIndex: ['region', 'name'], width: 140 },
  { title: '二手交易', dataIndex: 'enableSecondHand', width: 90 },
  { title: '最大发布数', dataIndex: 'maxListings', width: 100 },
  { title: '需要手机号', dataIndex: 'requirePhone', width: 100 },
  { title: '需要审核', dataIndex: 'requireAudit', width: 90 },
  { title: '更新时间', dataIndex: 'updatedAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 70 },
]

async function fetchRegions() {
  try {
    const res = await areaApi.getList({ page: 1, pageSize: 200 })
    regionOpts.value = (res.data as any).list || []
  } catch { /* ignore */ }
}

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.regionId) params.regionId = f.regionId
    const res = await secondHandApi.getRegionSettingsList(params)
    const data = res.data as any
    list.value = data.list || data.data?.list || []
    t.value = data.total || data.data?.total || 0
  } catch { /* ignore */ }
  finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onTableChange(pag: any) { p.value = pag.current; fetchList() }

const modalVisible = ref(false), editingRegionId = ref(''), editingRegionName = ref(''), submitting = ref(false)
const form = reactive({ enableSecondHand: true, maxListings: undefined as number | undefined | null, requirePhone: true, requireAudit: false })

function openEdit(record: any) {
  editingRegionId.value = record.regionId
  editingRegionName.value = record.region?.name || record.regionId
  form.enableSecondHand = record.enableSecondHand
  form.maxListings = record.maxListings
  form.requirePhone = record.requirePhone
  form.requireAudit = record.requireAudit
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    await secondHandApi.saveRegionSetting(editingRegionId.value, form as any)
    message.success('已保存')
    modalVisible.value = false
    fetchList()
  } catch { /* ignore */ }
  finally { submitting.value = false }
}

onMounted(() => { fetchRegions(); fetchList() })
</script>

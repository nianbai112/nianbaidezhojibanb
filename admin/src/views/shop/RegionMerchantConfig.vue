<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="f.regionId" placeholder="区域" allow-clear style="width:180px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-select v-model:value="f.isOpen" placeholder="商城状态" allow-clear style="width:120px">
        <a-select-option value="true">已开放</a-select-option>
        <a-select-option value="false">未开放</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">商家配置</span></div>
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #autoAuditEnabled="{ record }">
          <a-tag :color="record.autoAuditEnabled ? 'green' : 'default'">{{ record.autoAuditEnabled ? '开启' : '关闭' }}</a-tag>
        </template>
        <template #commissionRate="{ record }">{{ record.commissionRate ? record.commissionRate + '%' : '-' }}</template>
        <template #isOpen="{ record }">
          <a-tag :color="record.isOpen ? 'green' : 'red'">{{ record.isOpen ? '开放' : '关闭' }}</a-tag>
        </template>
        <template #action="{ record }">
          <a @click="onEdit(record)">配置</a>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="modalVisible" :title="'编辑配置 - ' + editingRegionName" :width="640" :confirm-loading="submitting" @ok="onSubmit">
      <a-form layout="vertical">
        <a-card title="基础设置" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item label="商城开放">
                <a-switch v-model:checked="form.isOpen" checked-children="开" un-checked-children="关" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="自动审核入驻">
                <a-switch v-model:checked="form.autoAuditEnabled" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="最大商家数">
                <a-input-number v-model:value="form.maxMerchants" :min="0" :max="9999" style="width:100%" placeholder="不限制" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>

        <a-card title="费率设置" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item label="平台抽成(%)">
                <a-input-number v-model:value="form.commissionRate" :min="0" :max="100" :precision="2" style="width:100%" placeholder="0" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="提现手续费(%)">
                <a-input-number v-model:value="form.withdrawFeeRate" :min="0" :max="100" :precision="2" style="width:100%" placeholder="0" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="最小提现(元)">
                <a-input-number v-model:value="form.minWithdrawAmount" :min="0" :precision="2" style="width:100%" placeholder="0" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>

        <a-card title="商品设置" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item label="商品需审核">
                <a-switch v-model:checked="form.requireProductAudit" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="允许负库存">
                <a-switch v-model:checked="form.allowNegativeStock" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="每商家最大商品数">
                <a-input-number v-model:value="form.maxProductCount" :min="0" :max="99999" style="width:100%" placeholder="不限制" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>

        <a-card title="配送与结算" size="small">
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item label="默认配送范围(米)">
                <a-input-number v-model:value="form.defaultDeliveryRange" :min="0" :max="99999" style="width:100%" placeholder="0" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="结算周期">
                <a-select v-model:value="form.settlementCycle">
                  <a-select-option value="weekly">每周</a-select-option>
                  <a-select-option value="monthly">每月</a-select-option>
                  <a-select-option value="manual">手动</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="结算日">
                <a-input-number v-model:value="form.settlementDay" :min="1" :max="28" style="width:100%" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ regionId: undefined as string | undefined, isOpen: undefined as string | undefined })
const regionOpts = ref<any[]>([])

const cols = [
  { title: '区域', dataIndex: ['region', 'name'], width: 140 },
  { title: '商城状态', dataIndex: 'isOpen', width: 90, slot: 'isOpen' },
  { title: '自动审核', dataIndex: 'autoAuditEnabled', width: 80, slot: 'autoAuditEnabled' },
  { title: '平台抽成', dataIndex: 'commissionRate', width: 90, slot: 'commissionRate' },
  { title: '最大商家', dataIndex: 'maxMerchants', width: 80 },
  { title: '商品审核', dataIndex: 'requireProductAudit', width: 80 },
  { title: '更新时间', dataIndex: 'updatedAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 70, slot: 'action', fixed: 'right' },
]

async function fetchData() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.regionId) params.regionId = f.regionId
    if (f.isOpen !== undefined) params.isOpen = f.isOpen
    const res = await shopApi.getRegionSettingsList(params)
    list.value = res.data.data?.list || []
    t.value = res.data.data?.total || 0
  } catch { /* handled */ }
  finally { ld.value = false }
}

async function loadRegions() {
  try {
    const res = await shopApi.getMerchantList({ page: 1, pageSize: 1000 })
    regionOpts.value = res.data.data?.list || []
  } catch { /* handled */ }
}

function onSearch() { p.value = 1; fetchData() }
function onReset() { f.regionId = undefined; f.isOpen = undefined; onSearch() }

const modalVisible = ref(false), editingRegionId = ref(''), editingRegionName = ref(''), submitting = ref(false)
const form = reactive({
  isOpen: true, autoAuditEnabled: false, maxMerchants: undefined as number | undefined,
  commissionRate: undefined as number | undefined, withdrawFeeRate: undefined as number | undefined, minWithdrawAmount: undefined as number | undefined,
  requireProductAudit: true, allowNegativeStock: false, maxProductCount: undefined as number | undefined,
  defaultDeliveryRange: undefined as number | undefined, settlementCycle: 'weekly' as string, settlementDay: 1,
})

async function onEdit(r: any) {
  editingRegionId.value = r.regionId
  editingRegionName.value = (r as any).region?.name || r.regionId
  Object.assign(form, {
    isOpen: r.isOpen, autoAuditEnabled: r.autoAuditEnabled,
    maxMerchants: r.maxMerchants, commissionRate: r.commissionRate ? Number(r.commissionRate) : undefined,
    withdrawFeeRate: r.withdrawFeeRate ? Number(r.withdrawFeeRate) : undefined,
    minWithdrawAmount: r.minWithdrawAmount ? Number(r.minWithdrawAmount) : undefined,
    requireProductAudit: r.requireProductAudit, allowNegativeStock: r.allowNegativeStock,
    maxProductCount: r.maxProductCount, defaultDeliveryRange: r.defaultDeliveryRange,
    settlementCycle: r.settlementCycle || 'weekly', settlementDay: r.settlementDay || 1,
  })
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    await shopApi.saveRegionSettings(editingRegionId.value, form as any)
    message.success('配置已保存')
    modalVisible.value = false
    fetchData()
  } catch { /* handled */ }
  finally { submitting.value = false }
}

loadRegions()
fetchData()
</script>

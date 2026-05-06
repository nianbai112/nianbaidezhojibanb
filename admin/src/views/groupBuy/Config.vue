<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="regionId" placeholder="选择区域" style="width:200px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">团购区域设置</span></div>
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 12 }">
        <a-form-item label="开启团购">
          <a-switch v-model:checked="form.isOpen" />
          <span style="margin-left:8px;color:#999">关闭后，小程序端将不显示团购入口</span>
        </a-form-item>

        <a-form-item label="审核开关">
          <a-switch v-model:checked="form.requireAudit" />
          <span style="margin-left:8px;color:#999">开启后，商家发布的团购套餐需后台审核才能上架</span>
        </a-form-item>

        <a-form-item label="平台抽成比例 (%)">
          <a-input-number v-model:value="form.commissionRate" :min="0" :max="100" :precision="1" style="width:200px" />
          <span style="margin-left:8px;color:#999">团购订单完成后，平台扣除的提成比例</span>
        </a-form-item>

        <a-form-item label="区域抽成比例 (%)">
          <a-input-number v-model:value="form.regionCommissionRate" :min="0" :max="100" :precision="1" style="width:200px" />
          <span style="margin-left:8px;color:#999">区域运营方的分成比例</span>
        </a-form-item>

        <a-form-item label="团购说明文案">
          <a-textarea v-model:value="form.description" :rows="4" placeholder="显示在小程序端的团购须知" />
        </a-form-item>

        <a-form-item :wrapper-col="{ offset: 6, span: 12 }">
          <a-button type="primary" :loading="saving" @click="handleSave">保存配置</a-button>
        </a-form-item>
      </a-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { groupBuyApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'

const userStore = useUserStore()
const saving = ref(false)
const regionId = ref(userStore.regionId || '')
const regionOpts = ref<any[]>([])

const form = reactive({
  isOpen: true,
  requireAudit: false,
  commissionRate: 5,
  regionCommissionRate: 2,
  description: ''
})

async function fetchConfig() {
  if (!regionId.value) return
  try {
    const res = await groupBuyApi.getAdminConfig(regionId.value)
    if (res.data) Object.assign(form, res.data)
  } catch { /* ignore */ }
}

async function loadRegions() {
  try {
    const res = await shopApi.getMerchantList({ page: 1, pageSize: 1000 })
    const merchants = (res.data?.data?.list || res.data?.list || []) as any[]
    const map = new Map<string, any>()
    merchants.forEach((m: any) => { if (m.regionId && !map.has(m.regionId)) map.set(m.regionId, { id: m.regionId, name: m.regionName || m.regionId }) })
    regionOpts.value = Array.from(map.values())
  } catch { /* ignore */ }
}

async function handleSave() {
  if (!regionId.value) return message.warning('请选择区域')
  saving.value = true
  try {
    await groupBuyApi.updateAdminConfig(regionId.value, form)
    message.success('配置已保存')
  } finally { saving.value = false }
}

function onSearch() { fetchConfig() }
function onReset() { regionId.value = userStore.regionId || ''; fetchConfig() }

onMounted(() => { loadRegions(); fetchConfig() })
</script>

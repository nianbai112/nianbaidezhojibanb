<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">跑腿页面配置</span>
      </div>

      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 12 }">
        <a-form-item label="区域">
          <a-select v-model:value="regionId" placeholder="选择区域" style="width:240px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" :loading="regionLoading" @change="onRegionChange" />
        </a-form-item>

        <template v-if="regionId">
          <a-divider />

          <a-form-item label="首页顶部公告">
            <a-textarea v-model:value="form.notice" :rows="3" placeholder="请输入在小程序跑腿首页展示的滚动公告" />
          </a-form-item>

          <a-form-item label="下单页提示文案">
            <a-textarea v-model:value="form.orderTips" :rows="3" placeholder="例如：禁止配送违禁品、易燃易爆品等" />
          </a-form-item>

          <a-form-item label="默认骑手头像">
            <a-input v-model:value="form.defaultRiderAvatar" placeholder="输入头像URL" />
          </a-form-item>

          <a-form-item label="客服电话">
            <a-input v-model:value="form.servicePhone" placeholder="请输入客服电话" />
          </a-form-item>

          <a-form-item :wrapper-col="{ offset: 6, span: 12 }">
            <a-button type="primary" :loading="saving" @click="handleSave">保存配置</a-button>
          </a-form-item>
        </template>
      </a-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { deliveryApi } from '@/api/delivery'
import { shopApi } from '@/api/shop'

const regionId = ref('')
const regionOpts = ref<any[]>([])
const regionLoading = ref(false)
const saving = ref(false)

const form = reactive({
  notice: '',
  orderTips: '',
  defaultRiderAvatar: '',
  servicePhone: '',
})

async function loadRegions() {
  regionLoading.value = true
  try {
    const res = await shopApi.getMerchantList({ page: 1, pageSize: 1000 })
    const merchants = (res.data?.data?.list || res.data?.list || []) as any[]
    const map = new Map<string, any>()
    merchants.forEach((m: any) => {
      if (m.regionId && !map.has(m.regionId)) map.set(m.regionId, { id: m.regionId, name: m.regionName || m.regionId })
    })
    regionOpts.value = Array.from(map.values())
  } finally { regionLoading.value = false }
}

async function onRegionChange(val: string) {
  if (!val) return
  try {
    const res = await deliveryApi.getPageConfig(val)
    const data = res.data?.data || res.data
    if (data) {
      form.notice = data.notice || ''
      form.orderTips = data.orderTips || ''
      form.defaultRiderAvatar = data.defaultRiderAvatar || ''
      form.servicePhone = data.servicePhone || ''
    }
  } catch { /* use defaults */ }
}

async function handleSave() {
  if (!regionId.value) return
  saving.value = true
  try {
    await deliveryApi.savePageConfig(regionId.value, { ...form })
    message.success('配置已保存')
  } finally { saving.value = false }
}

loadRegions()
</script>

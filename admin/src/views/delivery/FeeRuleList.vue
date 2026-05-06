<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">跑腿计费配置</span>
      </div>

      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 12 }">
        <a-form-item label="区域">
          <a-select v-model:value="regionId" placeholder="选择区域" style="width:240px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" :loading="regionLoading" @change="onRegionChange" />
        </a-form-item>

        <template v-if="regionId">
          <a-divider />

          <a-form-item label="开启跑腿">
            <a-switch v-model:checked="form.isOpen" />
          </a-form-item>

          <a-form-item label="基础配送费(元)">
            <a-input-number v-model:value="form.basePrice" :min="0" :precision="2" style="width:100%" />
          </a-form-item>

          <a-form-item label="每公里加价(元)">
            <a-input-number v-model:value="form.distancePrice" :min="0" :precision="2" style="width:100%" />
          </a-form-item>

          <a-form-item label="每公斤加价(元)">
            <a-input-number v-model:value="form.weightPrice" :min="0" :precision="2" style="width:100%" />
          </a-form-item>

          <a-form-item label="每分钟加价(元)">
            <a-input-number v-model:value="form.timePrice" :min="0" :precision="2" style="width:100%" />
          </a-form-item>

          <a-form-item label="夜间加价(元)">
            <a-input-number v-model:value="form.nightPrice" :min="0" :precision="2" style="width:100%" />
          </a-form-item>

          <a-form-item label="最大配送距离(公里)">
            <a-input-number v-model:value="form.maxDistance" :min="1" style="width:100%" />
          </a-form-item>

          <a-form-item label="最大配送重量(公斤)">
            <a-input-number v-model:value="form.maxWeight" :min="1" style="width:100%" />
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
const loading = ref(false)

const form = reactive({
  isOpen: true,
  basePrice: 5,
  distancePrice: 2,
  weightPrice: 0.5,
  timePrice: 0,
  nightPrice: 3,
  maxDistance: 10,
  maxWeight: 20,
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
  loading.value = true
  try {
    const res = await deliveryApi.getFeeConfig(val)
    const data = res.data.data
    if (data) {
      form.isOpen = data.isOpen
      form.basePrice = Number(data.basePrice)
      form.distancePrice = Number(data.distancePrice)
      form.weightPrice = Number(data.weightPrice)
      form.timePrice = Number(data.timePrice) || 0
      form.nightPrice = Number(data.nightPrice)
      form.maxDistance = data.maxDistance
      form.maxWeight = data.maxWeight
    }
  } finally { loading.value = false }
}

async function handleSave() {
  if (!regionId.value) return
  saving.value = true
  try {
    await deliveryApi.saveFeeConfig(regionId.value, { ...form })
    message.success('配置已保存')
  } finally { saving.value = false }
}

loadRegions()
</script>

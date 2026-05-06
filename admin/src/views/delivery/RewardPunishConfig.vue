<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">奖惩配置</span>
      </div>

      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 12 }">
        <a-form-item label="区域">
          <a-select v-model:value="regionId" placeholder="选择区域" style="width:240px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" :loading="regionLoading" @change="onRegionChange" />
        </a-form-item>

        <template v-if="regionId">
          <a-divider />

          <a-form-item label="超时罚款(元)">
            <a-input-number v-model:value="form.timeoutPenalty" :min="0" :precision="2" style="width:100%" />
            <div class="text-secondary mt-1">骑手接单后超时未完成的罚款金额</div>
          </a-form-item>

          <a-form-item label="超时时间(分钟)">
            <a-input-number v-model:value="form.timeoutMinutes" :min="1" style="width:100%" />
          </a-form-item>

          <a-form-item label="差评罚款(元)">
            <a-input-number v-model:value="form.badReviewPenalty" :min="0" :precision="2" style="width:100%" />
          </a-form-item>

          <a-form-item label="好评奖励(元)">
            <a-input-number v-model:value="form.goodReviewReward" :min="0" :precision="2" style="width:100%" />
          </a-form-item>

          <a-form-item label="夜间完单额外奖励(元)">
            <a-input-number v-model:value="form.nightReward" :min="0" :precision="2" style="width:100%" />
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
  timeoutPenalty: 5,
  timeoutMinutes: 30,
  badReviewPenalty: 3,
  goodReviewReward: 2,
  nightReward: 5,
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
    const res = await deliveryApi.getRewardPunish(val)
    const data = res.data?.data || res.data
    if (data) {
      form.timeoutPenalty = Number(data.timeoutPenalty)
      form.timeoutMinutes = data.timeoutMinutes
      form.badReviewPenalty = Number(data.badReviewPenalty)
      form.goodReviewReward = Number(data.goodReviewReward)
      form.nightReward = Number(data.nightReward)
    }
  } catch { /* use defaults */ }
}

async function handleSave() {
  if (!regionId.value) return
  saving.value = true
  try {
    await deliveryApi.saveRewardPunish(regionId.value, { ...form })
    message.success('配置已保存')
  } finally { saving.value = false }
}

loadRegions()
</script>

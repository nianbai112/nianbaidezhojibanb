<template>
  <div class="page-shell">
    <PageHeader title="外卖区域规则" subtitle="配置区域抽成、配送范围、审核与结算规则" icon="Setting" />
    <div class="filter-bar">
      <el-select v-model="selectedRegionId" placeholder="选择区域" clearable filterable style="width: 240px" @change="loadDetail">
        <el-option v-for="r in regionList" :key="r.id" :label="r.name" :value="r.id" />
      </el-select>
      <el-button type="primary" :disabled="!selectedRegionId" @click="save">保存设置</el-button>
    </div>
    <el-card v-loading="loading" v-if="selectedRegionId">
      <template #header><span>区域商家配置</span></template>
      <el-form :model="form" label-width="180px">
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="自动审核商家">
              <el-switch v-model="form.autoAuditEnabled" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最大商家数">
              <el-input-number v-model="form.maxMerchants" :min="0" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="平台抽成比例(%)">
              <el-input-number v-model="form.commissionRate" :min="0" :max="100" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最小提现金额(元)">
              <el-input-number v-model="form.minWithdrawAmount" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="提现手续费率(%)">
              <el-input-number v-model="form.withdrawFeeRate" :min="0" :max="100" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="默认配送范围(km)">
              <el-input-number v-model="form.defaultDeliveryRange" :min="0" :precision="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="允许负库存">
              <el-switch v-model="form.allowNegativeStock" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最大商品数">
              <el-input-number v-model="form.maxProductCount" :min="0" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="商品需要审核">
              <el-switch v-model="form.requireProductAudit" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结算周期">
              <el-select v-model="form.settlementCycle" style="width: 100%">
                <el-option label="周结" value="weekly" />
                <el-option label="半月结" value="biweekly" />
                <el-option label="月结" value="monthly" />
                <el-option label="日结" value="daily" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="结算日">
              <el-input-number v-model="form.settlementDay" :min="1" :max="31" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="区域开放">
              <el-switch v-model="form.isOpen" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
    <EmptyState v-else description="请先选择区域" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { getRegionMerchantSettings, getRegionMerchantSettingDetail, saveRegionMerchantSettings } from '@/api/merchant'
import { fetchRegions } from '@/api/admin'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const selectedRegionId = ref('')
const regionList = ref<any[]>([])
const settingsMap = ref<Record<string, any>>({})

const form = reactive({
  autoAuditEnabled: false,
  maxMerchants: 100,
  commissionRate: 5,
  minWithdrawAmount: 10,
  withdrawFeeRate: 0,
  defaultDeliveryRange: 3,
  allowNegativeStock: false,
  maxProductCount: 200,
  requireProductAudit: true,
  settlementCycle: 'weekly',
  settlementDay: 1,
  isOpen: true,
})

const loadRegions = async () => {
  try {
    regionList.value = await fetchRegions()
  } catch (e: any) {
    ElMessage.error(e?.message || '加载区域失败')
  }
}

const loadDetail = async () => {
  if (!selectedRegionId.value) return
  // 优先使用已缓存的设置
  const cached = settingsMap.value[selectedRegionId.value]
  if (cached) {
    Object.assign(form, cached)
    return
  }
  loading.value = true
  try {
    const res: any = await getRegionMerchantSettingDetail(selectedRegionId.value)
    const data = res?.data ?? res
    if (data) {
      Object.assign(form, {
        autoAuditEnabled: !!data.autoAuditEnabled,
        maxMerchants: data.maxMerchants ?? 100,
        commissionRate: data.commissionRate ?? 5,
        minWithdrawAmount: data.minWithdrawAmount ?? 10,
        withdrawFeeRate: data.withdrawFeeRate ?? 0,
        defaultDeliveryRange: data.defaultDeliveryRange ?? 3,
        allowNegativeStock: !!data.allowNegativeStock,
        maxProductCount: data.maxProductCount ?? 200,
        requireProductAudit: !!data.requireProductAudit,
        settlementCycle: data.settlementCycle || 'weekly',
        settlementDay: data.settlementDay ?? 1,
        isOpen: data.isOpen !== false,
      })
      settingsMap.value[selectedRegionId.value] = { ...form }
    }
  } catch (e: any) {
    // 可能是404表示没有设置过，使用默认值
    Object.assign(form, {
      autoAuditEnabled: false, maxMerchants: 100, commissionRate: 5, minWithdrawAmount: 10,
      withdrawFeeRate: 0, defaultDeliveryRange: 3, allowNegativeStock: false, maxProductCount: 200,
      requireProductAudit: true, settlementCycle: 'weekly', settlementDay: 1, isOpen: true,
    })
    if (e?.response?.status !== 404 && !e?.message?.includes('不存在') && !e?.message?.includes('NotFound')) {
      ElMessage.error(e?.message || '加载区域设置失败')
    }
  } finally {
    loading.value = false
  }
}

const save = async () => {
  if (!selectedRegionId.value) { ElMessage.warning('请选择区域'); return }
  try {
    const payload = { ...form }
    await saveRegionMerchantSettings(selectedRegionId.value, payload)
    settingsMap.value[selectedRegionId.value] = { ...form }
    ElMessage.success('保存成功')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  }
}

onMounted(() => { loadRegions() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
</style>

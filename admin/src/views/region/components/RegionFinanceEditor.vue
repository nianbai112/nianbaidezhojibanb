<template>
  <div class="section-card glass-card">
    <div class="section-head">
      <div class="card-title">区域财务参数</div>
    </div>
    <el-form label-position="top">
      <div class="form-grid three relaxed">
        <el-form-item label="区域余额">
          <el-input-number v-model="balance" :precision="2" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="最低提现">
          <el-input-number v-model="minWithdraw" :precision="2" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="最高提现">
          <el-input-number v-model="maxWithdraw" :precision="2" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="提现手续费">
          <el-input-number v-model="withdrawFee" :precision="2" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="提现费率">
          <el-input-number v-model="withdrawRate" :precision="4" :min="0" :max="1" :step="0.01" style="width:100%" />
        </el-form-item>
        <el-form-item label="平台佣金比例">
          <el-input-number v-model="commissionRate" :precision="4" :min="0" :max="1" :step="0.01" style="width:100%" />
        </el-form-item>
        <el-form-item label="自助解封费用">
          <el-input-number v-model="selfUnbanFee" :precision="2" :min="0" style="width:100%" />
        </el-form-item>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  balance?: number
  minWithdraw?: number
  maxWithdraw?: number
  withdrawFee?: number
  withdrawRate?: number
  commissionRate?: number
  selfUnbanFee?: number
}

const props = withDefaults(defineProps<Props>(), {
  balance: 0,
  minWithdraw: 0,
  maxWithdraw: 0,
  withdrawFee: 0,
  withdrawRate: 0,
  commissionRate: 0,
  selfUnbanFee: 0
})

const emit = defineEmits<{
  'update:balance': [value: number]
  'update:minWithdraw': [value: number]
  'update:maxWithdraw': [value: number]
  'update:withdrawFee': [value: number]
  'update:withdrawRate': [value: number]
  'update:commissionRate': [value: number]
  'update:selfUnbanFee': [value: number]
}>()

const balance = computed({
  get: () => props.balance,
  set: (val) => emit('update:balance', val)
})

const minWithdraw = computed({
  get: () => props.minWithdraw,
  set: (val) => emit('update:minWithdraw', val)
})

const maxWithdraw = computed({
  get: () => props.maxWithdraw,
  set: (val) => emit('update:maxWithdraw', val)
})

const withdrawFee = computed({
  get: () => props.withdrawFee,
  set: (val) => emit('update:withdrawFee', val)
})

const withdrawRate = computed({
  get: () => props.withdrawRate,
  set: (val) => emit('update:withdrawRate', val)
})

const commissionRate = computed({
  get: () => props.commissionRate,
  set: (val) => emit('update:commissionRate', val)
})

const selfUnbanFee = computed({
  get: () => props.selfUnbanFee,
  set: (val) => emit('update:selfUnbanFee', val)
})
</script>

<style scoped lang="scss">
.section-card {
  padding: 0;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 4px;
}

.section-card :deep(.el-form) {
  padding: 16px 24px 24px;
}

.relaxed {
  gap: 16px 24px;
}
</style>

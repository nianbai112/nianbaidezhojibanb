<template>
  <div class="page-shell">
    <PageHeader title="计费规则" subtitle="配送计费规则配置" icon="Money" />
    <el-card v-loading="loading">
      <el-form :model="config" label-width="120px" style="max-width: 600px;">
        <el-form-item label="基础配送费">
          <el-input-number v-model="config.basePrice" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="每公里费用">
          <el-input-number v-model="config.distancePrice" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="最大距离(km)">
          <el-input-number v-model="config.maxDistance" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="最大重量(kg)">
          <el-input-number v-model="config.maxWeight" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="config.isOpen" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="save" :loading="saving">保存配置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const saving = ref(false)
const config = ref({
  basePrice: 0,
  distancePrice: 0,
  maxDistance: 10,
  maxWeight: 20,
  isOpen: true,
})

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/errand/fee-config')
    if (res) config.value = { ...config.value, ...(res?.data || res) }
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const save = async () => {
  saving.value = true
  try {
    await request.put('/admin/errand/fee-config', config.value)
    ElMessage.success('保存成功')
  } catch (e) { ElMessage.error('保存失败') } finally { saving.value = false }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
</style>

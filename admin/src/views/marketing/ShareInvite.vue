<template>
  <div class="page-shell">
    <PageHeader title="分享有礼" subtitle="管理分享有礼活动" icon="Share" />
    <el-card style="margin-top: 16px;">
      <template #header><span>分享有礼配置</span></template>
      <el-form :model="config" label-width="120px" style="max-width: 600px;" v-loading="loading">
        <el-form-item label="启用状态">
          <el-switch v-model="config.enabled" />
        </el-form-item>
        <el-form-item label="邀请奖励">
          <el-input-number v-model="config.inviteReward" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="被邀请奖励">
          <el-input-number v-model="config.inviteeReward" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveConfig" :loading="saving">保存配置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card style="margin-top: 20px;">
      <template #header><span>邀请记录</span></template>
      <el-table :data="records" size="small" v-loading="loadingRecords">
        <el-table-column prop="inviter.nickname" label="邀请人" width="120">
          <template #default="{ row }">{{ row.inviter?.nickname || row.inviterId }}</template>
        </el-table-column>
        <el-table-column prop="invitee.nickname" label="被邀请人" width="120">
          <template #default="{ row }">{{ row.invitee?.nickname || row.inviteeId }}</template>
        </el-table-column>
        <el-table-column prop="reward" label="奖励" width="100">
          <template #default="{ row }">¥{{ Number(row.reward || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="170">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
        </el-table-column>
      </el-table>
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
const loadingRecords = ref(false)
const config = ref({ enabled: false, inviteReward: 0, inviteeReward: 0 })
const records = ref<any[]>([])

const loadConfig = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/marketing/share-invite/config')
    if (res) config.value = { ...config.value, ...(res?.data || res) }
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const saveConfig = async () => {
  saving.value = true
  try {
    await request.put('/admin/marketing/share-invite/config', config.value)
    ElMessage.success('保存成功')
  } catch (e) { ElMessage.error('保存失败') } finally { saving.value = false }
}

const loadRecords = async () => {
  loadingRecords.value = true
  try {
    const res: any = await request.get('/admin/marketing/share-invite/records', { params: { page: 1, pageSize: 20 } })
    records.value = res?.list || res?.data?.list || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loadingRecords.value = false }
}

onMounted(() => { loadConfig(); loadRecords() })
</script>

<style scoped>
.page-shell { padding: 24px; }
</style>

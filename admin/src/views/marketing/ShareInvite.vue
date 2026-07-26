<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 分享</p>
        <h2>分享有礼</h2>
        <p>配置邀请奖励，查看真实分享邀请和奖励发放记录。</p>
      </div>
      <el-button type="primary" @click="saveConfig" :loading="saving">保存配置</el-button>
    </div>

    <div class="config-grid">
      <div class="data-card">
        <h3>奖励配置</h3>
        <el-form :model="config" label-position="top" v-loading="loadingConfig">
          <el-form-item label="启用分享奖励">
            <el-switch v-model="config.enabled" active-text="启用" inactive-text="关闭" />
          </el-form-item>
          <div class="dialog-grid">
            <el-form-item label="邀请人奖励">
              <el-input-number v-model="config.inviterReward" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="被邀请人奖励">
              <el-input-number v-model="config.inviteeReward" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="最大邀请次数">
              <el-input-number v-model="config.maxInvites" :min="0" />
            </el-form-item>
          </div>
        </el-form>
      </div>
      <div class="data-card summary-card">
        <h3>当前规则</h3>
        <p>邀请人成功邀请新用户后奖励 <b>{{ formatMoney(config.inviterReward) }}</b></p>
        <p>被邀请人注册后奖励 <b>{{ formatMoney(config.inviteeReward) }}</b></p>
        <p>单用户最多奖励 <b>{{ config.maxInvites }}</b> 次邀请</p>
      </div>
    </div>

    <div class="data-card">
      <div class="card-title">
        <h3>邀请记录</h3>
        <el-button @click="loadRecords">刷新</el-button>
      </div>
      <el-table :data="records" v-loading="loadingRecords" empty-text="暂无真实邀请记录">
        <el-table-column label="邀请人" min-width="160">
          <template #default="{ row }">{{ row.inviter?.nickname || row.inviterId }}</template>
        </el-table-column>
        <el-table-column label="被邀请人" min-width="160">
          <template #default="{ row }">{{ row.invitee?.nickname || row.inviteeId }}</template>
        </el-table-column>
        <el-table-column label="邀请奖励" width="110">
          <template #default="{ row }">{{ formatMoney(row.rewardAmount) }}</template>
        </el-table-column>
        <el-table-column label="新人奖励" width="110">
          <template #default="{ row }">{{ formatMoney(row.inviteeRewardAmount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="190">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadRecords"
          @size-change="loadRecords"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import { errorMessage, formatMoney, formatTime, unwrapData, unwrapPage } from './utils'

const loadingConfig = ref(false)
const saving = ref(false)
const loadingRecords = ref(false)
const records = ref<any[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const config = reactive({
  enabled: false,
  inviterReward: 0,
  inviteeReward: 0,
  maxInvites: 100,
})

function statusType(status: string) {
  const map: Record<string, string> = { SUCCESS: 'success', PENDING: 'warning', FAILED: 'danger', success: 'success', pending: 'warning', failed: 'danger' }
  return map[status] || 'info'
}

function statusLabel(status: string) {
  const map: Record<string, string> = { SUCCESS: '成功', PENDING: '待处理', FAILED: '失败', success: '成功', pending: '待处理', failed: '失败' }
  return map[status] || status || '-'
}

async function loadConfig() {
  loadingConfig.value = true
  try {
    const data = unwrapData(await request.get('/admin/marketing/share-invite/config'), config) as any
    Object.assign(config, {
      enabled: data.enabled ?? false,
      inviterReward: Number(data.inviterReward ?? data.inviteReward ?? 0),
      inviteeReward: Number(data.inviteeReward ?? 0),
      maxInvites: Number(data.maxInvites ?? 100),
    })
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载分享配置失败'))
  } finally {
    loadingConfig.value = false
  }
}

async function saveConfig() {
  saving.value = true
  try {
    await request.put('/admin/marketing/share-invite/config', config)
    ElMessage.success('分享配置已保存')
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '保存分享配置失败'))
  } finally {
    saving.value = false
  }
}

async function loadRecords() {
  loadingRecords.value = true
  try {
    const res = await request.get('/admin/marketing/share-invite/records', {
      params: { page: pagination.page, pageSize: pagination.pageSize },
    })
    const page = unwrapPage(res)
    records.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载邀请记录失败'))
  } finally {
    loadingRecords.value = false
  }
}

onMounted(() => {
  loadConfig()
  loadRecords()
})
</script>

<style scoped>
.marketing-page { padding: 24px; }
.marketing-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.config-grid { display: grid; grid-template-columns: 1.2fr .8fr; gap: 18px; margin-bottom: 18px; }
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 16px; box-shadow: 0 14px 36px rgba(37,99,235,.08); padding: 18px; }
.data-card h3 { margin: 0 0 16px; color: #0f172a; }
.summary-card p { color: #475569; font-weight: 700; }
.summary-card b { color: #2563eb; }
.dialog-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 12px; }
.card-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.card-title h3 { margin: 0; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 1000px) {
  .config-grid,
  .dialog-grid { grid-template-columns: 1fr; }
}
</style>

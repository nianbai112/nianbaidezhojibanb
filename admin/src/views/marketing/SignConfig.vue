<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 签到</p>
        <h2>签到任务</h2>
        <p>签到配置保存到 Config 表，签到记录读取真实 check_ins 数据。</p>
      </div>
      <el-button type="primary" @click="saveConfig" :loading="saving">保存配置</el-button>
    </div>

    <div class="config-grid">
      <div class="data-card">
        <h3>基础配置</h3>
        <el-form label-position="top" v-loading="loadingConfig">
          <el-form-item label="启用签到">
            <el-switch v-model="config.enabled" active-text="启用" inactive-text="关闭" />
          </el-form-item>
          <div class="dialog-grid">
            <el-form-item label="每日签到奖励">
              <el-input-number v-model="config.dailyReward" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="最大连续天数">
              <el-input-number v-model="config.maxContinuousDays" :min="1" :max="365" />
            </el-form-item>
          </div>
        </el-form>
      </div>

      <div class="data-card">
        <div class="card-title">
          <h3>连续签到奖励</h3>
          <el-button size="small" @click="addReward">增加一天</el-button>
        </div>
        <div class="reward-list">
          <div v-for="(_, index) in config.continuousRewards" :key="index" class="reward-item">
            <span>第 {{ index + 1 }} 天</span>
            <el-input-number v-model="config.continuousRewards[index]" :min="0" :precision="2" size="small" />
            <el-button link type="danger" @click="removeReward(index)">删除</el-button>
          </div>
        </div>
      </div>
    </div>

    <div class="data-card">
      <div class="card-title">
        <h3>签到记录</h3>
        <el-button @click="loadRecords">刷新</el-button>
      </div>
      <el-table :data="records" v-loading="loadingRecords" empty-text="暂无真实签到记录">
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
        </el-table-column>
        <el-table-column label="签到类型" width="120">
          <template #default="{ row }">{{ row.type || 'DAILY' }}</template>
        </el-table-column>
        <el-table-column label="连续天数" prop="continuousDays" width="110" />
        <el-table-column label="奖励" width="110">
          <template #default="{ row }">{{ formatMoney(row.reward) }}</template>
        </el-table-column>
        <el-table-column label="签到时间" width="190">
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

const saving = ref(false)
const loadingConfig = ref(false)
const loadingRecords = ref(false)
const records = ref<any[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const config = reactive({
  enabled: true,
  dailyReward: 10,
  maxContinuousDays: 7,
  continuousRewards: [20, 30, 50, 80, 100, 120, 150] as number[],
})

async function loadConfig() {
  loadingConfig.value = true
  try {
    const res = await request.get('/admin/marketing/sign/config')
    Object.assign(config, unwrapData(res, config))
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载签到配置失败'))
  } finally {
    loadingConfig.value = false
  }
}

async function loadRecords() {
  loadingRecords.value = true
  try {
    const res = await request.get('/admin/marketing/sign/records', {
      params: { page: pagination.page, pageSize: pagination.pageSize },
    })
    const page = unwrapPage(res)
    records.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载签到记录失败'))
  } finally {
    loadingRecords.value = false
  }
}

async function saveConfig() {
  saving.value = true
  try {
    await request.put('/admin/marketing/sign/config', config)
    ElMessage.success('配置已保存')
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '保存签到配置失败'))
  } finally {
    saving.value = false
  }
}

function addReward() {
  config.continuousRewards.push(0)
}

function removeReward(index: number) {
  if (config.continuousRewards.length <= 1) {
    ElMessage.warning('至少保留 1 天奖励')
    return
  }
  config.continuousRewards.splice(index, 1)
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
.config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; }
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 16px; box-shadow: 0 14px 36px rgba(37,99,235,.08); padding: 18px; }
.data-card h3 { margin: 0 0 16px; color: #0f172a; }
.card-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.card-title h3 { margin: 0; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.reward-list { display: grid; gap: 10px; max-height: 270px; overflow: auto; }
.reward-item { display: grid; grid-template-columns: 80px 1fr auto; gap: 12px; align-items: center; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 1000px) {
  .config-grid,
  .dialog-grid { grid-template-columns: 1fr; }
}
</style>

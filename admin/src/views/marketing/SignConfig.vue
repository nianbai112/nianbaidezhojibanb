<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 签到</p>
        <h2>签到任务</h2>
        <p>按区域配置在线成长规则，服务端确认在线时长后自动发放经验值。</p>
      </div>
      <div class="header-actions">
        <el-select v-model="selectedRegionId" filterable placeholder="选择运营区域" @change="handleRegionChange">
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-button @click="loadRecords">刷新记录</el-button>
        <el-button type="primary" @click="saveConfig" :loading="saving">保存配置</el-button>
      </div>
    </div>

    <div class="region-strip">
      <div>
        <span>当前区域</span>
        <strong>{{ currentRegion?.name || '未选择区域' }}</strong>
      </div>
      <el-tag :type="config.enabled ? 'success' : 'info'">{{ config.enabled ? '在线成长已启用' : '已关闭' }}</el-tag>
      <el-tag type="warning" effect="plain">前台在线 {{ config.online_minutes }} 分钟</el-tag>
      <el-tag effect="plain">每日 +{{ config.daily_base_exp }} EXP</el-tag>
    </div>

    <div class="config-grid">
      <div class="data-card">
        <div class="card-title">
          <h3>自动成长规则</h3>
          <el-switch v-model="config.enabled" active-text="启用" inactive-text="关闭" />
        </div>
        <el-form label-position="top" v-loading="loadingConfig">
          <div class="dialog-grid">
            <el-form-item label="弹窗标题">
              <el-input v-model="config.activity_title" maxlength="24" />
            </el-form-item>
            <el-form-item label="前台在线分钟数">
              <el-input-number v-model="config.online_minutes" :min="1" :max="180" :precision="0" />
            </el-form-item>
            <el-form-item label="每日经验值">
              <el-input-number v-model="config.daily_base_exp" :min="0" :precision="0" />
            </el-form-item>
            <el-form-item label="完成提示">
              <el-switch v-model="config.popup_enabled" active-text="显示弹窗" inactive-text="仅记账" />
            </el-form-item>
          </div>
          <el-form-item label="成长说明">
            <el-input v-model="config.activity_rules" type="textarea" :rows="3" maxlength="120" show-word-limit />
          </el-form-item>
          <el-form-item label="自动完成弹窗插图">
            <ImageUploadBox v-model="config.popup_image" scene="growth-signin-popup" shape="wide" placeholder="上传自动成长弹窗插图" tip="可按区域上传；未上传时小程序自动使用当前等级图标。建议透明 PNG，最大 5MB" :max-size="5" />
          </el-form-item>
        </el-form>
      </div>

      <div class="data-card">
        <div class="card-title">
          <h3>发放口径</h3>
        </div>
        <div class="operator-note">
          仅累计小程序前台期间的服务端心跳；达到分钟数后，同一用户在同一区域每天只发放一次经验值。不会发积分、余额，也不提供补签。
        </div>
      </div>
    </div>

    <div class="data-card">
      <div class="card-title">
        <h3>签到记录</h3>
        <div class="table-tools">
          <el-date-picker
            v-model="recordDateRange"
            type="daterange"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
          <el-input v-model="recordUserId" clearable placeholder="用户ID，可选" />
          <el-button @click="loadRecords">查询</el-button>
        </div>
      </div>
      <el-table :data="records" v-loading="loadingRecords" empty-text="暂无真实签到记录">
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
        </el-table-column>
        <el-table-column label="签到日期" prop="signinDate" width="120" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag size="small" type="success">
              {{ row.type === 'ONLINE_GROWTH' ? '在线成长' : '成长签到' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="经验值" width="110">
          <template #default="{ row }">+{{ Number(row.expEarned || 0) }}</template>
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
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { fetchRegions } from '@/api/admin'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { request } from '@/api/request'
import { errorMessage, formatTime, unwrapData, unwrapPage } from './utils'

const route = useRoute()
const saving = ref(false)
const loadingConfig = ref(false)
const loadingRecords = ref(false)
const regions = ref<any[]>([])
const selectedRegionId = ref('')
const records = ref<any[]>([])
const recordUserId = ref('')
const recordDateRange = ref<string[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const config = reactive({
  regionId: '',
  enabled: true,
  activity_title: '今日成长已到账',
  activity_rules: '累计前台在线达到设定时长后，系统自动发放经验值。',
  online_minutes: 30,
  daily_base_exp: 5,
  popup_enabled: true,
  popup_image: '',
})

const currentRegion = computed(() => regions.value.find(region => String(region.id) === String(selectedRegionId.value)))

async function loadRegions() {
  regions.value = await fetchRegions()
  const preferred = String(route.query.regionId || localStorage.getItem('LM_SELECTED_REGION_ID') || localStorage.getItem('selectedRegionId') || '')
  selectedRegionId.value = preferred && regions.value.some(region => String(region.id) === preferred)
    ? preferred
    : String(regions.value[0]?.id || '')
  if (selectedRegionId.value) await handleRegionChange()
}

function normalizeConfig(data: any) {
  Object.assign(config, {
    regionId: selectedRegionId.value,
    enabled: data.enabled !== false,
    activity_title: data.activity_title || '今日成长已到账',
    activity_rules: data.activity_rules || '累计前台在线达到设定时长后，系统自动发放经验值。',
    online_minutes: Number(data.online_minutes ?? data.onlineMinutes ?? 30),
    daily_base_exp: Number(data.daily_base_exp ?? 5),
    popup_enabled: data.popup_enabled !== false,
    popup_image: String(data.popup_image ?? data.popupImage ?? ''),
  })
}

async function handleRegionChange() {
  if (!selectedRegionId.value) return
  localStorage.setItem('LM_SELECTED_REGION_ID', String(selectedRegionId.value))
  localStorage.setItem('selectedRegionId', String(selectedRegionId.value))
  await Promise.all([loadConfig(), loadRecords(true)])
}

async function loadConfig() {
  loadingConfig.value = true
  try {
    const res = await request.get('/admin/marketing/sign/config', { params: { regionId: selectedRegionId.value } })
    normalizeConfig(unwrapData(res, config))
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载签到配置失败'))
  } finally {
    loadingConfig.value = false
  }
}

async function loadRecords(reset = false) {
  if (!selectedRegionId.value) return
  if (reset) pagination.page = 1
  loadingRecords.value = true
  try {
    const [startDate, endDate] = recordDateRange.value || []
    const res = await request.get('/admin/marketing/sign/records', {
      params: {
        regionId: selectedRegionId.value,
        userId: recordUserId.value || undefined,
        startDate,
        endDate,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
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
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  saving.value = true
  try {
    await request.put('/admin/marketing/sign/config', {
      ...config,
      regionId: selectedRegionId.value,
    })
    ElMessage.success('签到配置已保存')
    await loadConfig()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '保存签到配置失败'))
  } finally {
    saving.value = false
  }
}

onMounted(loadRegions)
</script>

<style scoped>
.marketing-page { padding: 24px; }
.marketing-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 18px; }
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.header-actions { display: flex; align-items: center; gap: 10px; }
.header-actions .el-select { width: 220px; }
.region-strip { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; padding: 14px 18px; background: #fff; border: 1px solid #dbe7f5; border-radius: 14px; box-shadow: 0 12px 30px rgba(37,99,235,.06); }
.region-strip div { margin-right: auto; display: grid; gap: 4px; }
.region-strip span { color: #64748b; font-size: 12px; font-weight: 700; }
.region-strip strong { color: #0f172a; font-size: 18px; }
.config-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 18px; margin-bottom: 18px; }
.data-card { background: rgba(255,255,255,0.9); border: 1px solid #dbe7f5; border-radius: 14px; box-shadow: 0 14px 36px rgba(37,99,235,.08); padding: 18px; }
.data-card h3 { margin: 0; color: #0f172a; }
.card-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.dialog-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
.reward-list { display: grid; gap: 10px; max-height: 330px; overflow: auto; }
.reward-item { display: grid; grid-template-columns: auto 92px auto 96px 112px auto; gap: 8px; align-items: center; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
.operator-note { margin-top: 12px; color: #64748b; font-size: 13px; line-height: 1.7; font-weight: 600; }
.table-tools { display: flex; align-items: center; gap: 10px; }
.table-tools .el-input { width: 180px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 1100px) {
  .marketing-header,
  .header-actions,
  .region-strip,
  .table-tools { align-items: stretch; flex-direction: column; }
  .config-grid,
  .dialog-grid { grid-template-columns: 1fr; }
  .reward-item { grid-template-columns: 1fr 1fr; }
  .header-actions .el-select,
  .table-tools .el-input { width: 100%; }
}
</style>

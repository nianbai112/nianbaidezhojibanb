<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 分享</p>
        <h2>分享有礼</h2>
        <p>配置邀请奖励、活动时间和发奖限制，小程序分享链接会携带邀请人和区域。</p>
      </div>
      <div class="header-actions">
        <el-select v-model="selectedRegionId" filterable placeholder="选择运营区域" @change="handleRegionChange">
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-button @click="loadRecords">刷新记录</el-button>
        <el-button v-if="hasEditPermission" type="primary" @click="saveConfig" :loading="saving">保存配置</el-button>
      </div>
    </div>

    <div class="region-strip">
      <div>
        <span>当前区域</span>
        <strong>{{ currentRegion?.name || '未选择区域' }}</strong>
      </div>
      <el-tag :type="config.enabled ? 'success' : 'info'">{{ config.enabled ? '活动开启' : '活动关闭' }}</el-tag>
      <el-tag type="warning" effect="plain">邀请人 {{ formatMoney(config.inviterReward) }}</el-tag>
      <el-tag effect="plain">新人 {{ formatMoney(config.inviteeReward) }}</el-tag>
    </div>

    <div class="config-grid">
      <div class="data-card">
        <div class="card-title">
          <h3>活动配置</h3>
          <el-switch v-model="config.enabled" active-text="启用" inactive-text="关闭" />
        </div>
        <el-form :model="config" label-position="top" v-loading="loadingConfig">
          <div class="dialog-grid">
            <el-form-item label="活动标题">
              <el-input v-model="config.activityTitle" maxlength="30" show-word-limit />
            </el-form-item>
            <el-form-item label="参与人群">
              <el-select v-model="config.userLimit" style="width: 100%">
                <el-option label="仅新用户可被邀请" value="NEW_USERS" />
                <el-option label="所有用户可被邀请" value="ALL_USERS" />
              </el-select>
            </el-form-item>
            <el-form-item label="邀请人奖励">
              <el-input-number v-model="config.inviterReward" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="被邀请人奖励">
              <el-input-number v-model="config.inviteeReward" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="邀请人奖励券">
              <el-select v-model="config.inviterCouponId" clearable filterable placeholder="不发券" style="width: 100%">
                <el-option v-for="coupon in coupons" :key="coupon.id" :label="couponLabel(coupon)" :value="coupon.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="新人奖励券">
              <el-select v-model="config.inviteeCouponId" clearable filterable placeholder="不发券" style="width: 100%">
                <el-option v-for="coupon in coupons" :key="coupon.id" :label="couponLabel(coupon)" :value="coupon.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="每日奖励上限">
              <el-input-number v-model="config.dailyInviteLimit" :min="0" />
            </el-form-item>
            <el-form-item label="累计奖励上限">
              <el-input-number v-model="config.totalInviteLimit" :min="0" />
            </el-form-item>
            <el-form-item label="开始时间">
              <el-date-picker v-model="config.startTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="不填表示立即开始" />
            </el-form-item>
            <el-form-item label="结束时间">
              <el-date-picker v-model="config.endTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="不填表示长期有效" />
            </el-form-item>
          </div>
          <el-divider content-position="left">资格限制</el-divider>
          <div class="switch-grid compact">
            <div class="switch-item">
              <div><b>邀请人需绑手机号</b><p>未绑定手机号不能获得邀请收益</p></div>
              <el-switch v-model="config.requireInviterPhone" />
            </div>
            <div class="switch-item">
              <div><b>新人需绑手机号</b><p>被邀请人未绑定手机号则不发奖</p></div>
              <el-switch v-model="config.requireInviteePhone" />
            </div>
            <div class="switch-item">
              <div><b>邀请人需学生认证</b><p>区域要求认证时也会自动强制</p></div>
              <el-switch v-model="config.requireInviterStudentVerify" />
            </div>
            <div class="switch-item">
              <div><b>新人需学生认证</b><p>适合仅认证学生可访问的区域</p></div>
              <el-switch v-model="config.requireInviteeStudentVerify" />
            </div>
          </div>
          <div class="dialog-grid">
            <el-form-item label="邀请人注册满 N 天">
              <el-input-number v-model="config.minInviterAccountAgeDays" :min="0" />
            </el-form-item>
            <el-form-item label="新人注册满 N 分钟">
              <el-input-number v-model="config.minInviteeAccountAgeMinutes" :min="0" />
            </el-form-item>
          </div>
          <el-divider content-position="left">防刷与预算</el-divider>
          <div class="dialog-grid">
            <el-form-item label="邀请冷却分钟">
              <el-input-number v-model="config.inviteCooldownMinutes" :min="0" />
            </el-form-item>
            <el-form-item label="短时间窗口分钟">
              <el-input-number v-model="config.recentWindowMinutes" :min="1" />
            </el-form-item>
            <el-form-item label="窗口内最多奖励次数">
              <el-input-number v-model="config.maxRecentInvites" :min="0" />
            </el-form-item>
            <el-form-item label="同 IP 每日上限">
              <el-input-number v-model="config.sameIpDailyLimit" :min="0" />
            </el-form-item>
            <el-form-item label="同设备每日上限">
              <el-input-number v-model="config.sameDeviceDailyLimit" :min="0" />
            </el-form-item>
            <el-form-item label="同设备累计上限">
              <el-input-number v-model="config.sameDeviceTotalLimit" :min="0" />
            </el-form-item>
            <el-form-item label="活动总预算">
              <el-input-number v-model="config.totalRewardBudget" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="单人单次奖励封顶">
              <el-input-number v-model="config.singleRewardCap" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="发放方式">
              <el-select v-model="config.rewardReleaseMode" style="width: 100%">
                <el-option label="立即发放" value="immediate" />
                <el-option label="管理员审核后发放" value="manual" />
                <el-option label="延迟发放" value="delayed" />
                <el-option label="达成条件后发放" value="qualified" />
              </el-select>
            </el-form-item>
            <el-form-item label="延迟小时">
              <el-input-number v-model="config.rewardDelayHours" :min="0" :disabled="config.rewardReleaseMode !== 'delayed'" />
            </el-form-item>
          </div>
          <el-divider content-position="left">名单限制</el-divider>
          <div class="dialog-grid">
            <el-form-item label="邀请人白名单">
              <el-input v-model="config.inviterWhitelist" type="textarea" :rows="2" placeholder="用户ID，换行或逗号分隔；留空不限制" />
            </el-form-item>
            <el-form-item label="邀请人黑名单">
              <el-input v-model="config.inviterBlacklist" type="textarea" :rows="2" placeholder="用户ID，换行或逗号分隔" />
            </el-form-item>
            <el-form-item label="被邀请人黑名单">
              <el-input v-model="config.inviteeBlacklist" type="textarea" :rows="2" placeholder="用户ID，换行或逗号分隔" />
            </el-form-item>
            <el-form-item label="禁止手机号段">
              <el-input v-model="config.blockedPhonePrefixes" type="textarea" :rows="2" placeholder="如 170,171；换行或逗号分隔" />
            </el-form-item>
          </div>
          <el-form-item label="活动封面">
            <ImageUploadBox
              v-model="config.activityImage"
              scene="share-invite"
              shape="wide"
              placeholder="上传分享活动封面"
              tip="建议 750x350，用于分享有礼页面和分享卡片"
              :max-size="3"
            />
          </el-form-item>
          <el-form-item label="活动规则">
            <el-input v-model="config.activityRules" type="textarea" :rows="4" maxlength="240" show-word-limit />
          </el-form-item>
        </el-form>
      </div>

      <div class="data-card summary-card">
        <h3>运营规则预览</h3>
        <div class="rule-preview">
          <div>
            <span>用户看到</span>
            <strong>{{ config.activityTitle || '邀请好友得奖励' }}</strong>
          </div>
          <div>
            <span>邀请成功</span>
            <strong>邀请人 +{{ formatMoney(config.inviterReward) }}{{ config.inviterCouponId ? ' + 券' : '' }}，新人 +{{ formatMoney(config.inviteeReward) }}{{ config.inviteeCouponId ? ' + 券' : '' }}</strong>
          </div>
          <div>
            <span>奖励限制</span>
            <strong>每日 {{ config.dailyInviteLimit || '不限' }} 次，累计 {{ config.totalInviteLimit || '不限' }} 次</strong>
          </div>
          <div>
            <span>防刷规则</span>
            <strong>{{ riskSummary }}</strong>
          </div>
          <div>
            <span>发放方式</span>
            <strong>{{ releaseModeLabel(config.rewardReleaseMode) }}{{ config.rewardReleaseMode === 'delayed' ? `，延迟 ${config.rewardDelayHours || 0} 小时` : '' }}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="data-card">
      <div class="card-title">
        <h3>邀请记录</h3>
        <div class="table-tools">
          <el-select v-model="recordStatus" clearable placeholder="状态">
            <el-option label="成功" value="SUCCESS" />
            <el-option label="待处理" value="PENDING" />
            <el-option label="失败" value="FAILED" />
          </el-select>
          <el-input v-model="recordKeyword" clearable placeholder="邀请人/被邀请人ID" />
          <el-button @click="loadRecords">查询</el-button>
        </div>
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
        <el-table-column label="失败原因" min-width="160">
          <template #default="{ row }">{{ row.failedReason || '-' }}</template>
        </el-table-column>
        <el-table-column label="奖励状态" min-width="170">
          <template #default="{ row }">
            <div class="reward-status">
              <el-tag size="small" :type="rewardStatusType(row)">{{ rewardStatusText(row) }}</el-tag>
              <small v-if="row.rewardReleaseMode">{{ releaseModeLabel(row.rewardReleaseMode) }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="风控信息" min-width="210">
          <template #default="{ row }">{{ riskText(row) }}</template>
        </el-table-column>
        <el-table-column label="时间" width="190">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button v-if="hasPendingReward(row)" size="small" type="primary" link @click="approveRewards(row)">发放奖励</el-button>
            <span v-else>-</span>
          </template>
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
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { fetchRegions } from '@/api/admin'
import { request } from '@/api/request'
import { errorMessage, formatMoney, formatTime, unwrapData, unwrapPage } from './utils'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('share:view') || auth.permissions.includes('marketing:view'))
const route = useRoute()
const regions = ref<any[]>([])
const coupons = ref<any[]>([])
const selectedRegionId = ref('')
const loadingConfig = ref(false)
const saving = ref(false)
const loadingRecords = ref(false)
const records = ref<any[]>([])
const recordStatus = ref('')
const recordKeyword = ref('')
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const config = reactive({
  regionId: '',
  enabled: false,
  activityTitle: '邀请好友得奖励',
  activityImage: '',
  activityRules: '邀请好友注册成功后，邀请人和新人都可以获得奖励。',
  inviterReward: 10,
  inviteeReward: 5,
  inviterCouponId: '',
  inviteeCouponId: '',
  userLimit: 'NEW_USERS',
  dailyInviteLimit: 10,
  totalInviteLimit: 100,
  startTime: '',
  endTime: '',
  requireInviterPhone: false,
  requireInviteePhone: false,
  requireInviterStudentVerify: false,
  requireInviteeStudentVerify: false,
  minInviterAccountAgeDays: 0,
  minInviteeAccountAgeMinutes: 0,
  inviteCooldownMinutes: 0,
  maxRecentInvites: 0,
  recentWindowMinutes: 10,
  sameIpDailyLimit: 0,
  sameDeviceDailyLimit: 0,
  sameDeviceTotalLimit: 0,
  totalRewardBudget: 0,
  singleRewardCap: 0,
  rewardReleaseMode: 'immediate',
  rewardDelayHours: 0,
  inviterWhitelist: '',
  inviterBlacklist: '',
  inviteeBlacklist: '',
  blockedPhonePrefixes: '',
})

const currentRegion = computed(() => regions.value.find(region => String(region.id) === String(selectedRegionId.value)))
const couponBusinessScopeLabels: Record<string, string> = {
  all: '通用',
  shop: '外卖/小店',
  mall: '商城',
  errand: '跑腿',
  activity: '活动',
  membership: '会员权益',
}

function couponBusinessScopeLabel(scope: any) {
  return couponBusinessScopeLabels[String(scope || 'all')] || '通用'
}

function couponLabel(coupon: any) {
  const region = coupon?.region?.name || (coupon?.regionId ? '指定区域' : '全区域')
  return `${coupon.name} · ${couponBusinessScopeLabel(coupon.businessScope)} · ${region}`
}

const riskSummary = computed(() => {
  const items = ['禁止自邀', '禁止重复受邀', '时间/次数限制']
  if (config.requireInviterStudentVerify) items.push('邀请人学生认证')
  if (config.requireInviteeStudentVerify) items.push('新人学生认证')
  if (config.sameIpDailyLimit) items.push(`同IP每日${config.sameIpDailyLimit}次`)
  if (config.sameDeviceDailyLimit) items.push(`同设备每日${config.sameDeviceDailyLimit}次`)
  if (config.totalRewardBudget) items.push(`总预算${formatMoney(config.totalRewardBudget)}`)
  return items.join('、')
})

async function loadRegions() {
  regions.value = await fetchRegions()
  const preferred = String(route.query.regionId || localStorage.getItem('LM_SELECTED_REGION_ID') || localStorage.getItem('selectedRegionId') || '')
  selectedRegionId.value = preferred && regions.value.some(region => String(region.id) === preferred)
    ? preferred
    : String(regions.value[0]?.id || '')
  if (selectedRegionId.value) await handleRegionChange()
}

async function loadCoupons() {
  coupons.value = unwrapPage(await request.get('/admin/marketing/coupons', {
    params: { page: 1, pageSize: 200, status: 'active', regionId: selectedRegionId.value || undefined },
  })).list
}

async function handleRegionChange() {
  if (!selectedRegionId.value) return
  localStorage.setItem('LM_SELECTED_REGION_ID', String(selectedRegionId.value))
  localStorage.setItem('selectedRegionId', String(selectedRegionId.value))
  await Promise.all([loadConfig(), loadRecords(true), loadCoupons()])
}

async function loadConfig() {
  loadingConfig.value = true
  try {
    const data = unwrapData(await request.get('/admin/marketing/share-invite/config', {
      params: { regionId: selectedRegionId.value },
    }), config) as any
    Object.assign(config, {
      regionId: selectedRegionId.value,
      enabled: data.enabled ?? data.isEnabled ?? false,
      activityTitle: data.activityTitle || '邀请好友得奖励',
      activityImage: data.activityImage || '',
      activityRules: data.activityRules || '邀请好友注册成功后，邀请人和新人都可以获得奖励。',
      inviterReward: Number(data.inviterReward ?? data.inviteReward ?? 0),
      inviteeReward: Number(data.inviteeReward ?? 0),
      inviterCouponId: data.inviterCouponId || '',
      inviteeCouponId: data.inviteeCouponId || '',
      userLimit: data.userLimit || 'NEW_USERS',
      dailyInviteLimit: Number(data.dailyInviteLimit ?? 10),
      totalInviteLimit: Number(data.totalInviteLimit ?? data.maxInvites ?? 100),
      startTime: data.startTime ? String(data.startTime).replace('T', ' ').slice(0, 19) : '',
      endTime: data.endTime ? String(data.endTime).replace('T', ' ').slice(0, 19) : '',
      requireInviterPhone: !!data.requireInviterPhone,
      requireInviteePhone: !!data.requireInviteePhone,
      requireInviterStudentVerify: !!data.requireInviterStudentVerify,
      requireInviteeStudentVerify: !!data.requireInviteeStudentVerify,
      minInviterAccountAgeDays: Number(data.minInviterAccountAgeDays ?? 0),
      minInviteeAccountAgeMinutes: Number(data.minInviteeAccountAgeMinutes ?? 0),
      inviteCooldownMinutes: Number(data.inviteCooldownMinutes ?? 0),
      maxRecentInvites: Number(data.maxRecentInvites ?? 0),
      recentWindowMinutes: Number(data.recentWindowMinutes ?? 10),
      sameIpDailyLimit: Number(data.sameIpDailyLimit ?? 0),
      sameDeviceDailyLimit: Number(data.sameDeviceDailyLimit ?? 0),
      sameDeviceTotalLimit: Number(data.sameDeviceTotalLimit ?? 0),
      totalRewardBudget: Number(data.totalRewardBudget ?? 0),
      singleRewardCap: Number(data.singleRewardCap ?? 0),
      rewardReleaseMode: data.rewardReleaseMode || 'immediate',
      rewardDelayHours: Number(data.rewardDelayHours ?? 0),
      inviterWhitelist: listToText(data.inviterWhitelist),
      inviterBlacklist: listToText(data.inviterBlacklist),
      inviteeBlacklist: listToText(data.inviteeBlacklist),
      blockedPhonePrefixes: listToText(data.blockedPhonePrefixes),
    })
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载分享配置失败'))
  } finally {
    loadingConfig.value = false
  }
}

async function saveConfig() {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  if (!config.activityTitle.trim()) {
    ElMessage.warning('请输入活动标题')
    return
  }
  saving.value = true
  try {
    await request.put('/admin/marketing/share-invite/config', {
      ...config,
      regionId: selectedRegionId.value,
      isEnabled: config.enabled,
    })
    ElMessage.success('分享有礼配置已保存')
    await loadConfig()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '保存分享配置失败'))
  } finally {
    saving.value = false
  }
}

async function loadRecords(reset = false) {
  if (!selectedRegionId.value) return
  if (reset) pagination.page = 1
  loadingRecords.value = true
  try {
    const keyword = recordKeyword.value.trim()
    const res = await request.get('/admin/marketing/share-invite/records', {
      params: {
        regionId: selectedRegionId.value,
        status: recordStatus.value || undefined,
        keyword: keyword || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
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

function statusType(status: string) {
  const map: Record<string, string> = { SUCCESS: 'success', PENDING: 'warning', FAILED: 'danger', success: 'success', pending: 'warning', failed: 'danger' }
  return map[status] || 'info'
}

function statusLabel(status: string) {
  const map: Record<string, string> = { SUCCESS: '成功', PENDING: '待处理', FAILED: '失败', success: '成功', pending: '待处理', failed: '失败' }
  return map[status] || status || '-'
}

function releaseModeLabel(mode: string) {
  const map: Record<string, string> = { immediate: '立即发放', manual: '审核发放', delayed: '延迟发放', qualified: '达成条件后发放' }
  return map[mode] || mode || '立即发放'
}

function listToText(value: any) {
  return Array.isArray(value) ? value.join('\n') : String(value || '')
}

function hasPendingReward(row: any) {
  return Array.isArray(row.rewards) && row.rewards.some((item: any) => item.status === 'PENDING' || item.status === 'FAILED')
}

function rewardStatusType(row: any) {
  if (hasPendingReward(row)) return 'warning'
  if (row.status === 'SUCCESS') return 'success'
  if (row.status === 'FAILED') return 'danger'
  return 'info'
}

function rewardStatusText(row: any) {
  if (!Array.isArray(row.rewards) || !row.rewards.length) return statusLabel(row.status)
  const pending = row.rewards.filter((item: any) => item.status === 'PENDING').length
  const failed = row.rewards.filter((item: any) => item.status === 'FAILED').length
  if (pending) return `${pending}笔待发放`
  if (failed) return `${failed}笔失败`
  return '已发放'
}

function riskText(row: any) {
  const reasons = row.riskReasons
  if (Array.isArray(reasons)) return reasons.join('、') || '-'
  if (Array.isArray(reasons?.reasons)) return reasons.reasons.join('、') || '-'
  const checks = reasons?.checks
  const parts = []
  if (row.ip) parts.push(`IP ${row.ip}`)
  if (row.deviceId) parts.push(`设备 ${String(row.deviceId).slice(0, 12)}`)
  if (checks?.requireInviterStudent && !checks?.inviterStudentApproved) parts.push('邀请人未学生认证')
  if (checks?.requireInviteeStudent && !checks?.inviteeStudentApproved) parts.push('新人未学生认证')
  return parts.join('；') || '-'
}

async function approveRewards(row: any) {
  const pendingRewards = (row.rewards || []).filter((item: any) => item.status === 'PENDING' || item.status === 'FAILED')
  if (!pendingRewards.length) return
  try {
    await Promise.all(pendingRewards.map((item: any) => request.post(`/admin/share/rewards/${item.id}/retry`)))
    ElMessage.success('奖励已发放')
    await loadRecords()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '发放奖励失败'))
  }
}

onMounted(loadRegions)
onMounted(loadCoupons)
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
.config-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 18px; margin-bottom: 18px; }
.data-card { background: rgba(255,255,255,0.9); border: 1px solid #dbe7f5; border-radius: 14px; box-shadow: 0 14px 36px rgba(37,99,235,.08); padding: 18px; }
.data-card h3 { margin: 0; color: #0f172a; }
.card-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.dialog-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
.dialog-grid :deep(.el-date-editor) { width: 100%; }
.summary-card { min-height: 280px; }
.rule-preview { display: grid; gap: 14px; }
.rule-preview div { padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
.rule-preview span { display: block; margin-bottom: 6px; color: #64748b; font-size: 12px; font-weight: 700; }
.rule-preview strong { color: #0f172a; font-size: 15px; line-height: 1.6; }
.switch-grid.compact { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 10px; }
.switch-grid.compact .switch-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
.switch-item { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.switch-item b { color: #0f172a; font-size: 14px; }
.switch-item p { margin: 4px 0 0; color: #64748b; font-size: 12px; line-height: 1.4; }
.reward-status { display: grid; gap: 4px; }
.reward-status small { color: #64748b; }
.table-tools { display: flex; align-items: center; gap: 10px; }
.table-tools .el-select { width: 120px; }
.table-tools .el-input { width: 210px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 1100px) {
  .marketing-header,
  .header-actions,
  .region-strip,
  .table-tools { align-items: stretch; flex-direction: column; }
  .config-grid,
  .dialog-grid { grid-template-columns: 1fr; }
  .header-actions .el-select,
  .table-tools .el-input,
  .table-tools .el-select { width: 100%; }
}
</style>

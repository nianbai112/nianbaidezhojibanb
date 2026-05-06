<template>
  <div class="page-container">
    <div class="detail-header">
      <a-space>
        <a-button @click="$router.back()"><ArrowLeftOutlined /> 返回</a-button>
        <span class="page-title">{{ user?.nickname || '用户详情' }}</span>
      </a-space>
      <a-space>
        <a-popconfirm v-if="user?.status !== 'banned'" title="确定封禁该用户?" @confirm="onBan">
          <a-button danger size="small">封禁</a-button>
        </a-popconfirm>
        <a-button v-else type="primary" size="small" @click="onUnban">解封</a-button>
      </a-space>
    </div>

    <a-tabs v-model:activeKey="activeTab" class="detail-tabs">
      <!-- 基本信息 -->
      <a-tab-pane key="info" tab="基本信息">
        <div class="detail-section">
          <div class="section-title">用户资料</div>
          <a-descriptions :column="2" bordered size="middle">
            <a-descriptions-item label="头像">
              <a-avatar :src="user?.avatar" :size="48">{{ (user?.nickname || '?').charAt(0) }}</a-avatar>
            </a-descriptions-item>
            <a-descriptions-item label="用户ID">{{ user?.id }}</a-descriptions-item>
            <a-descriptions-item label="昵称">{{ user?.nickname }}</a-descriptions-item>
            <a-descriptions-item label="手机号">{{ maskPhone(user?.phone || '') }}</a-descriptions-item>
            <a-descriptions-item label="性别">{{ genderMap[user?.gender || 0] }}</a-descriptions-item>
            <a-descriptions-item label="生日">{{ user?.birthday || '-' }}</a-descriptions-item>
            <a-descriptions-item label="学校">{{ user?.school || '-' }}</a-descriptions-item>
            <a-descriptions-item label="学生认证">
              <StatusTag :status="user?.studentCertStatus || 'none'" type="audit" />
            </a-descriptions-item>
            <a-descriptions-item label="个性签名" :span="2">{{ user?.bio || '暂无' }}</a-descriptions-item>
            <a-descriptions-item label="注册时间">{{ formatTime(user?.createdAt || '') }}</a-descriptions-item>
            <a-descriptions-item label="最近登录">{{ formatTime(user?.lastLoginAt || '') }}</a-descriptions-item>
          </a-descriptions>
        </div>

        <div class="detail-section">
          <div class="section-title">账户状态</div>
          <a-descriptions :column="2" bordered size="middle">
            <a-descriptions-item label="账号状态">
              <StatusTag :status="user?.status || 'active'" type="user" />
            </a-descriptions-item>
            <a-descriptions-item label="风险等级">
              <a-tag v-if="user?.riskLevel" :color="riskColorMap[user.riskLevel]">
                {{ riskLabelMap[user.riskLevel] || user.riskLevel }}
              </a-tag>
              <span v-else>-</span>
            </a-descriptions-item>
            <a-descriptions-item label="禁言状态">
              <template v-if="user?.muted">
                <a-tag color="orange">已禁言</a-tag>
                <span style="font-size:12px;color:#9ca3af;margin-left:8px">
                  至 {{ user?.muteEndAt ? formatTime(user.muteEndAt) : '永久' }}
                </span>
              </template>
              <span v-else style="color:#10b981">正常</span>
            </a-descriptions-item>
            <a-descriptions-item label="用户标签">
              <a-space v-if="user?.tags && user.tags.length" :size="4" wrap>
                <a-tag v-for="tag in user.tags" :key="tag.id" :color="tag.color">{{ tag.name }}</a-tag>
              </a-space>
              <span v-else style="color:#9ca3af">无标签</span>
            </a-descriptions-item>
          </a-descriptions>
        </div>
      </a-tab-pane>

      <!-- 钱包 & 交易 -->
      <a-tab-pane key="wallet" tab="钱包 & 交易">
        <div class="detail-section">
          <div class="section-title">钱包概览</div>
          <a-descriptions :column="3" bordered size="middle">
            <a-descriptions-item label="余额">
              <span class="money-value">¥{{ formatMoney(user?.balance || 0) }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="冻结金额">
              <span class="money-value">¥{{ formatMoney(walletInfo?.frozenBalance || 0) }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="累计充值">
              <span class="money-value">¥{{ formatMoney(walletInfo?.totalRecharge || 0) }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="累计消费">
              <span class="money-value">¥{{ formatMoney(walletInfo?.totalSpent || 0) }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="累计提现">
              <span class="money-value">¥{{ formatMoney(walletInfo?.totalWithdraw || 0) }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="累计收入">
              <span class="money-value">¥{{ formatMoney(walletInfo?.totalIncome || 0) }}</span>
            </a-descriptions-item>
          </a-descriptions>
        </div>

        <div class="detail-section">
          <div class="section-title">交易统计</div>
          <a-descriptions :column="3" bordered size="middle">
            <a-descriptions-item label="总订单数">{{ orderStat?.totalOrders || 0 }}</a-descriptions-item>
            <a-descriptions-item label="已完成">{{ orderStat?.completedOrders || 0 }}</a-descriptions-item>
            <a-descriptions-item label="退款订单">{{ orderStat?.refundOrders || 0 }}</a-descriptions-item>
            <a-descriptions-item label="总消费">
              <span class="money-value">¥{{ formatMoney(orderStat?.totalSpent || 0) }}</span>
            </a-descriptions-item>
          </a-descriptions>
        </div>

        <div class="detail-section">
          <div class="section-title">余额变动记录</div>
          <a-table
            :columns="balanceColumns"
            :data-source="balanceLogs"
            :loading="balanceLoading"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'amount'">
                <span :style="{ color: record.amount > 0 ? '#10b981' : '#ef4444' }">
                  {{ record.amount > 0 ? '+' : '' }}¥{{ formatMoney(Math.abs(record.amount)) }}
                </span>
              </template>
              <template v-else-if="column.dataIndex === 'type'">
                <a-tag size="small">{{ balanceTypeMap[record.type] || record.type }}</a-tag>
              </template>
            </template>
          </a-table>
          <a-empty v-if="!balanceLoading && !balanceLogs.length" description="暂无余额变动记录" :image-style="{ height: '40px' }" style="margin-top:20px" />
        </div>
      </a-tab-pane>

      <!-- 内容概览 -->
      <a-tab-pane key="content" tab="内容概览">
        <div class="detail-section">
          <div class="section-title">内容统计</div>
          <a-descriptions :column="3" bordered size="middle">
            <a-descriptions-item label="帖子总数">{{ contentStat?.totalPosts || user?.postCount || 0 }}</a-descriptions-item>
            <a-descriptions-item label="已删除帖子">{{ contentStat?.deletedPosts || 0 }}</a-descriptions-item>
            <a-descriptions-item label="评论总数">{{ contentStat?.totalComments || 0 }}</a-descriptions-item>
            <a-descriptions-item label="获赞总数">{{ contentStat?.totalLikes || 0 }}</a-descriptions-item>
            <a-descriptions-item label="被举报次数">{{ contentStat?.reportedCount || 0 }}</a-descriptions-item>
            <a-descriptions-item label="举报他人次数">{{ contentStat?.reportCount || 0 }}</a-descriptions-item>
          </a-descriptions>
        </div>

        <div class="detail-section">
          <div class="section-title">最近帖子</div>
          <a-table
            :columns="postColumns"
            :data-source="recentPosts"
            :loading="postLoading"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <StatusTag v-if="column.dataIndex === 'auditStatus'" :status="record.auditStatus" type="audit" />
            </template>
          </a-table>
          <a-empty v-if="!postLoading && !recentPosts.length" description="暂无帖子" :image-style="{ height: '40px' }" style="margin-top:20px" />
        </div>

        <div class="detail-section">
          <div class="section-title">最近评论</div>
          <a-table
            :columns="commentColumns"
            :data-source="recentComments"
            :loading="commentLoading"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <StatusTag v-if="column.dataIndex === 'auditStatus'" :status="record.auditStatus" type="audit" />
            </template>
          </a-table>
          <a-empty v-if="!commentLoading && !recentComments.length" description="暂无评论" :image-style="{ height: '40px' }" style="margin-top:20px" />
        </div>
      </a-tab-pane>

      <!-- 关注关系 -->
      <a-tab-pane key="follow" tab="关注 / 粉丝">
        <div class="detail-section">
          <div class="section-title">关注列表</div>
          <a-table
            :columns="followColumns"
            :data-source="follows"
            :loading="followLoading"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <a-avatar v-if="column.dataIndex === 'avatar'" :src="record.avatar" :size="28">{{ (record.nickname || '?').charAt(0) }}</a-avatar>
            </template>
          </a-table>
          <a-empty v-if="!followLoading && !follows.length" description="暂无关注" :image-style="{ height: '40px' }" style="margin-top:20px" />
        </div>

        <div class="detail-section">
          <div class="section-title">粉丝列表</div>
          <a-table
            :columns="fansColumns"
            :data-source="fans"
            :loading="fansLoading"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <a-avatar v-if="column.dataIndex === 'avatar'" :src="record.avatar" :size="28">{{ (record.nickname || '?').charAt(0) }}</a-avatar>
            </template>
          </a-table>
          <a-empty v-if="!fansLoading && !fans.length" description="暂无粉丝" :image-style="{ height: '40px' }" style="margin-top:20px" />
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import { userApi } from '@/api/user'
import { contentApi } from '@/api/content'
import StatusTag from '@/components/common/StatusTag.vue'
import { formatTime, formatMoney, maskPhone } from '@/utils/format'
import type { UserInfo, UserWalletInfo, UserOrderStat, UserContentStat } from '@/types/user'

const route = useRoute()
const user = ref<UserInfo | null>(null)
const activeTab = ref('info')
const genderMap = ['未知', '男', '女']

const riskColorMap: Record<string, string> = { low: 'green', medium: 'orange', high: 'red', black: '#000000' }
const riskLabelMap: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险', black: '黑名单' }
const balanceTypeMap: Record<string, string> = {
  recharge: '充值', consume: '消费', refund: '退款', withdraw: '提现',
  income: '收入', adjust: '调整', reward: '奖励',
}

const walletInfo = ref<UserWalletInfo | null>(null)
const orderStat = ref<UserOrderStat | null>(null)
const balanceLogs = ref<any[]>([])
const balanceLoading = ref(false)
const balanceColumns = [
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '类型', dataIndex: 'type', width: 80 },
  { title: '金额', dataIndex: 'amount', width: 100 },
  { title: '备注', dataIndex: 'remark', ellipsis: true },
]

const contentStat = ref<UserContentStat | null>(null)
const recentPosts = ref<any[]>([])
const postLoading = ref(false)
const recentComments = ref<any[]>([])
const commentLoading = ref(false)
const postColumns = [
  { title: '标题', dataIndex: 'title', ellipsis: true },
  { title: '审核', dataIndex: 'auditStatus', width: 80 },
  { title: '浏览', dataIndex: 'viewCount', width: 60 },
  { title: '点赞', dataIndex: 'likeCount', width: 60 },
  { title: '评论', dataIndex: 'commentCount', width: 60 },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
]
const commentColumns = [
  { title: '内容', dataIndex: 'content', ellipsis: true },
  { title: '审核', dataIndex: 'auditStatus', width: 80 },
  { title: '点赞', dataIndex: 'likeCount', width: 60 },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
]

const follows = ref<any[]>([])
const followLoading = ref(false)
const fans = ref<any[]>([])
const fansLoading = ref(false)
const followColumns = [
  { title: '头像', dataIndex: 'avatar', width: 50 },
  { title: '昵称', dataIndex: 'nickname' },
  { title: '关注时间', dataIndex: 'createdAt', width: 160 },
]
const fansColumns = [
  { title: '头像', dataIndex: 'avatar', width: 50 },
  { title: '昵称', dataIndex: 'nickname' },
  { title: '关注时间', dataIndex: 'createdAt', width: 160 },
]

onMounted(async () => {
  const id = Number(route.params.id)
  try {
    const res = await userApi.getDetail(id)
    user.value = (res.data?.data || res.data) as UserInfo
  } catch {
    message.error('加载用户信息失败')
  }
})

async function loadWalletData() {
  if (!user.value) return
  balanceLoading.value = true
  try {
    const res = await userApi.getBalanceLogs(Number(user.value.id), { page: 1, pageSize: 20 })
    const data: any = res.data?.data || res.data || {}
    balanceLogs.value = data.list || []
    walletInfo.value = data.wallet || (data as any)
    orderStat.value = data.orderStat || null
  } catch { /* ignore */ }
  finally { balanceLoading.value = false }
}

async function loadContentData() {
  if (!user.value) return
  const uid = Number(user.value.id)
  postLoading.value = true
  commentLoading.value = true
  try {
    const postRes = await contentApi.getPostList({ page: 1, pageSize: 10, userId: uid } as any)
    recentPosts.value = (postRes.data?.data?.list || postRes.data?.list || []) as any[]
  } catch { /* ignore */ }
  finally { postLoading.value = false }

  try {
    const commentRes = await contentApi.getCommentList({ page: 1, pageSize: 10, userId: uid } as any)
    recentComments.value = (commentRes.data?.data?.list || commentRes.data?.list || []) as any[]
  } catch { /* ignore */ }
  finally { commentLoading.value = false }
}

async function loadFollowData() {
  if (!user.value) return
  const uid = Number(user.value.id)
  followLoading.value = true
  fansLoading.value = true
  try {
    const followRes = await userApi.getFollows(uid, { page: 1, pageSize: 20 })
    follows.value = (followRes.data?.data?.list || followRes.data?.list || []) as any[]
  } catch { /* ignore */ }
  finally { followLoading.value = false }

  try {
    const fansRes = await userApi.getFans(uid, { page: 1, pageSize: 20 })
    fans.value = (fansRes.data?.data?.list || fansRes.data?.list || []) as any[]
  } catch { /* ignore */ }
  finally { fansLoading.value = false }
}

watch(activeTab, (tab) => {
  if (tab === 'wallet' && !walletInfo.value) loadWalletData()
  if (tab === 'content' && !recentPosts.value.length && !recentComments.value.length) loadContentData()
  if (tab === 'follow' && !follows.value.length && !fans.value.length) loadFollowData()
}, { immediate: false })

async function onBan() {
  if (user.value) {
    try {
      await userApi.ban(user.value.id, '管理员操作')
      user.value.status = 'banned'
      message.success('已封禁')
    } catch {
      message.error('封禁失败')
    }
  }
}
async function onUnban() {
  if (user.value) {
    try {
      await userApi.unban(user.value.id)
      user.value.status = 'active'
      message.success('已解封')
    } catch {
      message.error('解封失败')
    }
  }
}
</script>

<style lang="less" scoped>
.detail-tabs {
  background: #fff;
  border-radius: 8px;
  padding: 0 24px 16px;
}
.money-value {
  font-family: 'SF Mono', Monaco, monospace;
  color: #374151;
  font-weight: 500;
}
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
</style>

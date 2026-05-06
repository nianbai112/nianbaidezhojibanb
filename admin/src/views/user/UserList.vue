<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="昵称/手机号" allow-clear style="width:200px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:110px">
        <a-select-option value="active">正常</a-select-option>
        <a-select-option value="banned">封禁</a-select-option>
        <a-select-option value="muted">禁言</a-select-option>
      </a-select>
      <a-select v-model:value="filter.studentCertStatus" placeholder="学生认证" allow-clear style="width:120px">
        <a-select-option value="approved">已认证</a-select-option>
        <a-select-option value="pending">待审核</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        v-model:selected-keys="selectedKeys"
        :row-selection="true"
        :batch-actions="batchActions"
        @change="onTableChange"
        @batch-action="onBatchAction"
      >
        <template #avatar="{ record }">
          <a-avatar :src="record.avatar" :size="36">{{ (record.nickname || 'U').charAt(0) }}</a-avatar>
        </template>
        <template #status="{ record }"><StatusTag :status="record.status" type="user" /></template>
        <template #studentCertStatus="{ record }"><StatusTag :status="record.studentCertStatus" type="audit" /></template>
        <template #riskLevel="{ record }">
          <a-tag v-if="record.riskLevel" :color="riskColorMap[record.riskLevel] || 'default'" size="small">
            {{ riskLabelMap[record.riskLevel] || record.riskLevel }}
          </a-tag>
          <span v-else style="color:#9ca3af">-</span>
        </template>
        <template #userTags="{ record }">
          <a-space v-if="record.tags && record.tags.length" :size="4" wrap>
            <a-tag v-for="tag in record.tags" :key="tag.id" :color="tag.color" size="small" :style="{ borderRadius: '4px' }">
              {{ tag.name }}
            </a-tag>
          </a-space>
          <span v-else style="color:#9ca3af">-</span>
        </template>
        <template #balance="{ record }"><span class="money">{{ formatMoney(record.balance) }}</span></template>
        <template #action="{ record }">
          <a-space>
            <a-button type="link" size="small" @click="$router.push(`/user/detail/${record.id}`)">详情</a-button>
            <a-dropdown>
              <a-button type="link" size="small">更多<DownOutlined /></a-button>
              <template #overlay>
                <a-menu @click="({key}) => onAction(key as string, record)">
                  <a-menu-item key="tags">标签管理</a-menu-item>
                  <a-menu-item key="balance">余额调整</a-menu-item>
                  <a-menu-item key="mute" v-if="!record.muted">禁言</a-menu-item>
                  <a-menu-item key="unmute" v-else>解除禁言</a-menu-item>
                  <a-menu-divider />
                  <a-menu-item key="ban" v-if="record.status === 'active'" danger>封禁</a-menu-item>
                  <a-menu-item key="unban" v-if="record.status === 'banned'">解封</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 封禁弹窗 -->
    <a-modal v-model:open="banVisible" title="封禁用户" @ok="onBanSubmit" :confirm-loading="banLoading">
      <a-form layout="vertical">
        <a-form-item label="封禁原因" required>
          <a-textarea v-model:value="banReason" placeholder="请填写原因，用户可见" :rows="3" :maxlength="200" show-count />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 禁言弹窗 -->
    <a-modal v-model:open="muteVisible" title="禁言用户" @ok="onMuteSubmit" :confirm-loading="muteLoading">
      <a-form layout="vertical">
        <a-form-item label="禁言时长">
          <a-select v-model:value="muteDuration" placeholder="请选择禁言时长" style="width:100%">
            <a-select-option :value="1">1小时</a-select-option>
            <a-select-option :value="24">24小时</a-select-option>
            <a-select-option :value="72">3天</a-select-option>
            <a-select-option :value="168">7天</a-select-option>
            <a-select-option :value="720">30天</a-select-option>
            <a-select-option :value="-1">永久</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="禁言原因">
          <a-textarea v-model:value="muteReason" placeholder="请填写原因" :rows="2" :maxlength="200" show-count />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { DownOutlined } from '@ant-design/icons-vue'
import { userApi } from '@/api/user'
import { formatMoney } from '@/utils/format'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import type { UserInfo } from '@/types/user'

const loading = ref(false)
const list = ref<UserInfo[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedKeys = ref<(string | number)[]>([])
const filter = reactive({ keyword: '', status: undefined as string | undefined, studentCertStatus: undefined as string | undefined })

const banVisible = ref(false)
const banLoading = ref(false)
const banReason = ref('')
const banUserId = ref<string | number | null>(null)

const muteVisible = ref(false)
const muteLoading = ref(false)
const muteDuration = ref<number>(24)
const muteReason = ref('')
const muteUserId = ref<string | number | null>(null)

const riskColorMap: Record<string, string> = { low: 'green', medium: 'orange', high: 'red', black: '#000000' }
const riskLabelMap: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险', black: '黑名单' }

const columns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '头像', dataIndex: 'avatar', width: 60, slot: 'avatar' },
  { title: '昵称', dataIndex: 'nickname', width: 130, ellipsis: true },
  { title: '手机号', dataIndex: 'phone', width: 130 },
  { title: '学校', dataIndex: 'school', width: 140, ellipsis: true },
  { title: '认证', dataIndex: 'studentCertStatus', width: 80, slot: 'studentCertStatus' },
  { title: '标签', dataIndex: 'userTags', width: 130, slot: 'userTags' },
  { title: '风险', dataIndex: 'riskLevel', width: 80, slot: 'riskLevel' },
  { title: '余额', dataIndex: 'balance', width: 90, slot: 'balance' },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '帖子', dataIndex: 'postCount', width: 60 },
  { title: '注册时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 130, slot: 'action', fixed: 'right' },
]

const batchActions = [
  { key: 'ban', label: '批量封禁', danger: true },
  { key: 'unban', label: '批量解封' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await userApi.getList({ page: page.value, pageSize: pageSize.value, keyword: filter.keyword, status: filter.status, studentCertStatus: filter.studentCertStatus })
    list.value = (res.data?.data?.list || res.data?.list || []) as UserInfo[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    message.error('加载用户列表失败')
  } finally {
    loading.value = false
  }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.status = undefined; filter.studentCertStatus = undefined; onSearch() }
function onTableChange() { fetchList() }

async function onBatchAction(action: string, keys: (string | number)[]) {
  try {
    await userApi.batchOp({ ids: keys, action })
    message.success('操作成功')
    selectedKeys.value = []
    fetchList()
  } catch {
    message.error('批量操作失败')
  }
}

function onAction(key: string, record: UserInfo) {
  if (key === 'ban') {
    banUserId.value = record.id
    banReason.value = ''
    banVisible.value = true
  } else if (key === 'unban') {
    onUnbanConfirm(record)
  } else if (key === 'mute') {
    muteUserId.value = record.id
    muteDuration.value = 24
    muteReason.value = ''
    muteVisible.value = true
  } else if (key === 'unmute') {
    onUnmuteConfirm(record)
  } else {
    message.info('功能开发中')
  }
}

async function onBanSubmit() {
  if (!banUserId.value) return
  banLoading.value = true
  try {
    await userApi.ban(Number(banUserId.value), banReason.value || '管理员操作')
    message.success('已封禁')
    banVisible.value = false
    fetchList()
  } catch {
    message.error('封禁失败')
  } finally {
    banLoading.value = false
  }
}

function onUnbanConfirm(record: UserInfo) {
  userApi.unban(Number(record.id)).then(() => {
    message.success('已解封')
    fetchList()
  }).catch(() => {
    message.error('解封失败')
  })
}

async function onMuteSubmit() {
  if (!muteUserId.value) return
  muteLoading.value = true
  try {
    await userApi.toggleStatus(Number(muteUserId.value), 'muted')
    message.success('已禁言')
    muteVisible.value = false
    fetchList()
  } catch {
    message.error('操作失败')
  } finally {
    muteLoading.value = false
  }
}

function onUnmuteConfirm(record: UserInfo) {
  userApi.toggleStatus(Number(record.id), 'active').then(() => {
    message.success('已解除禁言')
    fetchList()
  }).catch(() => {
    message.error('操作失败')
  })
}

fetchList()
</script>

<style lang="less" scoped>
.money { font-family: 'SF Mono', Monaco, monospace; color: #374151; }
</style>

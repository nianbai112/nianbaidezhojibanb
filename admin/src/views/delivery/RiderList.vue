<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="f.keyword" placeholder="姓名/手机号" allow-clear style="width:180px" />
      <a-select v-model:value="f.auditStatus" placeholder="审核状态" allow-clear style="width:120px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="approved">已通过</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
      </a-select>
      <a-select v-model:value="f.status" placeholder="接单状态" allow-clear style="width:120px">
        <a-select-option value="online">在线</a-select-option>
        <a-select-option value="offline">离线</a-select-option>
        <a-select-option value="busy">忙碌</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #auditStatus="{ record }">
          <a-tag :color="auditColor(record.auditStatus)">{{ auditLabel(record.auditStatus) }}</a-tag>
        </template>
        <template #status="{ record }">
          <a-switch :checked="record.status === 'online'" :loading="record._toggling" checked-children="开" un-checked-children="关" size="small" @change="(v: boolean) => onToggleStatus(record, v)" />
        </template>
        <template #balance="{ record }">{{ (Number(record.balance) || 0).toFixed(2) }}</template>
        <template #a="{ record }">
          <a-space>
            <a @click="$router.push('/delivery/rider/' + record.id)">详情</a>
            <template v-if="record.auditStatus === 'pending'">
              <a @click="onAudit(record, 'approved')" style="color:#10b981">通过</a>
              <a @click="onAudit(record, 'rejected')" style="color:#ef4444">拒绝</a>
            </template>
          </a-space>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { deliveryApi } from '@/api/delivery'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const ld = ref(false)
const list = ref<any[]>([])
const t = ref(0)
const p = ref(1)
const ps = ref(20)
const f = reactive({ keyword: '', auditStatus: undefined as string | undefined, status: undefined as string | undefined })

const cols = [
  { title: '姓名', dataIndex: 'realName', width: 100 },
  { title: '手机', dataIndex: 'phone', width: 130 },
  { title: '接单状态', dataIndex: 'status', width: 90, slot: 'status' },
  { title: '审核', dataIndex: 'auditStatus', width: 80, slot: 'auditStatus' },
  { title: '余额(元)', dataIndex: 'balance', width: 100, slot: 'balance' },
  { title: '评分', dataIndex: 'score', width: 60 },
  { title: '总收入', dataIndex: 'totalIncome', width: 90 },
  { title: '总接单', dataIndex: 'totalOrders', width: 70 },
  { title: '今日', dataIndex: 'todayOrders', width: 60 },
  { title: '注册时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 160, slot: 'a', fixed: 'right' },
]

function auditColor(s: string) { return s === 'approved' ? 'green' : s === 'rejected' ? 'red' : 'orange' }
function auditLabel(s: string) { return s === 'approved' ? '已通过' : s === 'rejected' ? '已拒绝' : '待审核' }

async function ft() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value, keyword: f.keyword }
    if (f.auditStatus) params.auditStatus = f.auditStatus
    if (f.status) params.status = f.status
    const r = await deliveryApi.getRiderList(params)
    list.value = (r.data?.data?.list || r.data?.list || []) as any[]
    t.value = r.data?.data?.total || r.data?.total || 0
  } finally { ld.value = false }
}

function onSearch() { p.value = 1; ft() }
function onReset() { f.keyword = ''; f.auditStatus = undefined; f.status = undefined; onSearch() }

async function onAudit(record: any, status: string) {
  try {
    await deliveryApi.auditRider(record.id, { status, remark: '' })
    message.success(status === 'approved' ? '已通过' : '已拒绝')
    ft()
  } catch { message.error('操作失败') }
}

async function onToggleStatus(record: any, v: boolean) {
  record._toggling = true
  try {
    const status = v ? 'online' : 'offline'
    await deliveryApi.updateRiderStatus(record.id, { status })
    record.status = status
    message.success(v ? '已上线' : '已下线')
  } catch { message.error('操作失败') }
  finally { record._toggling = false }
}

ft()
</script>

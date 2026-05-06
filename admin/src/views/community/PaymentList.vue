<template>
  <div class="page-container">
    <div class="page-title mb-4">购买记录</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="4">
          <a-input v-model:value="f.userId" placeholder="用户ID" allow-clear @pressEnter="onSearch" />
        </a-col>
        <a-col :span="4">
          <a-select v-model:value="f.status" placeholder="支付状态" allow-clear style="width:100%" @change="onSearch">
            <a-select-option value="pending">待支付</a-select-option>
            <a-select-option value="paid">已支付</a-select-option>
            <a-select-option value="refunded">已退款</a-select-option>
          </a-select>
        </a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="cols" :loading="ld" :pagination="{ current: p, pageSize: ps, total: t }" @change="onTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'user'">
          <a-space v-if="record.user">
            <a-avatar :src="record.user.avatar" size="small" />
            <span>{{ record.user.nickname || '-' }}</span>
          </a-space>
        </template>
        <template v-else-if="column.dataIndex === 'circle'">
          <a-space v-if="record.circle">
            <a-avatar :src="record.circle.cover" :size="28" shape="square" />
            <span>{{ record.circle.name }}</span>
          </a-space>
        </template>
        <template v-else-if="column.dataIndex === 'amount'">
          ¥{{ (Number(record.amount)).toFixed(2) }}
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <a-tag :color="record.status === 'paid' ? 'green' : record.status === 'refunded' ? 'orange' : 'default'">
            {{ record.status === 'paid' ? '已支付' : record.status === 'refunded' ? '已退款' : '待支付' }}
          </a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'payChannel'">
          {{ record.payChannel || '-' }}
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { communityApi } from '@/api/community'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ userId: '', status: undefined as string | undefined })

const cols = [
  { title: '用户', dataIndex: 'user', width: 150 },
  { title: '社群', dataIndex: 'circle', width: 160 },
  { title: '金额', dataIndex: 'amount', width: 100 },
  { title: '支付方式', dataIndex: 'payChannel', width: 100 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '支付时间', dataIndex: 'payTime', width: 160 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
]

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.userId) params.userId = f.userId
    if (f.status) params.status = f.status
    const res = await communityApi.getPayments(params)
    const data = res.data as any
    list.value = data.list || []
    t.value = data.total || 0
  } catch { /* ignore */ }
  finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onTableChange(pag: any) { p.value = pag.current; fetchList() }

onMounted(() => fetchList())
</script>

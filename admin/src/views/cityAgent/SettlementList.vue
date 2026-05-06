<template>
  <div class="page-container">
    <div class="page-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-weight:600;font-size:16px">结算单列表</span>
        <a-button type="primary" @click="onCreate">
          <template #icon><plus-outlined /></template>
          创建结算单
        </a-button>
      </div>
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        @change="onTableChange"
      >
        <template #amount="{ record }">
          <span style="color:#3B82F6;font-weight:500">¥{{ record.amount }}</span>
        </template>
        <template #status="{ record }">
          <StatusTag :status="record.status" type="payment" />
        </template>
      </DataTable>
    </div>

    <!-- 创建结算单弹窗 -->
    <a-modal
      v-model:open="createVisible"
      title="创建结算单"
      :confirm-loading="submitLoading"
      @ok="onSubmit"
      @cancel="onClose"
      :width="520"
    >
      <a-form :model="form" layout="vertical">
        <a-form-item label="代理人" required>
          <a-input v-model:value="form.agentName" placeholder="输入代理人姓名或ID" />
        </a-form-item>
        <a-form-item label="结算月份" required>
          <a-month-picker v-model:value="form.settlementMonth" style="width:100%" placeholder="选择结算月份" />
        </a-form-item>
        <a-form-item label="结算金额" required>
          <a-input-number v-model:value="form.amount" :min="0" :precision="2" style="width:100%" placeholder="请输入结算金额" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="form.remark" :rows="3" placeholder="选填，结算备注" :maxlength="200" show-count />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { cityAgentApi } from '@/api/cityAgent'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import type { Dayjs } from 'dayjs'

const loading = ref(false)
const submitLoading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const createVisible = ref(false)

const form = reactive({
  agentName: '',
  settlementMonth: null as Dayjs | null,
  amount: null as number | null,
  remark: '',
})

const columns = [
  { title: '结算单号', dataIndex: 'settlementNo', width: 180 },
  { title: '代理人', dataIndex: 'agentName', width: 120 },
  { title: '结算月份', dataIndex: 'settlementMonth', width: 120 },
  { title: '结算金额', dataIndex: 'amount', width: 120, slot: 'amount' },
  { title: '状态', dataIndex: 'status', width: 100, slot: 'status' },
  { title: '备注', dataIndex: 'remark', width: 160, ellipsis: true },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await cityAgentApi.getSettlements({
      page: page.value,
      pageSize: pageSize.value,
    })
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch (err: any) {
    message.error(err?.message || '获取结算单列表失败')
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  fetchList()
}

function onReset() {
  onSearch()
}

function onTableChange() {
  fetchList()
}

function onCreate() {
  form.agentName = ''
  form.settlementMonth = null
  form.amount = null
  form.remark = ''
  createVisible.value = true
}

function onClose() {
  createVisible.value = false
}

async function onSubmit() {
  if (!form.agentName.trim()) {
    message.warning('请输入代理人')
    return
  }
  if (!form.settlementMonth) {
    message.warning('请选择结算月份')
    return
  }
  if (!form.amount || form.amount <= 0) {
    message.warning('请输入有效的结算金额')
    return
  }
  submitLoading.value = true
  try {
    await cityAgentApi.createSettlement({
      agentName: form.agentName.trim(),
      settlementMonth: form.settlementMonth.format('YYYY-MM'),
      amount: form.amount,
      remark: form.remark.trim() || undefined,
    })
    message.success('结算单创建成功')
    createVisible.value = false
    fetchList()
  } catch {
    // handled by interceptor
  } finally {
    submitLoading.value = false
  }
}

fetchList()
</script>

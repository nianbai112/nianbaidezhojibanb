<template>
  <div class="page-container">
    <div class="page-title mb-4">分销配置</div>

    <!-- 分销等级 -->
    <a-card title="分销等级" size="small" class="mb-4">
      <template #extra><a-button type="primary" size="small" @click="openLevelCreate">新增等级</a-button></template>
      <a-table :dataSource="levelList" :columns="levelColumns" :loading="levelLoading" rowKey="id" size="small" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'commissionRate'">{{ record.commissionRate }}%</template>
          <template v-if="column.dataIndex === 'conditionTotalAmount'">{{ record.conditionTotalAmount ? (Number(record.conditionTotalAmount) / 100).toFixed(2) : '-' }}</template>
          <template v-if="column.dataIndex === 'distributorCount'">{{ record._count?.distributors || 0 }}</template>
          <template v-if="column.dataIndex === 'action'">
            <a-space>
              <a @click="openLevelEdit(record)">编辑</a>
              <a-popconfirm title="确定删除该等级？" @confirm="handleLevelDelete(record.id)"><a class="text-danger">删除</a></a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 参数配置 -->
    <a-card title="参数配置" size="small" class="mb-4">
      <a-table :dataSource="configList" :columns="configColumns" :loading="configLoading" rowKey="id" size="small" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'value'">
            <a-tag v-if="record.key === 'auto_upgrade'" :color="record.value === 'true' ? 'green' : 'default'">{{ record.value === 'true' ? '开启' : '关闭' }}</a-tag>
            <span v-else>{{ record.key === 'min_withdraw' || record.key === 'withdraw_fee_rate' ? record.value : record.value }}</span>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a @click="openConfigEdit(record)">编辑</a>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 提现记录 -->
    <a-card title="提现记录" size="small">
      <a-row :gutter="12" class="mb-3">
        <a-col :span="4">
          <a-select v-model:value="withdrawalFilters.status" placeholder="状态" allow-clear @change="fetchWithdrawals">
            <a-select-option value="pending">待处理</a-select-option>
            <a-select-option value="processing">处理中</a-select-option>
            <a-select-option value="completed">已完成</a-select-option>
            <a-select-option value="rejected">已拒绝</a-select-option>
          </a-select>
        </a-col>
      </a-row>
      <a-table :dataSource="withdrawalList" :columns="withdrawalColumns" :loading="withdrawalLoading" :pagination="withdrawalPagination" @change="handleWithdrawalTableChange" rowKey="id" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'distributor'">{{ record.distributor?.realName || '-' }}</template>
          <template v-if="column.dataIndex === 'amount'">{{ (Number(record.amount) / 100).toFixed(2) }}</template>
          <template v-if="column.dataIndex === 'feeAmount'">{{ (Number(record.feeAmount) / 100).toFixed(2) }}</template>
          <template v-if="column.dataIndex === 'actualAmount'">{{ (Number(record.actualAmount) / 100).toFixed(2) }}</template>
          <template v-if="column.dataIndex === 'status'">
            <a-tag :color="record.status === 'completed' ? 'success' : record.status === 'rejected' ? 'error' : record.status === 'processing' ? 'processing' : 'warning'">
              {{ record.status === 'pending' ? '待处理' : record.status === 'processing' ? '处理中' : record.status === 'completed' ? '已完成' : '已拒绝' }}
            </a-tag>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <template v-if="record.status === 'pending'">
              <a-space>
                <a @click="handleWithdrawalProcess(record, 'completed')">通过</a>
                <a @click="handleWithdrawalProcess(record, 'rejected')">拒绝</a>
              </a-space>
            </template>
            <span v-else>-</span>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 等级弹窗 -->
    <a-modal v-model:open="levelModalVisible" :title="levelEditingId ? '编辑等级' : '新增等级'" :width="480" :confirm-loading="levelSubmitting" @ok="handleLevelSubmit">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="等级名称" required>
              <a-input v-model:value="levelForm.name" placeholder="如: 初级分销" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="等级序号" required>
              <a-input-number v-model:value="levelForm.level" :min="1" :max="99" style="width:100%" placeholder="1" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="佣金比例(%)" required>
          <a-input-number v-model:value="levelForm.commissionRate" :min="0" :max="100" :precision="2" style="width:100%" placeholder="10" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="升级所需订单数">
              <a-input-number v-model:value="levelForm.conditionOrderCount" :min="0" style="width:100%" placeholder="0" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="升级所需金额(元)">
              <a-input-number v-model:value="levelForm.conditionTotalAmount" :min="0" :precision="2" style="width:100%" placeholder="0.00" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="图标URL">
              <a-input v-model:value="levelForm.icon" placeholder="图标地址" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="排序">
              <a-input-number v-model:value="levelForm.sortOrder" :min="0" style="width:100%" placeholder="0" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 配置弹窗 -->
    <a-modal v-model:open="configModalVisible" title="编辑配置" :width="400" :confirm-loading="configSubmitting" @ok="handleConfigSubmit">
      <a-form layout="vertical">
        <a-form-item label="配置键">
          <a-input :value="configForm.key" disabled />
        </a-form-item>
        <a-form-item label="配置值" required>
          <a-input v-if="configForm.key === 'min_withdraw' || configForm.key === 'withdraw_fee_rate'" v-model:value="configForm.value" placeholder="输入值" />
          <a-select v-else-if="configForm.key === 'auto_upgrade'" v-model:value="configForm.value">
            <a-select-option value="true">开启</a-select-option>
            <a-select-option value="false">关闭</a-select-option>
          </a-select>
          <a-input v-else v-model:value="configForm.value" placeholder="输入值" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="configForm.description" placeholder="配置说明" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { shopApi } from '@/api/shop'

// ===== 等级管理 =====
const levelLoading = ref(false)
const levelList = ref<any[]>([])
const levelColumns = [
  { title: '名称', dataIndex: 'name', width: 120 },
  { title: '序号', dataIndex: 'level', width: 70 },
  { title: '佣金比例', dataIndex: 'commissionRate', width: 90 },
  { title: '升级条件(订单数)', dataIndex: 'conditionOrderCount', width: 130 },
  { title: '升级条件(金额)', dataIndex: 'conditionTotalAmount', width: 120 },
  { title: '分销商数', dataIndex: 'distributorCount', width: 80 },
  { title: '排序', dataIndex: 'sortOrder', width: 70 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

const fetchLevels = async () => {
  levelLoading.value = true
  try {
    const res = await shopApi.getLevelList({ page: 1, pageSize: 50 })
    levelList.value = (res.data as any).list || []
  } finally { levelLoading.value = false }
}

const levelModalVisible = ref(false)
const levelSubmitting = ref(false)
const levelEditingId = ref('')
const levelForm = reactive({
  name: '', level: 1, commissionRate: 10,
  conditionOrderCount: undefined as number | undefined,
  conditionTotalAmount: undefined as number | undefined,
  icon: '', sortOrder: 0,
})

const openLevelCreate = () => {
  levelEditingId.value = ''
  Object.assign(levelForm, { name: '', level: 1, commissionRate: 10, conditionOrderCount: undefined, conditionTotalAmount: undefined, icon: '', sortOrder: 0 })
  levelModalVisible.value = true
}

const openLevelEdit = (record: any) => {
  levelEditingId.value = record.id
  Object.assign(levelForm, {
    name: record.name, level: record.level, commissionRate: Number(record.commissionRate),
    conditionOrderCount: record.conditionOrderCount,
    conditionTotalAmount: record.conditionTotalAmount ? Number(record.conditionTotalAmount) / 100 : undefined,
    icon: record.icon || '', sortOrder: record.sortOrder || 0,
  })
  levelModalVisible.value = true
}

const handleLevelSubmit = async () => {
  levelSubmitting.value = true
  try {
    const data: any = {
      name: levelForm.name,
      level: levelForm.level,
      commissionRate: levelForm.commissionRate,
      conditionOrderCount: levelForm.conditionOrderCount || 0,
      conditionTotalAmount: levelForm.conditionTotalAmount ? Math.round(levelForm.conditionTotalAmount * 100) : undefined,
      icon: levelForm.icon || undefined,
      sortOrder: levelForm.sortOrder || 0,
    }
    if (levelEditingId.value) {
      await shopApi.updateLevel(levelEditingId.value, data)
    } else {
      await shopApi.createLevel(data)
    }
    message.success(levelEditingId.value ? '已更新' : '已创建')
    levelModalVisible.value = false
    fetchLevels()
  } catch { /* handled */ }
  finally { levelSubmitting.value = false }
}

const handleLevelDelete = async (id: string) => {
  try { await shopApi.deleteLevel(id); message.success('已删除'); fetchLevels() } catch { /* handled */ }
}

// ===== 参数配置 =====
const configLoading = ref(false)
const configList = ref<any[]>([])

const configColumns = [
  { title: '配置键', dataIndex: 'key', width: 160 },
  { title: '配置值', dataIndex: 'value', width: 120 },
  { title: '描述', dataIndex: 'description' },
  { title: '操作', dataIndex: 'action', width: 80 },
]

// 默认配置项中文名
const configLabels: Record<string, string> = {
  min_withdraw: '最小提现金额(元)',
  withdraw_fee_rate: '提现手续费率(%)',
  auto_upgrade: '自动升级',
}

const fetchConfigs = async () => {
  configLoading.value = true
  try {
    const res = await shopApi.getDistributorConfigList({ page: 1, pageSize: 50 })
    const raw = (res.data as any).list || []
    // 补充默认值显示
    const existingKeys = new Set(raw.map((r: any) => r.key))
    const defaults = [
      { key: 'min_withdraw', value: '10', description: '最小提现金额(元)' },
      { key: 'withdraw_fee_rate', value: '0', description: '提现手续费率(%)' },
      { key: 'auto_upgrade', value: 'false', description: '是否自动升级分销等级' },
    ]
    for (const d of defaults) {
      if (!existingKeys.has(d.key)) {
        raw.push({ id: '', key: d.key, value: d.value, description: d.description })
      }
    }
    configList.value = raw
  } finally { configLoading.value = false }
}

const configModalVisible = ref(false)
const configSubmitting = ref(false)
const configForm = reactive({ key: '', value: '', description: '' })

const openConfigEdit = (record: any) => {
  configForm.key = record.key
  configForm.value = record.value
  configForm.description = record.description || configLabels[record.key] || ''
  configModalVisible.value = true
}

const handleConfigSubmit = async () => {
  configSubmitting.value = true
  try {
    await shopApi.updateDistributorConfig(configForm.key, { value: configForm.value, description: configForm.description })
    message.success('已保存')
    configModalVisible.value = false
    fetchConfigs()
  } catch { /* handled */ }
  finally { configSubmitting.value = false }
}

// ===== 提现记录 =====
const withdrawalLoading = ref(false)
const withdrawalList = ref<any[]>([])
const withdrawalFilters = reactive({ status: undefined as string | undefined })
const withdrawalPagination = reactive({ current: 1, pageSize: 20, total: 0 })

const withdrawalColumns = [
  { title: '提现单号', dataIndex: 'withdrawNo', width: 180 },
  { title: '分销商', dataIndex: 'distributor', width: 100 },
  { title: '提现金额', dataIndex: 'amount', width: 100 },
  { title: '手续费', dataIndex: 'feeAmount', width: 80 },
  { title: '实到金额', dataIndex: 'actualAmount', width: 100 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '申请时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 100 },
]

const fetchWithdrawals = async () => {
  withdrawalLoading.value = true
  try {
    const res = await shopApi.getWithdrawalList({
      page: withdrawalPagination.current, pageSize: withdrawalPagination.pageSize,
      status: withdrawalFilters.status,
    })
    const data = res.data as any
    withdrawalList.value = data.list || []
    withdrawalPagination.total = data.total || 0
  } finally { withdrawalLoading.value = false }
}

const handleWithdrawalTableChange = (pag: any) => { withdrawalPagination.current = pag.current; fetchWithdrawals() }

const handleWithdrawalProcess = async (record: any, status: string) => {
  try {
    await shopApi.processWithdrawal(record.id, { status })
    message.success(status === 'completed' ? '已通过' : '已拒绝')
    fetchWithdrawals()
  } catch { /* handled */ }
}

onMounted(() => { fetchLevels(); fetchConfigs(); fetchWithdrawals() })
</script>

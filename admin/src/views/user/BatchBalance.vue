<template>
  <div class="page-container">
    <div class="page-title mb-4">余额管理</div>

    <a-tabs v-model:activeKey="activeTab">
      <!-- 批量操作 -->
      <a-tab-pane key="batch" tab="批量操作">
        <a-card title="余额批量操作" size="small" class="mb-4">
          <a-form layout="vertical">
            <a-form-item label="操作类型" required>
              <a-radio-group v-model:value="opType">
                <a-radio-button value="clear">批量清空</a-radio-button>
                <a-radio-button value="add">批量增加</a-radio-button>
                <a-radio-button value="deduct">批量扣减</a-radio-button>
              </a-radio-group>
            </a-form-item>

            <a-form-item label="用户ID列表" required>
              <a-textarea v-model:value="userIdsText" :rows="4" placeholder="每行一个用户ID，或使用逗号/空格/换行分隔" />
              <div class="text-secondary mt-1">已识别 {{ parsedUserIds.length }} 个用户ID</div>
            </a-form-item>

            <a-form-item v-if="opType !== 'clear'" label="金额" required>
              <a-input-number v-model:value="amount" :min="0.01" :precision="2" style="width:200px" placeholder="0.00" />
            </a-form-item>

            <a-form-item label="原因/备注">
              <a-input v-model:value="reason" placeholder="操作原因" />
            </a-form-item>

            <a-form-item>
              <a-popconfirm
                :title="`确定要对 ${parsedUserIds.length} 个用户执行${opType === 'clear' ? '余额清空' : opType === 'add' ? '余额增加' : '余额扣减'}操作吗？此操作不可逆！`"
                @confirm="onExecute"
                ok-text="确定"
                cancel-text="取消"
              >
                <a-button type="primary" danger :loading="executing" :disabled="parsedUserIds.length === 0">
                  {{ opType === 'clear' ? '批量清空余额' : opType === 'add' ? '批量增加余额' : '批量扣减余额' }}
                </a-button>
              </a-popconfirm>
            </a-form-item>
          </a-form>
        </a-card>

        <!-- 执行结果 -->
        <a-alert v-if="result" :message="result" type="info" show-icon class="mb-4" />
      </a-tab-pane>

      <!-- 操作日志 -->
      <a-tab-pane key="logs" tab="操作日志">
        <a-card size="small" class="mb-4">
          <a-row :gutter="12">
            <a-col :span="3">
              <a-select v-model:value="lf.action" placeholder="操作类型" allow-clear style="width:100%" @change="onLogSearch">
                <a-select-option value="batch_clear">批量清空</a-select-option>
                <a-select-option value="batch_add">批量增加</a-select-option>
                <a-select-option value="batch_deduct">批量扣减</a-select-option>
                <a-select-option value="adjust">余额调整</a-select-option>
              </a-select>
            </a-col>
          </a-row>
        </a-card>

        <a-table :dataSource="llist" :columns="lcols" :loading="lld" :pagination="{ current: lp, pageSize: lps, total: lt }" @change="onLogTableChange" rowKey="id" size="small">
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'action'">
              <a-tag :color="record.action === 'batch_clear' ? 'red' : record.action === 'batch_add' ? 'green' : record.action === 'batch_deduct' ? 'orange' : 'blue'">
                {{ record.action === 'batch_clear' ? '批量清空' : record.action === 'batch_add' ? '批量增加' : record.action === 'batch_deduct' ? '批量扣减' : '调整' }}
              </a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'userIds'">
              <span>{{ Array.isArray(record.userIds) ? record.userIds.length + '人' : '-' }}</span>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { userApi } from '@/api/user'
import type { BalanceLog } from '@/types/user'

const activeTab = ref('batch')

// === 批量操作 ===
const opType = ref<'clear' | 'add' | 'deduct'>('clear')
const userIdsText = ref('')
const amount = ref(0)
const reason = ref('')
const executing = ref(false)
const result = ref('')

const parsedUserIds = computed(() => {
  const text = userIdsText.value.trim()
  if (!text) return []
  return text.split(/[\n,，\s]+/).filter(Boolean).map((s: string) => s.trim())
})

async function onExecute() {
  const ids = parsedUserIds.value
  if (ids.length === 0) return

  executing.value = true
  result.value = ''
  try {
    let res: any
    if (opType.value === 'clear') {
      res = await userApi.batchBalanceClear({ userIds: ids, reason: reason.value })
    } else if (opType.value === 'add') {
      res = await userApi.batchBalanceAdd({ userIds: ids, amount: amount.value, reason: reason.value })
    } else {
      res = await userApi.batchBalanceDeduct({ userIds: ids, amount: amount.value, reason: reason.value })
    }
    const data = res.data as any
    result.value = `操作完成：成功 ${data.successCount || 0} 人，总金额 ${data.totalAmount || 0}${data.errors ? '，失败: ' + data.errors.length : ''}`
    message.success('操作完成')
    userIdsText.value = ''
    amount.value = 0
    reason.value = ''
  } catch { /* ignore */ } finally { executing.value = false }
}

// === 操作日志 ===
const lld = ref(false), llist = ref<BalanceLog[]>([]), lt = ref(0), lp = ref(1), lps = ref(20)
const lf = reactive({ action: undefined as string | undefined })

const lcols = [
  { title: '操作类型', dataIndex: 'action', width: 100 },
  { title: '操作人ID', dataIndex: 'operatorId', width: 120 },
  { title: '用户数', dataIndex: 'userIds', width: 80 },
  { title: '总金额', dataIndex: 'totalAmount', width: 100 },
  { title: '原因', dataIndex: 'reason', ellipsis: true },
  { title: 'IP', dataIndex: 'ip', width: 120 },
  { title: '时间', dataIndex: 'createdAt', width: 150 },
]

async function fetchLogs() {
  lld.value = true
  try {
    const params: any = { page: lp.value, pageSize: lps.value }
    if (lf.action) params.action = lf.action
    const res = await userApi.getBalanceOpsLogs(params)
    const data = res.data as any
    llist.value = data.list || []
    lt.value = data.total || 0
  } catch { /* ignore */ } finally { lld.value = false }
}

function onLogSearch() { lp.value = 1; fetchLogs() }
function onLogTableChange(pag: any) { lp.value = pag.current; fetchLogs() }

onMounted(() => fetchLogs())
</script>

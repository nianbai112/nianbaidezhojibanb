<template>
  <div class="page-container">
    <div class="page-title mb-4">私信管理</div>

    <a-tabs v-model:activeKey="activeTab">
      <!-- 会话列表 -->
      <a-tab-pane key="conversations" tab="会话管理">
        <a-card size="small" class="mb-4">
          <a-row :gutter="12">
            <a-col :span="3">
              <a-input v-model:value="cf.keyword" placeholder="搜索会话" allow-clear @pressEnter="onConvSearch" />
            </a-col>
            <a-col :span="2">
              <a-select v-model:value="cf.type" placeholder="类型" allow-clear style="width:100%" @change="onConvSearch">
                <a-select-option value="private">私聊</a-select-option>
                <a-select-option value="group">群聊</a-select-option>
                <a-select-option value="circle">圈子</a-select-option>
              </a-select>
            </a-col>
          </a-row>
        </a-card>

        <a-table :dataSource="clist" :columns="ccols" :loading="cld" :pagination="{ current: cp, pageSize: cps, total: ct }" @change="onConvTableChange" rowKey="id" size="small">
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'type'">
              <a-tag :color="record.type === 'private' ? 'blue' : record.type === 'group' ? 'green' : 'orange'">
                {{ record.type === 'private' ? '私聊' : record.type === 'group' ? '群聊' : '圈子' }}
              </a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'lastMessage'">
              {{ record.lastMessage || '-' }}
            </template>
            <template v-else-if="column.dataIndex === 'isBlocked'">
              <a-tag :color="record.isBlocked ? 'red' : 'green'">{{ record.isBlocked ? '已屏蔽' : '正常' }}</a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'action'">
              <a-space>
                <a @click="viewMessages(record)">查看消息</a>
                <a v-if="!record.isBlocked" @click="onBlockConv(record)" style="color:#faad14">屏蔽</a>
                <a v-else @click="onUnblockConv(record)">解除</a>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <!-- 违规消息 -->
      <a-tab-pane key="violations" tab="违规消息">
        <a-card size="small" class="mb-4">
          <a-row :gutter="12">
            <a-col :span="3">
              <a-select v-model:value="vf.status" placeholder="状态" allow-clear style="width:100%" @change="onVioSearch">
                <a-select-option value="pending">待处理</a-select-option>
                <a-select-option value="resolved">已处理</a-select-option>
              </a-select>
            </a-col>
          </a-row>
        </a-card>

        <a-table :dataSource="vlist" :columns="vcols" :loading="vld" :pagination="{ current: vp, pageSize: vps, total: vt }" @change="onVioTableChange" rowKey="id" size="small">
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'status'">
              <a-tag :color="record.status === 'pending' ? 'orange' : 'green'">
                {{ record.status === 'pending' ? '待处理' : '已处理' }}
              </a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'action'">
              <a-space v-if="record.status === 'pending'">
                <a @click="onHandleVio(record, 'resolved')">处理</a>
              </a-space>
              <span v-else style="color:#999">-</span>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>

    <!-- 消息记录弹窗 -->
    <a-modal v-model:open="msgVisible" title="消息记录" :width="700" :footer="null">
      <a-table :dataSource="mlist" :columns="mcols" :loading="mld" :pagination="{ current: mp, pageSize: mps, total: mt }" @change="onMsgTableChange" rowKey="id" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'sender'">
            {{ record.sender?.nickname || record.senderId }}
          </template>
          <template v-else-if="column.dataIndex === 'type'">
            <a-tag>{{ record.type }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-popconfirm title="确定撤销？" @confirm="onRevokeMsg(record)">
              <a style="color:#ff4d4f">撤销</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { messageApi } from '@/api/message'

const activeTab = ref('conversations')

// === 会话列表 ===
const cld = ref(false), clist = ref<any[]>([]), ct = ref(0), cp = ref(1), cps = ref(20)
const cf = reactive({ keyword: '', type: undefined as string | undefined })

const ccols = [
  { title: '会话ID', dataIndex: 'id', width: 80 },
  { title: '标题', dataIndex: 'title', width: 150 },
  { title: '类型', dataIndex: 'type', width: 80 },
  { title: '最后消息', dataIndex: 'lastMessage', ellipsis: true },
  { title: '未读', dataIndex: 'unreadCount', width: 60 },
  { title: '状态', dataIndex: 'isBlocked', width: 80 },
  { title: '时间', dataIndex: 'updatedAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

async function fetchConvList() {
  cld.value = true
  try {
    const params: any = { page: cp.value, pageSize: cps.value }
    if (cf.keyword) params.keyword = cf.keyword
    if (cf.type) params.type = cf.type
    const res = await messageApi.getConversationList(params)
    const data = res.data as any
    clist.value = data.list || []
    ct.value = data.total || 0
  } catch { /* ignore */ } finally { cld.value = false }
}

function onConvSearch() { cp.value = 1; fetchConvList() }
function onConvTableChange(pag: any) { cp.value = pag.current; fetchConvList() }

async function onBlockConv(r: any) {
  await messageApi.blockConversation(r.id)
  message.success('已屏蔽')
  fetchConvList()
}
async function onUnblockConv(r: any) {
  await messageApi.unblockConversation(r.id)
  message.success('已解除')
  fetchConvList()
}

// === 消息记录 ===
const msgVisible = ref(false), mld = ref(false), mlist = ref<any[]>([]), mt = ref(0), mp = ref(1), mps = ref(20)
let currentConvId = ''

const mcols = [
  { title: '发送者', dataIndex: 'sender', width: 100 },
  { title: '类型', dataIndex: 'type', width: 80 },
  { title: '内容', dataIndex: 'content', ellipsis: true },
  { title: '已读', dataIndex: 'readCount', width: 60 },
  { title: '时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 60 },
]

async function fetchMessages() {
  mld.value = true
  try {
    const res = await messageApi.getMessages(currentConvId as any, { page: mp.value, pageSize: mps.value })
    const data = res.data as any
    mlist.value = data.list || []
    mt.value = data.total || 0
  } catch { /* ignore */ } finally { mld.value = false }
}

function viewMessages(r: any) {
  currentConvId = r.id
  mp.value = 1
  msgVisible.value = true
  fetchMessages()
}

function onMsgTableChange(pag: any) { mp.value = pag.current; fetchMessages() }

async function onRevokeMsg(r: any) {
  await messageApi.revokeMessage(currentConvId, r.id)
  message.success('已撤销')
  fetchMessages()
}

// === 违规消息 ===
const vld = ref(false), vlist = ref<any[]>([]), vt = ref(0), vp = ref(1), vps = ref(20)
const vf = reactive({ status: undefined as string | undefined })

const vcols = [
  { title: '消息ID', dataIndex: 'messageId', width: 80 },
  { title: '内容', dataIndex: 'content', ellipsis: true },
  { title: '举报原因', dataIndex: 'reason', width: 150 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 60 },
]

async function fetchVioList() {
  vld.value = true
  try {
    const params: any = { page: vp.value, pageSize: vps.value }
    if (vf.status) params.status = vf.status
    const res = await messageApi.getViolationList(params)
    const data = res.data as any
    vlist.value = data.list || []
    vt.value = data.total || 0
  } catch { /* ignore */ } finally { vld.value = false }
}

function onVioSearch() { vp.value = 1; fetchVioList() }
function onVioTableChange(pag: any) { vp.value = pag.current; fetchVioList() }

async function onHandleVio(r: any, status: string) {
  await messageApi.handleViolation(r.id, status, '已处理')
  message.success('已处理')
  fetchVioList()
}

onMounted(() => { fetchConvList(); fetchVioList() })
</script>

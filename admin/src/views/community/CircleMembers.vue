<template>
  <div class="page-container table-page">
    <div class="table-toolbar">
      <div class="page-title">
        <a-button type="text" @click="$router.back()" style="padding-left:0">
          <template #icon><span>←</span></template>
        </a-button>
        社群成员管理
      </div>
    </div>

    <div class="table-container">
      <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'user'">
            <a-space v-if="record.user">
              <a-avatar :src="record.user.avatar" size="small" />
              <span>{{ record.user.nickname || '未知' }}</span>
            </a-space>
          </template>
          <template v-else-if="column.dataIndex === 'phone'">
            {{ record.user?.phone || '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'role'">
            <a-tag :color="roleColorMap[record.role]">{{ roleMap[record.role] || record.role }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-popconfirm
              v-if="record.role !== 'OWNER'"
              title="确定要踢出该成员吗？"
              @confirm="handleRemove(record)"
            >
              <a class="text-danger">踢出</a>
            </a-popconfirm>
            <span v-else class="text-secondary">群主</span>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { communityApi } from '@/api/community'

const route = useRoute()
const circleId = route.params.circleId as string

const loading = ref(false)
const list = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 50, total: 0 })

const roleMap: Record<string, string> = { OWNER: '群主', ADMIN: '管理员', MEMBER: '成员' }
const roleColorMap: Record<string, string> = { OWNER: 'gold', ADMIN: 'blue', MEMBER: 'default' }

const columns = [
  { title: '用户', dataIndex: 'user', width: 160 },
  { title: '手机号', dataIndex: 'phone', width: 130 },
  { title: '昵称', dataIndex: 'nickName', width: 120 },
  { title: '角色', dataIndex: 'role', width: 100 },
  { title: '加入时间', dataIndex: 'joinAt', width: 170 },
  { title: '操作', dataIndex: 'action', width: 100 }
]

const fetchList = async () => {
  loading.value = true
  try {
    const res = await communityApi.getMembers(circleId, {
      page: pagination.current,
      pageSize: pagination.pageSize
    })
    list.value = res.data.list
    pagination.total = res.data.total
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  fetchList()
}

const handleRemove = async (record: any) => {
  try {
    await communityApi.removeMember(record.id)
    message.success('已踢出该成员')
    fetchList()
  } catch (err: any) {
    message.error(err?.response?.data?.message || '操作失败')
  }
}

onMounted(() => fetchList())
</script>

<template>
  <div class="page-container">
    <div class="page-title mb-4">地址管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="3">
          <a-input v-model:value="f.keyword" placeholder="姓名/手机/地址" allow-clear @pressEnter="onSearch" />
        </a-col>
        <a-col :span="3">
          <a-input v-model:value="f.userId" placeholder="用户ID" allow-clear @pressEnter="onSearch" />
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
          <span v-else style="color:#ccc">-</span>
        </template>
        <template v-else-if="column.dataIndex === 'isDefault'">
          <a-tag v-if="record.isDefault" color="blue">默认</a-tag>
          <span v-else style="color:#ccc">-</span>
        </template>
        <template v-else-if="column.dataIndex === 'location'">
          <span v-if="record.latitude">
            {{ record.latitude.toFixed(4) }}, {{ record.longitude?.toFixed(4) }}
          </span>
          <span v-else style="color:#ccc">-</span>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-popconfirm title="确定删除该地址？" @confirm="onDelete(record)">
            <a style="color:#ff4d4f">删除</a>
          </a-popconfirm>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { userApi } from '@/api/user'
import type { UserAddress } from '@/types/user'

const ld = ref(false), list = ref<UserAddress[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ keyword: '', userId: '' })

const cols = [
  { title: '用户', dataIndex: 'user', width: 140 },
  { title: '收货人', dataIndex: 'name', width: 100 },
  { title: '手机号', dataIndex: 'phone', width: 120 },
  { title: '详细地址', dataIndex: 'detail', ellipsis: true },
  { title: '默认', dataIndex: 'isDefault', width: 60 },
  { title: '坐标', dataIndex: 'location', width: 140 },
  { title: '创建时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 60 },
]

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.keyword) params.keyword = f.keyword
    if (f.userId) params.userId = f.userId
    const res = await userApi.getAddressList(params)
    const data = res.data as any
    list.value = data.list || []
    t.value = data.total || 0
  } catch { /* ignore */ } finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onTableChange(pag: any) { p.value = pag.current; fetchList() }

async function onDelete(r: Record<string, any>) {
  await userApi.deleteAddress(r.id)
  message.success('已删除')
  fetchList()
}

onMounted(() => fetchList())
</script>

<template>
  <div class="page-container">
    <div class="page-title mb-4">下载记录</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="4">
          <a-input v-model:value="f.userId" placeholder="用户ID" allow-clear @pressEnter="onSearch" />
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="f.paid" placeholder="付费类型" allow-clear style="width:100%" @change="onSearch">
            <a-select-option value="true">付费</a-select-option>
            <a-select-option value="false">免费</a-select-option>
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
        <template v-else-if="column.dataIndex === 'resource'">
          {{ record.resource?.title || record.resourceId }}
        </template>
        <template v-else-if="column.dataIndex === 'price'">
          {{ record.resource?.price ? '¥' + (Number(record.resource.price)).toFixed(2) : '免费' }}
        </template>
        <template v-else-if="column.dataIndex === 'paid'">
          <a-tag :color="record.paid ? 'green' : 'default'">{{ record.paid ? '付费' : '免费' }}</a-tag>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { netdiskApi } from '@/api/netdisk'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ userId: '', paid: undefined as 'true' | 'false' | undefined })

const cols = [
  { title: '用户', dataIndex: 'user', width: 140 },
  { title: '资源', dataIndex: 'resource', width: 200 },
  { title: '资源价格', dataIndex: 'price', width: 90 },
  { title: '付费类型', dataIndex: 'paid', width: 80 },
  { title: 'IP', dataIndex: 'ip', width: 130 },
  { title: '下载时间', dataIndex: 'createdAt', width: 160 },
]

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.userId) params.userId = f.userId
    if (f.paid !== undefined) params.paid = f.paid === 'true'
    const res = await netdiskApi.getDownloadList(params)
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

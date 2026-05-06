<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">签到配置</span>
        <a-button type="primary" @click="onAdd">添加规则</a-button>
      </div>
      <a-table :columns="columns" :data-source="list" row-key="id" size="middle" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'rewardType'">
            <a-tag>{{ record.rewardType === 'points' ? '积分' : record.rewardType === 'coupon' ? '优惠券' : '余额' }}</a-tag>
          </template>
          <template v-if="column.key === 'rewardValue'">
            <span v-if="record.rewardType === 'points'">{{ record.rewardValue }}积分</span>
            <span v-else-if="record.rewardType === 'coupon'">优惠券ID: {{ record.couponId }}</span>
            <span v-else>¥{{ (record.rewardValue / 100).toFixed(2) }}</span>
          </template>
          <template v-if="column.key === 'status'">
            <a-switch :checked="record.status === 1" size="small" />
          </template>
          <template v-if="column.key === 'action'">
            <a-space>
              <a @click="onEdit(record)">编辑</a>
              <a-popconfirm title="确定删除?" @confirm="onDel(record.id)">
                <a style="color:#ef4444">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { marketingApi } from '@/api/marketing'

const list = ref<any[]>([])

const columns = [
  { title: '连续天数', dataIndex: 'consecutiveDays', width: 100 },
  { title: '奖励类型', key: 'rewardType', width: 100 },
  { title: '奖励', key: 'rewardValue', width: 150 },
  { title: '状态', key: 'status', width: 70 },
  { title: '操作', key: 'action', width: 120 },
]

onMounted(async () => {
  try {
    const res = await marketingApi.getSignConfigs()
    list.value = (res.data?.data || res.data || []) as any[]
  } catch {
    /* handled */
  }
})

async function onAdd() {
  const data = { consecutiveDays: 1, rewardType: 'points', rewardValue: 10, status: 1 }
  try {
    await marketingApi.saveSignConfig(data)
    message.success('添加成功')
    const res = await marketingApi.getSignConfigs()
    list.value = (res.data?.data || res.data || []) as any[]
  } catch (err: any) {
    message.error(err?.message || '添加失败')
  }
}

async function onEdit(record: any) {
  const data = { ...record, status: record.status === 1 ? 0 : 1 }
  try {
    await marketingApi.updateSignConfig(record.id, data)
    message.success('更新成功')
    const res = await marketingApi.getSignConfigs()
    list.value = (res.data?.data || res.data || []) as any[]
  } catch (err: any) {
    message.error(err?.message || '更新失败')
  }
}

async function onDel(id: number) {
  await marketingApi.deleteSignConfig(id)
  message.success('已删除')
  const res = await marketingApi.getSignConfigs()
  list.value = (res.data?.data || res.data || []) as any[]
}
</script>

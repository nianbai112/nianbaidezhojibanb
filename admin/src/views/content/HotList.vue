<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">热榜管理</span>
        <a-space>
          <a-button type="primary" :loading="saving" @click="onSave">保存热榜配置</a-button>
        </a-space>
      </div>

      <a-alert message="设置热榜用于展示精选帖子。热门帖子会优先展示在内容首页热榜区域。" type="info" show-icon style="margin-bottom:16px" />

      <DataTable
        :columns="columns as any"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        v-model:selected-keys="hotKeys"
        :row-selection="true"
        @change="onTableChange"
      >
        <template #cover="{ record }">
          <a-image v-if="record.images?.length" :src="record.images[0]" :width="50" :height="50" style="object-fit:cover;border-radius:4px" />
          <span v-else style="color:#ccc">无图</span>
        </template>
        <template #isEssence="{ record }">
          <a-tag v-if="record.isEssence" color="gold">精华</a-tag>
          <span v-else>-</span>
        </template>
        <template #action="{ record }">
          <a-switch
            :checked="hotKeys.includes(record.id)"
            size="small"
            @change="(checked: boolean) => onToggleHot(record, checked)"
          />
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { contentApi } from '@/api/content'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const saving = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const hotKeys = ref<(string | number)[]>([])

const columns = [
  { title: '封面', dataIndex: 'cover', width: 70, slot: 'cover' },
  { title: '标题', dataIndex: 'title', width: 280, ellipsis: true },
  { title: '作者', dataIndex: 'userNickname', width: 100 },
  { title: '浏览', dataIndex: 'viewCount', width: 70 },
  { title: '赞', dataIndex: 'likeCount', width: 60 },
  { title: '精华', dataIndex: 'isEssence', width: 80, slot: 'isEssence' },
  { title: '发布时间', dataIndex: 'createdAt', width: 160 },
  { title: '热榜', dataIndex: 'action', width: 80, slot: 'action' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await contentApi.getHotList({ page: page.value, pageSize: pageSize.value })
    const body: any = res.data?.data || res.data || {}
    list.value = (body.list || []).map((item: any) => ({
      ...item,
      images: item.media?.map((m: any) => m.url) || [],
    }))
    total.value = body.total || 0
    hotKeys.value = list.value.filter((item: any) => item.isEssence).map((item: any) => item.id)
  } catch { message.error('加载热榜失败') } finally { loading.value = false }
}

function onTableChange() { fetchList() }

function onToggleHot(record: any, _checked: boolean) {
  const idx = hotKeys.value.indexOf(record.id)
  if (idx >= 0) {
    hotKeys.value.splice(idx, 1)
  } else {
    hotKeys.value.push(record.id)
  }
}

async function onSave() {
  saving.value = true
  try {
    await contentApi.setHotPosts(hotKeys.value as number[])
    message.success('热榜配置已保存')
    fetchList()
  } catch { message.error('保存失败') } finally { saving.value = false }
}

onMounted(() => fetchList())
</script>

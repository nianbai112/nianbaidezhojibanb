<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset" show-expand>
      <a-input v-model:value="filter.keyword" placeholder="标题/内容" allow-clear style="width:180px" />
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:130px" :options="regionOpts" />
      <a-select v-model:value="filter.auditStatus" placeholder="审核状态" allow-clear style="width:110px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="approved">已通过</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
      </a-select>
      <a-select v-model:value="filter.status" placeholder="帖子状态" allow-clear style="width:110px">
        <a-select-option value="PUBLISHED">已发布</a-select-option>
        <a-select-option value="PENDING">待审核</a-select-option>
        <a-select-option value="REJECTED">已驳回</a-select-option>
        <a-select-option value="DELETED">已删除</a-select-option>
        <a-select-option value="DRAFT">草稿</a-select-option>
      </a-select>
      <a-select v-model:value="filter.type" placeholder="类型" allow-clear style="width:100px">
        <a-select-option value="text">图文</a-select-option>
        <a-select-option value="image">图片</a-select-option>
        <a-select-option value="video">视频</a-select-option>
        <a-select-option value="vote">投票</a-select-option>
      </a-select>
      <template #expand>
        <a-range-picker v-model:value="filter.dateRange" style="width:240px" />
      </template>
    </FilterBar>

    <div class="page-card">
      <DataTable
        :columns="columns as any"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        v-model:selected-keys="selectedKeys"
        :row-selection="true"
        :batch-actions="batchActions"
        @change="onTableChange"
        @batch-action="onBatchAction"
      >
        <template #images="{ record }"><ImagePreview :urls="record.images" :width="50" :height="50" /></template>
        <template #auditStatus="{ record }"><StatusTag :status="record.auditStatus" type="audit" /></template>
        <template #statusSlot="{ record }">
          <a-tag v-if="record.status === 'PUBLISHED'" color="green">已发布</a-tag>
          <a-tag v-else-if="record.status === 'PENDING'" color="orange">待审核</a-tag>
          <a-tag v-else-if="record.status === 'REJECTED'" color="red">已驳回</a-tag>
          <a-tag v-else-if="record.status === 'DELETED'" color="default">已删除</a-tag>
          <a-tag v-else>{{ record.status }}</a-tag>
        </template>
        <template #flags="{ record }">
          <a-space :size="4">
            <a-tag v-if="record.isTop" color="red">置顶</a-tag>
            <a-tag v-if="record.isEssence" color="gold">精华</a-tag>
            <a-tag v-if="record.isHot" color="orange">热门</a-tag>
          </a-space>
        </template>
        <template #region="{ record }">
          <span>{{ record.regionName || '-' }}</span>
        </template>
        <template #action="{ record }">
          <a-space>
            <a-button type="link" size="small" @click="$router.push(`/content/post/${record.id}`)">详情</a-button>
            <template v-if="record.auditStatus === 'pending'">
              <a-button type="link" size="small" style="color:#10b981" @click="onAudit(record, 'approve')">通过</a-button>
              <a-button type="link" size="small" danger @click="onAudit(record, 'reject')">拒绝</a-button>
            </template>
            <a-dropdown>
              <a-button type="link" size="small">更多 <DownOutlined /></a-button>
              <template #overlay>
                <a-menu @click="({key}) => onQuickAction(key as string, record)">
                  <a-menu-item key="top">{{ record.isTop ? '取消置顶' : '置顶' }}</a-menu-item>
                  <a-menu-item key="essence">{{ record.isEssence ? '取消精华' : '设为精华' }}</a-menu-item>
                  <a-menu-item key="hot">{{ record.isHot ? '取消热门' : '设为热门' }}</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
            <a-popconfirm title="确定删除?" @confirm="onDelete(record.id)">
              <a-button type="link" size="small" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <AuditModal
      v-model:visible="auditVisible"
      title="帖子审核"
      :images="auditPost?.images || []"
      @submit="onAuditSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { DownOutlined } from '@ant-design/icons-vue'
import { contentApi } from '@/api/content'
import { areaApi } from '@/api/area'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import ImagePreview from '@/components/common/ImagePreview.vue'
import AuditModal from '@/components/common/AuditModal.vue'
import type { Post } from '@/types/content'
import type { Dayjs } from 'dayjs'

const loading = ref(false)
const list = ref<Post[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedKeys = ref<(string | number)[]>([])
const regionOpts = ref<{ label: string; value: string }[]>([])

const filter = reactive({
  keyword: '',
  regionId: undefined as string | undefined,
  auditStatus: undefined as string | undefined,
  status: undefined as string | undefined,
  type: undefined as string | undefined,
  dateRange: undefined as [Dayjs, Dayjs] | undefined,
})

const auditVisible = ref(false)
const auditPost = ref<Post | null>(null)
const auditAction = ref<'approve' | 'reject'>('approve')

const columns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '标题', dataIndex: 'title', width: 200, ellipsis: true },
  { title: '作者', dataIndex: 'userNickname', width: 90 },
  { title: '类型', dataIndex: 'type', width: 60 },
  { title: '图片', dataIndex: 'images', width: 70, slot: 'images' },
  { title: '区域', dataIndex: 'region', width: 80, slot: 'region' },
  { title: '状态', dataIndex: 'statusSlot', width: 80, slot: 'statusSlot' },
  { title: '标记', dataIndex: 'flags', width: 100, slot: 'flags' },
  { title: '审核', dataIndex: 'auditStatus', width: 70, slot: 'auditStatus' },
  { title: '浏览', dataIndex: 'viewCount', width: 55 },
  { title: '赞', dataIndex: 'likeCount', width: 50 },
  { title: '评', dataIndex: 'commentCount', width: 50 },
  { title: '举报', dataIndex: 'reportCount', width: 50 },
  { title: '发布时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 260, slot: 'action', fixed: 'right' },
]

const batchActions = [
  { key: 'approve', label: '批量通过' },
  { key: 'reject', label: '批量拒绝', danger: true },
  { key: 'delete', label: '批量删除', danger: true },
]

async function fetchRegions() {
  try {
    const res = await areaApi.getList({ page: 1, pageSize: 100 })
    const body: any = res.data?.data || res.data || {}
    const regions = body.list || body.data || []
    regionOpts.value = (regions as any[]).map((r: any) => ({ label: r.name, value: r.id }))
  } catch { /* ignore */ }
}

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, keyword: filter.keyword || undefined, auditStatus: filter.auditStatus, type: filter.type, regionId: filter.regionId, status: filter.status }
    if (filter.dateRange) {
      params.startDate = filter.dateRange[0].format('YYYY-MM-DD')
      params.endDate = filter.dateRange[1].format('YYYY-MM-DD')
    }
    const res = await contentApi.getPostList(params)
    const body: any = res.data?.data || res.data || {}
    list.value = body.list || []
    total.value = body.total || 0
  } catch { message.error('加载帖子列表失败') } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.regionId = undefined; filter.auditStatus = undefined; filter.status = undefined; filter.type = undefined; filter.dateRange = undefined; onSearch() }
function onTableChange() { fetchList() }

async function onBatchAction(action: string, keys: (string | number)[]) {
  try {
    await contentApi.batchOp({ ids: keys, action })
    message.success('操作成功')
    selectedKeys.value = []
    fetchList()
  } catch { message.error('批量操作失败') }
}

function onAudit(record: Post, action: 'approve' | 'reject') {
  auditPost.value = record
  auditAction.value = action
  auditVisible.value = true
}

async function onAuditSubmit(action: 'approve' | 'reject', remark: string) {
  if (!auditPost.value) return
  try {
    if (action === 'approve') await contentApi.approvePost(Number(auditPost.value.id), remark)
    else await contentApi.rejectPost(Number(auditPost.value.id), remark)
    message.success('操作成功')
    auditVisible.value = false
    fetchList()
  } catch { message.error('审核操作失败') }
}

async function onQuickAction(key: string, record: Post) {
  try {
    if (key === 'top') await contentApi.toggleTop(record.id)
    else if (key === 'essence') await contentApi.toggleEssence(record.id)
    else if (key === 'hot') await contentApi.setHotPosts([record.id])
    message.success('操作成功')
    fetchList()
  } catch { message.error('操作失败') }
}

async function onDelete(id: string | number) {
  try {
    await contentApi.deletePost(Number(id))
    message.success('已删除')
    fetchList()
  } catch { message.error('删除失败') }
}

onMounted(() => { fetchRegions(); fetchList() })
</script>

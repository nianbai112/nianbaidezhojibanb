<template>
  <a-card title="广告管理" :bordered="false">
    <div class="page-header">
      <span class="page-title">广告列表</span>
      <a-button type="primary" @click="onAdd">添加广告</a-button>
    </div>

    <FilterBar @search="fetchList" @reset="onFilterReset">
      <a-select v-model:value="filterPosition" placeholder="广告位置" allow-clear style="width: 160px" @change="fetchList">
        <a-select-option value="home_banner">首页轮播</a-select-option>
        <a-select-option value="home_popup">首页弹窗</a-select-option>
        <a-select-option value="feed">信息流</a-select-option>
        <a-select-option value="detail">详情页</a-select-option>
        <a-select-option value="splash">开屏</a-select-option>
      </a-select>
      <a-select v-model:value="filterStatus" placeholder="状态" allow-clear style="width: 120px" @change="fetchList">
        <a-select-option :value="1">启用</a-select-option>
        <a-select-option :value="0">禁用</a-select-option>
      </a-select>
    </FilterBar>

    <DataTable
      :columns="columns"
      :data-source="list"
      :loading="loading"
      :total="total"
      :page="page"
      :page-size="pageSize"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
    >
      <template #image="{ record }">
        <ImagePreview :urls="record.image" :width="60" :height="60" />
      </template>
      <template #position="{ record }">
        <a-tag>{{ positionMap[record.position] || record.position }}</a-tag>
      </template>
      <template #linkType="{ record }">
        <a-tag>{{ linkTypeMap[record.linkType] || record.linkType }}</a-tag>
      </template>
      <template #time="{ record }">
        <span class="time-text">{{ record.startTime }} ~ {{ record.endTime }}</span>
      </template>
      <template #status="{ record }">
        <a-switch
          :checked="record.status === 1"
          size="small"
          :loading="statusLoadingMap[record.id]"
          @change="(checked: boolean) => onToggleStatus(record, checked)"
        />
      </template>
      <template #action="{ record }">
        <a-space>
          <a @click="onEdit(record)">编辑</a>
          <a-popconfirm title="确定删除此广告？" ok-text="确定" cancel-text="取消" @confirm="onDelete(record.id)">
            <a style="color: #ef4444">删除</a>
          </a-popconfirm>
        </a-space>
      </template>
    </DataTable>

    <a-modal
      v-model:open="modalVisible"
      :title="editingId ? '编辑广告' : '添加广告'"
      :confirm-loading="modalSaving"
      @ok="onModalSave"
      @cancel="onModalCancel"
      width="640px"
    >
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="广告名称">
          <a-input v-model:value="modalForm.name" placeholder="请输入广告名称" />
        </a-form-item>
        <a-form-item label="广告图片">
          <UploadImage v-model="modalForm.image" :max-count="1" scene="ad" />
        </a-form-item>
        <a-form-item label="链接类型">
          <a-select v-model:value="modalForm.linkType" placeholder="请选择链接类型" style="width: 100%">
            <a-select-option value="url">外部链接</a-select-option>
            <a-select-option value="post">帖子</a-select-option>
            <a-select-option value="product">商品</a-select-option>
            <a-select-option value="topic">话题</a-select-option>
            <a-select-option value="none">无跳转</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="modalForm.linkType !== 'none'" label="链接值">
          <a-input v-model:value="modalForm.linkValue" placeholder="请输入链接地址或ID" />
        </a-form-item>
        <a-form-item label="广告位置">
          <a-select v-model:value="modalForm.position" placeholder="请选择广告位置" style="width: 100%">
            <a-select-option value="home_banner">首页轮播</a-select-option>
            <a-select-option value="home_popup">首页弹窗</a-select-option>
            <a-select-option value="feed">信息流</a-select-option>
            <a-select-option value="detail">详情页</a-select-option>
            <a-select-option value="splash">开屏</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="开始时间">
          <a-date-picker v-model:value="modalForm.startTime" show-time style="width: 100%" />
        </a-form-item>
        <a-form-item label="结束时间">
          <a-date-picker v-model:value="modalForm.endTime" show-time style="width: 100%" />
        </a-form-item>
        <a-form-item label="优先级">
          <a-input-number v-model:value="modalForm.priority" :min="0" :max="9999" style="width: 120px" />
          <span class="form-hint">数值越大越靠前</span>
        </a-form-item>
      </a-form>
    </a-modal>
  </a-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { configApi } from '@/api/config'
import type { Advertisement } from '@/types/config'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import ImagePreview from '@/components/common/ImagePreview.vue'
import UploadImage from '@/components/common/UploadImage.vue'

const positionMap: Record<string, string> = {
  home_banner: '首页轮播',
  home_popup: '首页弹窗',
  feed: '信息流',
  detail: '详情页',
  splash: '开屏',
}

const linkTypeMap: Record<string, string> = {
  url: '外部链接',
  post: '帖子',
  product: '商品',
  topic: '话题',
  none: '无跳转',
}

const columns = [
  { title: '名称', dataIndex: 'name', width: 140 },
  { title: '图片', key: 'image', width: 100 },
  { title: '位置', key: 'position', width: 100 },
  { title: '链接类型', key: 'linkType', width: 100 },
  { title: '有效期', key: 'time', width: 220 },
  { title: '优先级', dataIndex: 'priority', width: 80 },
  { title: '浏览', dataIndex: 'viewCount', width: 80 },
  { title: '点击', dataIndex: 'clickCount', width: 80 },
  { title: '状态', key: 'status', width: 80 },
  { title: '操作', key: 'action', width: 120 },
]

const list = ref<Advertisement[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const filterPosition = ref<string | undefined>(undefined)
const filterStatus = ref<number | undefined>(undefined)

const modalVisible = ref(false)
const modalSaving = ref(false)
const editingId = ref<number | null>(null)
const statusLoadingMap = reactive<Record<number, boolean>>({})

const modalForm = reactive({
  name: '',
  image: '',
  linkType: 'url' as string,
  linkValue: '',
  position: 'home_banner' as string,
  startTime: null as any,
  endTime: null as any,
  priority: 0,
})

onMounted(() => {
  fetchList()
})

async function fetchList() {
  loading.value = true
  try {
    const res = await configApi.getAdvertisements({
      page: page.value,
      pageSize: pageSize.value,
      position: filterPosition.value,
      status: filterStatus.value,
    })
    const data = res.data as any
    list.value = data?.list || data?.data?.list || []
    total.value = data?.total || data?.data?.total || 0
  } catch {
    /* handled */
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  fetchList()
}

function onPageSizeChange(ps: number) {
  pageSize.value = ps
  page.value = 1
  fetchList()
}

function onFilterReset() {
  filterPosition.value = undefined
  filterStatus.value = undefined
  page.value = 1
  fetchList()
}

function onAdd() {
  editingId.value = null
  modalForm.name = ''
  modalForm.image = ''
  modalForm.linkType = 'url'
  modalForm.linkValue = ''
  modalForm.position = 'home_banner'
  modalForm.startTime = null
  modalForm.endTime = null
  modalForm.priority = 0
  modalVisible.value = true
}

function onEdit(record: Advertisement) {
  editingId.value = record.id
  modalForm.name = record.name
  modalForm.image = record.image
  modalForm.linkType = record.linkType
  modalForm.linkValue = record.linkValue
  modalForm.position = record.position
  modalForm.startTime = record.startTime ? dayjs(record.startTime) : null
  modalForm.endTime = record.endTime ? dayjs(record.endTime) : null
  modalForm.priority = record.priority
  modalVisible.value = true
}

async function onModalSave() {
  modalSaving.value = true
  try {
    const data: any = {
      name: modalForm.name,
      image: modalForm.image,
      linkType: modalForm.linkType,
      linkValue: modalForm.linkValue,
      position: modalForm.position,
      priority: modalForm.priority,
    }
    if (modalForm.startTime) {
      data.startTime = modalForm.startTime.format ? modalForm.startTime.format('YYYY-MM-DD HH:mm:ss') : modalForm.startTime
    }
    if (modalForm.endTime) {
      data.endTime = modalForm.endTime.format ? modalForm.endTime.format('YYYY-MM-DD HH:mm:ss') : modalForm.endTime
    }

    if (editingId.value) {
      await configApi.updateAdvertisement(editingId.value, data)
      message.success('更新成功')
    } else {
      await configApi.saveAdvertisement(data)
      message.success('添加成功')
    }
    modalVisible.value = false
    fetchList()
  } catch {
    message.error('操作失败')
  } finally {
    modalSaving.value = false
  }
}

function onModalCancel() {
  modalVisible.value = false
}

async function onDelete(id: number) {
  try {
    await configApi.deleteAdvertisement(id)
    message.success('已删除')
    fetchList()
  } catch {
    message.error('删除失败')
  }
}

async function onToggleStatus(record: Advertisement, checked: boolean) {
  const newStatus = checked ? 1 : 0
  statusLoadingMap[record.id] = true
  try {
    await configApi.toggleAdvertisement(record.id, newStatus as 0 | 1)
    record.status = newStatus as 0 | 1
    message.success(checked ? '已启用' : '已禁用')
  } catch {
    message.error('操作失败')
  } finally {
    statusLoadingMap[record.id] = false
  }
}
</script>

<style lang="less" scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  .page-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }
}

.time-text {
  font-size: 12px;
  color: #6b7280;
}

.form-hint {
  margin-left: 12px;
  font-size: 13px;
  color: #9ca3af;
}
</style>

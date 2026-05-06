<template>
  <div class="detail-page">
    <div class="detail-header">
      <a-space>
        <a-button @click="$router.back()"><arrow-left-outlined /></a-button>
        <span class="page-title">首页装修 - {{ areaName }}</span>
      </a-space>
      <a-button @click="fetchAll">刷新</a-button>
    </div>

    <div class="detail-section">
      <div class="section-title">
        轮播图
        <a-button size="small" type="link" @click="openBanner()">+ 添加</a-button>
      </div>
      <a-table :columns="bannerColumns" :data-source="banners" row-key="id" size="small" :pagination="false" :loading="loading">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'image'">
            <a-image :src="record.image" :width="120" :height="60" style="object-fit:cover;border-radius:4px" />
          </template>
          <template v-if="column.dataIndex === 'isShow'">
            <a-tag :color="record.isShow ? 'green' : 'default'">{{ record.isShow ? '显示' : '隐藏' }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-space>
              <a @click="openBanner(record)">编辑</a>
              <a-popconfirm title="确定删除轮播图?" @confirm="deleteBanner(record.id)">
                <a style="color:#ef4444">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <div class="detail-section">
      <div class="section-title">
        公告
        <a-button size="small" type="link" @click="openNotice()">+ 添加</a-button>
      </div>
      <a-table :columns="noticeColumns" :data-source="notices" row-key="id" size="small" :pagination="false" :loading="loading">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'isShow'">
            <a-tag :color="record.isShow ? 'green' : 'default'">{{ record.isShow ? '显示' : '隐藏' }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-space>
              <a @click="openNotice(record)">编辑</a>
              <a-popconfirm title="确定删除公告?" @confirm="deleteNotice(record.id)">
                <a style="color:#ef4444">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <div class="detail-section">
      <div class="section-title">
        首页导航
        <a-button size="small" type="link" @click="addNav">+ 添加</a-button>
      </div>
      <a-table :columns="navColumns" :data-source="navItems" row-key="key" size="small" :pagination="false">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.dataIndex === 'name'"><a-input v-model:value="record.name" /></template>
          <template v-if="column.dataIndex === 'icon'"><a-input v-model:value="record.icon" /></template>
          <template v-if="column.dataIndex === 'link'"><a-input v-model:value="record.link" /></template>
          <template v-if="column.dataIndex === 'action'"><a @click="navItems.splice(index, 1)" style="color:#ef4444">删除</a></template>
        </template>
      </a-table>
      <a-button class="mt-12" type="primary" :loading="savingNav" @click="saveNav">保存首页导航</a-button>
    </div>

    <a-modal v-model:open="bannerVisible" :title="bannerForm.id ? '编辑轮播图' : '添加轮播图'" :confirm-loading="saving" @ok="saveBanner">
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="标题"><a-input v-model:value="bannerForm.title" /></a-form-item>
        <a-form-item label="图片" required><UploadImage v-model="bannerForm.image" :max-count="1" scene="region" /></a-form-item>
        <a-form-item label="跳转链接"><a-input v-model:value="bannerForm.link" placeholder="/pages/..." /></a-form-item>
        <a-form-item label="排序"><a-input-number v-model:value="bannerForm.sortOrder" :min="0" /></a-form-item>
        <a-form-item label="显示"><a-switch v-model:checked="bannerForm.isShow" /></a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="noticeVisible" :title="noticeForm.id ? '编辑公告' : '添加公告'" :confirm-loading="saving" @ok="saveNotice">
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="标题" required><a-input v-model:value="noticeForm.title" /></a-form-item>
        <a-form-item label="内容" required><a-textarea v-model:value="noticeForm.content" :rows="4" /></a-form-item>
        <a-form-item label="类型">
          <a-select v-model:value="noticeForm.type">
            <a-select-option value="normal">普通</a-select-option>
            <a-select-option value="important">重要</a-select-option>
            <a-select-option value="emergency">紧急</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="置顶"><a-switch v-model:checked="noticeForm.isTop" /></a-form-item>
        <a-form-item label="显示"><a-switch v-model:checked="noticeForm.isShow" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import { areaApi } from '@/api/area'
import UploadImage from '@/components/common/UploadImage.vue'

const route = useRoute()
const regionId = String(route.params.id)
const areaName = ref('')
const loading = ref(false)
const saving = ref(false)
const savingNav = ref(false)
const banners = ref<any[]>([])
const notices = ref<any[]>([])
const navItems = ref<any[]>([])
const bannerVisible = ref(false)
const noticeVisible = ref(false)

const bannerForm = reactive<any>({ id: '', title: '', image: '', link: '', sortOrder: 0, isShow: true })
const noticeForm = reactive<any>({ id: '', title: '', content: '', type: 'normal', isTop: false, isShow: true })

const bannerColumns = [
  { title: '标题', dataIndex: 'title' },
  { title: '图片', dataIndex: 'image', width: 150 },
  { title: '链接', dataIndex: 'link' },
  { title: '排序', dataIndex: 'sortOrder', width: 80 },
  { title: '状态', dataIndex: 'isShow', width: 80 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

const noticeColumns = [
  { title: '标题', dataIndex: 'title' },
  { title: '内容', dataIndex: 'content' },
  { title: '类型', dataIndex: 'type', width: 100 },
  { title: '状态', dataIndex: 'isShow', width: 80 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

const navColumns = [
  { title: '名称', dataIndex: 'name', width: 160 },
  { title: '图标', dataIndex: 'icon' },
  { title: '链接', dataIndex: 'link' },
  { title: '操作', dataIndex: 'action', width: 80 },
]

onMounted(fetchAll)

async function fetchAll() {
  loading.value = true
  try {
    const [detailRes, bannerRes, noticeRes, navRes] = await Promise.all([
      areaApi.getDetail(regionId as any),
      areaApi.getBanners(regionId as any),
      areaApi.getAnnouncements(regionId as any),
      areaApi.getNavItems(regionId as any),
    ])
    areaName.value = detailRes.data.data.name
    banners.value = unwrapList(bannerRes)
    notices.value = unwrapList(noticeRes)
    navItems.value = unwrapList(navRes).map((item: any) => ({ key: item.id || `${Date.now()}-${Math.random()}`, ...item }))
  } finally {
    loading.value = false
  }
}

function unwrapList(res: any) {
  const data = res.data?.data
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.list)) return data.list
  return []
}

function openBanner(record?: any) {
  Object.assign(bannerForm, record || { id: '', title: '', image: '', link: '', sortOrder: 0, isShow: true })
  bannerVisible.value = true
}

async function saveBanner() {
  if (!bannerForm.image) {
    message.warning('请上传轮播图片')
    return
  }
  saving.value = true
  try {
    const payload = { ...bannerForm, regionId, image: Array.isArray(bannerForm.image) ? bannerForm.image[0] : bannerForm.image }
    delete payload.id
    if (bannerForm.id) await areaApi.updateBanner(bannerForm.id, payload)
    else await areaApi.saveBanner(payload)
    message.success('保存成功')
    bannerVisible.value = false
    fetchAll()
  } finally {
    saving.value = false
  }
}

async function deleteBanner(id: number) {
  await areaApi.deleteBanner(id)
  message.success('删除成功')
  fetchAll()
}

function openNotice(record?: any) {
  Object.assign(noticeForm, record || { id: '', title: '', content: '', type: 'normal', isTop: false, isShow: true })
  noticeVisible.value = true
}

async function saveNotice() {
  if (!noticeForm.title || !noticeForm.content) {
    message.warning('请填写公告标题和内容')
    return
  }
  saving.value = true
  try {
    const payload = { ...noticeForm, regionId }
    delete payload.id
    if (noticeForm.id) await areaApi.updateAnnouncement(noticeForm.id, payload)
    else await areaApi.saveAnnouncement(payload)
    message.success('保存成功')
    noticeVisible.value = false
    fetchAll()
  } finally {
    saving.value = false
  }
}

async function deleteNotice(id: number) {
  await areaApi.deleteAnnouncement(id)
  message.success('删除成功')
  fetchAll()
}

function addNav() {
  navItems.value.push({ key: Date.now(), name: '', icon: '', link: '', type: 'page', isShow: true })
}

async function saveNav() {
  savingNav.value = true
  try {
    await areaApi.saveNavItems({
      regionId: regionId as any,
      items: navItems.value.map(({ key: _key, id: _id, ...item }) => item),
    })
    message.success('首页导航已保存')
    fetchAll()
  } finally {
    savingNav.value = false
  }
}
</script>

<style lang="less" scoped>
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
}
.detail-section {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 600;
}
.mt-12 {
  margin-top: 12px;
}
</style>

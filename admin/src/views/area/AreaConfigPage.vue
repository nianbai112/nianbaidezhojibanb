<template>
  <div class="page-container">
    <div class="page-card area-config">
      <div class="page-header">
        <div>
          <div class="page-title">{{ pageTitle }}</div>
          <div class="page-desc">{{ pageDesc }}</div>
        </div>
        <a-space>
          <a-select
            v-model:value="regionId"
            show-search
            option-filter-prop="label"
            placeholder="选择区域"
            style="width: 240px"
            :options="regionOptions"
            @change="loadRegionConfig"
          />
          <a-button v-if="mode === 'home'" type="primary" :disabled="!regionId" @click="openDecoration">
            进入首页装修
          </a-button>
          <a-button v-else-if="isListMode" type="primary" :disabled="!regionId" @click="openListModal">
            + 添加{{ pageTitle.replace('管理', '') }}
          </a-button>
          <a-button v-else type="primary" :loading="saving" :disabled="!regionId" @click="onSave">
            保存配置
          </a-button>
        </a-space>
      </div>

      <a-alert
        v-if="!regionId"
        type="info"
        show-icon
        message="请先选择区域"
        description="区域级配置会按区域分别保存，不会影响其他区域。"
      />

      <template v-else>
        <!-- TabBar -->
        <a-form v-if="mode === 'tabbar'" :label-col="{ span: 4 }" :wrapper-col="{ span: 16 }">
          <a-form-item label="启用区域 TabBar">
            <a-switch v-model:checked="tabbar.enabled" />
          </a-form-item>
          <a-form-item label="TabBar 项">
            <a-table :columns="tabbarColumns" :data-source="tabbar.items" :pagination="false" row-key="key" size="small">
              <template #bodyCell="{ column, record, index }">
                <template v-if="column.dataIndex === 'name'">
                  <a-input v-model:value="record.name" placeholder="名称" />
                </template>
                <template v-if="column.dataIndex === 'path'">
                  <a-input v-model:value="record.path" placeholder="/pages/index/index" />
                </template>
                <template v-if="column.dataIndex === 'icon'">
                  <a-input v-model:value="record.icon" placeholder="未选中图标 URL" />
                </template>
                <template v-if="column.dataIndex === 'activeIcon'">
                  <a-input v-model:value="record.activeIcon" placeholder="选中图标 URL" />
                </template>
                <template v-if="column.dataIndex === 'action'">
                  <a @click="tabbar.items.splice(index, 1)" style="color:#ef4444">删除</a>
                </template>
              </template>
            </a-table>
            <a-button class="mt-12" @click="addTabbarItem">添加 TabBar 项</a-button>
          </a-form-item>
        </a-form>

        <!-- 首页装修入口 -->
        <a-form v-else-if="mode === 'home'" :label-col="{ span: 4 }" :wrapper-col="{ span: 16 }">
          <a-form-item label="首页内容">
            <a-space direction="vertical">
              <span>轮播图、公告、首页导航已经接入真实接口，请进入首页装修维护。</span>
              <a-button type="primary" @click="openDecoration">打开首页装修</a-button>
            </a-space>
          </a-form-item>
        </a-form>

        <!-- 列表模式: customPages / richText -->
        <div v-else-if="isListMode">
          <a-table :columns="listColumns" :data-source="listData" row-key="id" size="middle" :pagination="false">
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'content'">
                <span style="color:#9ca3af">{{ String(record.content || '').slice(0, 60) }}...</span>
              </template>
              <template v-if="column.dataIndex === 'isShow'">
                <a-tag :color="record.isShow ? 'green' : 'default'">{{ record.isShow ? '显示' : '隐藏' }}</a-tag>
              </template>
              <template v-if="column.dataIndex === 'action'">
                <a-space>
                  <a @click="editListItem(record)">编辑</a>
                  <a-popconfirm title="确定删除?" @confirm="deleteListItem(record.id)">
                    <a style="color:#ef4444">删除</a>
                  </a-popconfirm>
                </a-space>
              </template>
            </template>
          </a-table>
          <a-empty v-if="listData.length === 0" description="暂无数据，请点击右上角添加" />
        </div>

        <!-- 通用表单模式 -->
        <a-form v-else :label-col="{ span: 4 }" :wrapper-col="{ span: 16 }">
          <a-form-item v-for="field in fields" :key="field.key" :label="field.label">
            <a-switch v-if="field.type === 'switch'" v-model:checked="settings[field.key]" />
            <a-input-number
              v-else-if="field.type === 'number'"
              v-model:value="settings[field.key]"
              :min="field.min ?? 0"
              :max="field.max"
              style="width: 220px"
            />
            <a-textarea
              v-else-if="field.type === 'textarea'"
              v-model:value="settings[field.key]"
              :rows="4"
              :placeholder="field.placeholder"
            />
            <a-select
              v-else-if="field.type === 'select'"
              v-model:value="settings[field.key]"
              :options="field.options"
              style="width: 260px"
            />
            <a-input v-else v-model:value="settings[field.key]" :placeholder="field.placeholder" />
            <div v-if="field.hint" class="form-hint">{{ field.hint }}</div>
          </a-form-item>
        </a-form>
      </template>
    </div>

    <!-- 列表项添加/编辑 Modal -->
    <a-modal v-model:open="listModalVisible" :title="listModalTitle" @ok="saveListItem" :confirm-loading="listSaving">
      <a-form :model="listForm" :label-col="{ span: 4 }" :wrapper-col="{ span: 18 }">
        <a-form-item label="标题" required>
          <a-input v-model:value="listForm.title" />
        </a-form-item>
        <a-form-item label="内容" required>
          <a-textarea v-model:value="listForm.content" :rows="6" />
        </a-form-item>
        <a-form-item v-if="mode === 'customPages'" label="显示范围">
          <a-select v-model:value="listForm.displayScope" :options="[
            { label: '全部', value: 'all' },
            { label: '首页', value: 'home' },
            { label: '我的', value: 'mine' },
          ]" />
        </a-form-item>
        <a-form-item v-if="mode === 'richText'" label="类型">
          <a-select v-model:value="listForm.type" :options="[
            { label: '文章', value: 'article' },
            { label: '公告', value: 'notice' },
            { label: '帮助', value: 'help' },
          ]" />
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model:value="listForm.sortOrder" :min="0" style="width: 120px" />
        </a-form-item>
        <a-form-item label="显示">
          <a-switch v-model:checked="listForm.isShow" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { areaApi } from '@/api/area'
import type { Area } from '@/types/area'

type Field = {
  key: string
  label: string
  type?: 'input' | 'textarea' | 'switch' | 'number' | 'select'
  placeholder?: string
  hint?: string
  min?: number
  max?: number
  options?: { label: string; value: string | number }[]
}

const route = useRoute()
const router = useRouter()
const mode = computed(() => String(route.meta.configKind || 'features'))
const saving = ref(false)
const regionId = ref<string>()
const regions = ref<Area[]>([])
const settings = reactive<Record<string, any>>({})
const tabbar = reactive<{ enabled: boolean; items: any[] }>({ enabled: true, items: [] })

// 列表模式状态
const listData = ref<any[]>([])
const listModalVisible = ref(false)
const listSaving = ref(false)
const listForm = reactive<any>({ id: '', title: '', content: '', displayScope: 'all', type: 'article', sortOrder: 0, isShow: true })
const isEditing = ref(false)

const isListMode = computed(() => mode.value === 'customPages' || mode.value === 'richText')

const pageMap: Record<string, { title: string; desc: string; fields: Field[] }> = {
  share: {
    title: '分享设置',
    desc: '控制该区域的小程序分享标题、图片、奖励和落地页。',
    fields: [
      { key: 'enabled', label: '启用分享', type: 'switch' },
      { key: 'title', label: '默认分享标题', placeholder: '如：发现附近校园生活' },
      { key: 'image', label: '默认分享图片', placeholder: '图片 URL' },
      { key: 'rewardPoints', label: '分享奖励积分', type: 'number', max: 9999 },
      { key: 'dailyLimit', label: '每日奖励上限', type: 'number', max: 999 },
    ],
  },
  features: {
    title: '功能配置',
    desc: '控制该区域首页、小程序入口和运营能力是否开放。',
    fields: [
      { key: 'postEnabled', label: '发帖', type: 'switch' },
      { key: 'shopEnabled', label: '商城', type: 'switch' },
      { key: 'deliveryEnabled', label: '跑腿配送', type: 'switch' },
      { key: 'secondHandEnabled', label: '二手市场', type: 'switch' },
      { key: 'robotEnabled', label: '机器人互动', type: 'switch' },
    ],
  },
  robots: {
    title: '机器人配置',
    desc: '控制该区域机器人发帖、评论、热场和内容风格。',
    fields: [
      { key: 'enabled', label: '启用机器人', type: 'switch' },
      { key: 'postPerDay', label: '每日发帖数', type: 'number', max: 200 },
      { key: 'commentPerDay', label: '每日评论数', type: 'number', max: 1000 },
      { key: 'style', label: '内容风格', type: 'select', options: [
        { label: '校园生活', value: 'campus' },
        { label: '真实闲聊', value: 'chat' },
        { label: '活动运营', value: 'campaign' },
      ] },
    ],
  },
  signin: {
    title: '签到与积分配置',
    desc: '控制该区域签到奖励、连续签到和积分规则。',
    fields: [
      { key: 'enabled', label: '启用签到', type: 'switch' },
      { key: 'basePoints', label: '每日基础积分', type: 'number', max: 999 },
      { key: 'streakBonus', label: '连续签到奖励', type: 'number', max: 999 },
      { key: 'maxDailyPoints', label: '每日积分上限', type: 'number', max: 9999 },
    ],
  },
  avatars: {
    title: '头像库管理',
    desc: '维护该区域默认头像库，可填多行图片 URL。',
    fields: [
      { key: 'enabled', label: '启用头像库', type: 'switch' },
      { key: 'urls', label: '头像 URL', type: 'textarea', hint: '每行一个图片 URL' },
    ],
  },
  emojis: {
    title: '表情包管理',
    desc: '维护该区域聊天、评论可用的表情包资源。',
    fields: [
      { key: 'enabled', label: '启用表情包', type: 'switch' },
      { key: 'urls', label: '表情包 URL', type: 'textarea', hint: '每行一个图片 URL' },
    ],
  },
}

const pageTitle = computed(() => {
  if (mode.value === 'tabbar') return 'Tabbar管理'
  if (mode.value === 'home') return '首页内容配置'
  if (mode.value === 'customPages') return '自定义页面管理'
  if (mode.value === 'richText') return '区域富文本'
  return pageMap[mode.value]?.title || '区域配置'
})
const pageDesc = computed(() => {
  if (mode.value === 'tabbar') return '维护该区域的小程序底部导航。'
  if (mode.value === 'home') return '维护轮播图、公告、导航等首页内容。'
  if (mode.value === 'customPages') return '维护小程序里可跳转的区域自定义页面。'
  if (mode.value === 'richText') return '维护该区域的公告说明、用户协议补充和运营介绍。'
  return pageMap[mode.value]?.desc || ''
})
const fields = computed(() => pageMap[mode.value]?.fields || [])
const regionOptions = computed(() => regions.value.map((item) => ({ label: item.name, value: String(item.id) })))
const listModalTitle = computed(() => isEditing.value ? '编辑' + pageTitle.value.replace('管理', '') : '添加' + pageTitle.value.replace('管理', ''))

const tabbarColumns = [
  { title: '名称', dataIndex: 'name', width: 140 },
  { title: '路径', dataIndex: 'path', width: 220 },
  { title: '图标', dataIndex: 'icon' },
  { title: '选中图标', dataIndex: 'activeIcon' },
  { title: '操作', dataIndex: 'action', width: 80 },
]

const listColumns = computed(() => {
  const base = [
    { title: '标题', dataIndex: 'title', width: 200 },
    { title: '内容', dataIndex: 'content' },
    { title: '排序', dataIndex: 'sortOrder', width: 80 },
    { title: '状态', dataIndex: 'isShow', width: 80 },
    { title: '操作', dataIndex: 'action', width: 120 },
  ]
  return base
})

watch(mode, () => {
  if (regionId.value) loadRegionConfig()
})

onMounted(async () => {
  const res = await areaApi.getList({ page: 1, pageSize: 200 })
  regions.value = res.data.data.list
  if (regions.value[0]) {
    regionId.value = String(regions.value[0].id)
    await loadRegionConfig()
  }
})

async function loadRegionConfig() {
  if (!regionId.value) return
  Object.keys(settings).forEach((key) => delete settings[key])
  tabbar.enabled = true
  tabbar.items = []
  listData.value = []

  if (mode.value === 'tabbar') {
    const res = await areaApi.getTabBar(regionId.value as any)
    const responseData = (res.data as any)?.data
    const config = responseData?.data?.config || responseData?.config || {}
    tabbar.enabled = config.enabled ?? true
    tabbar.items = Array.isArray(config.items) ? config.items : defaultTabbarItems()
    return
  }

  if (mode.value === 'customPages') {
    const res = await areaApi.getCustomPages(regionId.value as any)
    listData.value = (res.data as any)?.data?.data || (res.data as any)?.data || []
    return
  }

  if (mode.value === 'richText') {
    const res = await areaApi.getRichTexts(regionId.value as any)
    listData.value = (res.data as any)?.data?.data || (res.data as any)?.data || []
    return
  }

  const res = await areaApi.getDetail(regionId.value as any)
  const detail = ((res.data as any).data || {}) as any
  Object.assign(settings, detail.settings?.[mode.value] || defaultSettings(mode.value))
}

async function onSave() {
  if (!regionId.value) return
  saving.value = true
  try {
    if (mode.value === 'tabbar') {
      await areaApi.saveTabBar({ regionId: regionId.value as any, config: { enabled: tabbar.enabled, items: tabbar.items } } as any)
    } else {
      const detailRes = await areaApi.getDetail(regionId.value as any)
      const detail = ((detailRes.data as any).data || {}) as any
      await areaApi.update(regionId.value as any, {
        settings: {
          ...(detail.settings || {}),
          [mode.value]: { ...settings },
        },
      } as any)
    }
    message.success('保存成功')
  } finally {
    saving.value = false
  }
}

function openDecoration() {
  if (regionId.value) router.push(`/area/decoration/${regionId.value}`)
}

function addTabbarItem() {
  tabbar.items.push({ key: Date.now(), name: '', path: '', icon: '', activeIcon: '' })
}

function defaultTabbarItems() {
  return [
    { key: 'home', name: '首页', path: '/pages/index/index', icon: '', activeIcon: '' },
    { key: 'post', name: '发布', path: '/pages/post/index', icon: '', activeIcon: '' },
    { key: 'mine', name: '我的', path: '/pages/mine/index', icon: '', activeIcon: '' },
  ]
}

function defaultSettings(key: string) {
  const defaults: Record<string, Record<string, any>> = {
    share: { enabled: true, title: '', image: '', rewardPoints: 10, dailyLimit: 100 },
    features: { postEnabled: true, shopEnabled: true, deliveryEnabled: true, secondHandEnabled: true, robotEnabled: false },
    robots: { enabled: false, postPerDay: 5, commentPerDay: 20, style: 'campus' },
    signin: { enabled: true, basePoints: 5, streakBonus: 2, maxDailyPoints: 100 },
    avatars: { enabled: true, urls: '' },
    emojis: { enabled: true, urls: '' },
  }
  return defaults[key] || {}
}

// 列表模式方法
function openListModal() {
  isEditing.value = false
  listForm.id = ''
  listForm.title = ''
  listForm.content = ''
  listForm.displayScope = 'all'
  listForm.type = 'article'
  listForm.sortOrder = 0
  listForm.isShow = true
  listModalVisible.value = true
}

function editListItem(record: any) {
  isEditing.value = true
  Object.assign(listForm, record)
  listModalVisible.value = true
}

async function saveListItem() {
  if (!regionId.value || !listForm.title.trim() || !listForm.content.trim()) {
    message.warning('请填写标题和内容')
    return
  }
  listSaving.value = true
  try {
    const payload = {
      regionId: regionId.value,
      title: listForm.title,
      content: listForm.content,
      sortOrder: listForm.sortOrder,
      isShow: listForm.isShow,
      ...(mode.value === 'customPages' ? { displayScope: listForm.displayScope } : { type: listForm.type }),
    }
    if (isEditing.value && listForm.id) {
      if (mode.value === 'customPages') {
        await areaApi.updateCustomPage(Number(listForm.id), payload)
      } else {
        await areaApi.updateRichText(Number(listForm.id), payload)
      }
    } else {
      if (mode.value === 'customPages') {
        await areaApi.saveCustomPage(payload)
      } else {
        await areaApi.saveRichText(payload)
      }
    }
    message.success('保存成功')
    listModalVisible.value = false
    await loadRegionConfig()
  } catch (err: any) {
    message.error(err?.message || '保存失败')
  } finally {
    listSaving.value = false
  }
}

async function deleteListItem(id: string) {
  try {
    if (mode.value === 'customPages') {
      await areaApi.deleteCustomPage(Number(id))
    } else {
      await areaApi.deleteRichText(Number(id))
    }
    message.success('删除成功')
    await loadRegionConfig()
  } catch (err: any) {
    message.error(err?.message || '删除失败')
  }
}
</script>

<style lang="less" scoped>
.area-config {
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .page-title {
    font-size: 18px;
    font-weight: 600;
    color: #111827;
  }
  .page-desc {
    margin-top: 4px;
    color: #6b7280;
    font-size: 13px;
  }
  .form-hint {
    margin-top: 6px;
    font-size: 12px;
    color: #9ca3af;
  }
  .mt-12 {
    margin-top: 12px;
  }
}
</style>

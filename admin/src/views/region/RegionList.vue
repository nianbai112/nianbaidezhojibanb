<template>
  <div class="page-shell region-list-page">
    <GlassPageHeader title="区域列表" subtitle="管理每个学校/区域的基础档案、上线状态、装修进度和运营入口">
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="loadRegions">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreateDrawer">新建区域</el-button>
      </template>
    </GlassPageHeader>

    <section class="region-overview-grid">
      <div class="overview-card">
        <span>区域总数</span>
        <b>{{ regions.length }}</b>
        <small>当前真实区域</small>
      </div>
      <div class="overview-card">
        <span>运营中</span>
        <b>{{ openCount }}</b>
        <small>可被小程序选择</small>
      </div>
      <div class="overview-card">
        <span>热门区域</span>
        <b>{{ hotCount }}</b>
        <small>首页/区域选择优先展示</small>
      </div>
      <div class="overview-card">
        <span>待完善</span>
        <b>{{ incompleteCount }}</b>
        <small>配置完成度低于 80%</small>
      </div>
    </section>

    <section class="region-toolbar glass-card">
      <div class="toolbar-left">
        <el-input v-model="keyword" clearable :prefix-icon="Search" placeholder="搜索区域名称、编码、地址" />
        <el-select v-model="statusFilter" placeholder="状态" style="width: 132px">
          <el-option label="全部状态" value="all" />
          <el-option label="运营中" value="open" />
          <el-option label="已停用" value="closed" />
        </el-select>
        <el-select v-model="typeFilter" placeholder="类型" style="width: 132px">
          <el-option label="全部类型" value="all" />
          <el-option label="校园" value="campus" />
          <el-option label="社区" value="community" />
          <el-option label="其他" value="other" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <span>共 {{ filteredRegions.length }} 个结果</span>
      </div>
    </section>

    <section v-loading="loading" class="region-card-grid">
      <article v-for="region in filteredRegions" :key="region.id" class="region-card glass-card">
        <div class="region-cover" :style="region.coverImage ? { backgroundImage: `url(${region.coverImage})` } : {}">
          <el-tag :type="region.isOpen !== false ? 'success' : 'info'" effect="light">
            {{ region.isOpen !== false ? '正常运营' : '已停用' }}
          </el-tag>
          <el-tag v-if="region.isHot" type="warning" effect="light">热门</el-tag>
          <el-tag :type="isRegionSwitchOpen(region) ? 'success' : 'danger'" effect="light">
            {{ isRegionSwitchOpen(region) ? '切换开放' : '切换关闭' }}
          </el-tag>
        </div>

        <div class="region-card-body">
          <div class="region-identity">
            <el-avatar :size="54" :src="region.logo || region.coverImage">
              {{ region.name?.slice(0, 1) || '区' }}
            </el-avatar>
            <div>
              <h3>{{ region.name }}</h3>
              <p>{{ region.description || '暂无区域简介' }}</p>
            </div>
          </div>

          <div class="completion-block">
            <div class="completion-top">
              <span>上线配置完成度</span>
              <b>{{ getCompletion(region) }}%</b>
            </div>
            <el-progress :percentage="getCompletion(region)" :stroke-width="8" :color="completionColor(getCompletion(region))" />
          </div>

          <div class="region-facts">
            <div>
              <span>区域类型</span>
              <b>{{ regionTypeText(region.regionType) }}</b>
            </div>
            <div>
              <span>区域余额</span>
              <b>¥{{ money(region.balance) }}</b>
            </div>
            <div>
              <span>地图定位</span>
              <b :class="{ muted: !hasLocation(region) }">{{ hasLocation(region) ? '已配置' : '未配置' }}</b>
            </div>
            <div>
              <span>小程序负责人</span>
              <b :class="{ muted: !getRegionManagerName(region) }">{{ getRegionManagerName(region) || '未配置' }}</b>
            </div>
            <div>
              <span>首页广告</span>
              <b :class="{ muted: !hasCarousel(region) }">{{ hasCarousel(region) ? `${getCarousel(region).length} 张` : '未上传' }}</b>
            </div>
          </div>

          <div class="region-flags">
            <el-tag size="small" :type="region.onlyStudentAuthUsers ? 'warning' : 'info'" effect="plain">
              {{ region.onlyStudentAuthUsers ? '仅认证可进' : '开放访问' }}
            </el-tag>
            <el-tag size="small" :type="region.privateMessageEnabled !== false ? 'success' : 'info'" effect="plain">
              {{ region.privateMessageEnabled !== false ? '私信开启' : '私信关闭' }}
            </el-tag>
            <el-tag size="small" :type="region.groupChatEnabled ? 'success' : 'info'" effect="plain">
              {{ region.groupChatEnabled ? '群聊开启' : '群聊关闭' }}
            </el-tag>
            <el-tag size="small" :type="isRegionSwitchOpen(region) ? 'success' : 'danger'" effect="plain">
              {{ isRegionSwitchOpen(region) ? '用户可切换' : '用户不可切换' }}
            </el-tag>
          </div>
        </div>

        <div class="region-card-actions">
          <div class="region-switch-toggle" :class="{ off: !isRegionSwitchOpen(region) }">
            <span>{{ isRegionSwitchOpen(region) ? '允许用户切换' : '禁止用户切换' }}</span>
            <el-switch
              v-model="region.regionSwitchSupported"
              inline-prompt
              active-text="开"
              inactive-text="关"
              :loading="region.regionSwitchSaving"
              @change="value => saveRegionSwitch(region, value)"
            />
          </div>
          <el-button text :icon="EditPen" @click="openEditBasic(region)">编辑档案</el-button>
          <el-button text :icon="MagicStick" @click="goRegionModule(region, '/region/app-pages')">UI 编辑器</el-button>
          <el-button text :icon="School" @click="goRegionModule(region, '/user/schools')">学校库</el-button>
        </div>
      </article>
    </section>

    <EmptyState v-if="!loading && !filteredRegions.length" class="empty-card glass-card" description="没有符合条件的区域">
      <el-button type="primary" @click="openCreateDrawer">新建第一个区域</el-button>
    </EmptyState>

    <el-drawer v-model="createVisible" class="region-create-drawer" :title="drawerTitle" size="min(980px, calc(100vw - 32px))" :close-on-click-modal="false">
      <div class="create-layout">
        <el-steps :active="createStep" direction="vertical" class="create-steps">
          <el-step title="基础档案" description="名称、类型、状态" />
          <el-step title="视觉素材" description="Logo、封面、横幅" />
          <el-step title="位置范围" description="地图定位、服务半径" />
          <el-step title="模板初始化" description="Tabs、导航、底部栏" />
        </el-steps>

        <div class="create-panel">
          <template v-if="createStep === 0">
            <div class="panel-title">基础档案</div>
            <div class="form-grid two">
              <el-form-item label="区域名称" required>
                <el-input v-model="createForm.name" placeholder="如：云阳双江中学" />
              </el-form-item>
              <el-form-item label="区域编码">
                <el-input v-model="createForm.code" placeholder="留空自动生成" />
              </el-form-item>
              <el-form-item label="区域类型">
                <el-select v-model="createForm.regionType" style="width:100%">
                  <el-option label="校园" value="campus" />
                  <el-option label="社区" value="community" />
                  <el-option label="其他" value="other" />
                </el-select>
              </el-form-item>
              <el-form-item label="运营状态">
                <el-switch v-model="createForm.isOpen" active-text="正常" inactive-text="禁用" />
              </el-form-item>
              <el-form-item label="是否热门">
                <el-switch v-model="createForm.isHot" active-text="是" inactive-text="否" />
              </el-form-item>
              <el-form-item label="允许用户切换到此区域">
                <el-switch v-model="createForm.regionSwitchSupported" inline-prompt active-text="允许" inactive-text="禁止" />
                <div class="switch-help">关闭后，小程序用户不能自行切换到该区域。</div>
              </el-form-item>
              <el-form-item label="区域负责人">
                <el-input v-model="createForm.managerName" placeholder="可选，用于运营备注" />
              </el-form-item>
              <el-form-item label="联系电话">
                <el-input v-model="createForm.contactPhone" placeholder="可选" />
              </el-form-item>
              <el-form-item label="负责账号">
                <el-select v-model="createForm.managerAccountId" clearable filterable placeholder="选择可登录后台的账号" style="width:100%">
                  <el-option
                    v-for="account in adminAccounts"
                    :key="account.id"
                    :label="`${account.realName || account.username}（${account.username}）`"
                    :value="account.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="小程序区域负责人">
                <el-select v-model="createForm.managerUserId" clearable filterable placeholder="选择小程序用户" style="width:100%">
                  <el-option
                    v-for="user in miniUsers"
                    :key="user.id"
                    :label="userOptionLabel(user)"
                    :value="user.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="区域描述" class="span-2">
                <el-input v-model="createForm.description" type="textarea" :rows="4" placeholder="展示在小程序区域详情页，用一句话讲清楚这个区域" />
              </el-form-item>
            </div>
          </template>

          <template v-else-if="createStep === 1">
            <div class="panel-title">视觉素材</div>
            <div class="asset-grid">
              <div>
                <div class="asset-label">区域 Logo</div>
                <ImageUploadBox v-model="createForm.logo" scene="region-logo" shape="square" placeholder="上传 Logo" tip="建议 200x200px" :max-size="2" />
              </div>
              <div>
                <div class="asset-label">区域封面</div>
                <ImageUploadBox v-model="createForm.coverImage" scene="region-cover" shape="wide" placeholder="上传封面" tip="建议 750x350px" :max-size="5" />
              </div>
              <div class="span-2">
                <div class="asset-label">首页横幅广告图</div>
                <ImageUploadBox v-model="createForm.firstBanner" scene="region-carousel" shape="wide" placeholder="上传第一张横幅广告" tip="这是首页广告主要来源，可创建后继续添加更多横幅" :max-size="5" />
              </div>
            </div>
          </template>

          <template v-else-if="createStep === 2">
            <div class="panel-title">地图与服务范围</div>
            <div class="map-summary">
              <div>
                <span>当前地址</span>
                <b>{{ createForm.address || '未选择地图位置' }}</b>
              </div>
              <el-button :icon="MapLocation" @click="mapVisible = true">从高德地图选择</el-button>
            </div>
            <div class="location-form-grid">
              <el-form-item label="经度 longitude">
                <el-input-number v-model="createForm.longitude" :precision="6" controls-position="right" style="width:100%" />
              </el-form-item>
              <el-form-item label="纬度 latitude">
                <el-input-number v-model="createForm.latitude" :precision="6" controls-position="right" style="width:100%" />
              </el-form-item>
              <el-form-item label="服务半径（米）">
                <el-input-number v-model="createForm.serviceRadius" :min="0" :step="500" controls-position="right" style="width:100%" />
              </el-form-item>
              <el-form-item label="距离限制（米）">
                <el-input-number v-model="createForm.distanceLimit" :min="0" :step="500" controls-position="right" style="width:100%" />
              </el-form-item>
              <el-form-item label="详细地址" class="location-address-field">
                <el-input v-model="createForm.address" placeholder="可手动填写，地图选择后自动带入" />
              </el-form-item>
            </div>
          </template>

          <template v-else>
            <div class="panel-title">模板初始化</div>
            <div class="template-grid">
              <button
                v-for="tpl in templates"
                :key="tpl.key"
                type="button"
                class="template-card"
                :class="{ active: createForm.templateKey === tpl.key }"
                @click="createForm.templateKey = tpl.key"
              >
                <b>{{ tpl.title }}</b>
                <span>{{ tpl.desc }}</span>
              </button>
            </div>
            <div v-if="createForm.templateKey === 'copy'" class="copy-template-row">
              <el-select v-model="createForm.copyRegionId" filterable clearable placeholder="选择要复制配置的区域">
                <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
              </el-select>
            </div>
            <div class="init-checks">
              <el-checkbox v-model="createForm.initTabs">初始化首页 Tabs</el-checkbox>
              <el-checkbox v-model="createForm.initHomeNav">初始化首页导航/金刚区</el-checkbox>
              <el-checkbox v-model="createForm.initTabbar">初始化底部导航 Tabbar</el-checkbox>
              <el-checkbox v-model="createForm.goDecorationAfterCreate">创建后直接进入页面装修</el-checkbox>
            </div>
          </template>
        </div>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="createVisible = false">取消</el-button>
          <div>
            <el-button :disabled="createStep === 0" @click="createStep--">上一步</el-button>
            <el-button v-if="createStep < 3" type="primary" @click="nextCreateStep">下一步</el-button>
            <el-button v-else type="primary" :loading="creating" @click="submitCreate">创建区域</el-button>
          </div>
        </div>
      </template>
    </el-drawer>

    <AmapLocationPicker
      v-model:visible="mapVisible"
      :default-center="mapDefaultCenter"
      :service-radius="createForm.serviceRadius"
      @confirm="onMapConfirm"
      @cancel="mapVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  EditPen,
  MagicStick,
  MapLocation,
  Plus,
  Refresh,
  School,
  Search
} from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import AmapLocationPicker from '@/components/common/AmapLocationPicker.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { createRegion, fetchRegionDetail, fetchRegions, saveRegionTabbar, updateRegion } from '@/api/admin'
import { request } from '@/api/request'

const router = useRouter()
const loading = ref(false)
const creating = ref(false)
const regions = ref<any[]>([])
const adminAccounts = ref<any[]>([])
const miniUsers = ref<any[]>([])
const keyword = ref('')
const statusFilter = ref('all')
const typeFilter = ref('all')
const createVisible = ref(false)
const createStep = ref(0)
const mapVisible = ref(false)

const defaultTabs = [
  { id: '0', name: '笔记', type: 'note', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesB/post/post', appId: '', query: '', remark: '', sortOrder: 0 },
  { id: '1', name: '外卖', type: 'takeout', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesA/merchant/merchant', appId: '', query: '', remark: '', sortOrder: 1 },
  { id: '2', name: '二手', type: 'secondhand', enabled: true, icon: '', image: '', linkType: 'filter', path: '', appId: '', query: '', remark: '', sortOrder: 2 },
  { id: '3', name: '活动', type: 'activity', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesA/selection/list/list?tabIndex=0', appId: '', query: '', remark: '', sortOrder: 3 }
]

const defaultNav = [
  { id: 'note', name: '笔记', subtitle: '', icon: '', linkType: 'internal', path: 'pagesB/post/post', query: '', remark: '', enabled: true, sortOrder: 0 },
  { id: 'takeout', name: '外卖', subtitle: '', icon: '', linkType: 'internal', path: 'pagesA/merchant/merchant', query: '', remark: '', enabled: true, sortOrder: 1 },
  { id: 'secondhand', name: '二手', subtitle: '', icon: '', linkType: 'internal', path: 'pages/tabbar/index/index?tab=secondhand', query: '', remark: '', enabled: true, sortOrder: 2 },
  { id: 'activity', name: '活动', subtitle: '', icon: '', linkType: 'internal', path: 'pagesA/selection/list/list?tabIndex=0', query: '', remark: '', enabled: true, sortOrder: 3 }
]

const defaultTabbarConfig = {
  color: '#8A8A8A',
  selectedColor: '#1677ff',
  backgroundColor: '#ffffff',
  borderStyle: 'black',
  list: [
    { id: 'home', name: '首页', pagePath: 'pages/tabbar/index/index', action: '', iconPath: '/static/tabbar/home.png', selectedIconPath: '/static/tabbar/home-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 0, navType: 'bottom' },
    { id: 'circle', name: '圈子', pagePath: 'pages/tabbar/containers/containers', action: '', iconPath: '/static/tabbar/circle.png', selectedIconPath: '/static/tabbar/circle-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 1, navType: 'bottom' },
    { id: 'publish', name: '发布', pagePath: '', action: 'publish', iconPath: '/static/tabbar/publish.png', selectedIconPath: '/static/tabbar/publish-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 2, navType: 'bottom' },
    { id: 'message', name: '消息', pagePath: 'pages/tabbar/news/news', action: '', iconPath: '/static/tabbar/message.png', selectedIconPath: '/static/tabbar/message-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 3, navType: 'bottom' },
    { id: 'mine', name: '我的', pagePath: 'pages/tabbar/auth/PersonalHomepage', action: '', iconPath: '/static/tabbar/mine.png', selectedIconPath: '/static/tabbar/mine-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 4, navType: 'bottom' }
  ]
}

const templates = [
  { key: 'campus', title: '校园默认模板', desc: '笔记、外卖、二手、活动，适合大部分学校' },
  { key: 'takeout', title: '外卖强运营模板', desc: '突出商家、外卖和优惠，适合开城初期拉交易' },
  { key: 'content', title: '内容社区模板', desc: '突出笔记、圈子、活动，适合先做氛围' },
  { key: 'blank', title: '空白模板', desc: '只创建区域，不初始化首页配置' },
  { key: 'copy', title: '复制已有区域', desc: '复用另一个学校的装修和导航配置' }
]

const createForm = reactive<any>({
  name: '',
  code: '',
  regionType: 'campus',
  isOpen: true,
  isHot: false,
  regionSwitchSupported: true,
  managerName: '',
  contactPhone: '',
  managerAccountId: '',
  managerUserId: '',
  description: '',
  logo: '',
  coverImage: '',
  firstBanner: '',
  address: '',
  longitude: 0,
  latitude: 0,
  serviceRadius: 5000,
  distanceLimit: 0,
  templateKey: 'campus',
  copyRegionId: '',
  initTabs: true,
  initHomeNav: true,
  initTabbar: true,
  goDecorationAfterCreate: true
})

const drawerTitle = computed(() => createStep.value === 3 ? '新建区域：初始化模板' : '新建区域')
const openCount = computed(() => regions.value.filter(r => r.isOpen !== false).length)
const hotCount = computed(() => regions.value.filter(r => r.isHot).length)
const incompleteCount = computed(() => regions.value.filter(r => getCompletion(r) < 80).length)
const mapDefaultCenter = computed(() => {
  if (createForm.longitude && createForm.latitude) return [createForm.longitude, createForm.latitude] as [number, number]
  return undefined
})

const filteredRegions = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return regions.value.filter(region => {
    const hitKeyword = !kw || [region.name, region.code, region.address, region.description].some(v => String(v || '').toLowerCase().includes(kw))
    const hitStatus = statusFilter.value === 'all' || (statusFilter.value === 'open' ? region.isOpen !== false : region.isOpen === false)
    const hitType = typeFilter.value === 'all' || String(region.regionType || 'other') === typeFilter.value
    return hitKeyword && hitStatus && hitType
  })
})

onMounted(() => {
  loadRegions()
  loadAdminAccounts()
  loadMiniUsers()
})

async function loadRegions() {
  loading.value = true
  try {
    regions.value = await fetchRegions()
  } catch (error: any) {
    ElMessage.error(error?.message || '加载区域列表失败')
  } finally {
    loading.value = false
  }
}

async function loadAdminAccounts() {
  try {
    const res: any = await request.get('/admin/admins', { params: { page: 1, pageSize: 200 } })
    adminAccounts.value = Array.isArray(res) ? res : res?.list || res?.data?.list || []
  } catch {
    adminAccounts.value = []
  }
}

async function loadMiniUsers() {
  try {
    const res: any = await request.get('/admin/users', { params: { page: 1, pageSize: 200, status: 'active', userType: 'normal' } })
    miniUsers.value = Array.isArray(res) ? res : res?.list || res?.data?.list || []
  } catch {
    miniUsers.value = []
  }
}

function userOptionLabel(user: any) {
  const name = user?.nickname || user?.realName || user?.phone || '未命名用户'
  const uid = user?.uid ? `UID ${user.uid}` : String(user?.id || '').slice(0, 8)
  return `${name}（${uid}）`
}

function openCreateDrawer() {
  Object.assign(createForm, {
    name: '',
    code: '',
    regionType: 'campus',
    isOpen: true,
    isHot: false,
    regionSwitchSupported: true,
    managerName: '',
    contactPhone: '',
    managerAccountId: '',
    managerUserId: '',
    description: '',
    logo: '',
    coverImage: '',
    firstBanner: '',
    address: '',
    longitude: 0,
    latitude: 0,
    serviceRadius: 5000,
    distanceLimit: 0,
    templateKey: 'campus',
    copyRegionId: '',
    initTabs: true,
    initHomeNav: true,
    initTabbar: true,
    goDecorationAfterCreate: true
  })
  createStep.value = 0
  createVisible.value = true
}

function nextCreateStep() {
  if (createStep.value === 0 && !createForm.name.trim()) {
    ElMessage.warning('请先填写区域名称')
    return
  }
  createStep.value += 1
}

async function submitCreate() {
  if (!createForm.name.trim()) {
    ElMessage.warning('请输入区域名称')
    return
  }
  creating.value = true
  try {
    const templatePayload = await buildTemplatePayload()
    const result: any = await createRegion({
      name: createForm.name.trim(),
      code: createForm.code || undefined,
      regionType: createForm.regionType,
      isOpen: createForm.isOpen,
      isHot: createForm.isHot,
      regionSwitchSupported: createForm.regionSwitchSupported,
      region_switch_supported: createForm.regionSwitchSupported,
      description: createForm.description,
      logo: createForm.logo,
      coverImage: createForm.coverImage,
      address: createForm.address,
      longitude: createForm.longitude || undefined,
      latitude: createForm.latitude || undefined,
      serviceRadius: createForm.serviceRadius,
      distanceLimit: createForm.distanceLimit,
      managerName: createForm.managerName,
      managerPhone: createForm.contactPhone,
      contactPhone: createForm.contactPhone,
      managerAccountId: createForm.managerAccountId || undefined,
      managerUserId: createForm.managerUserId || undefined,
      manager_user_id: createForm.managerUserId || undefined,
      settings: {
        operator: {
          managerName: createForm.managerName,
          contactPhone: createForm.contactPhone,
          managerAccountId: createForm.managerAccountId,
          managerUserId: createForm.managerUserId || undefined,
          manager_id: createForm.managerUserId || undefined
        },
        createTemplate: createForm.templateKey
      },
      ...templatePayload
    })
    const createdId = result?.id || result?.data?.id || result?.region?.id || result?.data?.region?.id
    if (createdId && createForm.initTabbar) {
      await saveRegionTabbar(createdId, JSON.parse(JSON.stringify(defaultTabbarConfig)))
    }
    ElMessage.success('区域创建成功，已初始化基础装修')
    createVisible.value = false
    await loadRegions()
    if (createdId && createForm.goDecorationAfterCreate) {
      goRegionModule({ id: createdId, name: createForm.name }, '/region/app-pages')
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '创建区域失败')
  } finally {
    creating.value = false
  }
}

async function buildTemplatePayload() {
  if (createForm.templateKey === 'blank') return {}
  if (createForm.templateKey === 'copy' && createForm.copyRegionId) {
    const detail: any = await fetchRegionDetail(createForm.copyRegionId)
    const source = detail?.data || detail || {}
    return {
      regionTabs: createForm.initTabs ? source.regionTabs || source.region_tabs || [] : undefined,
      homeNavLayoutConfig: createForm.initHomeNav ? source.homeNavLayoutConfig || source.home_nav_layout_config || [] : undefined,
      homeNavLayout: source.homeNavLayout || source.home_nav_layout || 1,
      carouselImages: createForm.firstBanner
        ? [{ image: createForm.firstBanner, title: createForm.name, linkType: 'none', enabled: true, sortOrder: 0 }]
        : source.carouselImages || source.carousel_images || []
    }
  }

  const tabs = createForm.templateKey === 'takeout'
    ? [
        { ...defaultTabs[1], id: '0', sortOrder: 0 },
        { ...defaultTabs[0], id: '1', sortOrder: 1 },
        { ...defaultTabs[2], id: '2', sortOrder: 2 },
        { name: '商家', type: 'merchant', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesA/merchant/merchant', appId: '', query: '', remark: '', sortOrder: 3 }
      ]
    : createForm.templateKey === 'content'
      ? [
          { ...defaultTabs[0], id: '0', sortOrder: 0 },
          { name: '圈子', type: 'circle', enabled: true, icon: '', image: '', linkType: 'internal', path: 'pages/tabbar/containers/containers', appId: '', query: '', remark: '', sortOrder: 1 },
          { ...defaultTabs[3], id: '2', sortOrder: 2 },
          { ...defaultTabs[2], id: '3', sortOrder: 3 }
        ]
      : defaultTabs

  const carouselImages = createForm.firstBanner
    ? [{ image: createForm.firstBanner, title: createForm.name, subtitle: createForm.description, linkType: 'none', path: '', query: '', remark: '创建区域时上传', enabled: true, sortOrder: 0 }]
    : []

  return {
    regionTabs: createForm.initTabs ? JSON.parse(JSON.stringify(tabs)) : undefined,
    homeNavLayoutConfig: createForm.initHomeNav ? JSON.parse(JSON.stringify(defaultNav)) : undefined,
    homeNavLayout: 1,
    carouselImages,
    showCarousel: true,
    showAnnouncement: true,
    showKingkong: true,
    homeFeatureStyle: 'default'
  }
}

function onMapConfirm(location: any) {
  createForm.longitude = Number(location.longitude || 0)
  createForm.latitude = Number(location.latitude || 0)
  createForm.address = location.address || location.poiName || ''
  mapVisible.value = false
}

function openEditBasic(region: any) {
  goRegionModule(region, '/region/config')
}

function toStrictBoolean(value: any, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  if (['false', '0', 'no', 'off'].includes(text)) return false
  if (['true', '1', 'yes', 'on'].includes(text)) return true
  return Boolean(value)
}

function isRegionSwitchOpen(region: any) {
  return toStrictBoolean(region?.regionSwitchSupported ?? region?.region_switch_supported, true)
}

async function saveRegionSwitch(region: any, value: any) {
  region.regionSwitchSaving = true
  try {
    const switchSupported = toStrictBoolean(value, true)
    await updateRegion(region.id, {
      regionSwitchSupported: switchSupported,
      region_switch_supported: switchSupported
    })
    region.regionSwitchSupported = switchSupported
    region.region_switch_supported = switchSupported
    ElMessage.success(switchSupported ? '已允许用户切换到该区域' : '已禁止用户切换到该区域')
  } catch (error: any) {
    ElMessage.error(error?.message || '保存区域切换状态失败')
    await loadRegions()
  } finally {
    region.regionSwitchSaving = false
  }
}

function goRegionModule(region: any, path: string) {
  localStorage.setItem('LM_SELECTED_REGION_ID', String(region.id))
  localStorage.setItem('selectedRegionId', String(region.id))
  localStorage.setItem('region', JSON.stringify(region))
  router.push({ path, query: { regionId: region.id } })
}

function hasLocation(region: any) {
  return Boolean(region.address && region.latitude && region.longitude)
}

function hasCarousel(region: any) {
  return getCarousel(region).some((item: any) => item?.image || item?.imageUrl || item?.url)
}

function getRegionManagerName(region: any) {
  return region?.managerNickname || region?.managerUser?.nickname || region?.managerName || ''
}

function getCarousel(region: any) {
  return Array.isArray(region.carouselImages)
    ? region.carouselImages
    : Array.isArray(region.carousel_images)
      ? region.carousel_images
      : []
}

function getCompletion(region: any) {
  const checks = [
    Boolean(region.name),
    Boolean(region.logo),
    Boolean(region.coverImage),
    hasLocation(region),
    getCarousel(region).length > 0,
    Array.isArray(region.regionTabs || region.region_tabs) && (region.regionTabs || region.region_tabs).length > 0,
    Array.isArray(region.homeNavLayoutConfig || region.home_nav_layout_config) && (region.homeNavLayoutConfig || region.home_nav_layout_config).length > 0,
    region.privateMessageEnabled !== undefined,
    region.isOpen !== undefined,
    Boolean(region.description)
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

function completionColor(value: number) {
  if (value >= 80) return '#16a34a'
  if (value >= 50) return '#d97706'
  return '#dc2626'
}

function regionTypeText(value: string) {
  const map: Record<string, string> = { campus: '校园', community: '社区', other: '其他' }
  return map[value] || '其他'
}

function money(value: any) {
  return Number(value || 0).toFixed(2)
}
</script>

<style scoped>
.region-list-page {
  gap: 22px;
}

.region-overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.overview-card,
.region-toolbar,
.region-card,
.empty-card {
  border: 1px solid var(--mx-border);
  background: var(--mx-card);
  box-shadow: 0 14px 36px color-mix(in srgb, var(--mx-text) 5%, transparent);
}

.overview-card {
  min-height: 118px;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.overview-card span {
  color: var(--mx-sub);
  font-weight: 800;
}

.overview-card b {
  color: var(--mx-text);
  font-size: 32px;
  line-height: 1;
}

.overview-card small {
  color: var(--mx-sub);
  font-size: 12px;
}

.region-toolbar {
  border-radius: 14px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.toolbar-left {
  display: grid;
  grid-template-columns: minmax(260px, 420px) 132px 132px;
  gap: 12px;
  flex: 1;
}

.toolbar-right {
  color: var(--mx-sub);
  font-weight: 800;
  white-space: nowrap;
}

.region-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 18px;
  min-height: 220px;
}

.region-card {
  border-radius: 14px;
  overflow: hidden;
}

.region-cover {
  min-height: 82px;
  padding: 14px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--mx-hover);
  background-size: cover;
  background-position: center;
}

.region-card-body {
  padding: 18px;
}

.region-identity {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: center;
  margin-bottom: 18px;
}

.region-identity h3 {
  margin: 0 0 5px;
  color: var(--mx-text);
  font-size: 18px;
  font-weight: 900;
}

.region-identity p {
  margin: 0;
  color: var(--mx-sub);
  line-height: 1.45;
  min-height: 20px;
}

.completion-block {
  padding: 14px;
  border-radius: 14px;
  background: var(--mx-soft);
  border: 1px solid var(--mx-border);
  margin-bottom: 16px;
}

.completion-top {
  display: flex;
  justify-content: space-between;
  color: var(--mx-sub);
  font-weight: 900;
  margin-bottom: 8px;
}

.region-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.region-facts div {
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--mx-soft);
  border: 1px solid var(--mx-border);
}

.region-facts span {
  display: block;
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 4px;
}

.region-facts b {
  color: var(--mx-text);
  font-size: 14px;
}

.region-facts b.muted {
  color: var(--el-color-warning);
}

.region-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.region-card-actions {
  border-top: 1px solid var(--mx-border);
  padding: 10px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
  align-items: center;
}

.region-switch-toggle {
  margin-right: auto;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--el-color-success-light-9);
  color: var(--el-color-success-dark-2);
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.region-switch-toggle.off {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger-dark-2);
}

.switch-help {
  width: 100%;
  margin-top: 6px;
  color: var(--mx-muted);
  font-size: 12px;
  line-height: 1.45;
}

.empty-card {
  border-radius: 14px;
  padding: 32px;
}

.create-layout {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 24px;
  min-height: 560px;
}

.create-steps {
  position: sticky;
  top: 0;
  align-self: start;
  padding: 8px 0 16px;
  min-width: 0;
}

.create-panel {
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  padding: 22px;
  background: var(--mx-card);
  min-width: 0;
}

.panel-title {
  color: var(--mx-text);
  font-size: 18px;
  font-weight: 900;
  margin-bottom: 18px;
}

.form-grid {
  display: grid;
  gap: 16px;
}

.form-grid.two,
.asset-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.form-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.location-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 18px 20px;
  align-items: start;
}

.location-form-grid :deep(.el-form-item) {
  display: block;
  margin-bottom: 0;
  min-width: 0;
}

.location-form-grid :deep(.el-form-item__label) {
  display: block;
  height: auto;
  line-height: 20px;
  margin-bottom: 8px;
  justify-content: flex-start;
  color: var(--mx-text);
  font-weight: 900;
  text-align: left;
}

.location-form-grid :deep(.el-form-item__content) {
  display: block;
  min-width: 0;
}

.location-form-grid :deep(.el-input-number),
.location-form-grid :deep(.el-input) {
  width: 100%;
}

.location-address-field {
  grid-column: 1 / -1;
}

.span-2 {
  grid-column: span 2;
}

.asset-grid {
  display: grid;
  gap: 18px;
}

.asset-label {
  color: var(--mx-sub);
  font-weight: 900;
  margin-bottom: 10px;
}

.map-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  background: var(--mx-soft);
  padding: 16px;
  margin-bottom: 18px;
}

.map-summary span {
  display: block;
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 6px;
}

.map-summary b {
  display: block;
  color: var(--mx-text);
  line-height: 1.45;
  word-break: break-word;
}

.map-summary :deep(.el-button) {
  flex: 0 0 auto;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.template-card {
  text-align: left;
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  background: var(--mx-card);
  padding: 16px;
  cursor: pointer;
  transition: .18s ease;
}

.template-card b {
  display: block;
  color: var(--mx-text);
  font-size: 15px;
  margin-bottom: 8px;
}

.template-card span {
  color: var(--mx-sub);
  line-height: 1.45;
}

.template-card.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  background: var(--mx-hover);
}

.copy-template-row {
  margin-top: 16px;
}

.init-checks {
  margin-top: 18px;
  display: grid;
  gap: 10px;
}

.drawer-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@media (max-width: 1200px) {
  .region-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .toolbar-left {
    grid-template-columns: 1fr;
  }

  .region-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (max-width: 760px) {
  .region-overview-grid,
  .region-card-grid,
  .form-grid.two,
  .form-grid.three,
  .location-form-grid,
  .asset-grid,
  .template-grid,
  .create-layout {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: span 1;
  }
}
</style>

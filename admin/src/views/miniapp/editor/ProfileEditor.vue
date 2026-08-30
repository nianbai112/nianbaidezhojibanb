<template>
  <div class="rte">
    <!-- ===== 顶部工具条 ===== -->
    <div class="rte-toolbar">
      <div class="rte-left">
        <el-select v-model="regionId" placeholder="选择区域" style="width: 180px" @change="loadAll">
          <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <span v-if="dirty.size" class="rte-dirty">{{ dirty.size }} 处未保存</span>
        <span v-else-if="lastSaved" class="rte-clean">已是最新 · {{ lastSaved }}</span>
      </div>
      <div class="rte-right">
        <el-button :icon="Refresh" :loading="loading" @click="loadAll">刷新</el-button>
        <el-tooltip content="版本历史" placement="bottom">
          <el-button :icon="Clock" circle @click="versionPanelVisible = true" />
        </el-tooltip>
        <el-button type="primary" :icon="Promotion" :disabled="!dirty.size" :loading="saving" @click="saveAll">
          保存并发布
        </el-button>
      </div>
    </div>

    <!-- ===== 版本历史（发布安全闭环：快照/对比/一键回滚） ===== -->
    <DecorVersionPanel v-model="versionPanelVisible" :region-id="regionId" :current="buildDecorSnapshot()" @rollback="loadAll()" />

    <div class="rte-body">
      <!-- ===== 画布：真实我的页（1:1 移植 PersonalHomepage） ===== -->
      <div class="rte-canvas">
        <div class="rte-page" :style="themeStyle">
          <!-- 自定义导航（nav-box，结构/class 由 sync-canvas-blocks.mjs 从 PersonalHomepage.wxml 生成） -->
          <div class="pf-nav">
            <div class="p-status"><span>9:41</span><span class="p-sig">●●●</span></div>
            <RealProfileNav :region="region" :resolve-asset="resolveAsset" :img-ok="imgOk" :on-img-error="onImgError" />
          </div>

          <!-- 用户卡片 / 主视觉（user-box 同源生成；用户信息为实时数据，只读占位） -->
          <section class="blk" :class="{ sel: editing === 'user' }" @click="startEdit('user')">
            <span class="blk-tag">用户卡片 / 主视觉</span>
            <RealProfileUserCard
              :region="region"
              :visual="visual"
              :is-xhs="isXhs"
              :resolve-asset="resolveAsset"
              :img-ok="imgOk"
              :on-img-error="onImgError"
            />
          </section>

          <!-- 成长等级卡（image11-growth-card 同源生成；实时数据，只读） -->
          <section class="blk readonly">
            <span class="blk-tag live">成长等级 · 实时数据</span>
            <RealProfileGrowthCard />
          </section>

          <!-- 数据栏（image11-stats-card 同源生成；实时数据，只读） -->
          <section class="blk readonly">
            <span class="blk-tag live">数据栏 · 实时数据</span>
            <RealProfileStatsCard />
          </section>

          <!-- 服务卡片（功能入口卡片 entryItems 数据源）+ 快捷入口宫格：真机 image11-action-panel
               为同一块（service-row + feature-grid），画布合并渲染一次，避免订单/钱包重复 -->
          <section
            class="blk"
            :class="{ sel: editing === 'quick' || editing === 'entries' }"
            @click="startEdit('quick')"
          >
            <span class="blk-tag">服务卡片 + 快捷入口</span>
            <RealProfileActionPanel
              :service-cards="serviceCardsData"
              service-empty-text="未配置功能入口卡片，点击编辑添加"
              :items="enabledQuick"
              empty-text="未配置快捷入口，点击编辑添加"
              :resolve-asset="resolveAsset"
              :img-ok="imgOk"
              :on-img-error="onImgError"
            />
          </section>

          <!-- 内容 Tab（bar-box 同源生成；只读） -->
          <section class="blk readonly">
            <span class="blk-tag live">内容 Tab</span>
            <RealProfileTabs :tabs="contentTabs" />
          </section>

          <!-- 我的发布（实时数据，只读，1:1 NotesCard 样式） -->
          <section class="blk readonly">
            <span class="blk-tag live">我的发布 · 实时数据</span>
            <div class="content-box">
              <div class="gg-feed">
                <div v-for="p in posts" :key="p.id" class="gg-box">
                  <div class="gg-header">
                    <img v-if="isHttp(p.user?.avatar)" :src="p.user.avatar" class="gg-avatar" alt="" @error="hideImg" />
                    <span v-else class="gg-avatar gg-avatar-letter">{{ (p.user?.nickname || '匿').slice(0, 1) }}</span>
                    <div class="gg-user-info">
                      <div class="gg-name">{{ p.user?.nickname || '匿名用户' }}</div>
                      <div class="gg-time">{{ formatTime(p.createdAt || p.created_at) }}</div>
                    </div>
                  </div>
                  <div class="gg-content">{{ p.title || p.content }}</div>
                  <div class="gg-footer">
                    <span>♡ {{ p.likeCount ?? p.like_count ?? 0 }}</span>
                    <span>💬 {{ p.commentCount ?? p.comment_count ?? 0 }}</span>
                  </div>
                </div>
                <div v-if="!posts.length" class="p-empty">该区域暂无帖子</div>
              </div>
            </div>
          </section>

          <!-- 侧边栏抽屉菜单（profile-drawer-menu，可配置） -->
          <section class="blk" :class="{ sel: editing === 'drawer' }" @click="startEdit('drawer')">
            <span class="blk-tag">侧边栏菜单</span>
            <div class="pf-drawer">
              <div class="pf-drawer-head"><span>≡</span> 我的侧边栏（点右上角菜单滑出）</div>
              <div v-for="(g, gi) in drawerGroups" :key="g.id || gi" class="pf-drawer-group">
                <div class="pf-drawer-group-title">{{ g.title || `分组 ${gi + 1}` }}</div>
                <div class="pf-drawer-items">
                  <span
                    v-for="(it, ii) in (g.items || [])"
                    :key="it.id || ii"
                    class="pf-drawer-item"
                    :class="{ dim: it.enabled === false }"
                  >{{ it.title }}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- TabBar -->
        <section class="blk tabbar-blk" :class="{ sel: editing === 'tabbar' }" @click="startEdit('tabbar')">
          <span class="blk-tag">底部导航</span>
          <div class="p-tabbar" :style="{ background: tabbarConfig.backgroundColor || '#fff' }">
            <div v-for="(t, i) in tabbarTabs" :key="i" class="p-tabbar-item" :class="{ dim: t.enabled === false }">
              <img v-if="tabbarIcon(t, i === tabbarTabs.length - 1)" :src="tabbarIcon(t, i === tabbarTabs.length - 1)" class="p-tabbar-icon-img" alt="" @error="hideImg" />
              <span v-else class="p-tabbar-icon" :style="{ color: tabColor(i) }">●</span>
              <span class="p-tabbar-text" :style="{ color: tabColor(i) }">{{ t.name }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- ===== 右侧面板 ===== -->
      <div class="rte-props">
        <el-tabs v-model="panelTab" stretch>
          <!-- ======== 版块编辑 ======== -->
          <el-tab-pane label="版块" name="section">
            <template v-if="editing === 'user'">
              <div class="pp-title">用户卡片 / 主视觉 <span class="pp-sub">头像昵称等为用户实时数据，只读</span></div>
              <el-form label-position="top">
                <el-form-item label="我的页布局">
                  <el-select v-model="profileLayout" style="width: 100%" @change="markDirty('layout')">
                    <el-option label="默认布局" value="default" />
                    <el-option label="小红书风格" value="xiaohongshu" />
                  </el-select>
                </el-form-item>
                <el-form-item label="显示右上角主视觉（吉祥物）">
                  <el-switch v-model="visual.enabled" @change="markDirty('visual')" />
                </el-form-item>
                <el-form-item label="主视觉图片">
                  <ImageUploadBox v-model="visual.image" shape="square" @update:model-value="markDirty('visual')" />
                </el-form-item>
              </el-form>
            </template>

            <template v-else-if="editing === 'entries'">
              <div class="pp-title">功能入口卡片（服务卡片） <span class="pp-sub">头像下方横向服务卡，未配置时显示默认「我的订单/我的钱包」</span></div>
              <el-button size="small" style="width: 100%; margin-bottom: 10px" @click="startEdit('quick')">编辑下方快捷入口宫格 →</el-button>
              <div class="pp-list">
                <div v-for="(it, i) in entryItems" :key="it.id || i" class="pp-item">
                  <div class="pp-item-head">
                    <b>{{ it.title || `入口 ${i + 1}` }}</b>
                    <div class="pp-item-ops">
                      <el-icon :class="{ dim: i === 0 }" @click="moveItem(entryItems, i, -1, 'entries')"><Top /></el-icon>
                      <el-icon :class="{ dim: i === entryItems.length - 1 }" @click="moveItem(entryItems, i, 1, 'entries')"><Bottom /></el-icon>
                      <el-icon class="danger" @click="entryItems.splice(i, 1); markDirty('entries')"><Delete /></el-icon>
                    </div>
                  </div>
                  <ImageUploadBox v-model="it.main_image" shape="square" @update:model-value="markDirty('entries')" />
                  <el-input v-model="it.title" placeholder="入口标题，如：我的订单" size="small" @input="markDirty('entries')" />
                  <el-input v-model="it.description" placeholder="副标题，如：查看订单和售后" size="small" @input="markDirty('entries')" />
                  <div class="pp-link">
                    <el-select v-model="it.type" size="small" style="width: 110px" @change="markDirty('entries')">
                      <el-option label="内部页面" value="internal_jump" />
                      <el-option label="外部小程序" value="external_jump" />
                      <el-option label="网页" value="web_page" />
                      <el-option label="弹窗提醒" value="popup" />
                    </el-select>
                    <el-input v-model="it.path" placeholder="路径，如 /pagesA/order/order" size="small" @input="markDirty('entries')" />
                  </div>
                  <el-input v-if="it.type === 'external_jump'" v-model="it.appId" placeholder="外部小程序 AppID" size="small" @input="markDirty('entries')" />
                  <el-input v-else v-model="it.query" placeholder="Query 参数，可选" size="small" @input="markDirty('entries')" />
                  <el-select v-model="it.navigation_permission" size="small" @change="markDirty('entries')">
                    <el-option label="所有用户可见" value="unlimited" />
                    <el-option label="区域管理员可见" value="region_manager" />
                    <el-option label="商家可见" value="merchant" />
                    <el-option label="商家店主可见" value="merchant_owner" />
                    <el-option label="仅宿舍小店店主可见" value="dorm_shop_owner" />
                    <el-option label="仅圈主可见" value="circle_owner" />
                    <el-option label="仅骑手可见" value="delivery_rider" />
                  </el-select>
                  <div class="pp-switches">
                    <el-switch v-model="it.enabled" size="small" inline-prompt active-text="启用" inactive-text="隐藏" @change="markDirty('entries')" />
                    <el-switch v-model="it.requireLogin" size="small" inline-prompt active-text="需登录" inactive-text="游客" @change="markDirty('entries')" />
                  </div>
                </div>
              </div>
              <el-button size="small" style="width: 100%" @click="addEntry">+ 添加入口</el-button>
            </template>

            <template v-else-if="editing === 'quick'">
              <div class="pp-title">快捷入口宫格 <span class="pp-sub">上方两张服务卡片即「功能入口卡片」</span></div>
              <el-button size="small" style="width: 100%; margin-bottom: 10px" @click="startEdit('entries')">编辑上方服务卡片（功能入口卡片）→</el-button>
              <div class="pp-list">
                <div v-for="(it, i) in quickItems" :key="it.key || i" class="pp-item">
                  <div class="pp-item-head">
                    <b>{{ it.title || `入口 ${i + 1}` }}</b>
                    <div class="pp-item-ops">
                      <el-icon :class="{ dim: i === 0 }" @click="moveItem(quickItems, i, -1, 'quick')"><Top /></el-icon>
                      <el-icon :class="{ dim: i === quickItems.length - 1 }" @click="moveItem(quickItems, i, 1, 'quick')"><Bottom /></el-icon>
                      <el-icon class="danger" @click="quickItems.splice(i, 1); markDirty('quick')"><Delete /></el-icon>
                    </div>
                  </div>
                  <el-input v-model="it.title" placeholder="入口名称" size="small" maxlength="8" @input="markDirty('quick')" />
                  <div class="pp-link">
                    <el-select v-model="it.icon" size="small" placeholder="图标" style="flex: 1" @change="markDirty('quick')">
                      <el-option v-for="ic in quickIcons" :key="ic.value" :label="ic.label" :value="ic.value" />
                    </el-select>
                    <el-select v-model="it.tone" size="small" placeholder="颜色" style="flex: 1" @change="markDirty('quick')">
                      <el-option v-for="tn in quickTones" :key="tn.value" :label="tn.label" :value="tn.value" />
                    </el-select>
                  </div>
                  <div class="pp-link">
                    <el-select v-model="it.type" size="small" style="width: 130px" @change="markDirty('quick')">
                      <el-option label="小程序内部页面" value="internal" />
                      <el-option label="我的页内容 Tab" value="profile_tab" />
                    </el-select>
                    <el-select v-if="it.type === 'profile_tab'" v-model="it.tabIndex" size="small" style="flex: 1" @change="markDirty('quick')">
                      <el-option label="我的发布" :value="0" />
                      <el-option label="我的收藏" :value="1" />
                      <el-option label="浏览记录" :value="2" />
                      <el-option label="收到的评论" :value="3" />
                    </el-select>
                    <el-input v-else v-model="it.path" placeholder="路径，如 /pagesA/Rider/Rider" size="small" style="flex: 1" @input="markDirty('quick')" />
                  </div>
                  <div class="pp-switches">
                    <el-select v-model="it.permission" size="small" style="flex: 1" @change="markDirty('quick')">
                      <el-option label="所有用户" value="all" />
                      <el-option label="商家" value="merchant" />
                      <el-option label="骑手" value="rider" />
                      <el-option label="区域管理员" value="manager" />
                    </el-select>
                    <el-switch v-model="it.enabled" size="small" inline-prompt active-text="显示" inactive-text="隐藏" @change="markDirty('quick')" />
                  </div>
                </div>
              </div>
              <el-button size="small" style="width: 100%" @click="addQuick">+ 添加入口</el-button>
            </template>

            <template v-else-if="editing === 'drawer'">
              <div class="pp-title">我的侧边栏 <span class="pp-sub">只允许选择已有页面</span></div>
              <div class="pp-list">
                <div v-for="(g, gi) in drawerGroups" :key="g.id || gi" class="pp-item">
                  <el-input v-model="g.title" placeholder="分组标题" size="small" @input="markDirty('drawer')" />
                  <div v-for="(it, ii) in (g.items || [])" :key="it.id || ii" class="pp-drawer-row">
                    <div class="pp-item-head">
                      <b>{{ it.title || `菜单 ${ii + 1}` }}</b>
                      <div class="pp-item-ops">
                        <el-icon :class="{ dim: ii === 0 }" @click="moveDrawerItem(gi, ii, -1)"><Top /></el-icon>
                        <el-icon :class="{ dim: ii === g.items.length - 1 }" @click="moveDrawerItem(gi, ii, 1)"><Bottom /></el-icon>
                      </div>
                    </div>
                    <el-input v-model="it.title" placeholder="入口名称" size="small" @input="markDirty('drawer')" />
                    <div class="pp-link">
                      <el-select v-model="it.icon" size="small" placeholder="图标" style="flex: 1" @change="markDirty('drawer')">
                        <el-option v-for="ic in drawerIcons" :key="ic.value" :label="ic.label" :value="ic.value" />
                      </el-select>
                      <el-select v-model="it.permission" size="small" style="flex: 1" @change="markDirty('drawer')">
                        <el-option label="所有用户" value="all" />
                        <el-option label="商家" value="merchant" />
                        <el-option label="骑手" value="rider" />
                        <el-option label="区域管理员" value="manager" />
                      </el-select>
                    </div>
                    <div class="pp-link">
                      <el-select v-model="it.path" size="small" placeholder="选择页面" style="flex: 1" @change="markDirty('drawer')">
                        <el-option v-for="p in drawerPages" :key="p.path" :label="p.label" :value="p.path" />
                      </el-select>
                      <el-switch v-model="it.enabled" size="small" inline-prompt active-text="显示" inactive-text="隐藏" @change="markDirty('drawer')" />
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="editing === 'tabbar'">
              <div class="pp-title">底部导航</div>
              <el-form label-position="top">
                <div class="pp-colors">
                  <el-form-item label="默认色"><el-color-picker v-model="tabbarConfig.color" @change="markDirty('tabbar')" /></el-form-item>
                  <el-form-item label="选中色"><el-color-picker v-model="tabbarConfig.selectedColor" @change="markDirty('tabbar')" /></el-form-item>
                  <el-form-item label="背景色"><el-color-picker v-model="tabbarConfig.backgroundColor" @change="markDirty('tabbar')" /></el-form-item>
                </div>
                <el-form-item label="消息未读提示">
                  <el-select v-model="tabbarConfig.messageBadgeStyle" style="width: 100%" @change="markDirty('tabbar')">
                    <el-option label="文字气泡" value="bubble" />
                    <el-option label="数字红点" value="number" />
                    <el-option label="小红点" value="dot" />
                    <el-option label="不显示" value="none" />
                  </el-select>
                </el-form-item>
              </el-form>
              <div class="pp-list">
                <div v-for="(t, i) in tabbarConfig.list" :key="i" class="pp-tabrow">
                  <el-switch v-model="t.enabled" size="small" @change="markDirty('tabbar')" />
                  <el-input v-model="t.name" size="small" style="flex: 1" @input="markDirty('tabbar')" />
                  <span class="pp-tabpath">{{ t.pagePath }}</span>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="pp-none">
                <el-icon :size="30"><Pointer /></el-icon>
                <p class="pp-none-title">点击画布中的版块开始编辑</p>
                <p class="pp-none-sub">用户卡片布局、主视觉、功能入口卡片、快捷入口宫格、侧边栏菜单、底部导航都可以直接修改，保存后小程序实时生效。</p>
              </div>
            </template>
          </el-tab-pane>

          <!-- ======== 主题 ======== -->
          <el-tab-pane label="主题" name="theme">
            <div class="pp-title">全局主题 <span class="pp-sub">画布实时预览</span></div>
            <div class="tp-presets">
              <button
                v-for="p in themePresets"
                :key="p.name"
                class="tp-preset"
                :class="{ active: themeVars['--brand'] === p.brand }"
                @click="applyPreset(p)"
              >
                <span class="tp-dot" :style="{ background: p.brand }" />
                <span>{{ p.name }}</span>
              </button>
            </div>
            <el-form label-position="top" style="margin-top: 14px">
              <el-form-item v-for="c in themeColors" :key="c.key" :label="c.label">
                <div class="tp-color-row">
                  <el-color-picker :model-value="themeVars[c.key]" @update:model-value="setThemeVar(c.key, $event)" />
                  <el-input :model-value="themeVars[c.key]" size="small" style="flex: 1" @update:model-value="setThemeVar(c.key, $event)" />
                </div>
              </el-form-item>
            </el-form>
            <el-alert type="info" :closable="false" show-icon style="margin-top: 8px">
              <template #title>主题写入小程序源码 app.wxss，需「下载代码包」并在开发者工具上传后生效。</template>
            </el-alert>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Bottom, Clock, Delete, Pointer, Promotion, Refresh, Top } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import { persistRegionEditor } from '@/views/miniapp/editor/editorPersistence.mjs'
import DecorVersionPanel from '@/components/miniapp/DecorVersionPanel.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { compileWxss } from '@/utils/wxssCompiler'
import { sharedGet } from '@/views/miniapp/editor/sharedGet'
import RealProfileNav from '@/views/miniapp/editor/generated/RealProfileNav.vue'
import RealProfileUserCard from '@/views/miniapp/editor/generated/RealProfileUserCard.vue'
import RealProfileGrowthCard from '@/views/miniapp/editor/generated/RealProfileGrowthCard.vue'
import RealProfileStatsCard from '@/views/miniapp/editor/generated/RealProfileStatsCard.vue'
import RealProfileActionPanel from '@/views/miniapp/editor/generated/RealProfileActionPanel.vue'
import RealProfileTabs from '@/views/miniapp/editor/generated/RealProfileTabs.vue'

// ============ 状态 ============
const regions = ref<any[]>([])
const regionId = ref('')
const region = ref<any>(null)
const loading = ref(false)
const saving = ref(false)
const editing = ref('')
const panelTab = ref('section')
const dirty = ref(new Set<string>())
const lastSaved = ref('')

const profileLayout = ref('default')
const visual = ref<any>({ enabled: true, image: '' })
const entryItems = ref<any[]>([])
const quickItems = ref<any[]>([])
const drawerGroups = ref<any[]>([])
const tabbarConfig = ref<any>({ type: 'bottom', color: '#8A8A8A', selectedColor: '#36A853', backgroundColor: '#ffffff', messageBadgeStyle: 'bubble', list: [] })

const posts = ref<any[]>([])
const contentTabs = ['我的发布', '我的收藏', '浏览记录', '收到的评论']

const isXhs = computed(() => profileLayout.value === 'xiaohongshu')

// ============ 默认值（与 RegionPageDecoration 对齐） ============
const defaultProfileDrawer = () => ({ groups: [
  { id: 'assets', title: '资产与订单', items: [{ id: 'wallet', icon: 'icon-qianbao', title: '我的钱包', path: '/pagesA/wallet/wallet', permission: 'all', enabled: true }, { id: 'history', icon: 'icon-clock-o', title: '浏览记录', path: '/pages/auth/BrowsingHistory/BrowsingHistory', permission: 'all', enabled: true }] },
  { id: 'activity', title: '活动', items: [{ id: 'activity', icon: 'icon-flag-o', title: '活动中心', path: '/pagesA/selection/list/list?tabIndex=0', permission: 'all', enabled: true }, { id: 'signup', icon: 'icon-description', title: '我的报名', path: '/pagesA/selection/list/list?tabIndex=1', permission: 'all', enabled: true }, { id: 'ticket', icon: 'icon-bill', title: '我的票券', path: '/pagesA/ticket-wallet/ticket-wallet', permission: 'all', enabled: true }] },
  { id: 'trade', title: '交易', items: [{ id: 'buy', icon: 'icon-goods-collect-o', title: '我的买入', path: '/pagesC/SecondHand/MySecondHand/MySecondHand?tab=orders&role=buyer', permission: 'all', enabled: true }, { id: 'sell', icon: 'icon-shop-o', title: '我的卖出', path: '/pagesC/SecondHand/MySecondHand/MySecondHand?tab=orders&role=seller', permission: 'all', enabled: true }, { id: 'address', icon: 'icon-location-o', title: '收货地址', path: '/pages/address/address', permission: 'all', enabled: true }] },
  { id: 'account', title: '账号', items: [{ id: 'verify', icon: 'icon-user-o', title: '我的认证', path: '/pages/auth/StudentCertification/StudentCertification', permission: 'all', enabled: true }, { id: 'member', icon: 'icon-vip', title: '我的会员', path: '/pagesA/MemberCenter/MemberCenter', permission: 'all', enabled: true }] }
] })
const defaultProfileQuickActions = () => ({ items: [
  { key: 'posts', title: '我的发布', icon: 'icon-bianji', tone: 'green', permission: 'all', type: 'profile_tab', tabIndex: 0, enabled: true, sortOrder: 0 },
  { key: 'idle', title: '我的闲置', icon: 'icon-dingdan2', tone: 'orange', permission: 'all', type: 'internal', path: '/pagesC/SecondHand/MySecondHand/MySecondHand', enabled: true, sortOrder: 1 },
  { key: 'errand', title: '我的跑腿', icon: 'icon-qishoupeisong', tone: 'green', permission: 'all', type: 'internal', path: '/pages/tabbar/RunErrands/RunErrands', enabled: true, sortOrder: 2 },
  { key: 'draft', title: '草稿箱', icon: 'icon-bill', tone: 'blue', permission: 'all', type: 'internal', path: '/pagesB/post/createPost', enabled: true, sortOrder: 3 },
  { key: 'favorite', title: '我的收藏', icon: 'icon-aixin4', tone: 'yellow', permission: 'all', type: 'profile_tab', tabIndex: 1, enabled: true, sortOrder: 4 },
  { key: 'history', title: '浏览记录', icon: 'icon-eye', tone: 'green-soft', permission: 'all', type: 'internal', path: '/pages/auth/BrowsingHistory/BrowsingHistory', enabled: true, sortOrder: 5 },
  { key: 'comments', title: '收到的评论', icon: 'icon-comment-circle-o', tone: 'purple', permission: 'all', type: 'profile_tab', tabIndex: 3, enabled: true, sortOrder: 6 },
  { key: 'certification', title: '账号认证', icon: 'icon-user-o', tone: 'blue', permission: 'all', type: 'internal', path: '/pages/auth/StudentCertification/StudentCertification', enabled: true, sortOrder: 7 },
  { key: 'badge', title: '我的称号', icon: 'icon-huangguan', tone: 'gold', permission: 'all', type: 'internal', path: '/pagesB/badge/badge', enabled: true, sortOrder: 8 },
] })

const quickIcons = [{ label: '发布笔记', value: 'icon-bianji' }, { label: '订单', value: 'icon-dingdan2' }, { label: '跑腿', value: 'icon-qishoupeisong' }, { label: '票券', value: 'icon-bill' }, { label: '收藏', value: 'icon-aixin4' }, { label: '浏览记录', value: 'icon-eye' }, { label: '评论', value: 'icon-comment-circle-o' }, { label: '账号认证', value: 'icon-user-o' }, { label: '我的称号', value: 'icon-huangguan' }]
const quickTones = [{ label: '草绿', value: 'green' }, { label: '橙色', value: 'orange' }, { label: '蓝色', value: 'blue' }, { label: '黄色', value: 'yellow' }, { label: '浅绿', value: 'green-soft' }, { label: '紫色', value: 'purple' }, { label: '金色', value: 'gold' }]
const drawerPages = [{ label: '我的钱包', path: '/pagesA/wallet/wallet' }, { label: '浏览记录', path: '/pages/auth/BrowsingHistory/BrowsingHistory' }, { label: '活动中心', path: '/pagesA/selection/list/list?tabIndex=0' }, { label: '我的报名', path: '/pagesA/selection/list/list?tabIndex=1' }, { label: '我的票券', path: '/pagesA/ticket-wallet/ticket-wallet' }, { label: '我的买入', path: '/pagesC/SecondHand/MySecondHand/MySecondHand?tab=orders&role=buyer' }, { label: '我的卖出', path: '/pagesC/SecondHand/MySecondHand/MySecondHand?tab=orders&role=seller' }, { label: '收货地址', path: '/pages/address/address' }, { label: '我的认证', path: '/pages/auth/StudentCertification/StudentCertification' }, { label: '我的会员', path: '/pagesA/MemberCenter/MemberCenter' }]
const drawerIcons = [{ label: '钱包', value: 'icon-qianbao' }, { label: '浏览记录', value: 'icon-clock-o' }, { label: '活动', value: 'icon-flag-o' }, { label: '报名', value: 'icon-description' }, { label: '票券', value: 'icon-bill' }, { label: '买入', value: 'icon-goods-collect-o' }, { label: '卖出', value: 'icon-shop-o' }, { label: '收货地址', value: 'icon-location-o' }, { label: '账号认证', value: 'icon-user-o' }, { label: '会员', value: 'icon-vip' }]

// ============ 主题 ============
const themeVars = ref<Record<string, string>>({})
const themeDirtyKeys = ref(new Set<string>())
const themeStyle = computed(() => themeVars.value)

const themeColors = [
  { key: '--brand', label: '品牌主色' },
  { key: '--brand-deep', label: '品牌深色' },
  { key: '--brand-bg', label: '品牌浅底' },
  { key: '--bg-page', label: '页面背景' },
  { key: '--text-primary', label: '主要文字' },
  { key: '--text-secondary', label: '次要文字' },
]
const themePresets = [
  { name: '清新绿', brand: '#36A853', deep: '#2E7E3A', bg: '#E8F3E4' },
  { name: '天空蓝', brand: '#3B82F6', deep: '#1D4ED8', bg: '#E3EDFB' },
  { name: '活力橙', brand: '#F97316', deep: '#C2410C', bg: '#FDEBDA' },
  { name: '薰衣紫', brand: '#8B5CF6', deep: '#6D28D9', bg: '#EFE9FD' },
  { name: '樱花粉', brand: '#EC4899', deep: '#BE185D', bg: '#FCE3F0' },
]
const setThemeVar = (key: string, value: string) => {
  themeVars.value = { ...themeVars.value, [key]: value }
  themeDirtyKeys.value.add(key)
  markDirty('theme')
}
const applyPreset = (p: any) => {
  setThemeVar('--brand', p.brand)
  setThemeVar('--brand-deep', p.deep)
  setThemeVar('--brand-bg', p.bg)
}
/** 主题值 rpx → px（画布 0.5 缩放），使注入的真机 wxss 中 var(--fs-*) 等引用可解析 */
const normalizeThemeValue = (v: string) =>
  String(v).replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_, n) => `${Math.round(parseFloat(n) * 50) / 100}px`)
async function loadThemeVars(retryOnDedupe = true) {
  try {
    const res: any = await sharedGet('/admin/miniapp/code/theme')
    const vars = res.data?.vars || []
    const map: Record<string, string> = {}
    for (const v of vars) if (v.name && v.value) map[v.name] = normalizeThemeValue(v.value)
    themeVars.value = map
  } catch (e: any) {
    // request 层 600ms 相同 GET 去重：多编辑器同页挂载时重试一次
    if (retryOnDedupe && e?.code === 'ERR_CANCELED') setTimeout(() => loadThemeVars(false), 700)
  }
}

// ============ 计算 ============
const enabledEntries = computed(() => entryItems.value.filter((it) => it.enabled !== false))
const enabledQuick = computed(() => quickItems.value.filter((it) => it.enabled !== false))
/** 服务卡片数据源：功能入口卡片 entryItems；未配置时回退真机静态默认（我的订单/我的钱包） */
const defaultServiceCards = () => [
  { id: 'svc_order', title: '我的订单', description: '查看跑腿、闲置交易订单', path: '/pagesA/order/order' },
  { id: 'svc_wallet', title: '我的钱包', description: '余额、收益、提现记录', path: '/pagesA/wallet/wallet' },
]
const serviceCardsData = computed(() => (enabledEntries.value.length ? enabledEntries.value : defaultServiceCards()))
const tabbarTabs = computed(() => (tabbarConfig.value.list || []).filter((t: any) => t.enabled !== false).slice(0, 5))

const isHttp = (v: string) => /^https?:\/\//.test(String(v || ''))
/** 解析素材地址：http 直用；/static/* 走后端素材代理（真实小程序图标） */
const resolveAsset = (v: string) => {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//.test(s)) return s
  if (s.startsWith('/static/')) return `/miniapp-static/${s.slice('/static/'.length)}`
  if (s.startsWith('static/')) return `/miniapp-static/${s.slice('static/'.length)}`
  return ''
}
/** 已失败的素材地址（加载失败走占位回退，与 HomeEditor 一致） */
const failedAssets = ref(new Set<string>())
const imgOk = (v: string) => {
  const r = resolveAsset(v)
  return !!r && !failedAssets.value.has(r)
}
const onImgError = (e: Event) => {
  const el = e.target as HTMLImageElement
  failedAssets.value.add(el.getAttribute('src') || el.src)
  // 重赋值触发 imgOk/v-if 重算，失败图片立即回退占位图标（不出现黑块）
  failedAssets.value = new Set(failedAssets.value)
  el.style.display = 'none'
}
const hideImg = (e: Event) => { (e.target as HTMLImageElement).style.display = 'none' }
const formatTime = (t: string) => (t ? String(t).slice(0, 10) : '')

const tabColor = (i: number) => (i === tabbarTabs.value.length - 1 ? (tabbarConfig.value.selectedColor || '#36A853') : (tabbarConfig.value.color || '#8A8A8A'))
const tabbarIcon = (t: any, active: boolean) => {
  const raw = active ? (t.selectedIconPath || t.icons?.selected || t.iconPath || t.icons?.unselected) : (t.iconPath || t.icons?.unselected)
  return resolveAsset(raw)
}

const markDirty = (key: string) => { dirty.value.add(key); dirty.value = new Set(dirty.value) }
const startEdit = (key: string) => { editing.value = key; panelTab.value = 'section' }
const moveItem = (list: any[], i: number, dir: number, key: string) => {
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const t = list[i]; list[i] = list[j]; list[j] = t
  markDirty(key)
}
const moveDrawerItem = (gi: number, ii: number, dir: number) => {
  const items = drawerGroups.value[gi]?.items || []
  moveItem(items, ii, dir, 'drawer')
}

const addEntry = () => {
  entryItems.value.push({
    id: `entry_${Date.now()}`, title: '', description: '', icon: '', main_image: '', path: '', query: '', appId: '',
    type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: entryItems.value.length, requireLogin: true,
  })
  markDirty('entries')
}
const addQuick = () => {
  quickItems.value.push({
    key: `custom_${Date.now()}`, title: '', icon: 'icon-bianji', tone: 'green', permission: 'all',
    type: 'internal', path: '', enabled: true, sortOrder: quickItems.value.length,
  })
  markDirty('quick')
}

// ============ 数据加载 ============
async function loadRegions() {
  const res: any = await sharedGet('/admin/regions')
  regions.value = res.data?.list || res.list || []
  if (!regionId.value && regions.value.length) {
    regionId.value = regions.value[0].id || regions.value[0].region_id
  }
}

const parseSettings = (raw: any) => {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return raw
}

async function loadAll(retryOnDedupe = true) {
  if (!regionId.value) return
  loading.value = true
  editing.value = ''
  dirty.value = new Set()
  themeDirtyKeys.value = new Set()
  const rid = regionId.value
  // request 层 600ms 相同 GET 去重的静默取消不吞掉，交给外层重试
  const safe = (p: Promise<any>, fb: any) => p.catch((e) => {
    if (e?.code === 'ERR_CANCELED') throw e
    return fb
  })
  try {
    const [regionRes, tabbarRes, postsRes] = await Promise.all([
      safe(sharedGet(`/admin/regions/${rid}`), null),
      safe(sharedGet('/admin/regions/tabbar', { regionId: rid }), null),
      safe(sharedGet(`/posts/region-posts/${rid}`, { page: 1, limit: 4 }), null),
    ])

    region.value = regionRes?.data || regionRes

    profileLayout.value = region.value?.profilePageLayout || region.value?.profile_page_layout || 'default'

    const settings = parseSettings(region.value?.settings)
    visual.value = { enabled: settings?.profileVisual?.enabled !== false, image: settings?.profileVisual?.image || '' }
    drawerGroups.value = settings?.profileDrawer?.groups
      ? JSON.parse(JSON.stringify(settings.profileDrawer.groups))
      : defaultProfileDrawer().groups
    quickItems.value = Array.isArray(settings?.profileQuickActions?.items)
      ? JSON.parse(JSON.stringify(settings.profileQuickActions.items))
      : defaultProfileQuickActions().items

    const pli = region.value?.profileLayoutItems || region.value?.profile_layout_items
    entryItems.value = (Array.isArray(pli) ? JSON.parse(JSON.stringify(pli)) : [])
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    const tb = tabbarRes?.data || tabbarRes
    if (tb?.config) tabbarConfig.value = { ...tabbarConfig.value, ...tb.config }
    else if (tb?.list) tabbarConfig.value = { ...tabbarConfig.value, ...tb }

    posts.value = postsRes?.list || postsRes?.posts || postsRes?.data || []
  } catch (e: any) {
    // request 层 600ms 相同 GET 去重：多编辑器同页挂载时重试一次
    if (retryOnDedupe && e?.code === 'ERR_CANCELED') {
      setTimeout(() => loadAll(false), 700)
      return
    }
    ElMessage.error('加载区域配置失败')
  } finally {
    loading.value = false
  }
}

// ============ 保存 ============
/** dirty key → 版本快照备注里的中文清单 */
const DIRTY_LABELS: Record<string, string> = {
  layout: '页面布局',
  entries: '菜单入口',
  visual: '主视觉',
  drawer: '抽屉分组',
  quick: '快捷操作',
  tabbar: '底部导航',
  theme: '主题',
}

// ============ 版本历史（发布安全闭环） ============
const versionPanelVisible = ref(false)
/** 当前完整编辑状态合集（与快照同形）：我的页 regions 字段子集 + tabbar */
const buildDecorSnapshot = () => {
  // settings 与保存链路同语义：以当前区域 settings 为底整体合并，不丢 publishMenu 等其他子键
  const base = parseSettings(region.value?.settings)
  const settings: any = { ...base }
  settings.profileVisual = { ...visual.value }
  settings.profileDrawer = { groups: drawerGroups.value }
  settings.profileQuickActions = { items: quickItems.value.map((it, i) => ({ ...it, sortOrder: i })) }
  return {
    regionPayload: {
      profile_page_layout: profileLayout.value,
      profile_layout_items: entryItems.value.map((it, i) => ({ ...it, sortOrder: i })),
      settings,
    },
    tabbarConfig: JSON.parse(JSON.stringify(tabbarConfig.value)),
  }
}
/** 发布成功后存一个版本快照（失败不打扰主流程） */
async function snapshotDecorVersion(note: string) {
  try {
    await request.post('/admin/decor-version/snapshot', {
      regionId: regionId.value,
      snapshot: buildDecorSnapshot(),
      note: `发布：${note}`,
    })
  } catch (e) {
    console.warn('[ProfileEditor] 版本快照失败：', e)
  }
}

async function saveAll() {
  if (!dirty.value.size) return
  saving.value = true
  // 记录本次要落库的 dirty key（成功后 dirty 清空，快照备注仍需要）
  const savingKeys = new Set(dirty.value)
  try {
    const rid = regionId.value
    const payload: any = {}

    if (dirty.value.has('layout')) {
      payload.profile_page_layout = profileLayout.value
    }
    if (dirty.value.has('entries')) {
      payload.profile_layout_items = entryItems.value.map((it, i) => ({ ...it, sortOrder: i }))
    }
    // settings 嵌套字段：以当前区域 settings 为底整体合并，不覆盖 publishMenu 等其他子键
    if (dirty.value.has('visual') || dirty.value.has('drawer') || dirty.value.has('quick')) {
      const base = parseSettings(region.value?.settings)
      const settings: any = { ...base }
      if (dirty.value.has('visual')) settings.profileVisual = { ...visual.value }
      if (dirty.value.has('drawer')) settings.profileDrawer = { groups: drawerGroups.value }
      if (dirty.value.has('quick')) {
        settings.profileQuickActions = { items: quickItems.value.map((it, i) => ({ ...it, sortOrder: i })) }
      }
      payload.settings = settings
    }
    if (Object.keys(payload).length) {
      await persistRegionEditor(request, rid, payload)
    }
    if (dirty.value.has('tabbar')) {
      await request.put('/admin/regions/tabbar', { regionId: rid, config: tabbarConfig.value })
    }
    if (dirty.value.has('theme')) {
      const vars = [...themeDirtyKeys.value].map((k) => ({ name: k, value: themeVars.value[k] }))
      await request.put('/admin/miniapp/code/theme', { vars })
      themeDirtyKeys.value = new Set()
    }

    dirty.value = new Set()
    lastSaved.value = new Date().toLocaleTimeString('zh-CN')
    ElMessage.success('已保存并发布，小程序端实时生效')
    // 发布成功后存版本快照（可在「版本历史」中一键回滚）
    snapshotDecorVersion([...savingKeys].map((k) => DIRTY_LABELS[k] || k).join('、'))
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ============ 真实样式编译注入（真实小程序 WXSS → 画布 CSS） ============
const REAL_WXSS_FILES = ['pages/tabbar/auth/PersonalHomepage.wxss']
async function injectRealWxss() {
  const parts: string[] = []
  for (const path of REAL_WXSS_FILES) {
    try {
      const res: any = await request.get('/admin/miniapp/code/source-file', { params: { path } })
      const content = res.data?.content || ''
      // 第 4 参数：wxss 元素选择器（view/text/image）映射为 div/span/img
      if (content) parts.push(compileWxss(content, '.rte-page', 0.5, true))
    } catch { /* 单文件失败不阻塞，生成组件自带关键布局回退样式 */ }
  }
  const id = 'rte-real-wxss-profile'
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = parts.join('\n')
}

async function initData(retryOnDedupe = true) {
  try {
    loadThemeVars()
    await loadRegions()
    await loadAll()
  } catch (e: any) {
    // request 层 600ms 相同 GET 去重：多编辑器同页挂载时重试一次
    if (retryOnDedupe && e?.code === 'ERR_CANCELED') {
      setTimeout(() => initData(false), 700)
      return
    }
    ElMessage.error('加载区域列表失败')
  }
}

onMounted(() => {
  injectRealWxss()
  initData()
})
</script>

<style scoped lang="scss">
.rte { display: flex; flex-direction: column; gap: 14px; }

.rte-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background: var(--mx-card);
  border: 1px solid var(--mx-border);
  border-radius: 12px;
}
.rte-left, .rte-right { display: flex; align-items: center; gap: 10px; }
/* 保存并发布：品牌绿主按钮（对齐 HomeEditor .rte-publish，全编辑器唯一品牌色） */
.rte-toolbar :deep(.el-button--primary) {
  --el-button-bg-color: var(--ds-brand, #16A34A);
  --el-button-border-color: var(--ds-brand, #16A34A);
  --el-button-text-color: #fff;
  --el-button-hover-bg-color: var(--ds-brand-hover, #15803D);
  --el-button-hover-border-color: var(--ds-brand-hover, #15803D);
  --el-button-hover-text-color: #fff;
  --el-button-active-bg-color: var(--ds-brand-hover, #15803D);
  --el-button-active-border-color: var(--ds-brand-hover, #15803D);
  --el-button-disabled-bg-color: #a7d9bb;
  --el-button-disabled-border-color: #a7d9bb;
  --el-button-disabled-text-color: #fff;
}
.rte-dirty { color: var(--ds-warning, #D97706); font-size: var(--ds-fs-label, 12px); font-weight: 500; }
.rte-clean { color: var(--mx-muted); font-size: var(--ds-fs-label, 12px); }

.rte-body {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  align-items: start;
}

/* ===== 画布 ===== */
.rte-canvas {
  background: var(--mx-soft);
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.rte-page {
  width: 375px;
  background: var(--bg-page, #f4f7f1);
  border-radius: 14px 14px 0 0;
  box-shadow: 0 8px 30px rgba(15, 23, 42, .10);
  overflow: hidden;
  min-height: 480px;
  max-height: 660px;
  overflow-y: auto;
  box-sizing: border-box;
  /* 顶部给 blk-tag 留位，底部留白避免最后一张卡顶着页面边缘（TabBar 不压内容） */
  padding: 10px 0 16px;
}

.blk {
  position: relative;
  cursor: pointer;
  border: 2px dashed transparent;
  border-radius: 10px;
  /* 区块间距均匀：卡片之间不再互相挤压，blk-tag 也有出标签的空间 */
  margin: 10px 8px;
  transition: border-color .12s ease;
}
.blk:hover { border-color: var(--brand-light, #87bd6d); }
.blk.sel { border-color: var(--brand, #36a853); }
.blk.off { opacity: .4; }
.blk.readonly { cursor: default; }
.blk.readonly:hover { border-color: transparent; }
.blk-tag {
  position: absolute;
  top: -9px;
  left: 12px;
  /* 必须高于卡片自身 z-index（成长卡 z5/数据栏 z4），否则蓝标被卡片边缘切掉 */
  z-index: 10;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--brand, #36a853);
  color: #fff;
  opacity: 0;
  transition: opacity .12s ease;
}
.blk:hover .blk-tag, .blk.sel .blk-tag { opacity: 1; }
.blk-tag.live { background: var(--ds-brand, #16A34A); opacity: 1; }
/* TabBar 独立成卡：与页面拉开间距，不再贴着/压住内容；
   flex-shrink:0 防止被 .rte-canvas 的 flex 列布局压缩裁切 */
.tabbar-blk { flex-shrink: 0; margin: 12px 0 0; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(15, 23, 42, .10); }

/* ===== 页面元素 ===== */
.p-status { display: flex; justify-content: space-between; padding: 8px 18px 4px; font-size: 11px; font-weight: 700; color: var(--text-primary, #1d271f); }
.p-sig { letter-spacing: 2px; font-size: 8px; }
.df { display: flex; align-items: center; }
.ohto { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 自定义导航：1:1 移植 nav-box */
.pf-nav {
  background: var(--bg-card, #fff);
  box-shadow: 0 2px 8px rgba(38, 58, 32, .06);
  padding-bottom: 10px;
  text-align: center;
}
.pf-nav-title {
  max-width: 160px;
  margin: 4px auto 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, #1d271f);
}

/* ===== 用户卡片：1:1 移植 user-box（rpx→px ÷2） ===== */
.user-box {
  position: relative;
  width: 100%;
  min-height: 215px;
  padding: 30px 16px 16px;
  box-sizing: border-box;
  color: var(--text-primary, #1d271f);
  overflow: hidden;
  background: linear-gradient(180deg, var(--brand-bg, #e8f3e4) 0%, var(--bg-cream, #fff8e8) 62%, var(--bg-page, #f4f7f1) 100%);
}
.user-box::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 150px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0));
  z-index: 0;
}
.profile-visual-image {
  position: absolute;
  right: 14px;
  top: 58px;
  width: 94px;
  height: 80px;
  z-index: 1;
  object-fit: contain;
  pointer-events: none;
}
.profile-visual-empty {
  position: absolute;
  right: 14px;
  top: 58px;
  width: 94px;
  height: 80px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: 1px dashed var(--brand-light, #87bd6d);
  border-radius: 12px;
  color: var(--text-tertiary, #8a9384);
  font-size: 10px;
  line-height: 1.5;
  pointer-events: none;
}
.user-info-container { position: relative; z-index: 2; width: 100%; }
.user-top {
  position: relative;
  z-index: 2;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  min-height: 80px;
  margin-bottom: 8px;
}
.avatar-wrapper { position: relative; width: 66px; height: 66px; flex-shrink: 0; }
.avatar-container {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--bg-card, #fff);
  border: 2px solid var(--bg-card, #fff);
  box-shadow: 0 0 0 0.5px var(--line-hairline, #e6ebdf), 0 4px 10px rgba(38, 58, 32, .12);
  overflow: hidden;
  display: grid;
  place-items: center;
}
.avatar-letter { color: var(--brand, #36a853); font-size: 24px; font-weight: 800; }
.user-info-right {
  flex: 1;
  margin-left: 12px;
  padding-right: 85px;
  min-height: 66px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
}
.user-info-right .user-name { margin: 0; display: flex; align-items: center; font-size: 18px; font-weight: 900; }
.user-info-right .user-uid { margin-top: 4px; font-size: 13px; color: var(--text-tertiary, #8a9384); font-weight: 400; }
.user-info-right .region-switch {
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  border: 0.5px solid var(--line-hairline, #e6ebdf);
  color: var(--text-secondary, #55604f);
  font-size: 11px;
  width: fit-content;
  max-width: 180px;
}
.user-info-right .region-switch .region-name { max-width: 140px; font-size: 11px; }
.rs-arrow { margin-left: 6px; font-size: 10px; color: var(--text-tertiary, #8a9384); }
.user-name {
  position: relative;
  z-index: 2;
  margin: 0 0 6px;
  width: 100%;
  font-size: 18px;
  line-height: 1.18;
  font-weight: 900;
  color: var(--text-primary, #1d271f);
  align-items: center;
  gap: 4px;
}
.user-name::after {
  content: "";
  width: 11px;
  height: 11px;
  margin-left: 4px;
  border-radius: 9px 1px 9px 1px;
  background: var(--brand-light, #87bd6d);
  transform: rotate(-28deg);
}
.user-intro { position: relative; z-index: 2; margin-top: 2px; max-width: 250px; width: 100%; word-break: break-word; }
.user-intro span { color: var(--text-secondary, #55604f); font-size: 13px; line-height: 1.45; }
.user-tag {
  position: relative;
  z-index: 2;
  margin: 8px 0 0;
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tag-item {
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  border: 0.5px solid var(--line-hairline, #e6ebdf);
  color: var(--text-secondary, #55604f);
  font-size: 11px;
  font-weight: 500;
  justify-content: center;
}
.tag-item.region-tag { color: var(--brand-deep, #2e7e3a); background: var(--brand-bg, #e8f3e4); white-space: nowrap; }
.user-btn { position: absolute; right: 0; bottom: 1px; z-index: 4; margin: 0; }
.btn-item {
  height: 24px;
  line-height: 24px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(38, 58, 32, .08);
}
.btn-item.bg1 { color: var(--brand-deep, #2e7e3a); background: rgba(255, 255, 255, 0.78); border: 0.5px solid var(--line-hairline, #e6ebdf); }
.btn-item.bg2 { margin-left: 6px; color: #fff; background: var(--brand, #36a853); border: 0.5px solid var(--brand-deep, #2e7e3a); }

/* ===== 成长等级卡：1:1 移植 image11-growth-card ===== */
.image11-growth-card {
  position: relative;
  z-index: 5;
  width: calc(100% - 24px);
  /* 真机为 -4px 负 margin 咬合用户卡；画布按独立区块归一，避免与上一区块重叠 */
  margin: 0 12px 8px;
  padding: 10px 12px 8px;
  box-sizing: border-box;
  border-radius: 12px;
  border: 0.5px solid var(--line-hairline, #e6ebdf);
  background: linear-gradient(135deg, var(--bg-cream, #fff8e8) 0%, var(--brand-bg, #e8f3e4) 100%);
  box-shadow: 0 2px 8px rgba(38, 58, 32, .08);
}
.image11-growth-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.image11-growth-left { display: flex; align-items: center; flex: 1; min-width: 0; }
.image11-level-pill {
  min-width: 36px;
  height: 17px;
  padding: 0 8px;
  margin-right: 8px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  background: linear-gradient(135deg, var(--brand, #36a853), var(--brand-light, #87bd6d));
  box-sizing: border-box;
}
.image11-level-name {
  max-width: 120px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text-primary, #1d271f);
  font-size: 13px;
  font-weight: 800;
}
.image11-level-star { margin-left: 4px; color: var(--accent-sun, #f2c94c); font-size: 13px; }
.image11-growth-entry {
  height: 23px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  border-radius: 999px;
  color: var(--brand-deep, #2e7e3a);
  background: rgba(255, 255, 255, 0.64);
  border: 0.5px solid var(--brand-light, #87bd6d);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}
.image11-exp-line { display: flex; align-items: center; margin-top: 8px; color: var(--text-secondary, #55604f); font-size: 13px; gap: 4px; }
.image11-exp-current { color: var(--brand, #36a853); font-weight: 900; }
.image11-progress {
  width: 68%;
  height: 4px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-fill, #eef2e8);
}
.image11-progress-inner { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--brand, #36a853), var(--brand-light, #87bd6d)); }
.image11-next-line { margin-top: 4px; color: var(--text-secondary, #55604f); font-size: 13px; }

/* ===== 数据栏：1:1 移植 image11-stats-card ===== */
.image11-stats-card {
  position: relative;
  z-index: 4;
  display: flex;
  width: calc(100% - 24px);
  margin: 0 12px 10px;
  padding: 10px 0;
  border-radius: 12px;
  background: var(--bg-card, #fff);
  box-shadow: 0 2px 8px rgba(38, 58, 32, .08);
}
.image11-stat { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.image11-stat:not(:last-child)::after {
  content: "";
  position: absolute;
  right: 0;
  top: 6px;
  bottom: 6px;
  width: 0.5px;
  background: var(--line-hairline, #e6ebdf);
}
.image11-stat-value { color: var(--text-primary, #1d271f); font-size: 18px; line-height: 1; font-weight: 700; }
.image11-stat-label { color: var(--text-tertiary, #8a9384); font-size: 11px; }

/* ===== 服务卡片 + 快捷入口宫格样式见 generated/RealProfileActionPanel.vue（同源生成，画布只渲染一次） ===== */

/* ===== 内容 Tab：1:1 移植 bar-box ===== */
.bar-box {
  width: calc(100% - 24px);
  height: 42px;
  margin: 0 12px;
  border-radius: 12px 12px 0 0;
  overflow: hidden;
  background: var(--bg-card, #fff);
  box-shadow: 0 2px 8px rgba(38, 58, 32, .08);
}
.bar-item { flex: 1; padding: 0; flex-direction: column; justify-content: center; position: relative; height: 100%; }
.bar-text { font-weight: 700; font-size: 13px; color: var(--text-tertiary, #8a9384); }
.bar-text.active { font-size: 15px; color: var(--text-primary, #1d271f); }
.bar-line { position: absolute; bottom: 5px; width: 17px; height: 3px; border-radius: 4px; background: var(--brand, #36a853); }

/* ===== 我的发布：1:1 移植 content-box + NotesCard ===== */
.content-box {
  width: calc(100% - 24px);
  margin: 0 12px 12px;
  padding-bottom: 12px;
  background: var(--bg-card, #fff);
  border-radius: 0 0 12px 12px;
  box-shadow: 0 2px 8px rgba(38, 58, 32, .08);
  overflow: hidden;
}
.gg-feed { background: #fff; }
.gg-box {
  border-bottom: 0.5px solid var(--bg-fill, #eef2e8);
  padding: 16px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: #fff;
}
.gg-header { display: flex; align-items: center; }
.gg-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 0.5px solid var(--bg-fill, #eef2e8);
  flex-shrink: 0;
}
.gg-avatar-letter {
  background: var(--brand-bg, #e8f3e4);
  color: var(--brand, #36a853);
  font-size: 13px;
  font-weight: 700;
  display: grid;
  place-items: center;
}
.gg-user-info { flex: 1; margin-left: 10px; min-width: 0; }
.gg-name { color: var(--text-primary, #1d271f); font-size: 12px; line-height: 16px; font-weight: 700; }
.gg-time { color: var(--text-tertiary, #8a9384); font-size: 10px; margin-top: 2px; }
.gg-content {
  margin-top: 10px;
  margin-left: 44px;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-primary, #1d271f);
  white-space: pre-line;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.gg-footer { margin-top: 8px; margin-left: 44px; display: flex; gap: 18px; font-size: 11px; color: var(--text-tertiary, #8a9384); }
.p-empty { padding: 22px 0; text-align: center; color: var(--text-tertiary, #8a9384); font-size: 12px; width: 100%; }

/* ===== 侧边栏抽屉菜单预览（profile-drawer-menu） ===== */
.pf-drawer {
  width: calc(100% - 24px);
  margin: 0 12px 12px;
  background: var(--bg-card, #fff);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(38, 58, 32, .08);
  overflow: hidden;
  box-sizing: border-box;
}
.pf-drawer-head {
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary, #1d271f);
  border-bottom: 0.5px solid var(--bg-fill, #eef2e8);
  display: flex;
  align-items: center;
  gap: 6px;
}
.pf-drawer-group { padding: 8px 12px; border-bottom: 0.5px solid var(--bg-fill, #eef2e8); }
.pf-drawer-group:last-child { border-bottom: none; }
.pf-drawer-group-title { font-size: 11px; color: var(--text-tertiary, #8a9384); margin-bottom: 6px; font-weight: 700; }
.pf-drawer-items { display: flex; flex-wrap: wrap; gap: 4px; }
.pf-drawer-item {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-fill, #eef2e8);
  color: var(--text-secondary, #55604f);
}
.pf-drawer-item.dim { opacity: .35; }

.p-tabbar { display: flex; border-top: 1px solid var(--bg-fill, #eef2e8); padding: 8px 0 10px; background: #fff; }
.p-tabbar-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.p-tabbar-item.dim { opacity: .35; }
.p-tabbar-icon { font-size: 14px; }
.p-tabbar-icon-img { width: 22px; height: 22px; object-fit: contain; }
.p-tabbar-text { font-size: 10px; }

/* ===== 右栏 ===== */
.rte-props {
  background: var(--mx-card);
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  padding: 12px 16px 16px;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}
.pp-title { font-size: var(--ds-fs-title, 16px); font-weight: 600; color: var(--mx-text); margin-bottom: 12px; }
.pp-sub { font-size: var(--ds-fs-label, 12px); color: var(--mx-muted); font-weight: 400; margin-left: 6px; }
.pp-list { display: grid; gap: 10px; margin-bottom: 12px; }
.pp-item {
  padding: 10px;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  background: var(--mx-soft);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pp-item-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--mx-text); }
.pp-item-ops { display: flex; gap: 6px; }
.pp-item-ops .el-icon { cursor: pointer; color: var(--mx-muted); }
.pp-item-ops .el-icon:hover { color: var(--mx-text); }
.pp-item-ops .el-icon.dim { opacity: .3; cursor: not-allowed; }
.pp-item-ops .el-icon.danger:hover { color: var(--el-color-danger); }
.pp-link { display: flex; gap: 6px; }
.pp-switches { display: flex; gap: 10px; align-items: center; }
.pp-drawer-row {
  padding: 8px;
  border: 1px solid var(--mx-border);
  border-radius: 8px;
  background: var(--mx-card);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pp-tabrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  background: var(--mx-soft);
}
.pp-tabpath { font-size: 10px; color: var(--mx-muted); font-family: var(--mx-font-mono); max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-colors { display: flex; gap: 14px; }
.pp-none { padding: 70px 10px; text-align: center; color: var(--mx-muted); }
.pp-none-title { margin-top: 12px; font-size: 14px; font-weight: 600; color: var(--mx-sub); }
.pp-none-sub { margin-top: 8px; font-size: 12.5px; line-height: 1.8; }

/* 主题面板 */
.tp-presets { display: flex; flex-wrap: wrap; gap: 8px; }
.tp-preset {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--mx-border);
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--mx-sub);
  transition: border-color .12s ease;
}
.tp-preset.active { border-color: var(--el-color-primary); color: var(--mx-text); font-weight: 600; }
.tp-dot { width: 14px; height: 14px; border-radius: 50%; }
.tp-color-row { display: flex; align-items: center; gap: 8px; width: 100%; }

@media (max-width: 1200px) {
  .rte-body { grid-template-columns: 1fr; }
  .rte-props { position: static; max-height: none; }
}
</style>

<!-- 画布归一修正（非 scoped）：运行时注入的真机 wxss 与生成组件回退样式都是
     `.rte-page .xxx` 两层 class 且注入时机更晚，这里用三层 class 确保最终生效 -->
<style>
/* 卡片间距归一：消除真机负 margin 咬合，各卡间距均匀、无重叠、无裁切 */
.rte-canvas .rte-page .image11-growth-card { margin: 0 12px 8px; }
.rte-canvas .rte-page .image11-stats-card { margin: 0 12px 10px; }
.rte-canvas .rte-page .image11-action-panel { margin: 0 12px 8px; }
/* 服务卡一行两张：注入的真机 wxss `flex:1` 会把 N 张卡等分压窄，这里盖回 wrap 布局 */
.rte-canvas .rte-page .image11-service-card { flex: 1 1 calc(50% - 4px); }
/* 真机入场动画（translateY + backwards + delay）在画布会造成瞬态错位/重叠，画布禁用 */
.rte-canvas .rte-page .image11-growth-card,
.rte-canvas .rte-page .image11-stats-card,
.rte-canvas .rte-page .image11-action-panel,
.rte-canvas .rte-page .image11-service-card,
.rte-canvas .rte-page .image11-feature,
.rte-canvas .rte-page .image11-feature-grid {
  animation: none;
}
</style>

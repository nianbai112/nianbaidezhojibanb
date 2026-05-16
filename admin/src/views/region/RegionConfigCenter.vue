<template>
  <div class="page-shell region-page">
    <GlassPageHeader title="区域配置中心" subtitle="配置区域信息、页面布局、业务规则，保存后小程序端实时生效">
      <template #actions>
        <el-button :loading="loadingRegions" @click="loadRegions(true)">刷新</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="saveRegion">保存配置</el-button>
      </template>
    </GlassPageHeader>

    <!-- 区域驾驶舱 -->
    <RegionHeroPanel
      v-model:selectedId="selectedId"
      :logo="form.logo"
      :name="form.name"
      :is-open="form.isOpen"
      :is-hot="form.isHot"
      :address="locationAddress"
      :completion="completionPercent"
      :last-updated="lastUpdated"
      :regions="regions"
      :saving="saving"
      :refreshing="loadingRegions"
      @select-region="selectRegion"
      @create="openCreateDialog"
      @refresh="loadRegions(true)"
      @save="saveRegion"
      @preview="showPreview = true"
      @batch="showBatchOps = true"
    />

    <el-tabs v-model="activeTab" class="quiet-tabs">
      <!-- 1. 基础档案 -->
      <el-tab-pane label="基础档案" name="basic">
        <div class="section-card glass-card">
          <div class="section-head"><div class="card-title">基础信息</div></div>
          <el-form label-position="top">
            <div class="form-grid two relaxed">
              <el-form-item label="区域名称" required><el-input v-model="form.name" placeholder="如：东校区" /></el-form-item>
              <el-form-item label="区域编码"><el-input v-model="form.code" placeholder="自动生成或手动输入" /></el-form-item>
              <el-form-item label="区域类型">
                <el-select v-model="form.regionType" style="width:100%">
                  <el-option label="校园" value="campus" />
                  <el-option label="社区" value="community" />
                  <el-option label="其他" value="other" />
                </el-select>
              </el-form-item>
              <el-form-item label="运营状态">
                <el-switch v-model="form.isOpen" active-text="开放" inactive-text="关闭" />
              </el-form-item>
              <el-form-item label="热门区域"><el-switch v-model="form.isHot" active-text="是" inactive-text="否" /></el-form-item>
              <el-form-item label="封面展示模式">
                <el-radio-group v-model="form.regionCoverMode">
                  <el-radio value="cover">封面图</el-radio>
                  <el-radio value="popup">弹窗</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="区域描述" class="span-2">
                <el-input v-model="form.description" type="textarea" :rows="3" placeholder="区域简介，展示在小程序区域详情页" />
              </el-form-item>
            </div>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 2. 视觉装修 -->
      <el-tab-pane label="视觉装修" name="assets">
        <RegionAssetEditor
          v-model:logo="form.logo"
          v-model:coverImage="form.coverImage"
          v-model:carouselItems="carouselItems"
        />
      </el-tab-pane>

      <!-- 3. 地图与服务范围 -->
      <el-tab-pane label="地图与服务范围" name="location">
        <RegionMapEditor
          v-model:latitude="form.latitude"
          v-model:longitude="form.longitude"
          v-model:address="locationAddress"
          v-model:serviceRadius="form.serviceRadius"
          v-model:distanceLimit="form.distanceLimit"
        />
      </el-tab-pane>

      <!-- 4. 业务开关 -->
      <el-tab-pane label="业务开关" name="switches">
        <RegionBusinessSwitches
          v-model:showHotList="form.showHotList"
          v-model:isForceGuidance="form.isForceGuidance"
          v-model:privateMessageEnabled="form.privateMessageEnabled"
          v-model:contactsRequireStudentAuth="form.contactsRequireStudentAuth"
          v-model:onlyStudentAuthUsers="form.onlyStudentAuthUsers"
          v-model:groupChatEnabled="form.groupChatEnabled"
          v-model:enableQrcodeFilter="form.enableQrcodeFilter"
          v-model:hotFeaturedDisplay="form.hotFeaturedDisplay"
        />
      </el-tab-pane>

      <!-- 5. 财务规则 -->
      <el-tab-pane label="财务规则" name="finance">
        <RegionFinanceEditor
          v-model:balance="form.balance"
          v-model:minWithdraw="form.minWithdraw"
          v-model:maxWithdraw="form.maxWithdraw"
          v-model:withdrawFee="form.withdrawFee"
          v-model:withdrawRate="form.withdrawRate"
          v-model:commissionRate="form.commissionRate"
          v-model:selfUnbanFee="form.selfUnbanFee"
        />
      </el-tab-pane>

      <!-- 6. 首页频道 -->
      <el-tab-pane label="首页频道" name="home">
        <div class="section-card glass-card">
          <div class="section-head"><div class="card-title">页面布局模式</div></div>
          <el-form label-position="top">
            <div class="form-grid three relaxed">
              <el-form-item label="首页导航栏布局">
                <el-select v-model="form.homeNavLayout" style="width:100%">
                  <el-option v-for="n in 9" :key="n" :label="`布局 ${n}`" :value="n" />
                </el-select>
                <div class="form-tip">控制小程序首页顶部导航栏的样式。</div>
              </el-form-item>
              <el-form-item label="标题文字"><el-input v-model="navConfig.title.text" placeholder="灵萌圈友" /></el-form-item>
              <el-form-item label="标题颜色"><el-color-picker v-model="navConfig.title.color" /></el-form-item>
              <el-form-item label="字号"><el-input-number v-model="navConfig.title.fontSize" :min="12" :max="24" /></el-form-item>
              <el-form-item label="显示标题"><el-switch v-model="navConfig.title.show" /></el-form-item>
              <el-form-item label="显示布局切换按钮"><el-switch v-model="navConfig.showLayoutSwitch" /></el-form-item>
            </div>
          </el-form>
        </div>
        <RegionHomeTabsEditor
          v-model:tabs="regionTabsList"
        />
        <div class="section-card glass-card" style="margin-top:24px">
          <div class="section-head">
            <div class="card-title">首页榜单配置</div>
            <el-button size="small" @click="resetLeaderboard">恢复默认</el-button>
          </div>
          <div class="switch-item" style="margin-bottom:16px">
            <div><b>启用首页榜单</b><p>在小程序首页展示榜单模块</p></div>
            <el-switch v-model="leaderboard.enabled" />
          </div>
          <div class="sortable-list">
            <div v-for="(item, idx) in leaderboard.items" :key="item.type" class="sortable-item">
              <div class="sortable-grip">☰</div>
              <div class="sortable-content">
                <el-input v-model="item.title" size="small" style="width:160px" />
                <span class="muted">{{ item.type }}</span>
              </div>
              <el-switch v-model="item.enabled" size="small" />
              <div class="sortable-actions">
                <el-button size="small" circle :disabled="idx === 0" @click="moveItem(leaderboard.items, idx, -1)"><el-icon><Top /></el-icon></el-button>
                <el-button size="small" circle :disabled="idx === leaderboard.items.length - 1" @click="moveItem(leaderboard.items, idx, 1)"><el-icon><Bottom /></el-icon></el-button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 7. 消息页 -->
      <el-tab-pane label="消息页" name="message">
        <div class="section-card glass-card">
          <div class="section-head"><div class="card-title">消息页布局</div></div>
          <el-form label-position="top">
            <div class="form-grid two relaxed">
              <el-form-item label="消息页布局">
                <el-select v-model="form.messagePageLayout" style="width:100%">
                  <el-option label="默认布局" value="default" />
                  <el-option label="小红书风格" value="xiaohongshu" />
                </el-select>
              </el-form-item>
            </div>
          </el-form>
        </div>
        <RegionMessageEditor
          v-model:likeIcon="msgIcons.like"
          v-model:followIcon="msgIcons.follow"
          v-model:commentIcon="msgIcons.comment"
          v-model:messageIcon="msgIcons.message"
          v-model:navCards="msgNavCards"
        />
      </el-tab-pane>

      <!-- 8. 我的页 -->
      <el-tab-pane label="我的页" name="profile">
        <div class="section-card glass-card">
          <div class="section-head"><div class="card-title">我的页面布局</div></div>
          <el-form label-position="top">
            <div class="form-grid two relaxed">
              <el-form-item label="我的页面布局">
                <el-select v-model="form.profilePageLayout" style="width:100%">
                  <el-option label="默认布局" value="default" />
                  <el-option label="小红书风格" value="xiaohongshu" />
                </el-select>
              </el-form-item>
            </div>
          </el-form>
        </div>
        <RegionProfileEditor
          v-model:items="profileItems"
        />
      </el-tab-pane>

      <!-- 9. 分享卡片 -->
      <el-tab-pane label="分享卡片" name="share">
        <div class="section-grid">
          <div class="section-card glass-card">
            <div class="section-head">
              <div class="card-title">分享卡片配置</div>
              <el-switch v-model="shareConfig.enabled" active-text="启用" inactive-text="禁用" />
            </div>
            <el-form label-position="top">
              <div class="form-grid two relaxed">
                <el-form-item label="分享标题" required>
                  <el-input v-model="shareConfig.title" placeholder="如：灵萌圈友 - 校园生活圈" maxlength="30" show-word-limit />
                  <div class="form-tip">分享给朋友时显示的标题</div>
                </el-form-item>
                <el-form-item label="分享类型">
                  <el-select v-model="shareConfig.shareType" style="width:100%">
                    <el-option label="小程序页面" value="page" />
                    <el-option label="自定义链接" value="link" />
                  </el-select>
                </el-form-item>
                <el-form-item label="分享路径" class="span-2">
                  <el-input v-model="shareConfig.path" placeholder="如：/pages/index/index?regionId=xxx" />
                  <div class="form-tip">用户点击分享卡片后跳转的页面路径，可带参数</div>
                </el-form-item>
                <el-form-item label="分享图片" class="span-2">
                  <ImageUploadBox v-model="shareConfig.imageUrl" scene="share-image" shape="wide" tip="建议尺寸 5:4，如 500x400 像素" :max-size="2" />
                </el-form-item>
                <el-form-item label="分享描述" class="span-2">
                  <el-input v-model="shareConfig.description" type="textarea" :rows="3" placeholder="分享给朋友时显示的描述文案" maxlength="50" show-word-limit />
                </el-form-item>
              </div>
            </el-form>
          </div>
          <div class="section-card glass-card">
            <div class="section-head">
              <div class="card-title">朋友圈分享配置</div>
              <el-switch v-model="shareConfig.momentsEnabled" active-text="启用" inactive-text="禁用" />
            </div>
            <el-form label-position="top">
              <div class="form-grid two relaxed">
                <el-form-item label="朋友圈标题" class="span-2">
                  <el-input v-model="shareConfig.momentsTitle" placeholder="如：校园生活就在这里" maxlength="30" show-word-limit />
                  <div class="form-tip">发朋友圈时显示的标题</div>
                </el-form-item>
                <el-form-item label="朋友圈图片" class="span-2">
                  <ImageUploadBox v-model="shareConfig.momentsImageUrl" scene="moments-image" shape="wide" tip="建议尺寸 1:1，如 500x500 像素" :max-size="2" />
                </el-form-item>
                <el-form-item label="朋友圈描述" class="span-2">
                  <el-input v-model="shareConfig.momentsDescription" type="textarea" :rows="3" placeholder="朋友圈分享的描述文案" maxlength="50" show-word-limit />
                </el-form-item>
              </div>
            </el-form>
          </div>
        </div>
      </el-tab-pane>

      <!-- 10. 底部导航 -->
      <el-tab-pane label="底部导航" name="tabbar">
        <div class="section-card glass-card">
          <div class="section-head">
            <div class="card-title">底部导航配置</div>
            <el-button size="small" @click="openTabbarDrawer">编辑配置</el-button>
          </div>
          <div class="tabbar-preview">
            <div class="tabbar-phone">
              <div class="tabbar-bar">
                <div v-for="tab in tabbarList" :key="tab.id" class="tabbar-item" :class="{ disabled: !tab.enabled }">
                  <div class="tabbar-icon" :style="{ color: tab.enabled ? (tab.selectedColor || '#1677ff') : '#ccc' }">
                    <el-icon :size="16"><component :is="getTabIcon(tab.id)" /></el-icon>
                  </div>
                  <span class="tabbar-text">{{ tab.name }}</span>
                </div>
              </div>
            </div>
            <div class="tabbar-summary">
              {{ tabbarList.length }} 个导航项，{{ tabbarList.filter(t => t.enabled).length }} 个启用
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 11. 上线检查 -->
      <el-tab-pane label="上线检查" name="checklist">
        <RegionLaunchChecklist
          :region-name="form.name"
          :logo="form.logo"
          :cover-image="form.coverImage"
          :latitude="form.latitude"
          :longitude="form.longitude"
          :service-radius="form.serviceRadius"
          :home-tabs="regionTabsList"
          :tabbar-list="tabbarList"
          :share-title="shareConfig.title"
          :share-image="shareConfig.imageUrl"
          :profile-items="profileItems"
          :home-layout="form.homeNavLayout"
          :message-layout="form.messagePageLayout"
          :profile-layout="form.profilePageLayout"
          @jump="handleJumpToTab"
        />
      </el-tab-pane>
    </el-tabs>

    <!-- 预览抽屉 -->
    <RegionPreviewDrawer
      v-model="showPreview"
      :home-config="homeConfig"
      :message-cards="msgNavCards"
      :profile-items="profileItems"
      :tabbar-config="tabbarConfig"
      :tabbar-list="tabbarList"
      :share-config="shareConfig"
      :region-name="form.name"
    />

    <!-- 批量操作抽屉 -->
    <RegionBatchOperations
      v-model="showBatchOps"
      @success="handleBatchSuccess"
    />

    <!-- 底部导航编辑抽屉 -->
    <el-drawer v-model="tabbarDrawerVisible" title="编辑底部导航" size="780px" direction="rtl">
      <template v-if="selectedId">
        <div class="editor-layout">
          <div class="editor-form">
            <div class="editor-section">
              <div class="editor-section-title">全局样式</div>
              <div class="style-row">
                <div class="style-field">
                  <label>默认文字颜色</label>
                  <el-color-picker v-model="tabbarConfig.color" />
                </div>
                <div class="style-field">
                  <label>选中文字颜色</label>
                  <el-color-picker v-model="tabbarConfig.selectedColor" />
                </div>
                <div class="style-field">
                  <label>背景颜色</label>
                  <el-color-picker v-model="tabbarConfig.backgroundColor" />
                </div>
              </div>
            </div>
            <div class="editor-section">
              <div class="editor-section-title">
                导航项（最多 5 个）
                <el-button size="small" type="primary" plain @click="addTabbarItem" :disabled="tabbarList.length >= 5">添加</el-button>
              </div>
              <div class="tab-list">
                <div v-for="(tab, idx) in tabbarList" :key="tab.id" class="tab-editor-item">
                  <div class="tab-editor-header">
                    <div class="tab-drag">☰</div>
                    <el-switch v-model="tab.enabled" size="small" />
                    <span class="tab-label">{{ tab.name || '未命名' }}</span>
                    <div class="tab-actions">
                      <el-button size="small" circle :disabled="idx === 0" @click="moveTabbarItem(idx, -1)"><el-icon><Top /></el-icon></el-button>
                      <el-button size="small" circle :disabled="idx === tabbarList.length - 1" @click="moveTabbarItem(idx, 1)"><el-icon><Bottom /></el-icon></el-button>
                      <el-button size="small" circle type="danger" @click="tabbarList.splice(idx, 1)"><el-icon><Delete /></el-icon></el-button>
                    </div>
                  </div>
                  <div class="tab-editor-body">
                    <div class="field-row">
                      <div class="field-item">
                        <label>名称</label>
                        <el-input v-model="tab.name" size="small" placeholder="首页" />
                      </div>
                      <div class="field-item">
                        <label>ID</label>
                        <el-input v-model="tab.id" size="small" placeholder="home" />
                      </div>
                    </div>
                    <div class="field-row">
                      <div class="field-item">
                        <label>页面路径 pagePath</label>
                        <el-input v-model="tab.pagePath" size="small" placeholder="pages/tabbar/index/index" />
                      </div>
                      <div class="field-item">
                        <label>动作 action</label>
                        <el-input v-model="tab.action" size="small" placeholder="publish（发布按钮用）" />
                      </div>
                    </div>
                    <div class="field-row">
                      <div class="field-item">
                        <label>未选中图标 iconPath</label>
                        <el-input v-model="tab.iconPath" size="small" placeholder="/static/tabbar/home.png" />
                      </div>
                      <div class="field-item">
                        <label>选中图标 selectedIconPath</label>
                        <el-input v-model="tab.selectedIconPath" size="small" placeholder="/static/tabbar/home-active.png" />
                      </div>
                    </div>
                    <div class="field-row">
                      <div class="field-item small">
                        <label>图标宽度</label>
                        <el-input-number v-model="tab.width" :min="16" :max="64" size="small" />
                      </div>
                      <div class="field-item small">
                        <label>图标高度</label>
                        <el-input-number v-model="tab.height" :min="16" :max="64" size="small" />
                      </div>
                      <div class="field-item small">
                        <label>字号</label>
                        <el-input-number v-model="tab.fontSize" :min="8" :max="20" size="small" />
                      </div>
                    </div>
                    <div class="field-row">
                      <div class="field-item small">
                        <label>普通颜色</label>
                        <el-color-picker v-model="tab.color" />
                      </div>
                      <div class="field-item small">
                        <label>选中颜色</label>
                        <el-color-picker v-model="tab.selectedColor" />
                      </div>
                      <div class="field-item toggle">
                        <label>头像模式</label>
                        <el-switch v-model="tab.avatarMode" size="small" />
                      </div>
                      <div class="field-item toggle">
                        <label>隐藏文字</label>
                        <el-switch v-model="tab.hideText" size="small" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="!tabbarList.length" class="empty-tabs">
                暂无导航项，点击"添加"或"恢复默认"
              </div>
            </div>
            <div class="editor-actions">
              <el-button @click="resetTabbar">恢复默认</el-button>
              <el-button type="primary" :loading="savingTabbar" @click="saveTabbar">保存配置</el-button>
            </div>
          </div>
          <div class="editor-preview">
            <div class="preview-title">实时预览</div>
            <div class="preview-phone">
              <div class="preview-content">
                <div class="preview-placeholder">小程序内容区域</div>
              </div>
              <div class="preview-tabbar" :style="{ background: tabbarConfig.backgroundColor || '#ffffff' }">
                <div v-for="tab in tabbarList" :key="tab.id" class="preview-tab-item" :class="{ disabled: !tab.enabled }">
                  <div class="preview-tab-icon" :style="{ color: tab.enabled ? (tab.selectedColor || tabbarConfig.selectedColor || '#1677ff') : '#ccc' }">
                    <el-icon :size="20"><component :is="getTabIcon(tab.id)" /></el-icon>
                  </div>
                  <span v-if="!tab.hideText" class="preview-tab-text" :style="{ color: tab.enabled ? (tab.color || tabbarConfig.color || '#8A8A8A') : '#ccc', fontSize: (tab.fontSize || 12) + 'px' }">
                    {{ tab.name }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </el-drawer>

    <!-- 新增区域对话框 -->
    <el-dialog v-model="createVisible" title="新增区域" width="520px">
      <el-form :model="createForm" label-position="top">
        <el-form-item label="区域名称" required>
          <el-input v-model="createForm.name" placeholder="如：南校区" />
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
        <div class="create-next glass-card">
          <div>
            <b>创建后自动进入装修流程</b>
            <p>自动选中新区域，初始化首页频道、底部导航、我的页和分享配置，不再让你来回切页面。</p>
          </div>
          <el-switch v-model="createForm.enterDecoration" />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建并配置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { Check, Delete, Top, Bottom, HomeFilled, ChatDotRound, User, Position, Menu } from '@element-plus/icons-vue'
import { fetchRegions, fetchRegionDetail, createRegion, fetchRegionTabbar, saveRegionTabbar, fetchRegionShareSetting, saveRegionShareSetting } from '@/api/admin'

// 导入子组件
import RegionHeroPanel from './components/RegionHeroPanel.vue'
import RegionPreviewDrawer from './components/RegionPreviewDrawer.vue'
import RegionAssetEditor from './components/RegionAssetEditor.vue'
import RegionMapEditor from './components/RegionMapEditor.vue'
import RegionBusinessSwitches from './components/RegionBusinessSwitches.vue'
import RegionFinanceEditor from './components/RegionFinanceEditor.vue'
import RegionHomeTabsEditor from './components/RegionHomeTabsEditor.vue'
import RegionMessageEditor from './components/RegionMessageEditor.vue'
import RegionProfileEditor from './components/RegionProfileEditor.vue'
import RegionLaunchChecklist from './components/RegionLaunchChecklist.vue'
import RegionBatchOperations from './components/RegionBatchOperations.vue'

// ---- 状态 ----
const route = useRoute()
const activeTab = ref('basic')
const regions = ref<any[]>([])
const selectedId = ref<string | number>('')
const saving = ref(false)
const creating = ref(false)
const loadingRegions = ref(false)
const createVisible = ref(false)
const showPreview = ref(false)
const showBatchOps = ref(false)
const tabbarDrawerVisible = ref(false)
const savingTabbar = ref(false)
const locationAddress = ref('')
const lastUpdated = ref('')

interface CarouselItem {
  image: string
  title: string
  linkType: string
  linkValue: string
  sortOrder: number
  enabled: boolean
}

const carouselItems = ref<CarouselItem[]>([])

// ---- 默认配置 ----
const DEFAULT_TABS = [
  { id: '0', name: '笔记', enabled: true },
  { id: '1', name: '外卖', enabled: true },
  { id: '2', name: '二手', enabled: true },
  { id: '3', name: '活动', enabled: true },
  { id: '4', name: '评分', enabled: true },
  { id: '5', name: '打卡地点', enabled: true }
]
const DEFAULT_LEADERBOARD = {
  enabled: true,
  items: [
    { type: 'note', title: '笔记榜单', enabled: true, sortOrder: 0 },
    { type: 'user', title: '用户榜单', enabled: true, sortOrder: 1 },
    { type: 'topic', title: '话题榜单', enabled: true, sortOrder: 2 }
  ]
}
const DEFAULT_MSG_NAV_CARDS = [
  { id: 'notice', title: '系统通知', subtitle: '平台消息与审核通知', icon: 'notice', path: '/pages/tabbar/news/news', enabled: true, sortOrder: 0 }
]
const DEFAULT_PROFILE_ITEMS = [
  { id: 'orders', title: '我的订单', description: '查看订单、配送和售后', icon: '', main_image: '/static/logo.jpg', path: '/pagesA/order/order', query: '', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 0, requireLogin: true },
  { id: 'wallet', title: '我的钱包', description: '余额、提现和交易流水', icon: '', main_image: '/static/logo.jpg', path: '/pagesA/withdraw/withdraw', query: '', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 1, requireLogin: true },
  { id: 'share', title: '分享有礼', description: '邀请同学加入本地生活圈', icon: '', main_image: '/static/logo.jpg', path: '/pagesA/news/SharingCourtesy/SharingCourtesy', query: '', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 2, requireLogin: true },
  { id: 'merchant', title: '商家中心', description: '商家入驻与店铺管理', icon: '', main_image: '/static/logo.jpg', path: '/pagesA/MerchantManagement/managerial', query: '', type: 'internal_jump', navigation_permission: 'merchant', enabled: true, sortOrder: 3, requireLogin: true },
  { id: 'settings', title: '账号设置', description: '资料、隐私和系统设置', icon: '', main_image: '/static/logo.jpg', path: '/pages/auth/settings/settings', query: '', type: 'internal_jump', navigation_permission: 'unlimited', enabled: true, sortOrder: 4, requireLogin: false }
]
const DEFAULT_TABBAR = [
  { id: 'home', name: '首页', pagePath: 'pages/tabbar/index/index', action: '', iconPath: '/static/tabbar/home.png', selectedIconPath: '/static/tabbar/home-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 0, navType: 'bottom' },
  { id: 'circle', name: '圈子', pagePath: 'pages/tabbar/containers/containers', action: '', iconPath: '/static/tabbar/circle.png', selectedIconPath: '/static/tabbar/circle-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 1, navType: 'bottom' },
  { id: 'publish', name: '发布', pagePath: '', action: 'publish', iconPath: '/static/tabbar/publish.png', selectedIconPath: '/static/tabbar/publish-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 2, navType: 'bottom' },
  { id: 'message', name: '消息', pagePath: 'pages/tabbar/news/news', action: '', iconPath: '/static/tabbar/message.png', selectedIconPath: '/static/tabbar/message-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 3, navType: 'bottom' },
  { id: 'mine', name: '我的', pagePath: 'pages/tabbar/auth/PersonalHomepage', action: '', iconPath: '/static/tabbar/mine.png', selectedIconPath: '/static/tabbar/mine-active.png', color: '#8A8A8A', selectedColor: '#1677ff', width: 24, height: 24, fontSize: 12, avatarMode: false, hideText: false, enabled: true, sortOrder: 4, navType: 'bottom' }
]

// ---- 表单数据 ----
const form = reactive({
  id: '',
  name: '',
  code: '',
  description: '',
  logo: '',
  coverImage: '',
  regionType: 'other',
  isOpen: true,
  isHot: false,
  regionCoverMode: 'cover',
  carouselImages: [] as string[],
  latitude: null as number | null,
  longitude: null as number | null,
  serviceRadius: 5000,
  distanceLimit: 0,
  balance: 0,
  minWithdraw: 0,
  maxWithdraw: 0,
  withdrawFee: 0,
  withdrawRate: 0,
  commissionRate: 0,
  selfUnbanFee: 0,
  showHotList: false,
  hotFeaturedDisplay: 'none',
  isForceGuidance: false,
  privateMessageEnabled: true,
  contactsRequireStudentAuth: false,
  onlyStudentAuthUsers: false,
  groupChatEnabled: false,
  enableQrcodeFilter: false,
  homeNavLayout: 1,
  messagePageLayout: 'default',
  profilePageLayout: 'default'
})

const navConfig = reactive({
  title: { show: true, text: '灵萌圈友', color: '#222222', fontSize: 15, fontWeight: '600' },
  showLayoutSwitch: true
})

const leaderboard = reactive(JSON.parse(JSON.stringify(DEFAULT_LEADERBOARD)))
const msgIcons = reactive({ like: '', follow: '', comment: '', message: '' })
const msgNavCards = ref<any[]>(JSON.parse(JSON.stringify(DEFAULT_MSG_NAV_CARDS)))
const regionTabsList = ref<any[]>(JSON.parse(JSON.stringify(DEFAULT_TABS)))
const profileItems = ref<any[]>(JSON.parse(JSON.stringify(DEFAULT_PROFILE_ITEMS)))
const tabbarList = ref<any[]>(JSON.parse(JSON.stringify(DEFAULT_TABBAR)))
const tabbarConfig = reactive({
  color: '#8A8A8A',
  selectedColor: '#1677ff',
  backgroundColor: '#ffffff',
  borderStyle: 'black'
})

const shareConfig = reactive({
  enabled: true,
  title: '',
  shareType: 'page',
  path: '',
  imageUrl: '',
  description: '',
  momentsEnabled: true,
  momentsTitle: '',
  momentsImageUrl: '',
  momentsDescription: ''
})

const createForm = reactive({ name: '', code: '', regionType: 'campus', enterDecoration: true })

// ---- 计算属性 ----
const completionPercent = computed(() => {
  let total = 0
  let passed = 0

  // 基础检查项
  if (form.name?.trim()) passed++
  total++
  if (form.logo) passed++
  total++
  if (form.coverImage) passed++
  total++
  if (form.latitude && form.longitude) passed++
  total++
  if (form.serviceRadius > 0) passed++
  total++
  if (regionTabsList.value.filter(t => t.enabled).length >= 2) passed++
  total++
  if (tabbarList.value.length >= 3 && tabbarList.value.length <= 5) passed++
  total++

  return Math.round((passed / total) * 100)
})

const homeConfig = computed(() => ({
  title: navConfig.title.text,
  navbarColor: '#fff',
  banner: carouselItems.value[0]?.image,
  searchBar: true,
  gridMenu: true
}))

// ---- 工具函数 ----
function moveItem(arr: any[], idx: number, dir: number) {
  const target = idx + dir
  if (target < 0 || target >= arr.length) return
  const tmp = arr[idx]
  arr[idx] = arr[target]
  arr[target] = tmp
  // 触发响应式
  if (Array.isArray(arr)) arr.splice(0, 0, ...arr.splice(0, 0))
}

function getTabIcon(id: string) {
  const map: Record<string, any> = { home: HomeFilled, circle: Menu, publish: Position, message: ChatDotRound, mine: User }
  return map[id] || Menu
}

function handleJumpToTab(tab: string) {
  activeTab.value = tab
}

function handleBatchSuccess() {
  loadRegions(true)
}

// ---- 底部导航相关 ----
function openTabbarDrawer() {
  tabbarDrawerVisible.value = true
}

function addTabbarItem() {
  if (tabbarList.value.length >= 5) return
  tabbarList.value.push({
    id: `tab_${Date.now()}`,
    name: '新导航',
    pagePath: '',
    action: '',
    iconPath: '',
    selectedIconPath: '',
    color: tabbarConfig.color,
    selectedColor: tabbarConfig.selectedColor,
    width: 24,
    height: 24,
    fontSize: 12,
    avatarMode: false,
    hideText: false,
    enabled: true,
    sortOrder: tabbarList.value.length,
    navType: 'bottom'
  })
}

function moveTabbarItem(idx: number, dir: number) {
  const target = idx + dir
  if (target < 0 || target >= tabbarList.value.length) return
  const tmp = tabbarList.value[idx]
  tabbarList.value[idx] = tabbarList.value[target]
  tabbarList.value[target] = tmp
}

function resetTabbar() {
  tabbarList.value = JSON.parse(JSON.stringify(DEFAULT_TABBAR))
  tabbarConfig.color = '#8A8A8A'
  tabbarConfig.selectedColor = '#1677ff'
  tabbarConfig.backgroundColor = '#ffffff'
  tabbarConfig.borderStyle = 'black'
}

async function saveTabbar() {
  if (!selectedId.value) return
  savingTabbar.value = true
  try {
    const config = {
      color: tabbarConfig.color,
      selectedColor: tabbarConfig.selectedColor,
      backgroundColor: tabbarConfig.backgroundColor,
      borderStyle: tabbarConfig.borderStyle,
      list: JSON.parse(JSON.stringify(tabbarList.value))
    }
    await saveRegionTabbar(selectedId.value, config)
    ElMessage.success('底部导航配置已保存')
    tabbarDrawerVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingTabbar.value = false
  }
}

// ---- 其他工具函数 ----
function resetLeaderboard() {
  Object.assign(leaderboard, JSON.parse(JSON.stringify(DEFAULT_LEADERBOARD)))
}

function cleanJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null))
}

// ---- 数据加载 ----
function fillForm(row: any) {
  form.id = row.id || ''
  form.name = row.name || ''
  form.code = row.code || ''
  form.description = row.description || ''
  form.logo = row.logo || ''
  form.coverImage = row.coverImage || row.cover || ''
  form.regionType = row.regionType || 'other'
  form.isOpen = row.isOpen !== undefined ? row.isOpen : (row.status === 1 || row.status === true)
  form.isHot = row.isHot ?? false
  form.regionCoverMode = row.regionCoverMode || 'cover'
  if (Array.isArray(row.carouselImages)) {
    carouselItems.value = row.carouselImages.map((item: any, idx: number) => {
      if (typeof item === 'string') {
        return { image: item, title: '', linkType: 'none', linkValue: '', sortOrder: idx, enabled: true }
      }
      return { ...item, sortOrder: item.sortOrder ?? idx }
    })
  } else {
    carouselItems.value = []
  }
  form.latitude = row.latitude ?? null
  form.longitude = row.longitude ?? null
  form.serviceRadius = row.serviceRadius ?? row.radius ?? 5000
  locationAddress.value = row.address || ''
  form.distanceLimit = row.distanceLimit ?? 0
  form.balance = row.balance ?? 0
  form.minWithdraw = row.minWithdraw ?? 0
  form.maxWithdraw = row.maxWithdraw ?? 0
  form.withdrawFee = row.withdrawFee ?? 0
  form.withdrawRate = row.withdrawRate ?? 0
  form.commissionRate = row.commissionRate ?? 0
  form.selfUnbanFee = row.selfUnbanFee ?? 0
  form.showHotList = row.showHotList ?? false
  form.hotFeaturedDisplay = row.hotFeaturedDisplay || 'none'
  form.isForceGuidance = row.isForceGuidance ?? false
  form.privateMessageEnabled = row.privateMessageEnabled ?? true
  form.contactsRequireStudentAuth = row.contactsRequireStudentAuth ?? false
  form.onlyStudentAuthUsers = row.onlyStudentAuthUsers ?? false
  form.groupChatEnabled = row.groupChatEnabled ?? false
  form.enableQrcodeFilter = row.enableQrcodeFilter ?? false
  form.homeNavLayout = row.homeNavLayout ?? 1
  form.messagePageLayout = row.messagePageLayout || 'default'
  form.profilePageLayout = row.profilePageLayout || 'default'

  // JSON 字段
  if (row.homeNavLayoutConfig) {
    Object.assign(navConfig, row.homeNavLayoutConfig)
    if (!navConfig.title) navConfig.title = { show: true, text: '灵萌圈友', color: '#222222', fontSize: 15, fontWeight: '600' }
  }
  if (row.homeLeaderboard) {
    Object.assign(leaderboard, row.homeLeaderboard)
    if (!leaderboard.items) leaderboard.items = []
  }
  if (row.messageIcons) {
    Object.assign(msgIcons, row.messageIcons)
  }
  if (row.messageNavigation?.cards) {
    msgNavCards.value = JSON.parse(JSON.stringify(row.messageNavigation.cards))
  }
  if (Array.isArray(row.regionTabs)) {
    regionTabsList.value = JSON.parse(JSON.stringify(row.regionTabs))
  }
  if (Array.isArray(row.profileLayoutItems)) {
    profileItems.value = JSON.parse(JSON.stringify(row.profileLayoutItems))
  }

  lastUpdated.value = row.updatedAt || row.createdAt || ''
}

async function selectRegion(id: string | number) {
  try {
    const detail: any = await fetchRegionDetail(id)
    fillForm(detail)

    // 加载底部导航
    try {
      const tabbarData: any = await fetchRegionTabbar(id)
      if (tabbarData?.config) {
        tabbarConfig.color = tabbarData.config.color || '#8A8A8A'
        tabbarConfig.selectedColor = tabbarData.config.selectedColor || '#1677ff'
        tabbarConfig.backgroundColor = tabbarData.config.backgroundColor || '#ffffff'
        tabbarConfig.borderStyle = tabbarData.config.borderStyle || 'black'
        tabbarList.value = JSON.parse(JSON.stringify(tabbarData.config.list || DEFAULT_TABBAR))
      }
    } catch (e: any) {
      ElMessage.error(e?.message || '加载失败')
      tabbarList.value = JSON.parse(JSON.stringify(DEFAULT_TABBAR))
    }

    // 加载分享设置
    try {
      const shareData: any = await fetchRegionShareSetting(id)
      if (shareData) {
        shareConfig.enabled = shareData.isEnabled ?? true
        shareConfig.title = shareData.activityTitle || ''
        shareConfig.imageUrl = shareData.activityImage || ''
        try {
          const rules = typeof shareData.activityRules === 'string' ? JSON.parse(shareData.activityRules) : (shareData.activityRules || {})
          shareConfig.shareType = rules.shareType || 'page'
          shareConfig.path = rules.path || ''
          shareConfig.description = rules.description || ''
          shareConfig.momentsEnabled = rules.momentsEnabled ?? true
          shareConfig.momentsTitle = rules.momentsTitle || ''
          shareConfig.momentsImageUrl = rules.momentsImageUrl || ''
          shareConfig.momentsDescription = rules.momentsDescription || ''
        } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
      }
    } catch (e: any) { ElMessage.error(e?.message || '加载失败') }

  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
    const row = regions.value.find(r => r.id === id)
    if (row) fillForm(row)
  }
}

async function loadRegions(showSuccess = false) {
  loadingRegions.value = true
  try {
    regions.value = await fetchRegions()
    const preferredId = String(
      route.query.regionId ||
      localStorage.getItem('LM_SELECTED_REGION_ID') ||
      localStorage.getItem('selectedRegionId') ||
      ''
    )
    if (preferredId && regions.value.some(r => String(r.id) === preferredId)) {
      selectedId.value = preferredId
    } else if (!selectedId.value && regions.value.length) {
      selectedId.value = regions.value[0].id
    }
    if (selectedId.value) {
      await selectRegion(selectedId.value)
    }
    if (showSuccess) ElMessage.success('区域数据已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载区域失败')
  } finally {
    loadingRegions.value = false
  }
}

// ---- 保存 ----
async function saveRegion() {
  if (!form.id) {
    ElMessage.warning('请先选择区域')
    return
  }
  if (!form.name.trim()) {
    ElMessage.warning('区域名称不能为空')
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name,
      code: form.code,
      description: form.description,
      logo: form.logo,
      coverImage: form.coverImage,
      regionType: form.regionType,
      isOpen: form.isOpen,
      isHot: form.isHot,
      regionCoverMode: form.regionCoverMode,
      carouselImages: carouselItems.value,
      latitude: form.latitude,
      longitude: form.longitude,
      address: locationAddress.value,
      serviceRadius: form.serviceRadius,
      distanceLimit: form.distanceLimit,
      balance: form.balance,
      minWithdraw: form.minWithdraw,
      maxWithdraw: form.maxWithdraw,
      withdrawFee: form.withdrawFee,
      withdrawRate: form.withdrawRate,
      commissionRate: form.commissionRate,
      selfUnbanFee: form.selfUnbanFee,
      showHotList: form.showHotList,
      hotFeaturedDisplay: form.hotFeaturedDisplay,
      isForceGuidance: form.isForceGuidance,
      privateMessageEnabled: form.privateMessageEnabled,
      contactsRequireStudentAuth: form.contactsRequireStudentAuth,
      onlyStudentAuthUsers: form.onlyStudentAuthUsers,
      groupChatEnabled: form.groupChatEnabled,
      enableQrcodeFilter: form.enableQrcodeFilter,
      homeNavLayout: form.homeNavLayout,
      messagePageLayout: form.messagePageLayout,
      profilePageLayout: form.profilePageLayout,
      homeNavLayoutConfig: cleanJson({ ...navConfig, title: { ...navConfig.title } }),
      homeLeaderboard: cleanJson(leaderboard),
      messageIcons: cleanJson(msgIcons),
      messageNavigation: cleanJson({ cards: msgNavCards.value }),
      regionTabs: cleanJson(regionTabsList.value),
      profileLayoutItems: cleanJson(profileItems.value)
    }
    try {
      await saveRegionBaseConfig(form.id, payload)
    } catch (e: any) {
      throw new Error(`区域基础配置保存失败：${getErrorMessage(e)}`)
    }

    // 保存分享设置
    try {
      await saveRegionShareSetting(form.id, {
        isEnabled: shareConfig.enabled,
        activityTitle: shareConfig.title,
        activityImage: shareConfig.imageUrl,
        activityRules: JSON.stringify({
          shareType: shareConfig.shareType,
          path: shareConfig.path,
          description: shareConfig.description,
          momentsEnabled: shareConfig.momentsEnabled,
          momentsTitle: shareConfig.momentsTitle,
          momentsImageUrl: shareConfig.momentsImageUrl,
          momentsDescription: shareConfig.momentsDescription
        })
      })
    } catch (e: any) {
      console.error('保存区域分享设置失败', e)
      ElMessage.warning(`区域基础配置已保存，但分享设置保存失败：${getErrorMessage(e)}`)
    }

    ElMessage.success('区域配置已保存，小程序端将在下次加载时生效')
    lastUpdated.value = new Date().toISOString()
    await loadRegions()
  } catch (e: any) {
    ElMessage.error(getErrorMessage(e))
  } finally {
    saving.value = false
  }
}

function getErrorMessage(e: any) {
  const raw =
    e?.response?.data?.message ||
    e?.response?.data?.error ||
    e?.data?.message ||
    e?.message ||
    e?.msg ||
    '保存失败'
  return Array.isArray(raw) ? raw.join('；') : String(raw)
}

async function saveRegionBaseConfig(id: string | number, payload: Record<string, any>) {
  const token = localStorage.getItem('LM_ADMIN_TOKEN') || localStorage.getItem('admin_token')
  const response = await fetch(`/api/admin/regions/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  })

  let body: any = null
  const text = await response.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch (e: any) {
      body = { message: text }
    }
  }

  const numericCode =
    body &&
    typeof body === 'object' &&
    'code' in body &&
    (typeof body.code === 'number' || /^\d+$/.test(String(body.code)))
  if (
    !response.ok ||
    (body && typeof body === 'object' && body.success === false) ||
    (numericCode && ![0, 200].includes(Number(body.code)))
  ) {
    const message = body?.message || body?.error || response.statusText || '保存失败'
    throw new Error(`HTTP ${response.status} ${message}`)
  }

  return body?.data ?? body
}

// ---- 新增区域 ----
function openCreateDialog() {
  createForm.name = ''
  createForm.code = ''
  createForm.regionType = 'campus'
  createForm.enterDecoration = true
  createVisible.value = true
}

async function submitCreate() {
  if (!createForm.name.trim()) {
    ElMessage.warning('请输入区域名称')
    return
  }
  creating.value = true
  try {
    const result: any = await createRegion({
      name: createForm.name,
      code: createForm.code || undefined,
      regionType: createForm.regionType,
      regionTabs: DEFAULT_TABS,
      homeLeaderboard: DEFAULT_LEADERBOARD,
      messageNavigation: { cards: DEFAULT_MSG_NAV_CARDS },
      profileLayoutItems: DEFAULT_PROFILE_ITEMS
    })
    ElMessage.success('区域创建成功')
    createVisible.value = false
    await loadRegions()
    const createdId = result?.id || result?.data?.id || result?.region?.id || result?.data?.region?.id
    if (createdId) {
      selectedId.value = createdId
      await selectRegion(createdId)
      if (createForm.enterDecoration) {
        resetTabbar()
        activeTab.value = 'assets'
        showPreview.value = true
        try {
          await saveTabbar()
        } catch {
          // saveTabbar already displays the error; keep creation flow usable.
        }
        ElMessage.success('已进入视觉装修，下一步补 Logo、封面和地图位置')
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

onMounted(loadRegions)
</script>

<style scoped lang="scss">
.region-page { gap: 24px; }

.quiet-tabs :deep(.el-tabs__header) { margin: 0 0 20px; }
.quiet-tabs :deep(.el-tabs__nav-wrap::after) { height: 0; }
.quiet-tabs :deep(.el-tabs__item) {
  height: 42px;
  padding: 0 18px;
  font-size: 14.5px;
  font-weight: 650;
  color: #526174;
}
.quiet-tabs :deep(.el-tabs__item.is-active) {
  color: #1f6fff;
  font-weight: 760;
}

.section-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}
.section-card { padding: 0; }
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 4px;
}
.section-card :deep(.el-form) { padding: 16px 24px 24px; }
.relaxed { gap: 16px 24px; }
.span-2 { grid-column: span 2; }
.form-tip { color: #94a3b8; font-size: 12px; margin-top: 4px; }

.create-next {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  margin-top: 4px;
  border-radius: 14px;
  background: rgba(239, 246, 255, .72);
}
.create-next b {
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
}
.create-next p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.switch-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  padding: 16px 24px 24px;
}
.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, .6);
  border: 1px solid rgba(226, 232, 240, .6);
}
.switch-item b { font-size: 14px; }
.switch-item p { margin: 4px 0 0; color: #94a3b8; font-size: 12px; }

.sortable-list {
  display: grid;
  gap: 8px;
  padding: 0 24px 24px;
}
.sortable-item {
  display: grid;
  grid-template-columns: 28px 1fr auto 80px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .66);
  border: 1px solid rgba(226, 232, 240, .6);
}
.sortable-grip {
  cursor: grab;
  color: #94a3b8;
  font-size: 16px;
  user-select: none;
}
.sortable-content {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.sortable-actions {
  display: flex;
  gap: 4px;
}
.muted {
  color: #94a3b8;
  font-size: 12px;
}

/* 底部导航预览 */
.tabbar-preview {
  padding: 16px 24px;
}
.tabbar-phone {
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px;
}
.tabbar-bar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: #fff;
  border-radius: 10px;
  padding: 8px 4px;
}
.tabbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.tabbar-item.disabled {
  opacity: 0.4;
}
.tabbar-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
}
.tabbar-text {
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
}
.tabbar-summary {
  color: #94a3b8;
  font-size: 12px;
  margin-top: 8px;
}

/* 编辑器 */
.editor-layout {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 24px;
  height: calc(100vh - 120px);
}
.editor-form {
  overflow-y: auto;
  padding-right: 4px;
}
.editor-section {
  margin-bottom: 24px;
}
.editor-section-title {
  font-weight: 900;
  font-size: 14px;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.style-row {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.style-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.style-field label {
  font-size: 12px;
  color: #64748b;
  font-weight: 700;
}
.tab-list {
  display: grid;
  gap: 12px;
}
.tab-editor-item {
  border: 1px solid rgba(226, 232, 240, .7);
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, .6);
}
.tab-editor-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(248, 250, 252, .8);
  border-bottom: 1px solid rgba(226, 232, 240, .5);
}
.tab-drag {
  cursor: grab;
  color: #94a3b8;
  user-select: none;
}
.tab-label {
  font-weight: 800;
  font-size: 13px;
  flex: 1;
}
.tab-actions {
  display: flex;
  gap: 4px;
}
.tab-editor-body {
  padding: 14px;
  display: grid;
  gap: 10px;
}
.field-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.field-item {
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-item.small {
  min-width: 80px;
  flex: 0 0 auto;
}
.field-item.toggle {
  min-width: auto;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.field-item label {
  font-size: 11px;
  color: #64748b;
  font-weight: 700;
}
.empty-tabs {
  text-align: center;
  color: #94a3b8;
  padding: 24px;
  font-size: 13px;
}
.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid rgba(226, 232, 240, .5);
}
.editor-preview {
  position: sticky;
  top: 0;
}
.preview-title {
  font-weight: 900;
  font-size: 14px;
  margin-bottom: 12px;
}
.preview-phone {
  width: 220px;
  margin: 0 auto;
  border-radius: 28px;
  border: 2px solid #1f6fff;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(37, 99, 235, .12);
}
.preview-content {
  height: 320px;
  background: linear-gradient(180deg, #f0f7ff, #fff);
  display: grid;
  place-items: center;
}
.preview-placeholder {
  color: #94a3b8;
  font-size: 12px;
}
.preview-tabbar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 6px 2px 10px;
  border-top: 1px solid rgba(226, 232, 240, .5);
}
.preview-tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.preview-tab-item.disabled {
  opacity: 0.3;
}
.preview-tab-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
}
.preview-tab-text {
  white-space: nowrap;
  font-weight: 700;
}

@media (max-width: 1050px) {
  .section-grid { grid-template-columns: 1fr; }
  .switch-grid { grid-template-columns: 1fr; }
}
</style>

<template>
  <div class="rte">
    <!-- ===== 顶部工具条 ===== -->
    <div class="rte-toolbar">
      <div class="rte-left">
        <el-select v-model="regionId" placeholder="选择校区" style="width: 180px" @change="loadAll">
          <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <span v-if="dirty.size" class="rte-dirty"><i class="rte-dirty-dot" />{{ dirty.size }} 处修改待发布</span>
        <span v-else-if="lastSaved" class="rte-clean">已是最新 · {{ lastSaved }}</span>
      </div>
      <div class="rte-right">
        <el-button :icon="Collection" @click="templateVisible = true">模板</el-button>
        <el-button :icon="Iphone" plain @click="liveVisible = true">模拟器验收</el-button>
        <el-tooltip content="撤销 (Ctrl+Z)" placement="bottom">
          <el-button class="rte-history" :icon="RefreshLeft" circle :disabled="!past.length" @click="undo" />
        </el-tooltip>
        <el-tooltip content="重做 (Ctrl+Shift+Z)" placement="bottom">
          <el-button class="rte-history" :icon="RefreshRight" circle :disabled="!future.length" @click="redo" />
        </el-tooltip>
        <el-tooltip content="重新加载" placement="bottom">
          <el-button class="rte-history" :icon="Refresh" circle :loading="loading" @click="loadAll" />
        </el-tooltip>
        <el-tooltip content="版本历史" placement="bottom">
          <el-button class="rte-history" :icon="Clock" circle @click="versionPanelVisible = true" />
        </el-tooltip>
        <el-button class="rte-publish" type="primary" :icon="Promotion" :disabled="!dirty.size" :loading="saving" @click="saveAll">
          保存并发布
        </el-button>
      </div>
    </div>

    <!-- ===== 版本历史（发布安全闭环：快照/对比/一键回滚） ===== -->
    <DecorVersionPanel v-model="versionPanelVisible" :region-id="regionId" :current="buildDecorSnapshot()" @rollback="loadAll" />

    <div class="rte-body">
      <!-- ===== 画布：真实首页编辑视图（真机画面收进「模拟器验收」弹窗） ===== -->
      <div class="rte-canvas">
        <div class="rte-page" :style="themeStyle">
          <div class="p-status"><span>9:41</span><span class="p-sig">●●●</span></div>

          <!-- Hero 区（结构 / class 由 sync-canvas-blocks.mjs 从 DynamicHomeContent.wxml 生成，样式经 injectRealWxss 同源注入） -->
          <section class="blk" :class="{ sel: editing === 'hero', off: !hero.enabled }" @click="startEdit('hero')">
            <span class="blk-tag">Hero 区</span>
            <div class="blk-tools">
              <span class="blk-tool" :title="hero.enabled ? '点击隐藏' : '点击显示'" @click.stop="hero.enabled = !hero.enabled; markDirty('hero')">👁</span>
            </div>
            <RealHeroBlock
              :hero="hero"
              :region="region"
              :inline-key="inlineKey"
              :resolve-asset="resolveAsset"
              :img-ok="imgOk"
              :begin-inline="beginInline"
              :commit-inline="commitInline"
              :inline-keydown="inlineKeydown"
              :inline-paste="inlinePaste"
              :on-img-error="onImgError"
            />
          </section>

          <!-- 金刚区（结构 / class 由 sync-canvas-blocks.mjs 从 DynamicHomeContent.wxml 生成） -->
          <section class="blk" :class="{ sel: editing === 'kingkong', off: !switches.show_kingkong }" @click="startEdit('kingkong')">
            <span class="blk-tag">金刚区</span>
            <div class="blk-tools">
              <span class="blk-tool" :title="switches.show_kingkong ? '点击隐藏' : '点击显示'" @click.stop="switches.show_kingkong = !switches.show_kingkong; markDirty('switches')">👁</span>
            </div>
            <RealKingkongBlock
              v-if="kingkongPrimary.length"
              :items="kingkongPrimary"
              :resolve-asset="resolveAsset"
              :img-ok="imgOk"
              :on-img-error="onImgError"
            />
            <div v-else class="campus-menu-card rte-kk-empty">
              <EmptySlot icon="grid" text="还没有金刚区入口" action-text="+ 添加入口" @action="startEdit('kingkong')" />
            </div>
          </section>

          <!-- 轮播 -->
          <section class="blk" :class="{ sel: editing === 'carousel', off: !switches.show_carousel }" @click="startEdit('carousel')">
            <span class="blk-tag">轮播图</span>
            <div class="blk-tools">
              <span class="blk-tool" :title="switches.show_carousel ? '点击隐藏' : '点击显示'" @click.stop="switches.show_carousel = !switches.show_carousel; markDirty('switches')">👁</span>
            </div>
            <div class="p-banner">
              <img v-if="firstBannerImage" :src="firstBannerImage" alt="" @error="onImgError" />
              <EmptySlot v-else icon="image" text="还没有轮播图" action-text="+ 上传图片" @action="startEdit('carousel')" />
              <i v-if="carousel.length > 1 && firstBannerImage" class="p-dots">•••</i>
            </div>
          </section>

          <!-- 公告 -->
          <section v-if="notices.length" class="blk" :class="{ off: !switches.show_announcement }" @click="startEdit('switches')">
            <span class="blk-tag">公告</span>
            <div class="blk-tools">
              <span class="blk-tool" :title="switches.show_announcement ? '点击隐藏' : '点击显示'" @click.stop="switches.show_announcement = !switches.show_announcement; markDirty('switches')">👁</span>
            </div>
            <div class="p-notice"><span>📢</span><span class="p-notice-text">{{ notices[0] }}</span></div>
          </section>

          <!-- 热榜 -->
          <section class="blk" :class="{ sel: editing === 'hotlist', off: !switches.show_hot_list }" @click="startEdit('hotlist')">
            <span class="blk-tag">热榜</span>
            <div class="blk-tools">
              <span class="blk-tool" :title="switches.show_hot_list ? '点击隐藏' : '点击显示'" @click.stop="switches.show_hot_list = !switches.show_hot_list; markDirty('switches')">👁</span>
            </div>
            <div v-if="hotPosts[0]?.title || hotPosts[0]?.content" class="p-hot">
              <span class="p-hot-tag">热</span>
              <span class="p-hot-text">{{ hotPosts[0]?.title || hotPosts[0]?.content }}</span>
            </div>
            <div v-else class="rte-slot-wrap">
              <EmptySlot icon="fire" text="还没有热榜内容" action-text="点击编辑热榜" @action="startEdit('hotlist')" />
            </div>
          </section>

          <!-- 分类 Tab -->
          <section class="blk" :class="{ sel: editing === 'tabs' }" @click="startEdit('tabs')">
            <span class="blk-tag">分类 Tab</span>
            <div class="p-tabs">
              <span v-for="(t, i) in enabledTabs" :key="i" class="p-tab" :class="{ active: i === 0 }">{{ t.name }}</span>
            </div>
          </section>

          <!-- 帖子流（实时数据，1:1 NotesCard 样式，只读） -->
          <section class="blk readonly">
            <span class="blk-tag live">🔒 实时帖子流</span>
            <div class="gg-feed">
              <div v-for="p in posts" :key="p.id" class="gg-box">
                <div class="gg-header">
                  <img v-if="isHttp(p.user?.avatar)" :src="p.user.avatar" class="gg-avatar" alt="" @error="onImgError" />
                  <span v-else class="gg-avatar gg-avatar-letter">{{ (p.user?.nickname || '匿').slice(0, 1) }}</span>
                  <div class="gg-user-info">
                    <div class="gg-user-main"><span class="name">{{ p.user?.nickname || '匿名用户' }}</span></div>
                    <div class="gg-item-time">{{ formatTime(p.createdAt || p.created_at) }}</div>
                  </div>
                </div>
                <div class="gg-content">
                  <div class="gg-item-content">{{ p.title || p.content }}</div>
                  <div class="gg-item-footer">
                    <span class="gg-item-time-inline">{{ formatTime(p.createdAt || p.created_at) }}</span>
                    <div class="gg-item-actions">
                      <span>♡ {{ p.likeCount ?? p.like_count ?? 0 }}</span>
                      <span>💬 {{ p.commentCount ?? p.comment_count ?? 0 }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="!posts.length" class="rte-slot-wrap">
                <EmptySlot icon="feed" text="还没有帖子内容" />
              </div>
            </div>
          </section>
        </div>

        <!-- TabBar -->
        <section class="blk tabbar-blk" :class="{ sel: editing === 'tabbar' }" @click="startEdit('tabbar')">
          <span class="blk-tag">底部导航</span>
          <div class="p-tabbar" :style="{ background: tabbarConfig.backgroundColor || '#fff' }">
            <div v-for="(t, i) in tabbarTabs" :key="i" class="p-tabbar-item" :class="{ dim: t.enabled === false }">
              <img v-if="tabbarIcon(t, i === 0)" :src="tabbarIcon(t, i === 0)" class="p-tabbar-icon-img" alt="" @error="onImgError" />
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
            <template v-if="editing === 'hero'">
              <div class="pp-title">Hero 区</div>
              <el-form label-position="top">
                <el-form-item label="启用"><el-switch v-model="hero.enabled" @change="markDirty('hero')" /></el-form-item>
                <el-form-item label="主标题"><el-input v-model="hero.title" type="textarea" :rows="2" @input="markDirty('hero')" /></el-form-item>
                <el-form-item label="副标题"><el-input v-model="hero.subtitle" @input="markDirty('hero')" /></el-form-item>
                <el-form-item label="搜索框占位文案"><el-input v-model="hero.search_placeholder" @input="markDirty('hero')" /></el-form-item>
                <el-form-item label="吉祥物图片"><ImageUploadBox v-model="hero.mascot_image" shape="square" @update:model-value="markDirty('hero')" /></el-form-item>
              </el-form>
            </template>

            <template v-else-if="editing === 'kingkong'">
              <div class="pp-title">金刚区 <span class="pp-sub">前 6 个直接展示，更多收进弹层</span></div>
              <el-form-item label="显示金刚区"><el-switch v-model="switches.show_kingkong" @change="markDirty('switches')" /></el-form-item>
              <div class="pp-list">
                <div v-for="(m, i) in kingkong" :key="i" class="pp-item">
                  <div class="pp-item-head">
                    <b>{{ m.name || `入口 ${i + 1}` }}</b>
                    <div class="pp-item-ops">
                      <el-icon :class="{ dim: i === 0 }" @click="moveItem(kingkong, i, -1, 'kingkong')"><Top /></el-icon>
                      <el-icon :class="{ dim: i === kingkong.length - 1 }" @click="moveItem(kingkong, i, 1, 'kingkong')"><Bottom /></el-icon>
                      <el-icon class="danger" @click="kingkong.splice(i, 1); markDirty('kingkong')"><Delete /></el-icon>
                    </div>
                  </div>
                  <ImageUploadBox v-model="m.icon" shape="square" @update:model-value="markDirty('kingkong')" />
                  <el-input v-model="m.name" placeholder="名称" size="small" @input="markDirty('kingkong')" />
                  <el-input v-model="m.subtitle" placeholder="副标题（可选）" size="small" @input="markDirty('kingkong')" />
                  <div class="pp-link">
                    <el-select v-model="m.linkType" size="small" style="width: 96px" @change="markDirty('kingkong')">
                      <el-option label="内部页" value="internal" />
                      <el-option label="网页" value="webview" />
                      <el-option label="其他小程序" value="miniapp" />
                      <el-option label="半屏小程序" value="miniapp_half" />
                      <el-option label="图片预览" value="image" />
                      <el-option label="拨打电话" value="tel" />
                      <el-option label="无跳转" value="none" />
                    </el-select>
                    <el-input
                      v-if="m.linkType === 'miniapp' || m.linkType === 'miniapp_half'"
                      v-model="m.appId"
                      placeholder="小程序 AppID（wx...）"
                      size="small"
                      @input="markDirty('kingkong')"
                    />
                  </div>
                  <ImageUploadBox
                    v-if="m.linkType === 'image'"
                    v-model="m.path"
                    scene="home-kingkong-preview"
                    shape="wide"
                    placeholder="上传点击入口后要预览的图片"
                    tip="支持点击或拖拽上传，最大 5MB"
                    :max-size="5"
                    @update:model-value="markDirty('kingkong')"
                  />
                  <el-input
                    v-else-if="m.linkType !== 'none'"
                    v-model="m.path"
                    :placeholder="m.linkType === 'internal' ? '页面路径，如 campusMap/index/index' : m.linkType === 'webview' ? 'https://...' : m.linkType === 'tel' ? '电话号码' : '目标小程序页面路径'"
                    size="small"
                    @input="markDirty('kingkong')"
                  />
                  <el-switch v-model="m.enabled" size="small" inline-prompt active-text="启用" inactive-text="停用" @change="markDirty('kingkong')" />
                </div>
              </div>
              <el-button size="small" style="width: 100%" @click="kingkong.push({ name: '', icon: '', linkType: 'internal', appId: '', path: '', query: '', enabled: true }); markDirty('kingkong')">+ 添加入口</el-button>
            </template>

            <template v-else-if="editing === 'carousel'">
              <div class="pp-title">轮播图</div>
              <el-form-item label="显示轮播"><el-switch v-model="switches.show_carousel" @change="markDirty('switches')" /></el-form-item>
              <div class="pp-list">
                <div v-for="(c, i) in carousel" :key="i" class="pp-item">
                  <div class="pp-item-head">
                    <b>第 {{ i + 1 }} 张</b>
                    <div class="pp-item-ops">
                      <el-icon :class="{ dim: i === 0 }" @click="moveItem(carousel, i, -1, 'carousel')"><Top /></el-icon>
                      <el-icon :class="{ dim: i === carousel.length - 1 }" @click="moveItem(carousel, i, 1, 'carousel')"><Bottom /></el-icon>
                      <el-icon class="danger" @click="carousel.splice(i, 1); markDirty('carousel')"><Delete /></el-icon>
                    </div>
                  </div>
                  <ImageUploadBox v-model="c.image" shape="wide" @update:model-value="markDirty('carousel')" />
                  <el-input v-model="c.title" placeholder="标题（可选）" size="small" @input="markDirty('carousel')" />
                  <div class="pp-link">
                    <el-select v-model="c.linkType" size="small" style="width: 96px" @change="markDirty('carousel')">
                      <el-option label="内部页" value="internal" />
                      <el-option label="网页" value="web" />
                      <el-option label="小程序" value="miniapp" />
                    </el-select>
                    <el-input v-model="c.path" placeholder="路径 / 链接" size="small" @input="markDirty('carousel')" />
                  </div>
                </div>
              </div>
              <el-button size="small" style="width: 100%" @click="carousel.push({ image: '', title: '', linkType: 'internal', path: '', enabled: true }); markDirty('carousel')">+ 添加轮播图</el-button>
            </template>

            <template v-else-if="editing === 'tabs'">
              <div class="pp-title">分类 Tab</div>
              <div class="pp-list">
                <div v-for="(t, i) in regionTabs" :key="i" class="pp-tabrow">
                  <el-switch v-model="t.enabled" size="small" @change="markDirty('tabs')" />
                  <el-input v-model="t.name" size="small" style="flex: 1" @input="markDirty('tabs')" />
                  <el-icon :class="{ dim: i === 0 }" @click="moveItem(regionTabs, i, -1, 'tabs')"><Top /></el-icon>
                  <el-icon :class="{ dim: i === regionTabs.length - 1 }" @click="moveItem(regionTabs, i, 1, 'tabs')"><Bottom /></el-icon>
                </div>
              </div>
            </template>

            <template v-else-if="editing === 'hotlist'">
              <div class="pp-title">热榜</div>
              <el-form label-position="top">
                <el-form-item label="显示热榜"><el-switch v-model="switches.show_hot_list" @change="markDirty('switches')" /></el-form-item>
                <el-form-item label="展示形式">
                  <el-select v-model="switches.hot_featured_display" style="width: 100%" @change="markDirty('switches')">
                    <el-option label="不展示精选" value="none" />
                    <el-option label="热门" value="hot" />
                    <el-option label="精选" value="featured" />
                    <el-option label="热门+精选" value="mixed" />
                  </el-select>
                </el-form-item>
              </el-form>
            </template>

            <template v-else-if="editing === 'switches'">
              <div class="pp-title">公告</div>
              <el-form-item label="显示公告"><el-switch v-model="switches.show_announcement" @change="markDirty('switches')" /></el-form-item>
              <div class="pp-tip">公告内容在「内容管理」中维护，这里控制是否在首页显示。</div>
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
              <div class="pp-title">页面大纲 <span class="pp-sub">当前首页的原生版块</span></div>
              <div class="ol-list">
                <div
                  v-for="it in outlineItems"
                  :key="it.key"
                  class="ol-row"
                  :class="{ sel: editing === it.key }"
                  @click="startEdit(it.key)"
                >
                  <span class="ol-icon" v-html="it.icon" />
                  <span class="ol-name">{{ it.name }}</span>
                  <el-icon v-if="it.toggle" class="ol-eye" :class="{ off: !it.on }" :title="it.on ? '点击隐藏' : '点击显示'" @click.stop="it.toggle()">
                    <View v-if="it.on" /><Hide v-else />
                  </el-icon>
                </div>
              </div>
              <p class="ol-tip">点击行选中版块进行编辑</p>
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

    <!-- ===== 模板库 ===== -->
    <el-dialog v-model="templateVisible" title="从模板开始" width="560px">
      <div class="tpl-grid">
        <button v-for="t in pageTemplates" :key="t.name" class="tpl-card" @click="applyPageTemplate(t)">
          <span class="tpl-emoji">{{ t.emoji }}</span>
          <span class="tpl-name">{{ t.name }}</span>
          <span class="tpl-desc">{{ t.desc }}</span>
        </button>
      </div>
      <p class="tpl-tip">应用模板会覆盖当前画布的 Hero、金刚区和轮播配置，可用「撤销」回退。</p>
    </el-dialog>

    <!-- ===== 模拟器验收：真实小程序只读预览（LiveCanvas） ===== -->
    <el-dialog v-model="liveVisible" title="在真实模拟器里验收 · 只读预览" width="480px">
      <LiveCanvas v-if="liveVisible" />
    </el-dialog>

    <!-- ===== 首次引导气泡 ===== -->
    <div v-if="onboardStep >= 0" class="ob-mask" :class="`pos-${onboardSteps[onboardStep].pos}`">
      <div class="ob-card">
        <div class="ob-step">{{ onboardStep + 1 }} / {{ onboardSteps.length }}</div>
        <div class="ob-title">{{ onboardSteps[onboardStep].title }}</div>
        <div class="ob-desc">{{ onboardSteps[onboardStep].desc }}</div>
        <div class="ob-ops">
          <el-button v-if="onboardStep > 0" text @click="onboardStep--">上一步</el-button>
          <span v-else />
          <el-button class="rte-publish" type="primary" @click="nextOnboard">
            {{ onboardStep === onboardSteps.length - 1 ? '我知道了' : '下一步' }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bottom, Clock, Collection, Delete, Hide, Iphone, Promotion, Refresh, RefreshLeft, RefreshRight, Top, View } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import DecorVersionPanel from '@/components/miniapp/DecorVersionPanel.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { compileWxss } from '@/utils/wxssCompiler'
import { sharedGet } from '@/views/miniapp/editor/sharedGet'
import LiveCanvas from '@/components/miniapp/LiveCanvas.vue'
import EmptySlot from '@/views/miniapp/editor/EmptySlot.vue'
import MenuFallbackIcon from '@/views/miniapp/editor/MenuFallbackIcon.vue'
import RealHeroBlock from '@/views/miniapp/editor/generated/RealHeroBlock.vue'
import RealKingkongBlock from '@/views/miniapp/editor/generated/RealKingkongBlock.vue'
import { buildKingkongPayload, normalizeKingkongCollection, normalizeKingkongEntry, validateKingkongEntries } from '@/views/miniapp/editor/homeKingkongLinks.mjs'

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

const hero = ref<any>({ enabled: true, title: '', subtitle: '', search_placeholder: '', mascot_image: '' })
const kingkong = ref<any[]>([])
const carousel = ref<any[]>([])
const regionTabs = ref<any[]>([])
const switches = ref<any>({ show_carousel: true, show_announcement: true, show_kingkong: true, show_hot_list: false, hot_featured_display: 'none' })
const tabbarConfig = ref<any>({ type: 'bottom', color: '#8A8A8A', selectedColor: '#36A853', backgroundColor: '#ffffff', messageBadgeStyle: 'bubble', list: [] })

const notices = ref<string[]>([])
const hotPosts = ref<any[]>([])
const posts = ref<any[]>([])

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
async function loadThemeVars() {
  try {
    const res: any = await sharedGet('/admin/miniapp/code/theme')
    const vars = res.data?.vars || []
    const map: Record<string, string> = {}
    for (const v of vars) if (v.name && v.value) map[v.name] = v.value
    themeVars.value = map
  } catch { /* 用默认色 */ }
}

// ============ 计算 ============
const kingkongPrimary = computed(() => kingkong.value.filter((m) => m.enabled !== false).slice(0, 6))
const enabledTabs = computed(() => regionTabs.value.filter((t) => t.enabled !== false))
const tabbarTabs = computed(() => (tabbarConfig.value.list || []).filter((t: any) => t.enabled !== false).slice(0, 5))
const firstBannerImage = computed(() => {
  const first = carousel.value.find((c) => c.enabled !== false && resolveAsset(c.image))
  const raw = first?.image || ''
  const resolved = resolveAsset(raw)
  // 加载失败的素材按无图处理，走占位文案而不是空白绿块
  return failedAssets.value.has(resolved) ? '' : resolved
})

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
/** 已失败的素材地址（加载失败走字母/占位回退，不再留空白方块） */
const failedAssets = ref(new Set<string>())
const imgOk = (v: string) => {
  const r = resolveAsset(v)
  return !!r && !failedAssets.value.has(r)
}
const onImgError = (e: Event) => {
  const el = e.target as HTMLImageElement
  const raw = el.getAttribute('src') || el.src
  failedAssets.value.add(raw)
  el.style.display = 'none'
}
const formatTime = (t: string) => (t ? String(t).slice(0, 10) : '')

const tabColor = (i: number) => (i === 0 ? (tabbarConfig.value.selectedColor || '#36A853') : (tabbarConfig.value.color || '#8A8A8A'))
const tabbarIcon = (t: any, active: boolean) => {
  const raw = active ? (t.selectedIconPath || t.icons?.selected || t.iconPath || t.icons?.unselected) : (t.iconPath || t.icons?.unselected)
  return resolveAsset(raw)
}

const markDirty = (key: string) => {
  dirty.value.add(key)
  dirty.value = new Set(dirty.value)
  // 历史快照（600ms 防抖合并连续输入）
  const now = Date.now()
  if (now - lastSnapshotAt > 600) {
    past.value.push(lastSnapshot)
    if (past.value.length > 50) past.value.shift()
    future.value = []
    lastSnapshotAt = now
  }
  lastSnapshot = snapshotState()
}

// ============ 画布内联编辑 ============
const inlineKey = ref('')
let inlineEl: HTMLElement | null = null
let inlineBackup = ''
let inlineMultiline = false
let inlineApply: ((v: string) => void) | null = null
let inlineDirtyKey = ''

function beginInline(key: string, apply: (v: string) => void, dirtyKey: string, multiline = false) {
  if (inlineKey.value === key) return
  inlineKey.value = key
  inlineApply = apply
  inlineDirtyKey = dirtyKey
  inlineMultiline = multiline
  nextTick(() => {
    const el = document.querySelector(`[contenteditable="true"]`) as HTMLElement | null
    if (!el) return
    inlineEl = el
    inlineBackup = multiline ? el.innerText : (el.textContent || '')
    el.focus()
    // 全选现有文本，方便直接覆盖输入
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  })
}
function commitInline() {
  if (!inlineKey.value || !inlineEl) return
  const raw = inlineMultiline ? inlineEl.innerText : (inlineEl.textContent || '')
  const value = raw.replace(/\u00a0/g, ' ').trim()
  if (value !== inlineBackup.trim() && inlineApply) {
    inlineApply(value)
    markDirty(inlineDirtyKey)
  }
  endInline()
}
function cancelInline() {
  if (inlineEl) {
    // 恢复原文（Vue 不会主动回写 contenteditable 中被手改的 DOM）
    if (inlineMultiline) inlineEl.innerText = inlineBackup
    else inlineEl.textContent = inlineBackup
  }
  endInline()
}
function endInline() {
  inlineKey.value = ''
  inlineEl = null
  inlineApply = null
  inlineDirtyKey = ''
}
function inlineKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancelInline()
    ;(e.target as HTMLElement).blur()
  } else if (e.key === 'Enter' && (!inlineMultiline || !e.shiftKey)) {
    // 回车提交；多行标题用 Shift+Enter 换行
    e.preventDefault()
    ;(e.target as HTMLElement).blur()
  }
}
function inlinePaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}

// ============ 撤销 / 重做 ============
const past = ref<string[]>([])
const future = ref<string[]>([])
let lastSnapshot = ''
let lastSnapshotAt = 0

function snapshotState() {
  return JSON.stringify({
    hero: hero.value, kingkong: kingkong.value, carousel: carousel.value,
    regionTabs: regionTabs.value, switches: switches.value,
    tabbarConfig: tabbarConfig.value,
  })
}
function applyState(json: string) {
  const s = JSON.parse(json)
  hero.value = s.hero
  kingkong.value = s.kingkong
  carousel.value = s.carousel
  regionTabs.value = s.regionTabs
  switches.value = s.switches
  tabbarConfig.value = s.tabbarConfig
  // contenteditable 行内编辑手改了 DOM，撤销/重做后强制退出行内态让 Vue 重渲染文本
  inlineKey.value = ''
}
function markAllDirty() {
  ['hero', 'kingkong', 'carousel', 'tabs', 'switches', 'tabbar'].forEach((k) => dirty.value.add(k))
  dirty.value = new Set(dirty.value)
}
const undo = () => {
  if (!past.value.length) return
  future.value.push(snapshotState())
  applyState(past.value.pop()!)
  lastSnapshot = snapshotState()
  lastSnapshotAt = Date.now()
  markAllDirty()
}
const redo = () => {
  if (!future.value.length) return
  past.value.push(snapshotState())
  applyState(future.value.pop()!)
  lastSnapshot = snapshotState()
  lastSnapshotAt = Date.now()
  markAllDirty()
}
const initHistory = () => {
  past.value = []
  future.value = []
  lastSnapshot = snapshotState()
  lastSnapshotAt = Date.now()
}

// ============ 模板库 ============
const templateVisible = ref(false)
const pageTemplates = [
  {
    name: '标准校园首页', emoji: '🏫', desc: 'Hero + 六宫格入口',
    apply() {
      hero.value = { enabled: true, title: '今天想在校园里\n干点啥？', subtitle: '发现校园美好生活', search_placeholder: '搜索校园生活', mascot_image: '' }
      kingkong.value = [
        { name: '笔记', icon: '', linkType: 'internal', path: 'pagesB/post/post', enabled: true },
        { name: '外卖', icon: '', linkType: 'internal', path: 'pagesA/merchant/merchant', enabled: true },
        { name: '二手', icon: '', linkType: 'internal', path: 'pages/tabbar/index/index?tab=secondhand', enabled: true },
        { name: '圈子', icon: '', linkType: 'internal', path: 'pages/circlelite/circlelite', enabled: true },
        { name: '活动', icon: '', linkType: 'internal', path: 'pagesA/selection/list/list', enabled: true },
        { name: '跑腿', icon: '', linkType: 'internal', path: 'pages/tabbar/RunErrands/RunErrands', enabled: true },
      ]
      carousel.value = []
    },
  },
  {
    name: '校园种草', emoji: '🌿', desc: '种草 Hero + 精选轮播',
    apply() {
      hero.value = { enabled: true, title: '校园种草', subtitle: '发现好物与灵感', search_placeholder: '搜索', mascot_image: '' }
      carousel.value = [{ image: '', title: '精选', linkType: 'internal', path: '', enabled: true, sortOrder: 0 }]
    },
  },
  {
    name: '校园社区', emoji: '💬', desc: '社区 Hero + 原生信息流',
    apply() {
      hero.value = { enabled: true, title: '校园广场', subtitle: '说点什么…', search_placeholder: '搜索帖子', mascot_image: '' }
      carousel.value = []
    },
  },
]
const applyPageTemplate = (t: any) => {
  initHistory()
  past.value.push(lastSnapshot)
  t.apply()
  markAllDirty()
  templateVisible.value = false
  ElMessage.success(`已应用模板「${t.name}」，记得保存发布`)
}
const startEdit = (key: string) => { editing.value = key; panelTab.value = 'section' }

// ============ 右侧默认面板：页面大纲 ============
/** 大纲行内联 SVG 线性图标：16px / 1.5px 描边 / 圆角端点（Lucide 风格），stroke=currentColor 随选中态变色 */
const OL_SVG = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
const OL_ICONS = {
  // Hero 区：靶心
  hero: OL_SVG('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>'),
  // 金刚区：2x2 宫格
  kingkong: OL_SVG('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  // 轮播图：图片
  carousel: OL_SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 18l4.5-4.5 3 3 3.5-3.5L20 17"/>'),
  // 公告：喇叭
  announcement: OL_SVG('<path d="M4 10v4l3 .6V9.4L4 10z"/><path d="M7 9.4L18 5v14l-11-4.4"/><path d="M10 15.5V18a2 2 0 004 0v-1.7"/>'),
  // 热榜：火焰
  hotlist: OL_SVG('<path d="M12 3s5.5 4.6 5.5 9.3a5.5 5.5 0 01-11 0c0-2.1 1.1-3.7 2.2-5.2.5 1.5 1.4 2.2 2.4 2.2-.5-2 .3-4.6.9-6.3z"/>'),
  // 分类 Tab：标签
  tabs: OL_SVG('<path d="M3.5 11V4.5H11L20.5 14l-6.5 6.5L3.5 11z"/><circle cx="8" cy="8" r="1.3"/>'),
  // 底部导航：指南针
  tabbar: OL_SVG('<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2.1 4.9-4.9 2.1 2.1-4.9z"/>'),
}
const outlineItems = computed(() => {
  const items: { key: string; name: string; icon: string; on?: boolean; toggle?: () => void }[] = []
  items.push({
    key: 'hero', name: 'Hero 区', icon: OL_ICONS.hero, on: hero.value.enabled,
    toggle: () => { hero.value.enabled = !hero.value.enabled; markDirty('hero') },
  })
  items.push({
    key: 'kingkong', name: '金刚区', icon: OL_ICONS.kingkong, on: switches.value.show_kingkong,
    toggle: () => { switches.value.show_kingkong = !switches.value.show_kingkong; markDirty('switches') },
  })
  items.push({
    key: 'carousel', name: '轮播图', icon: OL_ICONS.carousel, on: switches.value.show_carousel,
    toggle: () => { switches.value.show_carousel = !switches.value.show_carousel; markDirty('switches') },
  })
  items.push({
    key: 'switches', name: '公告', icon: OL_ICONS.announcement, on: switches.value.show_announcement,
    toggle: () => { switches.value.show_announcement = !switches.value.show_announcement; markDirty('switches') },
  })
  items.push({
    key: 'hotlist', name: '热榜', icon: OL_ICONS.hotlist, on: switches.value.show_hot_list,
    toggle: () => { switches.value.show_hot_list = !switches.value.show_hot_list; markDirty('switches') },
  })
  items.push({ key: 'tabs', name: '分类 Tab', icon: OL_ICONS.tabs })
  items.push({ key: 'tabbar', name: '底部导航', icon: OL_ICONS.tabbar })
  return items
})
const moveItem = (list: any[], i: number, dir: number, key: string) => {
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const t = list[i]; list[i] = list[j]; list[j] = t
  markDirty(key)
}

// ============ 数据加载 ============
async function loadRegions() {
  const res: any = await sharedGet('/admin/regions')
  regions.value = res.data?.list || res.list || []
  if (!regionId.value && regions.value.length) {
    regionId.value = regions.value[0].id || regions.value[0].region_id
  }
}

async function loadAll() {
  if (!regionId.value) return
  loading.value = true
  editing.value = ''
  dirty.value = new Set()
  themeDirtyKeys.value = new Set()
  const rid = regionId.value
  const safe = (p: Promise<any>, fb: any) => p.catch(() => fb)
  try {
    const [regionRes, tabbarRes, hotRes, postsRes] = await Promise.all([
      safe(sharedGet(`/admin/regions/${rid}`), null),
      safe(sharedGet('/admin/regions/tabbar', { regionId: rid }), null),
      safe(sharedGet(`/posts/featured-hot-posts/${rid}`), null),
      safe(sharedGet(`/posts/region-posts/${rid}`, { page: 1, limit: 4 }), null),
    ])

    region.value = regionRes?.data || regionRes

    const carouselImages = region.value?.carouselImages || region.value?.carousel_images || []
    const heroItem = (Array.isArray(carouselImages) ? carouselImages : []).find((i: any) => i.module_type === 'hero')
    hero.value = heroItem
      ? { enabled: heroItem.enabled !== false, title: heroItem.title || '', subtitle: heroItem.subtitle || '', search_placeholder: heroItem.search_placeholder || '', mascot_image: heroItem.mascot_image || '' }
      : { enabled: true, title: '', subtitle: '', search_placeholder: '', mascot_image: '' }

    carousel.value = (Array.isArray(carouselImages) ? carouselImages : [])
      .filter((i: any) => i.module_type !== 'hero')
      .map((i: any) => ({ id: i.id, title: i.title || '', subtitle: i.subtitle || '', image: i.image || '', linkType: i.linkType || 'internal', path: i.path || '', enabled: i.enabled !== false, sortOrder: i.sortOrder ?? 0 }))

    const navCfg = region.value?.homeNavLayoutConfig || region.value?.home_nav_layout_config || []
    kingkong.value = normalizeKingkongCollection(navCfg)
      .map((i: any) => normalizeKingkongEntry(i))
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)

    const tabs = region.value?.regionTabs || region.value?.region_tabs || []
    regionTabs.value = (Array.isArray(tabs) ? tabs : [])
      .map((t: any) => ({ id: t.id, name: t.name || '', type: t.type || '', enabled: t.enabled !== false, sortOrder: t.sortOrder ?? 0 }))
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)

    switches.value = {
      show_carousel: region.value?.showCarousel ?? region.value?.show_carousel ?? true,
      show_announcement: region.value?.showAnnouncement ?? region.value?.show_announcement ?? true,
      show_kingkong: region.value?.showKingkong ?? region.value?.show_kingkong ?? true,
      show_hot_list: region.value?.showHotList ?? region.value?.show_hot_list ?? false,
      hot_featured_display: region.value?.hotFeaturedDisplay || region.value?.hot_featured_display || 'none',
    }

    const tb = tabbarRes?.data || tabbarRes
    if (tb?.config) tabbarConfig.value = { ...tabbarConfig.value, ...tb.config }
    else if (tb?.list) tabbarConfig.value = { ...tabbarConfig.value, ...tb }

    hotPosts.value = hotRes?.list || hotRes?.posts || hotRes?.data || []
    posts.value = postsRes?.list || postsRes?.posts || postsRes?.data || []
    notices.value = []
  } catch (e) {
    ElMessage.error('加载区域配置失败')
  } finally {
    loading.value = false
    initHistory()
  }
}

// ============ 保存 ============
/** dirty key → 发布确认弹窗里的中文清单 */
const DIRTY_LABELS: Record<string, string> = {
  hero: 'Hero 区',
  kingkong: '金刚区',
  carousel: '轮播图',
  switches: '模块显隐',
  tabs: '分类 Tab',
  tabbar: '底部导航',
  theme: '主题',
  hotlist: '热榜',
}

// ============ 版本历史（发布安全闭环） ============
const versionPanelVisible = ref(false)
/** 当前完整编辑状态合集：区域页面字段 + TabBar。 */
const buildDecorSnapshot = () => {
  const carouselItems: any[] = [{
    id: 'home_hero', module_type: 'hero',
    title: hero.value.title, subtitle: hero.value.subtitle,
    search_placeholder: hero.value.search_placeholder, mascot_image: hero.value.mascot_image,
    enabled: hero.value.enabled, sortOrder: -100,
  }]
  carousel.value.forEach((c, i) => {
    carouselItems.push({ id: c.id || `carousel_${i}`, title: c.title, subtitle: c.subtitle || '', image: c.image, linkType: c.linkType, path: c.path, appId: '', query: '', enabled: c.enabled, sortOrder: i })
  })
  return {
    regionPayload: {
      carousel_images: carouselItems,
      home_nav_layout_config: buildKingkongPayload(kingkong.value),
      region_tabs: regionTabs.value.map((t, i) => ({ ...t, sortOrder: i })),
      show_carousel: switches.value.show_carousel,
      show_announcement: switches.value.show_announcement,
      show_kingkong: switches.value.show_kingkong,
      show_hot_list: switches.value.show_hot_list,
      hot_featured_display: switches.value.hot_featured_display,
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
    console.warn('[HomeEditor] 版本快照失败：', e)
  }
}
/** 保存原生页面控制项并生成可回滚快照。 */
async function doSave() {
  if (!dirty.value.size || saving.value) return
  const savingKeys = new Set<string>(dirty.value)
  if (!savingKeys.size) return
  if (savingKeys.has('kingkong')) {
    const validationError = validateKingkongEntries(kingkong.value)
    if (validationError) {
      ElMessage.error(validationError)
      return
    }
  }
  saving.value = true
  // 记录本次要落库的 dirty key，成功后只清掉这些（保存期间新增的修改保留，等待下一轮）
  try {
    const rid = regionId.value
    const payload: any = {}

    if (savingKeys.has('hero') || savingKeys.has('carousel')) {
      const items: any[] = [{
        id: 'home_hero', module_type: 'hero',
        title: hero.value.title, subtitle: hero.value.subtitle,
        search_placeholder: hero.value.search_placeholder, mascot_image: hero.value.mascot_image,
        enabled: hero.value.enabled, sortOrder: -100,
      }]
      carousel.value.forEach((c, i) => {
        items.push({ id: c.id || `carousel_${i}`, title: c.title, subtitle: c.subtitle || '', image: c.image, linkType: c.linkType, path: c.path, appId: '', query: '', enabled: c.enabled, sortOrder: i })
      })
      payload.carousel_images = items
    }
    if (savingKeys.has('kingkong')) {
      payload.home_nav_layout_config = buildKingkongPayload(kingkong.value)
    }
    if (savingKeys.has('tabs')) {
      payload.region_tabs = regionTabs.value.map((t, i) => ({ ...t, sortOrder: i }))
    }
    if (savingKeys.has('switches') || savingKeys.has('hotlist')) {
      Object.assign(payload, {
        show_carousel: switches.value.show_carousel,
        show_announcement: switches.value.show_announcement,
        show_kingkong: switches.value.show_kingkong,
        show_hot_list: switches.value.show_hot_list,
        hot_featured_display: switches.value.hot_featured_display,
      })
    }
    if (Object.keys(payload).length) {
      await request.put(`/admin/regions/${rid}`, payload)
    }
    if (savingKeys.has('tabbar')) {
      await request.put('/admin/regions/tabbar', { regionId: rid, config: tabbarConfig.value })
    }
    if (savingKeys.has('theme')) {
      const vars = [...themeDirtyKeys.value].map((k) => ({ name: k, value: themeVars.value[k] }))
      await request.put('/admin/miniapp/code/theme', { vars })
      themeDirtyKeys.value = new Set()
    }

    const left = new Set(dirty.value)
    savingKeys.forEach((k) => left.delete(k))
    dirty.value = left
    // 保存成功后同步刷新真机画面（模拟器验收弹窗开着时用户能立刻看到变化）
    if (liveVisible.value) refreshLiveFrame()
    lastSaved.value = new Date().toLocaleTimeString('zh-CN')
    ElMessage.success('已发布！小程序端已生效 🎉')
    snapshotDecorVersion([...savingKeys].map((k) => DIRTY_LABELS[k] || k).join('、'))
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
const saveAll = async () => {
  if (!dirty.value.size) return
  if (dirty.value.has('kingkong')) {
    const validationError = validateKingkongEntries(kingkong.value)
    if (validationError) {
      ElMessage.error(validationError)
      return
    }
  }
  const names = [...dirty.value].map((k) => DIRTY_LABELS[k] || k).join('、')
  const regionName = region.value?.name || '当前校区'
  try {
    await ElMessageBox.confirm(
      `<div class="pub-summary">本次变更：${names}</div><div class="pub-warn">发布后对该校区全体学生立即生效</div><div style="margin-top:8px;font-size:12.5px;color:#16a34a;">发布后可用版本历史一键回滚</div>`,
      `确认发布到【${regionName}】？`,
      {
        confirmButtonText: '发布',
        cancelButtonText: '再改改',
        dangerouslyUseHTMLString: true,
        customClass: 'pub-confirm',
        confirmButtonClass: 'pub-confirm-btn',
      },
    )
  } catch { return }
  doSave()
}

// ============ 模拟器验收弹窗（真实小程序画面，见 components/miniapp/LiveCanvas） ============
const liveVisible = ref(false)
/** 通知真机预览服务刷新画面（fire-and-forget） */
function refreshLiveFrame() {
  request.post('/admin/miniapp/preview/refresh').catch(() => {})
}
watch(liveVisible, (v) => {
  if (v) refreshLiveFrame()
})


// ============ 首次引导气泡 ============
const ONBOARD_KEY = 'ui-editor-onboarded-v2'
const onboardSteps = [
  { title: '画布 = 学生看到的首页', desc: '这就是学生看到的首页，点哪里改哪里。', pos: 'canvas' },
  { title: '右侧面板调内容和样式', desc: '在这里调整原生页面内容和显示开关。', pos: 'panel' },
  { title: '满意再发布', desc: '点发布学生才能看到，发布前会再跟你确认一次。', pos: 'publish' },
]
const onboardStep = ref(-1)
function nextOnboard() {
  if (onboardStep.value < onboardSteps.length - 1) onboardStep.value++
  else {
    localStorage.setItem(ONBOARD_KEY, '1')
    onboardStep.value = -1
  }
}


// ============ 真实样式编译注入（真实小程序 WXSS → 画布 CSS） ============
const REAL_WXSS_FILES = [
  'components/DynamicHomeContent.wxss',
  'components/xiaoyi-NotesCard/xiaoyi-NotesCard.wxss',
]
async function injectRealWxss() {
  const parts: string[] = []
  for (const path of REAL_WXSS_FILES) {
    try {
      const res: any = await request.get('/admin/miniapp/code/source-file', { params: { path } })
      const content = res.data?.content || ''
      if (content) parts.push(compileWxss(content, '.rte-page', 0.5))
    } catch { /* 单文件失败不阻塞 */ }
  }
  const id = 'rte-real-wxss'
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = parts.join('\n')
}

onMounted(async () => {
  try {
    injectRealWxss()
    loadThemeVars()
    await loadRegions()
    await loadAll()
  } catch {
    ElMessage.error('加载区域列表失败')
  }
  if (!localStorage.getItem(ONBOARD_KEY)) onboardStep.value = 0
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
/* 撤销 / 重做 / 刷新：28x28 图标圆钮，可用态 #374151，disabled 40% 透明 */
.rte-history { color: #374151; }
.rte-history.el-button.is-circle { width: 28px; height: 28px; padding: 0; }
.rte-history.is-disabled { opacity: .4; }
/* 保存并发布：品牌绿实色主按钮 */
.rte-publish {
  --el-button-bg-color: #16a34a;
  --el-button-border-color: #16a34a;
  --el-button-text-color: #fff;
  --el-button-hover-bg-color: #15803d;
  --el-button-hover-border-color: #15803d;
  --el-button-hover-text-color: #fff;
  --el-button-active-bg-color: #15803d;
  --el-button-active-border-color: #15803d;
  --el-button-disabled-bg-color: #a7d9bb;
  --el-button-disabled-border-color: #a7d9bb;
  --el-button-disabled-text-color: #fff;
}
.rte-dirty {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ds-warning, #D97706);
  font-size: var(--ds-fs-label, 12px);
  font-weight: 500;
}
.rte-dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ds-warning, #D97706);
  flex-shrink: 0;
}
.rte-clean { color: var(--mx-muted); font-size: var(--ds-fs-label, 12px); }
.rte-auto { color: var(--mx-muted); font-size: var(--ds-fs-label, 12px); }

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
}

.blk {
  position: relative;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 10px;
  margin: 2px 6px;
  transition: border-color .15s ease, opacity .15s ease;
}
/* hover：浅绿虚线框（outline 不占位，与选中实线框分层） */
.blk:hover { outline: 1.5px dashed rgba(22, 163, 74, .5); outline-offset: 2px; }
.blk.sel { border-color: var(--brand, #36a853); }
.blk.sel:hover { outline: none; }
.blk.off { opacity: .4; }
.blk.readonly { cursor: default; }
/* readonly：灰色虚线 + 🔒 tag */
.blk.readonly:hover { outline: 1.5px dashed #c0c4cc; }
.blk-tag {
  position: absolute;
  top: -9px;
  right: 12px;
  z-index: 4;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--brand, #36a853);
  color: #fff;
  opacity: 0;
  transition: opacity .15s ease;
}
.blk:hover .blk-tag, .blk.sel .blk-tag { opacity: 1; }
.blk-tag.live { background: #16a34a; opacity: 1; }
.tabbar-blk { margin: 0; border-radius: 0 0 12px 12px; }

/* hover 快捷小条（显隐 / 删除） */
.blk-tools {
  position: absolute;
  top: -9px;
  left: 12px;
  z-index: 5;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity .15s ease;
}
.blk:hover .blk-tools { opacity: 1; }
.blk-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 18px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid var(--mx-border, #e3e9f2);
  box-shadow: 0 2px 6px rgba(15, 23, 42, .12);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: transform .15s ease;
}
.blk-tool:hover { transform: scale(1.12); }
.blk-tool.danger:hover { border-color: var(--el-color-danger); }

/* 画布内联编辑 */
.ie {
  cursor: text;
  border-radius: 4px;
  outline: 1px dashed transparent;
  outline-offset: 2px;
  transition: outline-color .15s ease;
}
.ie:hover { outline-color: rgba(22, 163, 74, .5); }
.ie-on, .ie-on:hover {
  outline: 1.5px solid #16a34a;
  outline-offset: 2px;
  background: rgba(255, 255, 255, .35);
}

/* ===== 页面元素 ===== */
.p-status { display: flex; justify-content: space-between; padding: 8px 18px 4px; font-size: 11px; font-weight: 700; color: var(--text-primary, #1d271f); }
.p-sig { letter-spacing: 2px; font-size: 8px; }

.p-banner {
  margin: 10px 12px; height: 130px; border-radius: 12px; background: var(--brand-bg, #e8f3e4);
  overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative;
}
.p-banner img { width: 100%; height: 100%; object-fit: cover; }
.p-dots { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); color: #fff; letter-spacing: 3px; text-shadow: 0 1px 3px rgba(0,0,0,.4); }

.p-notice { margin: 8px 12px; padding: 10px 14px; background: var(--bg-cream, #fff8e8); border-radius: 10px; display: flex; align-items: center; gap: 10px; }
.p-notice-text { color: var(--text-secondary, #55604f); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.p-hot { margin: 8px 12px; background: #fff; border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 10px rgba(38, 58, 32, .08); }
.p-hot-tag { background: #ff4d4f; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
.p-hot-text { font-size: 12.5px; color: var(--text-primary, #1d271f); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.p-tabs { display: flex; gap: 6px; padding: 8px 12px; overflow-x: auto; }
.p-tab { padding: 5px 14px; border-radius: 999px; font-size: 12.5px; color: var(--text-secondary, #55604f); background: #fff; white-space: nowrap; }
.p-tab.active { background: var(--brand, #36a853); color: #fff; font-weight: 600; }

.p-empty { padding: 22px 0; text-align: center; color: var(--text-tertiary, #8a9384); font-size: 12px; width: 100%; }

/* 统一空态 EmptySlot 的画布落位 */
.p-banner .empty-slot { flex: 1; height: calc(100% - 16px); margin: 8px; }
.rte-slot-wrap { display: flex; padding: 8px 12px; }
.rte-kk-empty { padding: 6px; }

.p-tabbar { display: flex; border-top: 1px solid var(--bg-fill, #eef2e8); padding: 8px 0 10px; background: #fff; }
.p-tabbar-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.p-tabbar-item.dim { opacity: .35; }
.p-tabbar-icon { font-size: 14px; }
.p-tabbar-icon-img { width: 22px; height: 22px; object-fit: contain; }
.p-tabbar-text { font-size: 10px; }

/* ===== 首次引导气泡 ===== */
.ob-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(15, 23, 42, .45);
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 引导气泡指向对应区域：①画布 ②右侧面板 ③发布按钮 */
.ob-mask.pos-canvas { justify-content: flex-start; padding-left: 6vw; }
.ob-mask.pos-panel { justify-content: flex-end; padding-right: 4vw; }
.ob-mask.pos-publish { justify-content: flex-end; align-items: flex-start; padding: 11vh 6vw 0 0; }
.ob-card {
  width: 340px;
  padding: 22px 22px 18px;
  background: var(--mx-card, #fff);
  border: 1px solid var(--mx-border, #e3e9f2);
  border-radius: 12px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, .22);
}
.ob-step { font-size: 11px; color: #16a34a; font-weight: 700; letter-spacing: 1px; }
.ob-title { margin-top: 6px; font-size: 16px; font-weight: 800; color: var(--mx-text, #0f172a); }
.ob-desc { margin-top: 8px; font-size: 13px; line-height: 1.7; color: var(--mx-muted, #7d8ba3); }
.ob-ops { margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }

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
.pp-item-sel { border-color: var(--el-color-primary-light-7); background: #fff; }
.pp-item-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--mx-text); }
.pp-item-ops { display: flex; gap: 6px; }
.pp-item-ops .el-icon { cursor: pointer; color: var(--mx-muted); }
.pp-item-ops .el-icon:hover { color: var(--mx-text); }
.pp-item-ops .el-icon.dim { opacity: .3; cursor: not-allowed; }
.pp-item-ops .el-icon.danger:hover { color: var(--el-color-danger); }
.pp-link { display: flex; gap: 6px; }
.pp-tabrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  background: var(--mx-soft);
}
.pp-tabrow .el-icon { cursor: pointer; color: var(--mx-muted); }
.pp-tabrow .el-icon.dim { opacity: .3; cursor: not-allowed; }
.pp-tabpath { font-size: 10px; color: var(--mx-muted); font-family: var(--mx-font-mono); max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-colors { display: flex; gap: 14px; }
.pp-tip { padding: 10px 12px; background: var(--mx-soft); border-radius: 10px; color: var(--mx-muted); font-size: 12.5px; line-height: 1.7; }

/* 页面大纲（右侧默认面板） */
.ol-list { display: flex; flex-direction: column; gap: 4px; }
.ol-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: background .12s ease;
}
.ol-row:hover { background: var(--mx-soft); }
.ol-row.sel { border-left-color: var(--ds-brand, #16A34A); background: var(--ds-brand-soft, rgba(22, 163, 74, 0.10)); }
.ol-icon { display: inline-flex; line-height: 0; color: var(--ds-neutral, #9CA3AF); }
.ol-icon :deep(svg) { width: 16px; height: 16px; display: block; }
.ol-row.sel .ol-icon { color: var(--ds-brand, #16A34A); }
.ol-name { flex: 1; font-size: var(--ds-fs-body, 13px); color: var(--mx-text); }
.ol-eye { color: var(--ds-brand, #16A34A); cursor: pointer; }
.ol-eye:hover { color: var(--ds-brand-hover, #15803D); }
.ol-eye.off { color: var(--ds-neutral, #9CA3AF); }
.ol-tip { margin-top: 10px; font-size: var(--ds-fs-label, 12px); color: var(--mx-muted); }

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

<style scoped>
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.tpl-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 20px 12px;
  border: 1px solid var(--mx-border, #e3e9f2);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease;
}
.tpl-card:hover {
  border-color: var(--el-color-primary-light-7);
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(16, 24, 40, .08);
}
.tpl-emoji { font-size: 26px; }
.tpl-name { font-size: 14px; font-weight: 700; color: var(--mx-text, #0f172a); }
.tpl-desc { font-size: 11.5px; color: var(--mx-muted, #7d8ba3); text-align: center; line-height: 1.5; }
.tpl-tip {
  margin-top: 12px;
  color: var(--mx-muted, #7d8ba3);
  font-size: 12px;
}
</style>

<style scoped>
.rp-panel { display: flex; flex-direction: column; }
.rp-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.rp-time { font-size: 12px; color: var(--mx-muted, #7d8ba3); }
.rp-tip { font-size: 12px; color: var(--mx-muted, #7d8ba3); line-height: 1.7; margin-bottom: 12px; }
.rp-frame {
  width: 100%;
  min-height: 400px;
  border-radius: 16px;
  background: #f4f7f1;
  border: 1px solid var(--mx-border, #e3e9f2);
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
.rp-frame img { width: 100%; display: block; }
.rp-empty { padding: 160px 0; color: var(--mx-muted, #7d8ba3); font-size: 13px; }
</style>

<!-- 发布确认弹窗（ElMessageBox 挂载在 body，需非 scoped 样式） -->
<style>
.pub-confirm .pub-summary { font-size: 13.5px; color: #374151; line-height: 1.7; }
.pub-confirm .pub-warn { margin-top: 8px; font-size: 12.5px; color: #D97706; }
.pub-confirm .pub-confirm-btn.el-button--primary {
  background: #16a34a;
  border-color: #16a34a;
  color: #fff;
}
.pub-confirm .pub-confirm-btn.el-button--primary:hover,
.pub-confirm .pub-confirm-btn.el-button--primary:focus {
  background: #15803d;
  border-color: #15803d;
  color: #fff;
}
</style>

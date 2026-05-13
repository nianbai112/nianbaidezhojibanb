<template>
  <div class="page-shell page-decoration">
    <GlassPageHeader title="页面装修" subtitle="先看装修总览，再逐项配置首页、导航、分享与发布检查">
      <template #actions>
        <el-button @click="loadAllData">刷新</el-button>
        <el-button type="success" :icon="Promotion" :loading="publishing" @click="publishToMini">发布到小程序</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="saveAllConfig">保存全部装修</el-button>
      </template>
    </GlassPageHeader>

    <section class="decoration-hero glass-card">
      <div class="hero-region">
        <el-avatar :size="54" :src="currentRegion?.logo">
          {{ currentRegion?.name?.slice(0, 1) || '区' }}
        </el-avatar>
        <div>
          <div class="hero-eyebrow">当前装修区域</div>
          <div class="hero-title">{{ currentRegion?.name || '请选择区域' }}</div>
          <div class="hero-meta">
            <el-tag :type="currentRegion?.isOpen ? 'success' : 'info'" size="small">
              {{ currentRegion?.isOpen ? '运营中' : '未开启' }}
            </el-tag>
            <span>{{ activeMenuLabel }}</span>
          </div>
        </div>
      </div>
      <div class="hero-progress">
        <div class="hero-stat">
          <b>{{ completionPercent }}%</b>
          <span>装修完整度</span>
        </div>
        <el-progress :percentage="completionPercent" :color="completionColor" :stroke-width="10" />
      </div>
      <div class="hero-metrics">
        <div class="metric-pill">
          <b>{{ completedModuleCount }}/{{ menuItems.length }}</b>
          <span>模块完成</span>
        </div>
        <div class="metric-pill">
          <b>{{ enabledTabsCount }}</b>
          <span>启用 Tabs</span>
        </div>
        <div class="metric-pill">
          <b>{{ enabledTabbarCount }}</b>
          <span>底部导航</span>
        </div>
      </div>
      <div class="hero-actions">
        <el-button type="primary" plain @click="runPublishCheck">发布检查</el-button>
        <el-button @click="activeMenu = 'publish'">查看清单</el-button>
      </div>
    </section>

    <div class="decoration-layout">
      <!-- 左侧：区域与装修目录 -->
      <aside class="decoration-sidebar glass-card">
        <div class="sidebar-section">
          <div class="section-title">选择区域</div>
          <el-select v-model="selectedRegionId" placeholder="请选择区域" style="width:100%" @change="onRegionChange" filterable>
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </div>

        <div v-if="currentRegion" class="sidebar-section region-info">
          <div class="region-header">
            <el-avatar :size="40" :src="currentRegion.logo" />
            <div class="region-meta">
              <div class="region-name">{{ currentRegion.name }}</div>
              <el-tag :type="currentRegion.isOpen ? 'success' : 'danger'" size="small">
                {{ currentRegion.isOpen ? '运营中' : '已关闭' }}
              </el-tag>
            </div>
          </div>
          <div class="completion-bar">
            <div class="completion-label">装修完整度</div>
            <el-progress :percentage="completionPercent" :color="completionColor" :stroke-width="8" />
          </div>
        </div>

        <div class="sidebar-section">
          <div class="section-title">装修目录</div>
          <div class="menu-list">
            <div v-for="item in menuItems" :key="item.key" class="menu-item" :class="{ active: activeMenu === item.key }" @click="activeMenu = item.key">
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
              <el-icon v-if="item.completed" class="check-icon"><CircleCheck /></el-icon>
            </div>
          </div>
        </div>
      </aside>

      <!-- 中间：配置工作区 -->
      <main class="decoration-main">
        <!-- 首页装修 -->
        <div v-if="activeMenu === 'home'" class="config-section glass-card">
          <div class="section-head">
            <div class="card-title">首页装修</div>
            <el-button size="small" type="primary" @click="saveHomeConfig">保存当前模块</el-button>
          </div>
          <div class="config-content">
            <div class="switch-group">
              <div class="switch-item">
                <div>
                  <b>显示轮播图</b>
                  <p>在小程序首页顶部展示轮播图</p>
                </div>
                <el-switch v-model="homeConfig.show_carousel" />
              </div>
              <div class="switch-item">
                <div>
                  <b>显示公告</b>
                  <p>在首页展示区域公告信息</p>
                </div>
                <el-switch v-model="homeConfig.show_announcement" />
              </div>
              <div class="switch-item">
                <div>
                  <b>显示金刚区</b>
                  <p>在首页展示快捷入口导航</p>
                </div>
                <el-switch v-model="homeConfig.show_kingkong" />
              </div>
              <div class="switch-item">
                <div>
                  <b>显示热门列表</b>
                  <p>在首页展示热门内容列表</p>
                </div>
                <el-switch v-model="homeConfig.show_hot_list" />
              </div>
            </div>
            <el-divider />
            <div class="banner-editor">
              <div class="subsection-head">
                <div>
                  <div class="subsection-title">横幅轮播广告位</div>
                  <p>这里就是首页顶部横道图，支持上传广告主图，并配置点击后的跳转。</p>
                </div>
                <el-button size="small" type="primary" plain :icon="Plus" @click="addCarouselItem">添加横幅</el-button>
              </div>

              <div v-if="carouselItems.length" class="banner-list">
                <div v-for="(item, idx) in carouselItems" :key="item.id || idx" class="banner-card">
                  <div class="banner-cover">
                    <ImageUploadBox
                      v-model="item.image"
                      scene="region-carousel"
                      shape="wide"
                      placeholder="上传横道图"
                      tip="建议 750x350px，首页广告主要来源"
                      :max-size="5"
                    />
                  </div>
                  <div class="banner-fields">
                    <el-input v-model="item.title" placeholder="广告标题，如：新生开学季" />
                    <el-input v-model="item.subtitle" placeholder="副标题/卖点，可不填" />
                    <el-select v-model="item.linkType" placeholder="点击跳转方式">
                      <el-option v-for="opt in jumpTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </el-select>
                    <el-select
                      v-if="item.linkType === 'internal'"
                      v-model="item.path"
                      filterable
                      allow-create
                      placeholder="选择或输入小程序页面路径"
                    >
                      <el-option v-for="page in miniProgramPageOptions" :key="page.value" :label="page.label" :value="page.value" />
                    </el-select>
                    <el-input v-else-if="item.linkType === 'miniProgram'" v-model="item.appId" placeholder="外部小程序 AppID" />
                    <el-input v-else-if="item.linkType === 'webview'" v-model="item.path" placeholder="H5 链接，如 https://..." />
                    <el-input v-else-if="item.linkType === 'image'" v-model="item.path" placeholder="点击后预览的图片 URL，不填默认预览横幅图" />
                    <el-input v-else v-model="item.path" placeholder="不跳转时可留空" disabled />
                    <el-input v-model="item.query" placeholder="跳转参数 Query，如 id=1&from=banner" />
                    <el-input v-model="item.remark" placeholder="运营备注，如广告主/投放时间" />
                  </div>
                  <div class="banner-actions">
                    <el-switch v-model="item.enabled" active-text="启用" inactive-text="停用" />
                    <el-button size="small" circle :disabled="idx === 0" @click="moveCarouselItem(idx, -1)"><el-icon><Top /></el-icon></el-button>
                    <el-button size="small" circle :disabled="idx === carouselItems.length - 1" @click="moveCarouselItem(idx, 1)"><el-icon><Bottom /></el-icon></el-button>
                    <el-button size="small" circle type="danger" @click="removeCarouselItem(idx)"><el-icon><Delete /></el-icon></el-button>
                  </div>
                </div>
              </div>
              <div v-else class="empty-inline">
                <span>还没有横幅广告图。点击右上角“添加横幅”，上传后小程序首页才会出现轮播广告。</span>
                <el-button size="small" type="primary" :icon="Plus" @click="addCarouselItem">添加第一张</el-button>
              </div>
            </div>
            <el-divider />
            <el-form label-position="top">
              <div class="form-grid two relaxed">
                <el-form-item label="热门/精选显示模式">
                  <el-select v-model="homeConfig.hot_featured_display" style="width:100%">
                    <el-option label="热门优先" value="hot_first" />
                    <el-option label="精选优先" value="featured_first" />
                    <el-option label="混合显示" value="mixed" />
                  </el-select>
                </el-form-item>
                <el-form-item label="首页功能区样式">
                  <el-select v-model="homeConfig.home_feature_style" style="width:100%">
                    <el-option label="默认样式" value="default" />
                    <el-option label="卡片样式" value="card" />
                    <el-option label="简约样式" value="simple" />
                  </el-select>
                </el-form-item>
              </div>
            </el-form>
          </div>
        </div>

        <!-- 首页 Tabs -->
        <div v-if="activeMenu === 'tabs'" class="config-section glass-card">
          <div class="section-head">
            <div class="card-title">首页 Tabs 配置</div>
            <div class="head-actions">
              <el-button size="small" @click="resetTabs">恢复默认</el-button>
              <el-button size="small" type="primary" @click="saveTabsConfig">保存当前模块</el-button>
            </div>
          </div>
          <div class="config-content">
            <div class="tabs-editor rich-tabs-editor">
              <div v-for="(tab, idx) in tabsConfig" :key="idx" class="tab-item tab-item-rich">
                <div class="tab-row-main">
                  <div class="tab-index">{{ idx + 1 }}</div>
                  <el-input v-model="tab.name" placeholder="Tab名称" style="width:140px" />
                  <el-select v-model="tab.type" placeholder="内容类型" style="width:128px" @change="onTabTypeChange(tab)">
                    <el-option label="笔记" value="note" />
                    <el-option label="外卖" value="takeout" />
                    <el-option label="二手" value="secondhand" />
                    <el-option label="活动" value="activity" />
                    <el-option label="评选" value="vote" />
                    <el-option label="商家" value="merchant" />
                    <el-option label="跑腿" value="errand" />
                    <el-option label="圈子" value="circle" />
                    <el-option label="自定义" value="custom" />
                  </el-select>
                  <el-tag effect="plain" type="info">{{ getLinkTypeLabel(tab.linkType) }}</el-tag>
                  <el-switch v-model="tab.enabled" active-text="启用" inactive-text="禁用" />
                  <el-button size="small" plain @click="toggleTabDetail(idx)">
                    {{ isTabDetailOpen(idx) ? '收起详情' : '配置详情' }}
                  </el-button>
                  <div class="tab-actions">
                    <el-button size="small" circle :disabled="idx === 0" @click="moveTab(idx, -1)"><el-icon><Top /></el-icon></el-button>
                    <el-button size="small" circle :disabled="idx === tabsConfig.length - 1" @click="moveTab(idx, 1)"><el-icon><Bottom /></el-icon></el-button>
                    <el-button size="small" circle type="danger" :disabled="tabsConfig.length <= 1" @click="removeTab(idx)"><el-icon><Delete /></el-icon></el-button>
                  </div>
                </div>
                <div v-show="isTabDetailOpen(idx)" class="tab-row-extra">
                  <div class="tab-fields">
                    <el-select v-model="tab.linkType" placeholder="跳转方式">
                      <el-option label="内容筛选" value="filter" />
                      <el-option label="小程序页面" value="internal" />
                      <el-option label="外部小程序" value="miniProgram" />
                      <el-option label="网页 H5" value="webview" />
                      <el-option label="不跳转" value="none" />
                    </el-select>
                    <el-input v-model="tab.path" placeholder="内部页面路径，如 pagesB/post/createPost" />
                    <el-input v-model="tab.appId" placeholder="外部小程序 AppID（跳外部时填写）" />
                    <el-input v-model="tab.query" placeholder="参数 Query，如 regionId={{regionId}}" />
                    <el-input v-model="tab.remark" placeholder="运营备注，说明这个 Tab 的用途" />
                  </div>
                  <div class="tab-assets">
                    <div class="tab-upload-pair compact">
                      <div class="mini-upload-label">Tab 图标</div>
                      <ImageUploadBox v-model="tab.icon" scene="region-tab-icon" shape="square" placeholder="上传图标" tip="建议 80x80" :max-size="2" />
                    </div>
                    <div class="tab-upload-pair compact wide">
                      <div class="mini-upload-label">展示图/封面</div>
                      <ImageUploadBox v-model="tab.image" scene="region-tab-cover" shape="wide" placeholder="上传图片" tip="用于推荐位/视觉预览" :max-size="5" />
                    </div>
                  </div>
                </div>
              </div>
              <el-button class="add-tab-btn" @click="addTab"><el-icon><Plus /></el-icon>添加 Tab</el-button>
            </div>
            <div class="form-tip">至少保留 1 个启用的 Tab。跳转字段会一起保存到 region_tabs，供小程序端读取。</div>
          </div>
        </div>

        <!-- 首页导航/金刚区 -->
        <div v-if="activeMenu === 'nav'" class="config-section glass-card">
          <div class="section-head">
            <div class="card-title">首页导航/金刚区配置</div>
            <el-button size="small" type="primary" @click="saveNavConfig">保存当前模块</el-button>
          </div>
          <div class="config-content">
            <el-form label-position="top">
              <div class="form-grid two relaxed">
                <el-form-item label="导航布局">
                  <el-select v-model="homeNavLayout" style="width:100%">
                    <el-option v-for="n in 9" :key="n" :label="`布局 ${n}`" :value="n" />
                  </el-select>
                </el-form-item>
              </div>
            </el-form>
            <el-divider />
            <div class="nav-toolbar">
              <div>
                <div class="subsection-title">金刚区入口</div>
                <p>上传入口图标，配置点击后的真实小程序路径；保存后由首页接口下发给小程序。</p>
              </div>
              <el-button size="small" type="primary" plain :icon="Plus" @click="addNav">添加入口</el-button>
            </div>
            <div class="nav-list nav-card-list">
              <div v-for="(nav, idx) in navConfig" :key="nav.id || idx" class="nav-card">
                <div class="nav-card-index">{{ idx + 1 }}</div>
                <div class="nav-icon-upload">
                  <ImageUploadBox
                    v-model="nav.icon"
                    scene="region-nav-icon"
                    shape="square"
                    placeholder="上传图标"
                    tip="建议 96x96"
                    :max-size="2"
                  />
                </div>
                <div class="nav-card-fields">
                  <div class="nav-primary-fields">
                    <el-input v-model="nav.name" placeholder="入口名称，如 外卖" />
                    <el-input v-model="nav.subtitle" placeholder="副标题，可不填" />
                    <el-select v-model="nav.linkType" placeholder="跳转方式">
                      <el-option v-for="opt in jumpTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </el-select>
                    <el-select
                      v-if="nav.linkType === 'internal'"
                      v-model="nav.path"
                      filterable
                      allow-create
                      placeholder="选择或输入小程序页面路径"
                    >
                      <el-option v-for="page in miniProgramPageOptions" :key="page.value" :label="page.label" :value="page.value" />
                    </el-select>
                    <el-input v-else-if="nav.linkType === 'miniProgram'" v-model="nav.appId" placeholder="外部小程序 AppID" />
                    <el-input v-else-if="nav.linkType === 'webview'" v-model="nav.path" placeholder="H5 链接，如 https://..." />
                    <el-input v-else-if="nav.linkType === 'image'" v-model="nav.path" placeholder="点击预览图片 URL" />
                    <el-input v-else v-model="nav.path" placeholder="不跳转时可留空" disabled />
                  </div>
                  <div class="nav-secondary-fields">
                    <el-input v-model="nav.query" placeholder="参数 Query，如 category=takeout" />
                    <el-input v-model="nav.remark" placeholder="运营备注" />
                  </div>
                </div>
                <div class="nav-card-actions">
                  <el-switch v-model="nav.enabled" active-text="启用" inactive-text="停用" />
                  <el-button size="small" circle :disabled="idx === 0" @click="moveNav(idx, -1)"><el-icon><Top /></el-icon></el-button>
                  <el-button size="small" circle :disabled="idx === navConfig.length - 1" @click="moveNav(idx, 1)"><el-icon><Bottom /></el-icon></el-button>
                  <el-button size="small" circle type="danger" @click="removeNav(idx)"><el-icon><Delete /></el-icon></el-button>
                </div>
              </div>
              <el-button class="add-tab-btn" @click="addNav"><el-icon><Plus /></el-icon>添加入口</el-button>
            </div>
          </div>
        </div>

        <!-- 首页榜单 -->
        <div v-if="activeMenu === 'leaderboard'" class="config-section glass-card">
          <div class="section-head">
            <div class="card-title">首页榜单配置</div>
            <el-button size="small" type="primary" @click="saveLeaderboardConfig">保存当前模块</el-button>
          </div>
          <div class="config-content">
            <div class="switch-item" style="margin-bottom:16px">
              <div>
                <b>启用首页榜单</b>
                <p>在小程序首页展示榜单模块</p>
              </div>
              <el-switch v-model="leaderboardConfig.enabled" />
            </div>
            <el-divider />
            <div v-for="(item, idx) in leaderboardConfig.items" :key="item.type" class="leaderboard-item">
              <el-input v-model="item.title" style="width:140px" />
              <span class="muted">{{ item.type }}</span>
              <el-input-number v-model="item.limit" :min="1" :max="20" size="small" style="width:100px" />
              <el-switch v-model="item.enabled" size="small" />
              <div class="item-actions">
                <el-button size="small" circle :disabled="idx === 0" @click="moveLeaderboard(idx, -1)"><el-icon><Top /></el-icon></el-button>
                <el-button size="small" circle :disabled="idx === leaderboardConfig.items.length - 1" @click="moveLeaderboard(idx, 1)"><el-icon><Bottom /></el-icon></el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 消息页 -->
        <div v-if="activeMenu === 'message'" class="config-section glass-card">
          <div class="section-head">
            <div class="card-title">消息页布局配置</div>
            <el-button size="small" type="primary" @click="saveMessageConfig">保存当前模块</el-button>
          </div>
          <div class="config-content">
            <el-form label-position="top">
              <div class="form-grid two relaxed">
                <el-form-item label="消息页布局">
                  <el-select v-model="messageConfig.message_page_layout" style="width:100%">
                    <el-option label="默认布局" value="default" />
                    <el-option label="小红书风格" value="xiaohongshu" />
                  </el-select>
                </el-form-item>
                <el-form-item label="区域私信开关">
                  <el-switch v-model="messageConfig.private_message_enabled" active-text="开启" inactive-text="关闭" />
                </el-form-item>
              </div>
            </el-form>
          </div>
        </div>

        <!-- 我的页 -->
        <div v-if="activeMenu === 'profile'" class="config-section glass-card">
          <div class="section-head">
            <div class="card-title">我的页布局配置</div>
            <el-button size="small" type="primary" @click="saveProfileConfig">保存当前模块</el-button>
          </div>
          <div class="config-content">
            <el-form label-position="top">
              <div class="form-grid two relaxed">
                <el-form-item label="我的页布局">
                  <el-select v-model="profileConfig.profile_page_layout" style="width:100%">
                    <el-option label="默认布局" value="default" />
                    <el-option label="小红书风格" value="xiaohongshu" />
                  </el-select>
                </el-form-item>
              </div>
            </el-form>
          </div>
        </div>

        <!-- 底部导航预览 -->
        <div v-if="activeMenu === 'tabbar'" class="config-section glass-card">
          <div class="section-head">
            <div class="card-title">底部导航预览</div>
            <el-button size="small" type="primary" @click="goToTabbarManager">去底部导航管理</el-button>
          </div>
          <div class="config-content">
            <div class="tabbar-preview-list">
              <div v-for="tab in tabbarData" :key="tab.id" class="tabbar-preview-item">
                <el-avatar :size="32" :src="tab.iconPath" />
                <span>{{ tab.name }}</span>
                <el-tag :type="tab.enabled ? 'success' : 'info'" size="small">
                  {{ tab.enabled ? '启用' : '禁用' }}
                </el-tag>
              </div>
              <el-empty v-if="!tabbarData.length" description="暂无底部导航配置" />
            </div>
          </div>
        </div>

        <!-- 分享卡片预览 -->
        <div v-if="activeMenu === 'share'" class="config-section glass-card">
          <div class="section-head">
            <div class="card-title">分享卡片预览</div>
            <el-button size="small" type="primary" @click="goToShareSettings">去分享设置</el-button>
          </div>
          <div class="config-content">
            <div class="share-card-preview">
              <div class="share-card">
                <div class="share-header">
                  <el-avatar :size="24" :src="currentRegion?.logo" />
                  <span>{{ currentRegion?.name }}</span>
                </div>
                <div class="share-title">{{ shareConfig.title || '欢迎来到' + (currentRegion?.name || '小程序') }}</div>
                <div class="share-image" v-if="shareConfig.imageUrl">
                  <el-image :src="shareConfig.imageUrl" fit="cover" style="width:100%;height:120px;border-radius:8px" />
                </div>
                <div class="share-footer">
                  <span>小程序标识</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 发布检查 -->
        <div v-if="activeMenu === 'publish'" class="config-section glass-card">
          <div class="section-head">
            <div class="card-title">发布检查</div>
            <el-button size="small" @click="runPublishCheck"><el-icon><Refresh /></el-icon>重新检测</el-button>
          </div>
          <div class="config-content">
            <div class="check-list">
              <div v-for="check in publishChecks" :key="check.key" class="check-item">
                <div class="check-info">
                  <el-icon :class="check.status === 'pass' ? 'text-success' : check.status === 'warn' ? 'text-warning' : 'text-danger'">
                    <component :is="check.status === 'pass' ? 'CircleCheck' : check.status === 'warn' ? 'Warning' : 'CircleClose'" />
                  </el-icon>
                  <div>
                    <div class="check-name">{{ check.name }}</div>
                    <div class="check-desc">{{ check.description }}</div>
                  </div>
                </div>
                <el-tag :type="check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'danger'" size="small">
                  {{ check.status === 'pass' ? '已完成' : check.status === 'warn' ? '警告' : '未完成' }}
                </el-tag>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- 预览器先移除：配置工作台优先，避免挤压表单 -->
      <aside v-if="false" class="decoration-preview glass-card">
        <div class="preview-header">
          <div class="preview-title">小程序预览</div>
          <el-select v-model="previewPage" size="small" style="width:120px">
            <el-option label="首页" value="home" />
            <el-option label="消息页" value="message" />
            <el-option label="我的页" value="profile" />
            <el-option label="底部导航" value="tabbar" />
            <el-option label="分享卡片" value="share" />
          </el-select>
        </div>

        <!-- 高保真预览器 -->
        <MiniProgramPreview
          :nav-title="previewNavTitle"
          :show-tabbar="previewPage !== 'share'"
          :nav-background-color="previewPage === 'home' ? '#ffffff' : '#ffffff'"
        >
          <!-- 首页预览 -->
          <PreviewHomePage
            v-if="previewPage === 'home'"
            :region="currentRegion"
            :show-carousel="homeConfig.show_carousel"
            :show-announcement="homeConfig.show_announcement"
            :show-kingkong="homeConfig.show_kingkong"
            :show-hot-list="homeConfig.show_hot_list"
            :hot-featured-display="homeConfig.hot_featured_display"
            :carousel-images="currentRegion?.carousel_images || []"
            :announcement-text="currentRegion?.announcement || ''"
            :nav-items="navConfig"
            :tabs="tabsConfig"
            :leaderboard="leaderboardConfig"
            :home-feature-style="homeConfig.home_feature_style"
          />

          <!-- 消息页预览 -->
          <PreviewMessagePage
            v-if="previewPage === 'message'"
            :message-page-layout="messageConfig.message_page_layout"
            :private-message-enabled="messageConfig.private_message_enabled"
            :message-navigation-cards="currentRegion?.message_navigation?.cards || []"
          />

          <!-- 我的页预览 -->
          <PreviewProfilePage
            v-if="previewPage === 'profile'"
            :profile-page-layout="profileConfig.profile_page_layout"
            :user-info="userInfo"
            :layout-items="currentRegion?.profile_layout_items || []"
          />

          <!-- 底部导航预览 -->
          <div v-if="previewPage === 'tabbar'" class="tabbar-preview-page">
            <div class="tabbar-page-content">
              <div class="tabbar-preview-title">底部导航配置</div>
              <div class="tabbar-grid">
                <div v-for="tab in tabbarData.filter(t => t.enabled)" :key="tab.id" class="tabbar-grid-item">
                  <el-avatar :size="40" :src="tab.iconPath" />
                  <span>{{ tab.name }}</span>
                </div>
              </div>
              <el-empty v-if="!tabbarData.filter(t => t.enabled).length" description="暂无启用的底部导航" />
            </div>
          </div>

          <!-- 分享卡片预览 -->
          <PreviewShareCard
            v-if="previewPage === 'share'"
            :region-name="currentRegion?.name"
            :region-logo="currentRegion?.logo"
            :share-title="shareConfig.title"
            :share-description="shareConfig.description"
            :share-image="shareConfig.imageUrl"
            share-type="friend"
          />

          <template #tabbar>
            <PreviewTabbar
              v-if="previewPage !== 'share'"
              :tabs="tabbarData"
              :color="tabbarConfig.color"
              :selected-color="tabbarConfig.selectedColor"
              :background-color="tabbarConfig.backgroundColor"
            />
          </template>
        </MiniProgramPreview>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Check, Promotion, Top, Bottom, Delete, Plus, Refresh, CircleCheck, CircleClose, Warning,
  House, Grid, Trophy, ChatDotRound, User, Setting, Bell, Share
} from '@element-plus/icons-vue'
import { request } from '@/api/request'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import MiniProgramPreview from '@/components/preview/MiniProgramPreview.vue'
import PreviewHomePage from '@/components/preview/PreviewHomePage.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import PreviewMessagePage from '@/components/preview/PreviewMessagePage.vue'
import PreviewProfilePage from '@/components/preview/PreviewProfilePage.vue'
import PreviewTabbar from '@/components/preview/PreviewTabbar.vue'
import PreviewShareCard from '@/components/preview/PreviewShareCard.vue'

const router = useRouter()
const route = useRoute()

// 区域数据
const regions = ref<any[]>([])
const selectedRegionId = ref('')
const currentRegion = computed(() => regions.value.find(r => r.id === selectedRegionId.value))

function mergeCurrentRegion(data: any) {
  const index = regions.value.findIndex(r => r.id === selectedRegionId.value)
  if (index >= 0) {
    regions.value[index] = { ...regions.value[index], ...data }
  }
}

function normalizeTabbarConfig(raw: any) {
  const config = raw?.config || raw?.data?.config || raw
  const list = Array.isArray(config?.list)
    ? config.list
    : Array.isArray(config?.tabs)
      ? config.tabs
      : Array.isArray(config)
        ? config
        : []
  return {
    color: config?.color || '#999999',
    selectedColor: config?.selectedColor || '#1677ff',
    backgroundColor: config?.backgroundColor || '#ffffff',
    list: list.map((item: any, index: number) => ({
      id: item.id || item.key || `tab_${index}`,
      name: item.name || item.text || item.label || '导航',
      iconPath: item.iconPath || item.icon || '',
      selectedIconPath: item.selectedIconPath || item.activeIcon || item.selectedIcon || '',
      enabled: item.enabled !== false,
      isPublish: item.isPublish || item.action === 'publish',
      ...item,
    }))
  }
}

function normalizeShareConfig(raw: any) {
  const data = raw?.data || raw || {}
  let extra: any = {}
  try {
    extra = typeof data.activityRules === 'string'
      ? JSON.parse(data.activityRules || '{}')
      : (data.activityRules || {})
  } catch {
    extra = {}
  }
  return {
    title: data.title || data.shareTitle || data.activityTitle || extra.title || '',
    description: data.description || data.shareDescription || extra.description || '',
    imageUrl: data.imageUrl || data.shareImageUrl || data.activityImage || extra.imageUrl || '',
  }
}

// 用户信息
const userInfo = ref({
  id: 'preview-user',
  nickname: '预览用户',
  avatar: '',
  bio: '这里仅预览页面结构，真实用户数据由小程序端登录后加载',
  following_count: 0,
  follower_count: 0,
  total_like_count: 0,
  profile_layout_items: []
})

// 菜单配置
const activeMenu = ref('home')
const menuItems = ref([
  { key: 'home', label: '首页装修', icon: 'House', completed: false },
  { key: 'tabs', label: '首页 Tabs', icon: 'Grid', completed: false },
  { key: 'nav', label: '首页导航', icon: 'Grid', completed: false },
  { key: 'leaderboard', label: '首页榜单', icon: 'Trophy', completed: false },
  { key: 'message', label: '消息页', icon: 'ChatDotRound', completed: false },
  { key: 'profile', label: '我的页', icon: 'User', completed: false },
  { key: 'tabbar', label: '底部导航预览', icon: 'Setting', completed: false },
  { key: 'share', label: '分享卡片预览', icon: 'Share', completed: false },
  { key: 'publish', label: '发布检查', icon: 'CircleCheck', completed: false },
])

// 首页装修配置
const homeConfig = reactive({
  show_carousel: true,
  show_announcement: true,
  show_kingkong: true,
  show_hot_list: true,
  hot_featured_display: 'hot_first',
  home_feature_style: 'default',
  home_nav_layout: 1,
})

type DecorationJumpType = 'filter' | 'internal' | 'miniProgram' | 'webview' | 'image' | 'none'

const jumpTypeOptions = [
  { label: '内容筛选', value: 'filter' },
  { label: '小程序页面', value: 'internal' },
  { label: '外部小程序', value: 'miniProgram' },
  { label: '网页 H5', value: 'webview' },
  { label: '图片预览', value: 'image' },
  { label: '不跳转', value: 'none' },
]

const miniProgramPageOptions = [
  { label: '发笔记', value: 'pagesB/post/createPost' },
  { label: '笔记列表', value: 'pagesB/post/post' },
  { label: '圈子首页', value: 'pages/tabbar/containers/containers' },
  { label: '外卖商家', value: 'pagesA/selection/selection' },
  { label: '商家列表', value: 'pagesA/merchant/merchant' },
  { label: '二手交易', value: 'pagesA/SecondHand/Second-hand-selease/Second-hand-selease' },
  { label: '活动/分享有礼', value: 'pagesA/news/SharingCourtesy/SharingCourtesy' },
  { label: '评分首页', value: 'pagesA/RatingsHome/RatingsHome' },
  { label: '打卡地图', value: 'pagesA/RatingsHome/PunchingMap/PunchingMap' },
  { label: '跑腿', value: 'pages/tabbar/RunErrands/RunErrands' },
  { label: '商城首页', value: 'pagesB/mall/index/index' },
  { label: '商城商品', value: 'pagesB/mall/product/list' },
  { label: '签到中心', value: 'pagesB/signin/signin' },
  { label: '学生认证', value: 'pages/auth/StudentCertification/StudentCertification' },
  { label: '个人中心', value: 'pages/tabbar/auth/PersonalHomepage' },
]

const typePathMap: Record<string, string> = {
  note: 'pagesB/post/post',
  takeout: 'pagesA/selection/selection',
  secondhand: 'pagesA/SecondHand/Second-hand-selease/Second-hand-selease',
  activity: 'pagesA/news/SharingCourtesy/SharingCourtesy',
  vote: 'pagesA/RatingsHome/RatingsHome',
  rating: 'pagesA/RatingsHome/RatingsHome',
  merchant: 'pagesA/merchant/merchant',
  errand: 'pages/tabbar/RunErrands/RunErrands',
  circle: 'pages/tabbar/containers/containers',
  mall: 'pagesB/mall/index/index',
}

const carouselItems = ref<any[]>([])

// 首页 Tabs 配置
const tabsConfig = ref<any[]>([
  { name: '笔记', type: 'note', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesB/post/post', appId: '', query: '', remark: '' },
  { name: '外卖', type: 'takeout', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesA/selection/selection', appId: '', query: '', remark: '' },
  { name: '二手', type: 'secondhand', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesA/SecondHand/Second-hand-selease/Second-hand-selease', appId: '', query: '', remark: '' },
  { name: '活动', type: 'activity', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesA/news/SharingCourtesy/SharingCourtesy', appId: '', query: '', remark: '' },
])

// 首页导航配置
const homeNavLayout = ref(1)
const navConfig = ref<any[]>([
  { name: '笔记', subtitle: '', icon: '', page: 'pagesB/post/post', path: 'pagesB/post/post', linkType: 'internal', appId: '', query: '', remark: '', enabled: true },
  { name: '外卖', subtitle: '', icon: '', page: 'pagesA/selection/selection', path: 'pagesA/selection/selection', linkType: 'internal', appId: '', query: '', remark: '', enabled: true },
  { name: '二手', subtitle: '', icon: '', page: 'pagesA/SecondHand/Second-hand-selease/Second-hand-selease', path: 'pagesA/SecondHand/Second-hand-selease/Second-hand-selease', linkType: 'internal', appId: '', query: '', remark: '', enabled: true },
  { name: '活动', subtitle: '', icon: '', page: 'pagesA/news/SharingCourtesy/SharingCourtesy', path: 'pagesA/news/SharingCourtesy/SharingCourtesy', linkType: 'internal', appId: '', query: '', remark: '', enabled: true },
])

// 首页榜单配置
const leaderboardConfig = reactive({
  enabled: true,
  items: [
    { type: 'hot', title: '热门榜', limit: 10, enabled: true },
    { type: 'new', title: '新帖榜', limit: 10, enabled: true },
    { type: 'like', title: '点赞榜', limit: 10, enabled: true },
    { type: 'comment', title: '评论榜', limit: 10, enabled: true },
  ]
})

// 消息页配置
const messageConfig = reactive({
  message_page_layout: 'default',
  private_message_enabled: true,
})

// 我的页配置
const profileConfig = reactive({
  profile_page_layout: 'default',
})

// 底部导航数据
const tabbarData = ref<any[]>([])
const tabbarConfig = reactive({
  color: '#999999',
  selectedColor: '#1677ff',
  backgroundColor: '#ffffff'
})

// 分享设置数据
const shareConfig = reactive({
  title: '',
  description: '',
  imageUrl: '',
})

// 预览页面
const previewPage = ref('home')

// 预览导航标题
const previewNavTitle = computed(() => {
  switch (previewPage.value) {
    case 'home':
      return currentRegion.value?.name || '首页'
    case 'message':
      return '消息'
    case 'profile':
      return '我的'
    case 'tabbar':
      return '底部导航'
    case 'share':
      return '分享预览'
    default:
      return '首页'
  }
})

// 发布检查
const publishChecks = ref([
  { key: 'region', name: '选择区域', description: '必须选择一个区域才能进行装修', status: 'pass' },
  { key: 'tabs', name: '首页 Tabs', description: '至少需要 1 个启用的 Tab', status: 'pass' },
  { key: 'homeModule', name: '首页内容模块', description: '至少启用一个内容模块', status: 'pass' },
  { key: 'tabbar', name: '底部导航', description: '底部导航需要配置', status: 'pass' },
  { key: 'share', name: '分享卡片', description: '分享首页卡片需要配置', status: 'pass' },
  { key: 'message', name: '消息页布局', description: '消息页布局需要配置', status: 'pass' },
  { key: 'profile', name: '我的页布局', description: '我的页布局需要配置', status: 'pass' },
  { key: 'regionStatus', name: '区域状态', description: '区域需要处于开放状态', status: 'pass' },
])

// 保存状态
const saving = ref(false)
const publishing = ref(false)
const expandedTabs = ref(new Set<number>())

// 完整度计算
const completionPercent = computed(() => {
  if (!currentRegion.value) return 0
  const checks = publishChecks.value
  const passed = checks.filter(c => c.status === 'pass').length
  return Math.round((passed / checks.length) * 100)
})

const completionColor = computed(() => {
  if (completionPercent.value >= 80) return '#67c23a'
  if (completionPercent.value >= 60) return '#e6a23c'
  return '#f56c6c'
})

const activeMenuLabel = computed(() => {
  return menuItems.value.find(item => item.key === activeMenu.value)?.label || '首页装修'
})

const completedModuleCount = computed(() => {
  if (!currentRegion.value) return 0
  return menuItems.value.filter(item => item.completed).length
})

const enabledTabsCount = computed(() => {
  if (!currentRegion.value) return 0
  return tabsConfig.value.filter(tab => tab.enabled !== false).length
})

const enabledTabbarCount = computed(() => {
  if (!currentRegion.value) return 0
  return tabbarData.value.filter(item => item.enabled).length
})

function normalizeMiniPath(path?: string) {
  return String(path || '').trim().replace(/^\/+/, '')
}

function normalizeJumpType(value?: string): DecorationJumpType {
  const raw = String(value || '').trim()
  if (['filter', 'internal', 'miniProgram', 'webview', 'image', 'none'].includes(raw)) return raw as DecorationJumpType
  if (raw === 'miniapp') return 'miniProgram'
  if (raw === 'h5') return 'webview'
  return 'internal'
}

function makeJumpPayload(item: any) {
  const linkType = normalizeJumpType(item?.linkType || item?.jumpType)
  const path = linkType === 'image'
    ? (item?.path || item?.image || item?.imageUrl || item?.url || '')
    : normalizeMiniPath(item?.path || item?.page || item?.link || '')
  return {
    linkType,
    jumpType: linkType,
    path,
    page: path,
    appId: item?.appId || item?.appid || '',
    query: item?.query || '',
    link: item?.link || path,
  }
}

function normalizeCarouselItem(item: any, index = 0) {
  const raw = typeof item === 'string' ? { image: item } : (item || {})
  const image = raw.image || raw.imageUrl || raw.image_url || raw.url || raw.cover || ''
  return {
    id: raw.id || `carousel_${Date.now()}_${index}`,
    title: raw.title || '',
    subtitle: raw.subtitle || raw.description || '',
    image,
    imageUrl: image,
    enabled: raw.enabled !== false && raw.isShow !== false && raw.status !== 0,
    sortOrder: raw.sortOrder ?? raw.sort_order ?? index,
    remark: raw.remark || '',
    ...makeJumpPayload(raw),
  }
}

function serializeCarouselItems() {
  return carouselItems.value
    .map((item, index) => {
      const image = item.image || item.imageUrl || ''
      const jump = makeJumpPayload(item)
      return {
        id: item.id || `carousel_${index}`,
        title: item.title || '',
        subtitle: item.subtitle || '',
        image,
        imageUrl: image,
        url: image,
        enabled: item.enabled !== false,
        isShow: item.enabled !== false,
        sortOrder: index,
        remark: item.remark || '',
        ...jump,
      }
    })
    .filter(item => item.image || item.title)
}

function normalizeHomeNav(nav: any, index = 0) {
  const raw = nav || {}
  const type = raw.type || raw.key || raw.name || 'custom'
  const path = normalizeMiniPath(raw.path || raw.page || raw.link || typePathMap[type] || '')
  return {
    id: raw.id || `nav_${Date.now()}_${index}`,
    name: raw.name || raw.title || '新入口',
    subtitle: raw.subtitle || raw.description || '',
    icon: raw.icon || raw.image || raw.imageUrl || raw.image_url || '',
    image: raw.icon || raw.image || raw.imageUrl || raw.image_url || '',
    type,
    enabled: raw.enabled !== false && raw.isShow !== false && raw.status !== 0,
    sortOrder: raw.sortOrder ?? raw.sort_order ?? index,
    remark: raw.remark || '',
    ...makeJumpPayload({ ...raw, path }),
  }
}

function serializeHomeNavItems() {
  return navConfig.value
    .map((nav, index) => {
      const normalized = normalizeHomeNav(nav, index)
      return {
        ...normalized,
        image: normalized.icon,
        imageUrl: normalized.icon,
        isShow: normalized.enabled,
        sortOrder: index,
      }
    })
    .filter(nav => nav.name || nav.icon)
}

// 加载区域列表
const loadRegions = async () => {
  try {
    const res = await request.get<any, any>('/admin/regions', { params: { page: 1, pageSize: 100 } })
    regions.value = res?.list || res?.data?.list || res?.data || []
    const preferredId = String(route.query.regionId || localStorage.getItem('LM_SELECTED_REGION_ID') || localStorage.getItem('selectedRegionId') || '')
    if (preferredId && regions.value.some(r => String(r.id) === preferredId)) {
      selectedRegionId.value = preferredId
    }
    if (regions.value.length && !selectedRegionId.value) {
      selectedRegionId.value = regions.value[0].id
    }
  } catch (error) {
    console.error('加载区域失败', error)
    ElMessage.warning('加载区域列表失败')
  }
}

// 加载区域详情
const loadRegionDetail = async () => {
  if (!selectedRegionId.value) return
  try {
    const res = await request.get(`/admin/regions/${selectedRegionId.value}`)
    const data = res.data || res
    mergeCurrentRegion(data)

    // 更新首页配置
    if (data.show_carousel !== undefined) homeConfig.show_carousel = data.show_carousel
    if (data.show_announcement !== undefined) homeConfig.show_announcement = data.show_announcement
    if (data.show_kingkong !== undefined) homeConfig.show_kingkong = data.show_kingkong
    if (data.show_hot_list !== undefined) homeConfig.show_hot_list = data.show_hot_list
    if (data.hot_featured_display) homeConfig.hot_featured_display = data.hot_featured_display
    if (data.home_feature_style) homeConfig.home_feature_style = data.home_feature_style
    if (data.home_nav_layout) homeConfig.home_nav_layout = data.home_nav_layout

    const rawCarousel = data.carousel_images ?? data.carouselImages ?? []
    if (Array.isArray(rawCarousel)) {
      carouselItems.value = rawCarousel.map(normalizeCarouselItem)
    } else {
      carouselItems.value = []
    }

    // 更新 Tabs 配置
    if (data.region_tabs && Array.isArray(data.region_tabs)) {
      tabsConfig.value = data.region_tabs.map(normalizeHomeTab)
    }

    // 更新导航配置
    if (data.home_nav_layout) homeNavLayout.value = data.home_nav_layout
    if (data.home_nav_layout_config && Array.isArray(data.home_nav_layout_config)) {
      navConfig.value = data.home_nav_layout_config.map(normalizeHomeNav)
    } else if (Array.isArray(data.navs)) {
      navConfig.value = data.navs.map(normalizeHomeNav)
    }

    // 更新榜单配置
    if (data.home_leaderboard) {
      Object.assign(leaderboardConfig, data.home_leaderboard)
    }

    // 更新消息页配置
    if (data.message_page_layout) messageConfig.message_page_layout = data.message_page_layout
    if (data.private_message_enabled !== undefined) messageConfig.private_message_enabled = data.private_message_enabled

    // 更新我的页配置
    if (data.profile_page_layout) profileConfig.profile_page_layout = data.profile_page_layout

    // 更新完整度
    updateCompletionStatus()
  } catch (error) {
    console.error('加载区域详情失败', error)
    ElMessage.warning('加载区域详情失败')
  }
}

// 加载底部导航数据
const loadTabbarData = async () => {
  if (!selectedRegionId.value) return
  try {
    const res = await request.get('/admin/regions/tabbar', { params: { regionId: selectedRegionId.value } })
    const data = normalizeTabbarConfig(res)
    tabbarData.value = data.list

    // 更新底部导航配置
    if (data.color) tabbarConfig.color = data.color
    if (data.selectedColor) tabbarConfig.selectedColor = data.selectedColor
    if (data.backgroundColor) tabbarConfig.backgroundColor = data.backgroundColor
  } catch (error) {
    console.error('加载底部导航失败', error)
    ElMessage.warning('加载底部导航配置失败')
  }
}

// 加载分享设置
const loadShareSettings = async () => {
  if (!selectedRegionId.value) return
  try {
    const res = await request.get(`/admin/share/settings/${selectedRegionId.value}`)
    const data = normalizeShareConfig(res)
    shareConfig.title = data.title
    shareConfig.description = data.description
    shareConfig.imageUrl = data.imageUrl
  } catch (error) {
    console.error('加载分享设置失败', error)
    ElMessage.warning('加载分享配置失败')
  }
}

// 加载所有数据
const loadAllData = async () => {
  await loadRegions()
  if (selectedRegionId.value) {
    await Promise.all([
      loadRegionDetail(),
      loadTabbarData(),
      loadShareSettings(),
    ])
  }
}

// 区域切换
const onRegionChange = () => {
  loadRegionDetail()
  loadTabbarData()
  loadShareSettings()
}

// 更新完整度状态
const updateCompletionStatus = () => {
  publishChecks.value.forEach(check => {
    switch (check.key) {
      case 'region':
        check.status = selectedRegionId.value ? 'pass' : 'fail'
        break
      case 'tabs':
        check.status = tabsConfig.value.some(t => t.enabled) ? 'pass' : 'fail'
        break
      case 'homeModule':
        check.status = (homeConfig.show_carousel && carouselItems.value.some(item => item.enabled !== false && item.image))
          || homeConfig.show_kingkong
          || homeConfig.show_hot_list
          ? 'pass'
          : 'warn'
        break
      case 'tabbar':
        check.status = tabbarData.value.length > 0 ? 'pass' : 'warn'
        break
      case 'share':
        check.status = shareConfig.title ? 'pass' : 'warn'
        break
      case 'message':
        check.status = messageConfig.message_page_layout ? 'pass' : 'warn'
        break
      case 'profile':
        check.status = profileConfig.profile_page_layout ? 'pass' : 'warn'
        break
      case 'regionStatus':
        check.status = currentRegion.value?.isOpen ? 'pass' : 'fail'
        break
    }
  })

  // 更新菜单完成状态
  menuItems.value.forEach(item => {
    switch (item.key) {
      case 'home':
        item.completed = (homeConfig.show_carousel && carouselItems.value.some(b => b.enabled !== false && b.image))
          || homeConfig.show_kingkong
          || homeConfig.show_hot_list
        break
      case 'tabs':
        item.completed = tabsConfig.value.some(t => t.enabled)
        break
      case 'nav':
        item.completed = navConfig.value.some(n => n.enabled && n.name)
        break
      case 'leaderboard':
        item.completed = leaderboardConfig.enabled
        break
      case 'message':
        item.completed = !!messageConfig.message_page_layout
        break
      case 'profile':
        item.completed = !!profileConfig.profile_page_layout
        break
      case 'tabbar':
        item.completed = tabbarData.value.length > 0
        break
      case 'share':
        item.completed = !!shareConfig.title
        break
    }
  })
}

// Tab 操作
const addTab = () => {
  tabsConfig.value.push(normalizeHomeTab({ name: '新Tab', type: 'note', enabled: true }))
}

const removeTab = (idx: number) => {
  tabsConfig.value.splice(idx, 1)
}

const moveTab = (idx: number, direction: number) => {
  const newIdx = idx + direction
  if (newIdx < 0 || newIdx >= tabsConfig.value.length) return
  const temp = tabsConfig.value[idx]
  tabsConfig.value[idx] = tabsConfig.value[newIdx]
  tabsConfig.value[newIdx] = temp
}

const isTabDetailOpen = (idx: number) => expandedTabs.value.has(idx)

const toggleTabDetail = (idx: number) => {
  const next = new Set(expandedTabs.value)
  if (next.has(idx)) next.delete(idx)
  else next.add(idx)
  expandedTabs.value = next
}

const getLinkTypeLabel = (type?: string) => {
  const map: Record<string, string> = {
    filter: '内容筛选',
    internal: '小程序页面',
    miniProgram: '外部小程序',
    webview: '网页 H5',
    none: '不跳转',
  }
  return map[type || 'filter'] || '内容筛选'
}

const resetTabs = () => {
  tabsConfig.value = [
    { name: '笔记', type: 'note', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesB/post/post', appId: '', query: '', remark: '' },
    { name: '外卖', type: 'takeout', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesA/selection/selection', appId: '', query: '', remark: '' },
    { name: '二手', type: 'secondhand', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesA/SecondHand/Second-hand-selease/Second-hand-selease', appId: '', query: '', remark: '' },
    { name: '活动', type: 'activity', enabled: true, icon: '', image: '', linkType: 'filter', path: 'pagesA/news/SharingCourtesy/SharingCourtesy', appId: '', query: '', remark: '' },
  ]
}

function normalizeHomeTab(tab: any) {
  return {
    name: tab?.name || '新Tab',
    type: tab?.type || 'note',
    enabled: tab?.enabled !== false,
    icon: tab?.icon || tab?.iconUrl || '',
    image: tab?.image || tab?.imageUrl || tab?.cover || '',
    linkType: normalizeJumpType(tab?.linkType || tab?.jumpType || 'filter'),
    path: normalizeMiniPath(tab?.path || tab?.page || typePathMap[tab?.type || 'note'] || ''),
    appId: tab?.appId || tab?.appid || '',
    query: tab?.query || '',
    remark: tab?.remark || tab?.description || '',
  }
}

function serializeHomeTabs() {
  return tabsConfig.value.map((tab, index) => ({
    ...normalizeHomeTab(tab),
    sortOrder: index,
  }))
}

function onTabTypeChange(tab: any) {
  if (!tab) return
  tab.path = typePathMap[tab.type] || tab.path || ''
  if (!tab.name || tab.name === '新Tab') {
    const option = [
      { type: 'note', name: '笔记' },
      { type: 'takeout', name: '外卖' },
      { type: 'secondhand', name: '二手' },
      { type: 'activity', name: '活动' },
      { type: 'vote', name: '评选' },
      { type: 'merchant', name: '商家' },
      { type: 'errand', name: '跑腿' },
      { type: 'circle', name: '圈子' },
    ].find(item => item.type === tab.type)
    if (option) tab.name = option.name
  }
}

// 导航操作
const addNav = () => {
  navConfig.value.push(normalizeHomeNav({ name: '新入口', icon: '', path: '', linkType: 'internal', enabled: true }, navConfig.value.length))
}

const removeNav = (idx: number) => {
  navConfig.value.splice(idx, 1)
}

const moveNav = (idx: number, direction: number) => {
  const newIdx = idx + direction
  if (newIdx < 0 || newIdx >= navConfig.value.length) return
  const temp = navConfig.value[idx]
  navConfig.value[idx] = navConfig.value[newIdx]
  navConfig.value[newIdx] = temp
}

const addCarouselItem = () => {
  carouselItems.value.push(normalizeCarouselItem({
    title: '',
    subtitle: '',
    image: '',
    linkType: 'internal',
    path: 'pagesB/post/post',
    enabled: true,
  }, carouselItems.value.length))
}

const removeCarouselItem = (idx: number) => {
  carouselItems.value.splice(idx, 1)
}

const moveCarouselItem = (idx: number, direction: number) => {
  const newIdx = idx + direction
  if (newIdx < 0 || newIdx >= carouselItems.value.length) return
  const temp = carouselItems.value[idx]
  carouselItems.value[idx] = carouselItems.value[newIdx]
  carouselItems.value[newIdx] = temp
}

// 榜单操作
const moveLeaderboard = (idx: number, direction: number) => {
  const newIdx = idx + direction
  if (newIdx < 0 || newIdx >= leaderboardConfig.items.length) return
  const temp = leaderboardConfig.items[idx]
  leaderboardConfig.items[idx] = leaderboardConfig.items[newIdx]
  leaderboardConfig.items[newIdx] = temp
}

// 保存配置
const saveHomeConfig = async () => {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  try {
    await request.put(`/admin/regions/${selectedRegionId.value}`, {
      show_carousel: homeConfig.show_carousel,
      show_announcement: homeConfig.show_announcement,
      show_kingkong: homeConfig.show_kingkong,
      show_hot_list: homeConfig.show_hot_list,
      hot_featured_display: homeConfig.hot_featured_display,
      home_feature_style: homeConfig.home_feature_style,
      home_nav_layout: homeConfig.home_nav_layout,
      carousel_images: serializeCarouselItems(),
    })
    mergeCurrentRegion({
      ...homeConfig,
      carousel_images: serializeCarouselItems(),
      carouselImages: serializeCarouselItems(),
    })
    ElMessage.success('首页装修配置已保存')
    updateCompletionStatus()
  } catch (error) {
    ElMessage.error((error as any)?.message || '保存失败')
  }
}

const saveTabsConfig = async () => {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  if (!tabsConfig.value.some(t => t.enabled)) {
    ElMessage.warning('至少需要保留 1 个启用的 Tab')
    return
  }
  try {
    await request.put(`/admin/regions/${selectedRegionId.value}`, {
      region_tabs: serializeHomeTabs(),
    })
    tabsConfig.value = serializeHomeTabs()
    ElMessage.success('Tabs 配置已保存')
    updateCompletionStatus()
  } catch (error) {
    ElMessage.error((error as any)?.message || '保存失败')
  }
}

const saveNavConfig = async () => {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  try {
    await request.put(`/admin/regions/${selectedRegionId.value}`, {
      home_nav_layout: homeNavLayout.value,
      home_nav_layout_config: serializeHomeNavItems(),
    })
    navConfig.value = serializeHomeNavItems()
    ElMessage.success('导航配置已保存')
    updateCompletionStatus()
  } catch (error) {
    ElMessage.error((error as any)?.message || '保存失败')
  }
}

const saveLeaderboardConfig = async () => {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  try {
    await request.put(`/admin/regions/${selectedRegionId.value}`, {
      home_leaderboard: leaderboardConfig,
    })
    ElMessage.success('榜单配置已保存')
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const saveMessageConfig = async () => {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  try {
    await request.put(`/admin/regions/${selectedRegionId.value}`, {
      message_page_layout: messageConfig.message_page_layout,
      private_message_enabled: messageConfig.private_message_enabled,
    })
    ElMessage.success('消息页配置已保存')
    updateCompletionStatus()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const saveProfileConfig = async () => {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  try {
    await request.put(`/admin/regions/${selectedRegionId.value}`, {
      profile_page_layout: profileConfig.profile_page_layout,
    })
    ElMessage.success('我的页配置已保存')
    updateCompletionStatus()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

// 保存全部配置
const saveAllConfig = async () => {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  saving.value = true
  try {
    await request.put(`/admin/regions/${selectedRegionId.value}`, {
      // 首页配置
      show_carousel: homeConfig.show_carousel,
      show_announcement: homeConfig.show_announcement,
      show_kingkong: homeConfig.show_kingkong,
      show_hot_list: homeConfig.show_hot_list,
      hot_featured_display: homeConfig.hot_featured_display,
      home_feature_style: homeConfig.home_feature_style,
      home_nav_layout: homeNavLayout.value,
      carousel_images: serializeCarouselItems(),
      home_nav_layout_config: serializeHomeNavItems(),
      region_tabs: serializeHomeTabs(),
      home_leaderboard: leaderboardConfig,
      // 消息页配置
      message_page_layout: messageConfig.message_page_layout,
      private_message_enabled: messageConfig.private_message_enabled,
      // 我的页配置
      profile_page_layout: profileConfig.profile_page_layout,
    })
    mergeCurrentRegion({
      ...homeConfig,
      home_nav_layout: homeNavLayout.value,
      carousel_images: serializeCarouselItems(),
      carouselImages: serializeCarouselItems(),
      home_nav_layout_config: serializeHomeNavItems(),
      homeNavLayoutConfig: serializeHomeNavItems(),
      region_tabs: serializeHomeTabs(),
      regionTabs: serializeHomeTabs(),
    })
    ElMessage.success('全部装修配置已保存')
    updateCompletionStatus()
  } catch (error) {
    ElMessage.error((error as any)?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 发布到小程序
const publishToMini = async () => {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  await ElMessageBox.confirm('确定发布当前装修配置到小程序吗？', '确认发布', { type: 'warning' })
  publishing.value = true
  try {
    await saveAllConfig()
    ElMessage.success('已发布到小程序')
  } catch (error) {
    ElMessage.error('发布失败')
  } finally {
    publishing.value = false
  }
}

// 发布检查
const runPublishCheck = () => {
  updateCompletionStatus()
  ElMessage.success('检查完成')
}

// 跳转到底部导航管理
const goToTabbarManager = () => {
  router.push({ path: '/region/tabbar', query: selectedRegionId.value ? { regionId: selectedRegionId.value } : undefined })
}

// 跳转到分享设置
const goToShareSettings = () => {
  router.push({ path: '/region/share-settings', query: selectedRegionId.value ? { regionId: selectedRegionId.value } : undefined })
}

// 监听配置变化，更新完整度和预览
watch([homeConfig, carouselItems, tabsConfig, navConfig, leaderboardConfig, messageConfig, profileConfig], () => {
  updateCompletionStatus()
}, { deep: true })

onMounted(() => {
  loadAllData()
})
</script>

<style scoped>
.page-decoration {
  padding: 20px;
  min-height: 100vh;
}

.decoration-hero {
  min-height: 118px;
  padding: 20px 22px;
  display: grid;
  grid-template-columns: minmax(260px, 1.15fr) minmax(280px, 1fr) auto auto;
  align-items: center;
  gap: 22px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, .86), rgba(239, 246, 255, .76)),
    radial-gradient(circle at 84% 20%, rgba(59, 130, 246, .16), transparent 30%);
  border: 1px solid rgba(191, 219, 254, .78);
}

.hero-region {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.hero-eyebrow {
  color: #64748b;
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 4px;
}

.hero-title {
  color: #0f172a;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-meta {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
}

.hero-progress {
  display: grid;
  gap: 10px;
}

.hero-stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.hero-stat b {
  color: #0f172a;
  font-size: 28px;
  line-height: 1;
  font-weight: 950;
}

.hero-stat span,
.metric-pill span {
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, 88px);
  gap: 10px;
}

.metric-pill {
  min-height: 66px;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, .72);
  border: 1px solid rgba(226, 232, 240, .82);
  display: grid;
  align-content: center;
  gap: 4px;
  text-align: center;
}

.metric-pill b {
  color: #2563eb;
  font-size: 18px;
  font-weight: 950;
}

.hero-actions {
  display: grid;
  gap: 10px;
}

.decoration-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 24px;
  margin-top: 20px;
}

/* 左侧边栏 */
.decoration-sidebar {
  padding: 16px;
  position: sticky;
  top: 20px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}

.sidebar-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.region-info {
  padding: 12px;
  background: linear-gradient(135deg, #f0f7ff, #e8f4ff);
  border-radius: 8px;
}

.region-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.region-meta {
  flex: 1;
}

.region-name {
  font-weight: 600;
  font-size: 14px;
}

.completion-bar {
  margin-top: 8px;
}

.completion-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.menu-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: #475569;
}

.menu-item:hover {
  background: #f1f5f9;
}

.menu-item.active {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.check-icon {
  margin-left: auto;
  color: #67c23a;
}

/* 中间配置区 */
.decoration-main {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-section {
  padding: 20px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.5);
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.head-actions {
  display: flex;
  gap: 8px;
}

.config-content {
  padding: 0 4px;
}

.switch-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.switch-item b {
  font-size: 14px;
  color: #1e293b;
}

.switch-item p {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}

.form-grid {
  display: grid;
  gap: 16px;
}

.form-grid.two {
  grid-template-columns: 1fr 1fr;
}

.form-grid.relaxed {
  gap: 20px;
}

.subsection-head,
.nav-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;
}

.subsection-title {
  color: #0f172a;
  font-size: 15px;
  font-weight: 950;
  line-height: 1.35;
}

.subsection-head p,
.nav-toolbar p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.banner-list {
  display: grid;
  gap: 14px;
}

.banner-card {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(320px, 1fr) auto;
  gap: 16px;
  align-items: stretch;
  padding: 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, .78);
  border: 1px solid rgba(203, 213, 225, .74);
}

.banner-cover :deep(.upload-trigger) {
  min-height: 170px;
}

.banner-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
}

.banner-actions {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 10px;
  min-width: 92px;
}

.empty-inline {
  min-height: 120px;
  border-radius: 16px;
  border: 1px dashed rgba(148, 163, 184, .82);
  background: rgba(248, 250, 252, .74);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}

/* Tabs 编辑器 */
.tabs-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.tab-item-rich {
  display: grid;
  align-items: stretch;
  gap: 10px;
  padding: 12px;
  background: rgba(248, 250, 252, .76);
  border: 1px solid rgba(226, 232, 240, .82);
  border-radius: 14px;
}

.tab-row-main {
  display: grid;
  grid-template-columns: 28px minmax(180px, 1fr) 150px 108px 88px 96px auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.tab-row-main :deep(.el-input),
.tab-row-main :deep(.el-select) {
  width: 100% !important;
}

.tab-row-extra {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 250px;
  gap: 12px;
  align-items: start;
  padding: 12px;
  margin-left: 34px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .72);
  border: 1px solid rgba(226, 232, 240, .72);
}

.tab-assets {
  display: grid;
  grid-template-columns: 88px minmax(130px, 1fr);
  gap: 10px;
}

.tab-upload-pair {
  display: grid;
  gap: 6px;
}

.mini-upload-label {
  color: #475569;
  font-size: 12px;
  font-weight: 900;
}

.tab-upload-pair.compact :deep(.upload-trigger) {
  min-height: 68px;
  padding: 12px;
}

.tab-upload-pair.compact :deep(.preview-actions .el-button) {
  padding: 5px 7px;
}

.tab-upload-pair.compact :deep(.preview-meta) {
  display: none;
}

.tab-upload-pair.compact :deep(.upload-text) {
  font-size: 12px;
}

.tab-upload-pair.compact :deep(.upload-tip) {
  font-size: 11px;
}

.tab-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.tab-index {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e2e8f0;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.tab-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.add-tab-btn {
  width: 100%;
  margin-top: 8px;
}

/* 导航编辑器 */
.nav-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nav-card-list {
  gap: 14px;
}

.nav-card {
  display: grid;
  grid-template-columns: 28px 96px minmax(360px, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: rgba(248, 250, 252, .78);
  border: 1px solid rgba(203, 213, 225, .74);
  border-radius: 16px;
}

.nav-card-index {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #2563eb;
  background: #dbeafe;
  font-weight: 950;
  font-size: 13px;
}

.nav-icon-upload :deep(.upload-trigger) {
  min-height: 88px;
  padding: 10px;
}

.nav-icon-upload :deep(.upload-text),
.nav-icon-upload :deep(.upload-tip),
.nav-icon-upload :deep(.preview-meta) {
  display: none;
}

.nav-card-fields {
  display: grid;
  gap: 10px;
}

.nav-primary-fields {
  display: grid;
  grid-template-columns: minmax(110px, 150px) minmax(120px, 1fr) minmax(128px, 150px) minmax(180px, 1.5fr);
  gap: 10px;
}

.nav-secondary-fields {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr);
  gap: 10px;
}

.nav-card-actions {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 8px;
  min-width: 88px;
}

/* 榜单编辑器 */
.leaderboard-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 8px;
}

.muted {
  color: #94a3b8;
  font-size: 12px;
}

.item-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

/* 底部导航预览 */
.tabbar-preview-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tabbar-preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

/* 分享卡片预览 */
.share-card-preview {
  display: flex;
  justify-content: center;
}

.share-card {
  width: 280px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.share-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
}

.share-title {
  padding: 0 12px 12px;
  font-size: 14px;
  font-weight: 500;
}

.share-image {
  padding: 0 12px 12px;
}

.share-footer {
  padding: 8px 12px;
  background: #f8fafc;
  font-size: 12px;
  color: #94a3b8;
}

/* 发布检查 */
.check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.check-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.check-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.check-name {
  font-weight: 500;
  font-size: 14px;
}

.check-desc {
  font-size: 12px;
  color: #94a3b8;
}

.text-success {
  color: #67c23a;
}

.text-warning {
  color: #e6a23c;
}

.text-danger {
  color: #f56c6c;
}

/* 右侧预览区 */
.decoration-preview {
  padding: 16px;
  position: sticky;
  top: 20px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

/* 底部导航预览页 */
.tabbar-preview-page {
  min-height: 100%;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tabbar-page-content {
  padding: 20px;
  text-align: center;
  width: 100%;
}

.tabbar-preview-title {
  font-weight: 600;
  margin-bottom: 20px;
  font-size: 16px;
  color: #333;
}

.tabbar-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.tabbar-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.tabbar-grid-item span {
  font-size: 12px;
  color: #475569;
}

.form-tip {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

/* 响应式布局 */
@media (max-width: 1400px) {
  .decoration-hero {
    grid-template-columns: minmax(240px, 1fr) minmax(260px, 1fr);
  }

  .hero-metrics {
    grid-column: 1 / -1;
    grid-template-columns: repeat(3, minmax(120px, 1fr));
  }

  .hero-actions {
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, max-content);
  }

  .decoration-layout {
    grid-template-columns: 240px minmax(0, 1fr);
  }
}

@media (max-width: 1200px) {
  .decoration-layout {
    grid-template-columns: 240px 1fr;
  }

  .decoration-preview {
    display: none;
  }

  .tab-row-main {
    grid-template-columns: 28px minmax(160px, 1fr) 140px 100px;
  }

  .tab-row-extra {
    grid-template-columns: 1fr;
    margin-left: 0;
  }

  .tab-fields {
    grid-template-columns: 1fr;
  }

  .tab-assets {
    grid-template-columns: 1fr;
  }

  .banner-card {
    grid-template-columns: 1fr;
  }

  .banner-actions {
    grid-template-columns: max-content repeat(3, max-content);
    justify-content: flex-start;
  }

  .nav-card {
    grid-template-columns: 28px 82px minmax(0, 1fr);
  }

  .nav-card-actions {
    grid-column: 3;
    grid-template-columns: max-content repeat(3, max-content);
    justify-content: flex-start;
  }

  .nav-primary-fields,
  .nav-secondary-fields,
  .banner-fields {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .decoration-hero {
    grid-template-columns: 1fr;
  }

  .hero-metrics {
    grid-template-columns: 1fr;
  }

  .decoration-layout {
    grid-template-columns: 1fr;
  }

  .decoration-sidebar {
    position: static;
    max-height: none;
  }

  .form-grid.two {
    grid-template-columns: 1fr;
  }
}
</style>

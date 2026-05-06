<template>
  <div class="region-edit-page">
    <!-- 顶部标题栏 -->
    <div class="page-header">
      <a-button @click="goBack" :icon="h(ArrowLeftOutlined)">返回</a-button>
      <h2 class="page-title">{{ isEdit ? '编辑区域' : '新增区域' }}</h2>
    </div>

    <a-spin :spinning="pageLoading" tip="加载中...">
      <div class="sections-container">
        <!-- ===== 一、基础信息 ===== -->
        <div class="section">
          <h3 class="section-title">基础信息</h3>
          <a-row :gutter="[24, 16]">
            <a-col :span="12">
              <a-form-item label="区域名称" required>
                <a-input v-model:value="form.name" placeholder="请输入区域名称" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="区域编码">
                <a-input v-model:value="form.code" placeholder="不填则自动生成，需保持唯一" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="区域类型">
                <a-select v-model:value="form.regionType">
                  <a-select-option value="campus">校园</a-select-option>
                  <a-select-option value="community">社区</a-select-option>
                  <a-select-option value="other">其他</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="状态">
                <a-switch v-model:checked="statusOn" checked-children="启用" un-checked-children="关闭" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="是否热门">
                <a-switch v-model:checked="form.isHot" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="管理员姓名">
                <a-input v-model:value="form.managerName" placeholder="管理员姓名" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="联系电话">
                <a-input v-model:value="form.managerPhone" placeholder="联系电话" />
              </a-form-item>
            </a-col>
            <a-col :span="24">
              <a-form-item label="区域描述">
                <a-textarea v-model:value="form.description" :rows="4" placeholder="区域描述" />
              </a-form-item>
            </a-col>
          </a-row>
        </div>

        <!-- ===== 二、图片设置 ===== -->
        <div class="section">
          <h3 class="section-title">图片设置</h3>
          <a-row :gutter="[24, 16]">
            <a-col :span="12">
              <a-form-item label="Logo">
                <UploadImage v-model="form.logo" :max-count="1" scene="region" v-model:uploading="logoUploading" />
                <div style="color:#999;font-size:12px;margin-top:4px">建议尺寸 200x200</div>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="封面图">
                <UploadImage v-model="form.coverImage" :max-count="1" scene="region" v-model:uploading="coverUploading" />
                <div style="color:#999;font-size:12px;margin-top:4px">建议尺寸 750x350</div>
              </a-form-item>
            </a-col>
            <a-col :span="24">
              <a-form-item label="封面展示模式">
                <a-radio-group v-model:value="form.regionCoverMode">
                  <a-radio-button value="cover">封面模式</a-radio-button>
                  <a-radio-button value="popup">弹窗模式</a-radio-button>
                </a-radio-group>
              </a-form-item>
            </a-col>
          </a-row>

          <!-- 轮播图配置 -->
          <a-collapse v-model:activeKey="carouselActiveKey" :bordered="false" style="margin-top:12px">
            <a-collapse-panel key="carousel" header="轮播图配置">
              <div v-for="(group, gi) in form.carouselImages" :key="gi" class="carousel-group">
                <div class="carousel-group-header">
                  <span>轮播组 {{ gi + 1 }}</span>
                  <a-button size="small" danger @click="removeCarouselGroup(gi)">删除此组</a-button>
                </div>
                <a-row :gutter="[16, 8]">
                  <a-col :span="12">
                    <div class="carousel-label">A 组图片</div>
                    <div v-for="(url, ui) in group.a" :key="'a'+ui" class="carousel-url-row">
                      <a-input v-model:value="group.a[ui]" placeholder="图片 URL" size="small" />
                      <a-button size="small" type="text" danger @click="group.a.splice(ui, 1)">×</a-button>
                    </div>
                    <a-button size="small" type="dashed" block @click="group.a.push('')" v-if="group.a.length < 6">+ 添加图片</a-button>
                  </a-col>
                  <a-col :span="12">
                    <div class="carousel-label">D 组图片</div>
                    <div v-for="(url, ui) in group.d" :key="'d'+ui" class="carousel-url-row">
                      <a-input v-model:value="group.d[ui]" placeholder="图片 URL" size="small" />
                      <a-button size="small" type="text" danger @click="group.d.splice(ui, 1)">×</a-button>
                    </div>
                    <a-button size="small" type="dashed" block @click="group.d.push('')" v-if="group.d.length < 6">+ 添加图片</a-button>
                  </a-col>
                </a-row>
                <a-form-item label="播放间隔" style="margin-top:8px">
                  <a-select v-model:value="group.h" style="width:120px">
                    <a-select-option value="30s">30秒</a-select-option>
                    <a-select-option value="35s">35秒</a-select-option>
                    <a-select-option value="40s">40秒</a-select-option>
                    <a-select-option value="45s">45秒</a-select-option>
                  </a-select>
                </a-form-item>
              </div>
              <a-button type="dashed" block @click="addCarouselGroup" v-if="(form.carouselImages?.length || 0) < 4">
                + 添加轮播组
              </a-button>
              <a-empty v-if="!form.carouselImages?.length" description="暂无轮播图配置" :image-style="{ height: '60px' }" />
            </a-collapse-panel>
          </a-collapse>
        </div>

        <!-- ===== 三、位置信息 ===== -->
        <div class="section">
          <h3 class="section-title">位置信息</h3>
          <a-row :gutter="[24, 16]">
            <a-col :span="8">
              <a-form-item label="经度">
                <a-input-number v-model:value="form.longitude" :step="0.000001" :precision="6" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="纬度">
                <a-input-number v-model:value="form.latitude" :step="0.000001" :precision="6" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="距离限制(米)">
                <a-input-number v-model:value="form.distanceLimit" :min="0" :step="100" style="width:100%" />
                <div style="color:#999;font-size:12px">0=关闭距离限制</div>
              </a-form-item>
            </a-col>
            <a-col :span="24">
              <a-form-item label="详细地址">
                <a-input v-model:value="form.address" placeholder="省/市/区/街道" />
              </a-form-item>
            </a-col>
            <a-col :span="24">
              <a-button @click="mapModalVisible = true" :icon="h(EnvironmentOutlined)">从地图选择位置</a-button>
            </a-col>
          </a-row>
        </div>

        <!-- 地图弹窗 -->
        <a-modal
          v-model:open="mapModalVisible"
          title="地图选点"
          width="800px"
          :footer="null"
          @cancel="mapModalVisible = false"
        >
          <MapPicker
            :model-lng="form.longitude ?? null"
            :model-lat="form.latitude ?? null"
            @update:model-lng="(v) => (form.longitude = v)"
            @update:model-lat="(v) => (form.latitude = v)"
            @update:model-address="(v) => { if (!form.address) form.address = v }"
          />
        </a-modal>

        <!-- ===== 四、财务配置 ===== -->
        <div class="section">
          <h3 class="section-title">财务配置</h3>
          <a-row :gutter="[24, 16]">
            <a-col :span="8">
              <a-form-item label="余额">
                <a-input-number v-model:value="form.balance" :min="0" :precision="2" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="最小提现金额">
                <a-input-number v-model:value="form.minWithdraw" :min="0" :precision="2" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="最大提现金额">
                <a-input-number v-model:value="form.maxWithdraw" :min="0" :precision="2" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="提现手续费">
                <a-input-number v-model:value="form.withdrawFee" :min="0" :precision="2" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="提现费率(%)">
                <a-input-number v-model:value="form.withdrawRate" :min="0" :max="100" :precision="2" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="佣金比例(%)">
                <a-input-number v-model:value="form.commissionRate" :min="0" :max="100" :precision="2" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="自解封费用">
                <a-input-number v-model:value="form.selfUnbanFee" :min="0" :precision="2" style="width:100%" />
              </a-form-item>
            </a-col>
          </a-row>
        </div>

        <!-- ===== 五、显示设置 ===== -->
        <div class="section">
          <h3 class="section-title">显示设置</h3>
          <a-row :gutter="[24, 16]">
            <a-col :span="8">
              <a-form-item label="显示热门">
                <a-switch v-model:checked="form.showHotList" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="热榜/精榜设置">
                <a-select v-model:value="form.hotFeaturedDisplay" style="width:140px">
                  <a-select-option value="none">不显示</a-select-option>
                  <a-select-option value="hot">显示热榜</a-select-option>
                  <a-select-option value="featured">显示精榜</a-select-option>
                  <a-select-option value="mixed">混合显示</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="强制引导">
                <a-switch v-model:checked="form.isForceGuidance" />
                <a-tooltip title="开启后用户须完成引导流程">
                  <QuestionCircleOutlined style="color:#999;margin-left:4px" />
                </a-tooltip>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="区域私信">
                <a-switch v-model:checked="form.privateMessageEnabled" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="通讯录需要学生认证">
                <a-switch v-model:checked="form.contactsRequireStudentAuth" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="仅学生认证用户可访问">
                <a-switch v-model:checked="form.onlyStudentAuthUsers" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="区域群聊">
                <a-switch v-model:checked="form.groupChatEnabled" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="二维码检测">
                <a-switch v-model:checked="form.enableQrcodeFilter" />
              </a-form-item>
            </a-col>
          </a-row>
        </div>

        <!-- ===== 六、页面布局设置 ===== -->
        <div class="section">
          <h3 class="section-title">页面布局设置</h3>
          <a-row :gutter="[24, 16]">
            <a-col :span="8">
              <a-form-item label="首页导航栏布局">
                <a-select v-model:value="form.homeNavLayout" style="width:140px">
                  <a-select-option v-for="i in 9" :key="i" :value="i">布局 {{ i }}</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="消息页布局">
                <a-select v-model:value="form.messagePageLayout" style="width:160px">
                  <a-select-option value="default">默认布局</a-select-option>
                  <a-select-option value="xiaohongshu">小红书风格</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="我的页面布局">
                <a-select v-model:value="form.profilePageLayout" style="width:160px">
                  <a-select-option value="default">默认布局</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>

          <!-- 首页导航栏配置（布局9时显示） -->
          <div v-if="form.homeNavLayout === 9" class="sub-section">
            <h4 class="sub-section-title">首页导航栏详细配置</h4>
            <a-row :gutter="[24, 16]">
              <a-col :span="8">
                <a-form-item label="标题显示">
                  <a-switch v-model:checked="form.homeNavLayoutConfig.title.show" />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="标题文字">
                  <a-input v-model:value="form.homeNavLayoutConfig.title.text" />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="标题颜色">
                  <a-input type="color" v-model:value="form.homeNavLayoutConfig.title.color" style="width:60px" />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="字号">
                  <a-input-number v-model:value="form.homeNavLayoutConfig.title.fontSize" :min="10" :max="40" />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="字重">
                  <a-select v-model:value="form.homeNavLayoutConfig.title.fontWeight" style="width:120px">
                    <a-select-option value="normal">normal</a-select-option>
                    <a-select-option value="bold">bold</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="布局切换显示">
                  <a-switch v-model:checked="form.homeNavLayoutConfig.showLayoutSwitch" />
                </a-form-item>
              </a-col>
            </a-row>
          </div>
        </div>

        <!-- ===== 七、首页榜单配置 ===== -->
        <div class="section">
          <h3 class="section-title">首页榜单配置</h3>
          <a-form-item label="启用榜单">
            <a-switch v-model:checked="form.homeLeaderboard.enabled" />
          </a-form-item>
          <div v-if="form.homeLeaderboard.enabled" style="margin-top:12px">
            <div v-if="form.homeLeaderboard.items.length === 0" style="margin-bottom:8px">
              <a-empty description="暂无榜单配置" :image-style="{ height: '40px' }" />
            </div>
            <div v-for="(item, idx) in form.homeLeaderboard.items" :key="idx" class="list-item-row">
              <span class="drag-handle">⋮⋮</span>
              <a-tag :color="item.type === 'note' ? 'blue' : item.type === 'user' ? 'green' : 'orange'">
                {{ item.type === 'note' ? '笔记榜' : item.type === 'user' ? '用户榜' : '话题榜' }}
              </a-tag>
              <a-input v-model:value="item.title" size="small" style="width:160px;margin:0 8px" />
              <a-switch v-model:checked="item.enabled" size="small" />
              <a-button size="small" type="text" danger @click="form.homeLeaderboard.items.splice(idx, 1)">删除</a-button>
            </div>
            <a-button type="dashed" size="small" @click="addLeaderboardItem" style="margin-top:8px">
              + 添加榜单
            </a-button>
          </div>
        </div>

        <!-- ===== 八、消息导航配置 ===== -->
        <div class="section">
          <h3 class="section-title">消息导航配置</h3>
          <p class="section-desc">配置区域消息页面的导航卡片</p>
          <div style="margin-bottom:12px">
            <a-button size="small" @click="addMessageCard" :icon="h(PlusOutlined)" :disabled="(form.messageNavigation?.cards?.length || 0) >= 10">
              添加卡片
            </a-button>
            <a-button size="small" style="margin-left:8px" @click="loadDefaultMessageCards">加载默认配置</a-button>
          </div>
          <a-empty v-if="!form.messageNavigation?.cards?.length" description="暂无导航卡片" :image-style="{ height: '40px' }" />
          <div v-for="(card, idx) in form.messageNavigation?.cards" :key="card.id || idx" class="list-item-row card-item">
            <span class="drag-handle">⋮⋮</span>
            <span class="card-preview" :style="{ background: card.colors?.bg || '#f0f0f0' }">
              <img v-if="card.icon" :src="card.icon" style="width:24px;height:24px" />
            </span>
            <span style="flex:1;margin:0 8px;font-size:13px">{{ card.title || '未命名卡片' }}</span>
            <a-tag>{{ card.type }}</a-tag>
            <a-button size="small" type="text" @click="editMessageCard(idx)" style="margin-left:4px">编辑</a-button>
            <a-button size="small" type="text" danger @click="form.messageNavigation.cards.splice(idx, 1)">删除</a-button>
          </div>
        </div>

        <!-- 消息导航卡片编辑弹窗 -->
        <a-modal v-model:open="messageCardModalVisible" title="编辑导航卡片" @ok="saveMessageCard" width="600px">
          <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
            <a-form-item label="卡片ID">
              <a-input v-model:value="editingCard.id" placeholder="唯一标识" />
            </a-form-item>
            <a-form-item label="标题">
              <a-input v-model:value="editingCard.title" />
            </a-form-item>
            <a-form-item label="图标URL">
              <a-input v-model:value="editingCard.icon" placeholder="图标URL" />
            </a-form-item>
            <a-form-item label="图片URL">
              <a-input v-model:value="editingCard.img" placeholder="图片URL" />
            </a-form-item>
            <a-form-item label="类型">
              <a-input v-model:value="editingCard.type" placeholder="如: chat, reply, like" />
            </a-form-item>
            <a-form-item label="描述">
              <a-input v-model:value="editingCard.description" />
            </a-form-item>
            <a-form-item label="短文本">
              <a-input v-model:value="editingCard.shortText" />
            </a-form-item>
            <a-form-item label="背景色">
              <a-input v-model:value="editingCard.colors.bg" type="color" style="width:60px" />
            </a-form-item>
            <a-form-item label="文字色">
              <a-input v-model:value="editingCard.colors.text" type="color" style="width:60px" />
            </a-form-item>
            <a-form-item label="跳转类型">
              <a-input v-model:value="editingCard.action.type" placeholder="如: page, miniapp" />
            </a-form-item>
            <a-form-item label="跳转链接">
              <a-input v-model:value="editingCard.action.url" placeholder="跳转路径或URL" />
            </a-form-item>
          </a-form>
        </a-modal>

        <!-- ===== 九、区域 Tabs 配置 ===== -->
        <div class="section">
          <h3 class="section-title">区域 Tabs 配置</h3>
          <div style="margin-bottom:12px">
            <a-button size="small" @click="resetDefaultTabs">重置为默认</a-button>
          </div>
          <a-empty v-if="!form.regionTabs?.length" description="暂无Tab配置" :image-style="{ height: '40px' }" />
          <div v-for="(tab, idx) in form.regionTabs" :key="tab.id" class="list-item-row">
            <span class="drag-handle">⋮⋮</span>
            <a-tag>{{ tab.id }}</a-tag>
            <a-input v-model:value="tab.name" size="small" style="width:140px;margin:0 8px" />
            <a-switch v-model:checked="tab.enabled" size="small" />
            <span style="margin-left:4px;font-size:12px;color:#999">启用</span>
          </div>
        </div>

        <!-- ===== 十、我的页面布局配置 ===== -->
        <div class="section">
          <h3 class="section-title">我的页面布局配置</h3>
          <div style="margin-bottom:12px">
            <a-button size="small" @click="addProfileModule" :icon="h(PlusOutlined)">添加模块</a-button>
            <a-button size="small" style="margin-left:8px" @click="loadDefaultProfileModules">加载默认配置</a-button>
          </div>
          <a-empty v-if="!form.profileLayoutItems?.length" description="暂无布局模块" :image-style="{ height: '40px' }" />
          <div v-for="(item, idx) in form.profileLayoutItems" :key="idx" class="list-item-row card-item">
            <span class="drag-handle">⋮⋮</span>
            <img v-if="item.main_image" :src="item.main_image" style="width:32px;height:32px;border-radius:4px;object-fit:cover" />
            <span style="flex:1;margin:0 8px">
              <span style="font-size:13px;font-weight:500">{{ item.title || '未命名模块' }}</span>
              <span style="font-size:11px;color:#999;display:block">{{ item.description || '' }}</span>
            </span>
            <a-tag>{{ item.type }}</a-tag>
            <a-button size="small" type="text" @click="editProfileModule(idx)" style="margin-left:4px">编辑</a-button>
            <a-button size="small" type="text" danger @click="form.profileLayoutItems.splice(idx, 1)">删除</a-button>
          </div>
        </div>

        <!-- 我的页面模块编辑弹窗 -->
        <a-modal v-model:open="profileModuleModalVisible" title="编辑布局模块" @ok="saveProfileModule" width="600px">
          <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
            <a-form-item label="标题">
              <a-input v-model:value="editingProfileModule.title" />
            </a-form-item>
            <a-form-item label="描述">
              <a-textarea v-model:value="editingProfileModule.description" :rows="2" />
            </a-form-item>
            <a-form-item label="主图URL">
              <a-input v-model:value="editingProfileModule.main_image" placeholder="图标或图片URL" />
            </a-form-item>
            <a-form-item label="类型">
              <a-input v-model:value="editingProfileModule.type" placeholder="如: order, wallet, collect" />
            </a-form-item>
            <a-form-item label="跳转链接">
              <a-input v-model:value="editingProfileModule.url" placeholder="跳转路径" />
            </a-form-item>
          </a-form>
        </a-modal>
      </div>
    </a-spin>

    <!-- 底部操作栏 -->
    <div class="bottom-bar">
      <a-space>
        <a-button @click="goBack">取消 / 返回</a-button>
        <a-button type="primary" @click="onSave" :loading="saving" size="large">保存</a-button>
      </a-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, h, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons-vue'
import { areaApi } from '@/api/area'
import UploadImage from '@/components/common/UploadImage.vue'
import MapPicker from '@/components/common/MapPicker.vue'
import type {
  Area,
  CarouselGroup,
  RegionTab,
  LeaderboardItem,
  MessageNavigationCard,
  ProfileLayoutItem,
} from '@/types/area'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id)
const editId = computed(() => route.params.id as string | undefined)

const pageLoading = ref(false)
const saving = ref(false)
const logoUploading = ref(false)
const coverUploading = ref(false)
const mapModalVisible = ref(false)
const carouselActiveKey = ref<string[]>([])
const messageCardModalVisible = ref(false)
const profileModuleModalVisible = ref(false)
const editingCardIndex = ref(-1)
const editingProfileIndex = ref(-1)

const form = reactive<Partial<Area> & { managerName?: string; managerPhone?: string }>({
  name: '',
  code: '',
  regionType: 'other',
  isHot: false,
  description: '',
  managerName: '',
  managerPhone: '',
  logo: '',
  coverImage: '',
  regionCoverMode: 'cover',
  carouselImages: [],
  longitude: undefined,
  latitude: undefined,
  distanceLimit: 0,
  address: '',
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
  profilePageLayout: 'default',
  homeLeaderboard: { enabled: false, items: [] },
  messageNavigation: { cards: [] },
  regionTabs: [],
  profileLayoutItems: [],
  homeNavLayoutConfig: {
    title: { show: false, text: '', color: '#333333', fontSize: 16, fontWeight: 'bold' },
    showLayoutSwitch: false,
  },
})

const statusOn = computed({
  get: () => form.status === 1,
  set: (v: boolean) => (form.status = v ? 1 : 0),
})

const editingCard = reactive<MessageNavigationCard>({
  id: '',
  type: '',
  title: '',
  icon: '',
  img: '',
  description: '',
  shortText: '',
  colors: { bg: '#f0f0f0', text: '#333333' },
  action: { type: 'page', url: '' },
})

const editingProfileModule = reactive<ProfileLayoutItem>({
  title: '',
  description: '',
  main_image: '',
  type: '',
  url: '',
})

// ===== 轮播图操作 =====
function addCarouselGroup() {
  if (!form.carouselImages) form.carouselImages = []
  if (form.carouselImages.length >= 4) return
  form.carouselImages.push({ a: [''], d: [''], h: '30s' } as CarouselGroup)
}

function removeCarouselGroup(index: number) {
  form.carouselImages?.splice(index, 1)
}

// ===== 榜单操作 =====
function addLeaderboardItem() {
  if (!form.homeLeaderboard) form.homeLeaderboard = { enabled: false, items: [] }
  if (!form.homeLeaderboard.items) form.homeLeaderboard.items = []
  form.homeLeaderboard.items.push({ type: 'note', title: '', enabled: true, order: form.homeLeaderboard.items.length })
}

// ===== 消息导航操作 =====
function addMessageCard() {
  if (!form.messageNavigation) form.messageNavigation = { cards: [] }
  if (!form.messageNavigation.cards) form.messageNavigation.cards = []
  if (form.messageNavigation.cards.length >= 10) return
  form.messageNavigation.cards.push({
    id: `card_${Date.now()}`,
    type: 'page',
    title: '新卡片',
    icon: '',
    img: '',
    description: '',
    shortText: '',
    colors: { bg: '#f0f0f0', text: '#333333' },
    action: { type: 'page', url: '' },
  })
}

function editMessageCard(index: number) {
  editingCardIndex.value = index
  const card = form.messageNavigation?.cards?.[index]
  if (card) Object.assign(editingCard, JSON.parse(JSON.stringify(card)))
  messageCardModalVisible.value = true
}

function saveMessageCard() {
  const idx = editingCardIndex.value
  if (!form.messageNavigation?.cards) form.messageNavigation = { cards: [] }
  if (idx >= 0 && form.messageNavigation.cards) {
    form.messageNavigation.cards[idx] = JSON.parse(JSON.stringify(editingCard))
  }
  messageCardModalVisible.value = false
}

function loadDefaultMessageCards() {
  if (!form.messageNavigation) form.messageNavigation = { cards: [] }
  form.messageNavigation.cards = JSON.parse(JSON.stringify([
    { id: 'chat', type: 'chat', title: '私信', icon: '', img: '', description: '', shortText: '', colors: { bg: '#e6f7ff', text: '#1677ff' }, action: { type: 'page', url: '' } },
    { id: 'reply', type: 'reply', title: '回复', icon: '', img: '', description: '', shortText: '', colors: { bg: '#f6ffed', text: '#52c41a' }, action: { type: 'page', url: '' } },
    { id: 'like', type: 'like', title: '获赞', icon: '', img: '', description: '', shortText: '', colors: { bg: '#fff7e6', text: '#fa8c16' }, action: { type: 'page', url: '' } },
    { id: 'follow', type: 'follow', title: '关注', icon: '', img: '', description: '', shortText: '', colors: { bg: '#fff0f6', text: '#eb2f96' }, action: { type: 'page', url: '' } },
  ]))
}

// ===== 区域 Tabs 操作 =====
function resetDefaultTabs() {
  form.regionTabs = JSON.parse(JSON.stringify([
    { id: '0', name: '笔记', enabled: true },
    { id: '1', name: '外卖', enabled: true },
    { id: '2', name: '二手', enabled: true },
    { id: '3', name: '活动', enabled: true },
    { id: '4', name: '评分', enabled: true },
    { id: '5', name: '打卡', enabled: true },
  ]))
}

// ===== 我的页面模块操作 =====
function addProfileModule() {
  if (!form.profileLayoutItems) form.profileLayoutItems = []
  form.profileLayoutItems.push({
    title: '新模块',
    description: '',
    main_image: '',
    type: 'page',
    url: '',
  })
}

function editProfileModule(index: number) {
  editingProfileIndex.value = index
  const item = form.profileLayoutItems?.[index]
  if (item) Object.assign(editingProfileModule, JSON.parse(JSON.stringify(item)))
  profileModuleModalVisible.value = true
}

function saveProfileModule() {
  const idx = editingProfileIndex.value
  if (!form.profileLayoutItems) form.profileLayoutItems = []
  if (idx >= 0 && form.profileLayoutItems) {
    form.profileLayoutItems[idx] = JSON.parse(JSON.stringify(editingProfileModule))
  }
  profileModuleModalVisible.value = false
}

function loadDefaultProfileModules() {
  form.profileLayoutItems = JSON.parse(JSON.stringify([
    { title: '我的订单', description: '查看全部订单', main_image: '', type: 'order', url: '' },
    { title: '我的钱包', description: '余额/提现', main_image: '', type: 'wallet', url: '' },
    { title: '我的收藏', description: '收藏的笔记', main_image: '', type: 'collect', url: '' },
  ]))
}

// ===== 保存 =====
async function onSave() {
  const name = String(form.name || '').trim()
  if (!name) {
    message.warning('请填写区域名称')
    return
  }

  saving.value = true
  try {
    const payload: any = {
      name,
      code: String(form.code || '').trim() || undefined,
      description: form.description || undefined,
      coverImage: Array.isArray(form.coverImage) ? form.coverImage[0] : form.coverImage,
      logo: Array.isArray(form.logo) ? form.logo[0] : form.logo,
      address: form.address || undefined,
      longitude: form.longitude != null ? Number(form.longitude) : undefined,
      latitude: form.latitude != null ? Number(form.latitude) : undefined,
      serviceRadius: 5000,
      studentOnly: false,
      sort: 0,
      isOpen: form.status === 1,
      // 新增字段
      regionType: form.regionType || 'other',
      isHot: form.isHot ?? false,
      regionCoverMode: form.regionCoverMode || 'cover',
      distanceLimit: Number(form.distanceLimit || 0),
      balance: Number(form.balance || 0),
      minWithdraw: Number(form.minWithdraw || 0),
      maxWithdraw: Number(form.maxWithdraw || 0),
      withdrawFee: Number(form.withdrawFee || 0),
      withdrawRate: Number(form.withdrawRate || 0),
      commissionRate: Number(form.commissionRate || 0),
      selfUnbanFee: Number(form.selfUnbanFee || 0),
      showHotList: form.showHotList ?? false,
      hotFeaturedDisplay: form.hotFeaturedDisplay || 'none',
      isForceGuidance: form.isForceGuidance ?? false,
      privateMessageEnabled: form.privateMessageEnabled ?? true,
      contactsRequireStudentAuth: form.contactsRequireStudentAuth ?? false,
      onlyStudentAuthUsers: form.onlyStudentAuthUsers ?? false,
      groupChatEnabled: form.groupChatEnabled ?? false,
      enableQrcodeFilter: form.enableQrcodeFilter ?? false,
      homeNavLayout: Number(form.homeNavLayout || 1),
      messagePageLayout: form.messagePageLayout || 'default',
      profilePageLayout: form.profilePageLayout || 'default',
      carouselImages: form.carouselImages?.length ? form.carouselImages : undefined,
      regionTabs: form.regionTabs?.length ? form.regionTabs : undefined,
      homeLeaderboard: form.homeLeaderboard?.items?.length ? form.homeLeaderboard : undefined,
      messageIcons: form.messageIcons || undefined,
      messageNavigation: form.messageNavigation?.cards?.length ? form.messageNavigation : undefined,
      profileLayoutItems: form.profileLayoutItems?.length ? form.profileLayoutItems : undefined,
      homeNavLayoutConfig: form.homeNavLayout === 9 ? form.homeNavLayoutConfig : undefined,
      // 管理员信息存入 settings
      settings: {
        managerName: form.managerName || '',
        managerPhone: form.managerPhone || '',
      },
    }

    if (isEdit.value && editId.value) {
      await areaApi.update(Number(editId.value), payload)
      message.success('编辑成功')
    } else {
      await areaApi.create(payload)
      message.success('创建成功')
    }
    router.push('/area/list')
  } catch {
    /* handled by interceptor */
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push('/area/list')
}

// ===== 初始化 =====
onMounted(async () => {
  if (isEdit.value && editId.value) {
    pageLoading.value = true
    try {
      const res = await areaApi.getDetail(Number(editId.value))
      const data = res.data.data
      Object.assign(form, {
        name: data.name || '',
        code: data.code || '',
        description: data.description || '',
        logo: data.logo || data.coverImage || '',
        coverImage: data.coverImage || '',
        regionType: data.regionType || 'other',
        isHot: data.isHot ?? false,
        status: data.status,
        regionCoverMode: data.regionCoverMode || 'cover',
        longitude: data.longitude,
        latitude: data.latitude,
        distanceLimit: data.distanceLimit ?? 0,
        address: data.address || '',
        balance: data.balance ?? 0,
        minWithdraw: data.minWithdraw ?? 0,
        maxWithdraw: data.maxWithdraw ?? 0,
        withdrawFee: data.withdrawFee ?? 0,
        withdrawRate: data.withdrawRate ?? 0,
        commissionRate: data.commissionRate ?? 0,
        selfUnbanFee: data.selfUnbanFee ?? 0,
        showHotList: data.showHotList ?? false,
        hotFeaturedDisplay: data.hotFeaturedDisplay || 'none',
        isForceGuidance: data.isForceGuidance ?? false,
        privateMessageEnabled: data.privateMessageEnabled ?? true,
        contactsRequireStudentAuth: data.contactsRequireStudentAuth ?? false,
        onlyStudentAuthUsers: data.onlyStudentAuthUsers ?? false,
        groupChatEnabled: data.groupChatEnabled ?? false,
        enableQrcodeFilter: data.enableQrcodeFilter ?? false,
        homeNavLayout: data.homeNavLayout ?? 1,
        messagePageLayout: data.messagePageLayout || 'default',
        profilePageLayout: data.profilePageLayout || 'default',
        carouselImages: data.carouselImages?.length ? data.carouselImages : [],
        regionTabs: data.regionTabs?.length ? data.regionTabs : [],
        homeLeaderboard: data.homeLeaderboard || { enabled: false, items: [] },
        messageIcons: data.messageIcons || {},
        messageNavigation: data.messageNavigation || { cards: [] },
        profileLayoutItems: data.profileLayoutItems?.length ? data.profileLayoutItems : [],
        homeNavLayoutConfig: data.homeNavLayoutConfig || {
          title: { show: false, text: '', color: '#333333', fontSize: 16, fontWeight: 'bold' },
          showLayoutSwitch: false,
        },
        managerName: data.settings?.managerName || '',
        managerPhone: data.settings?.managerPhone || '',
        sort: data.sort ?? 0,
      })
    } catch {
      message.error('加载区域数据失败')
      router.push('/area/list')
    } finally {
      pageLoading.value = false
    }
  }
})
</script>

<style scoped>
.region-edit-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 80px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
  position: sticky;
  top: 0;
  z-index: 10;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.sections-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 20px 24px;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  padding-left: 12px;
  border-left: 3px solid #1677ff;
  color: #1a1a1a;
}

.sub-section {
  margin-top: 16px;
  padding: 16px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px dashed #e8e8e8;
}

.sub-section-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: #555;
}

.section-desc {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #999;
}

.list-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.list-item-row:last-child {
  border-bottom: none;
}

.drag-handle {
  color: #ccc;
  font-size: 18px;
  cursor: grab;
  user-select: none;
  line-height: 1;
}

.card-item {
  padding: 10px 0;
}

.card-preview {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.carousel-group {
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.carousel-group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 500;
  font-size: 13px;
}

.carousel-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.carousel-url-row {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.carousel-url-row .ant-input {
  flex: 1;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1px solid #f0f0f0;
  padding: 12px 24px;
  display: flex;
  justify-content: flex-end;
  z-index: 100;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
}
</style>

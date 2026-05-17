<template>
  <div class="page-container content-settings-page">
    <PageHeader
      title="内容运营配置"
      subtitle="按区域管理笔记发布、圈子创建、评论安全、广告位、匿名身份和内容奖励"
      icon="Setting"
    />

    <section class="ops-hero">
      <div class="hero-main">
        <span class="eyebrow">当前配置区域</span>
        <div class="region-line">
          <el-select v-model="selectedRegionId" filterable placeholder="选择区域" class="region-select" @change="handleRegionChange">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
          <el-tag v-if="selectedRegion" type="success" effect="light">{{ selectedRegion.statusText }}</el-tag>
        </div>
        <p class="hero-desc">
          这里控制小程序内容玩法的真实规则。保存后，笔记发布页、评论页、圈子运营和首页内容样式会读取当前区域配置。
        </p>
      </div>
      <div class="hero-actions">
        <el-button :loading="refreshing" @click="refreshCurrent">刷新当前配置</el-button>
        <el-button v-if="activeTab === 'note'" type="primary" :loading="savingNote" @click="saveNoteConfig">保存笔记配置</el-button>
        <el-button v-else-if="activeTab === 'circle'" type="primary" :loading="savingCircle" @click="saveCircleConfig">保存圈子配置</el-button>
      </div>
    </section>

    <el-tabs v-model="activeTab" class="config-tabs">
      <el-tab-pane label="笔记配置" name="note" />
      <el-tab-pane label="圈子配置" name="circle" />
      <el-tab-pane label="匿名身份" name="anonymous" />
      <el-tab-pane label="笔记海报" name="poster" />
      <el-tab-pane label="内容奖励" name="reward" />
      <el-tab-pane label="内容徽章" name="badge" />
      <el-tab-pane label="通知记录" name="notification" />
    </el-tabs>

    <div v-if="activeTab === 'note'" v-loading="loadingNote" class="settings-stack">
      <div class="insight-grid">
        <div class="insight-card primary">
          <span>发布入口</span>
          <strong>{{ noteForm.enable_region_posting ? '开启' : '关闭' }}</strong>
          <small>关闭后小程序发布页会拦截发布</small>
        </div>
        <div class="insight-card">
          <span>内容长度</span>
          <strong>{{ noteForm.min_length }} - {{ noteForm.max_length }}</strong>
          <small>正文最小/最大字数</small>
        </div>
        <div class="insight-card">
          <span>媒体能力</span>
          <strong>{{ enabledMediaText }}</strong>
          <small>控制图片、视频、音频入口</small>
        </div>
        <div class="insight-card">
          <span>评论策略</span>
          <strong>{{ noteForm.allow_comments ? '可评论' : '禁止评论' }}</strong>
          <small>{{ noteForm.comment_approval_type === 'ai' ? 'AI 审核' : noteForm.comment_approval_type === 'manual' ? '人工审核' : '直接展示' }}</small>
        </div>
      </div>

      <section class="settings-section">
        <div class="section-title">
          <h3>发布与正文规则</h3>
          <p>控制笔记发布入口、标题、正文长度和发布频率。</p>
        </div>
        <div class="form-grid">
          <FieldSwitch label="开启区域发布" desc="关闭后用户不能在该区域发布笔记" v-model="noteForm.enable_region_posting" />
          <FieldSwitch label="标题功能" desc="发布页是否展示标题输入框" v-model="noteForm.enable_note_title" />
          <FieldSwitch label="允许纯文字笔记" desc="关闭后必须上传图片、视频或音频" v-model="noteForm.allow_pure_text_notes" />
          <div class="field">
            <label>正文最小字数</label>
            <el-input-number v-model="noteForm.min_length" :min="0" :max="1000" controls-position="right" />
            <small>0 表示不限制最小字数</small>
          </div>
          <div class="field">
            <label>正文最大字数</label>
            <el-input-number v-model="noteForm.max_length" :min="100" :max="50000" controls-position="right" />
            <small>小程序会按这个值截断或提示</small>
          </div>
          <div class="field">
            <label>标题最大字数</label>
            <el-input-number v-model="noteForm.title_max_length" :min="10" :max="120" controls-position="right" />
            <small>标题开启后生效</small>
          </div>
          <div class="field">
            <label>发布间隔（秒）</label>
            <el-input-number v-model="noteForm.publish_interval_seconds" :min="0" :max="86400" controls-position="right" />
            <small>同一用户连续发笔记的最小间隔</small>
          </div>
          <div class="field">
            <label>每日发布上限</label>
            <el-input-number v-model="noteForm.daily_publish_limit" :min="0" :max="1000" controls-position="right" />
            <small>0 表示不限制</small>
          </div>
          <div class="field field-wide">
            <label>发布页默认提示</label>
            <el-input v-model="noteForm.default_note_prompt" type="textarea" :rows="3" maxlength="255" show-word-limit placeholder="例如：分享校园新鲜事、避雷、求助、活动体验..." />
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-title">
          <h3>媒体、安全与话题</h3>
          <p>控制图片视频、二维码过滤、匿名、定位、话题和扩展玩法入口。</p>
        </div>
        <div class="form-grid">
          <FieldSwitch label="允许图片" desc="发布页展示图片上传入口" v-model="noteForm.allow_images" />
          <FieldSwitch label="允许视频" desc="发布页展示视频上传入口" v-model="noteForm.allow_videos" />
          <FieldSwitch label="允许音频" desc="发布页展示音频上传入口" v-model="noteForm.allow_audio" />
          <FieldSwitch label="允许匿名发布" desc="用户可用匿名身份发布笔记" v-model="noteForm.allow_anonymous_notes" />
          <FieldSwitch label="开启位置" desc="发布笔记时可以携带地理位置" v-model="noteForm.enable_note_location" />
          <FieldSwitch label="开启话题" desc="发布时可以绑定圈子话题" v-model="noteForm.enable_topics" />
          <FieldSwitch label="置顶套餐" desc="展示笔记置顶能力入口" v-model="noteForm.enable_note_top" />
          <FieldSwitch label="团购挂载" desc="允许笔记挂载团购商品" v-model="noteForm.enable_note_group" />
          <FieldSwitch label="投票能力" desc="允许发布投票型笔记" v-model="noteForm.enable_vote" />
          <FieldSwitch label="共创笔记" desc="允许多人共创内容" v-model="noteForm.enable_co_create_note" />
          <FieldSwitch label="二维码过滤" desc="过滤笔记图片里的二维码" v-model="noteForm.enable_qrcode_filter" />
          <div class="field">
            <label>每篇最多图片数</label>
            <el-input-number v-model="noteForm.max_images_per_note" :min="0" :max="30" controls-position="right" />
            <small>小程序图片选择上限</small>
          </div>
          <div class="field">
            <label>每篇最多话题数</label>
            <el-input-number v-model="noteForm.max_topics_per_note" :min="0" :max="20" controls-position="right" />
            <small>话题开启后生效</small>
          </div>
          <div class="field">
            <label>图片压缩比例</label>
            <el-input-number v-model="noteForm.image_compression_ratio" :min="0.1" :max="1" :step="0.05" controls-position="right" />
            <small>1 表示不压缩</small>
          </div>
          <div class="field field-upload">
            <label>违规图片替代图</label>
            <ImageUploadBox
              v-model="noteForm.qrcode_replace_image_url"
              scene="content"
              shape="wide"
              :max-size="3"
              placeholder="上传替代图片"
              tip="二维码过滤后展示，建议用提示性图片"
            />
          </div>
          <div class="field field-wide">
            <label>二维码过滤白名单用户</label>
            <el-input v-model="qrcodeWhitelistText" type="textarea" :rows="3" placeholder="每行一个用户ID，白名单用户可正常使用含二维码图片" />
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-title">
          <h3>审核、评论与广告</h3>
          <p>控制发布审核、评论体验、匿名评论、广告位和列表展示策略。</p>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>笔记审核方式</label>
            <el-select v-model="noteForm.note_approval_type">
              <el-option label="人工审核" value="manual" />
              <el-option label="AI 审核" value="ai" />
              <el-option label="不审核" value="none" />
            </el-select>
            <small>AI 不确定或失败时建议进入人工审核</small>
          </div>
          <FieldSwitch label="发布绑定手机号" desc="发布前必须绑定手机号" v-model="noteForm.require_phone_before_publish" />
          <FieldSwitch label="发布需学生认证" desc="发布前必须完成学生认证" v-model="noteForm.require_student_auth_before_publish" />
          <FieldSwitch label="允许评论" desc="关闭后笔记详情不允许评论" v-model="noteForm.allow_comments" />
          <FieldSwitch label="允许匿名评论" desc="评论框展示匿名开关" v-model="noteForm.allow_anonymous_comments" />
          <FieldSwitch label="作者置顶评论" desc="允许作者置顶优质评论" v-model="noteForm.allow_author_pin_comment" />
          <FieldSwitch label="负责人删评论" desc="区域负责人可删除评论" v-model="noteForm.allow_manager_delete_comment" />
          <div class="field">
            <label>评论审核方式</label>
            <el-select v-model="noteForm.comment_approval_type">
              <el-option label="人工审核" value="manual" />
              <el-option label="AI 审核" value="ai" />
              <el-option label="不审核" value="none" />
            </el-select>
          </div>
          <div class="field">
            <label>每篇最大评论数</label>
            <el-input-number v-model="noteForm.max_comments" :min="0" :max="10000" controls-position="right" />
          </div>
          <div class="field">
            <label>评论字数上限</label>
            <el-input-number v-model="noteForm.comment_length_limit" :min="20" :max="5000" controls-position="right" />
          </div>
          <div class="field">
            <label>首页默认布局</label>
            <el-select v-model="noteForm.note_list_style">
              <el-option label="瀑布流" value="waterfall" />
              <el-option label="卡片流" value="card" />
              <el-option label="紧凑列表" value="compact" />
            </el-select>
            <small>会同步给区域信息里的 note_list_style</small>
          </div>
          <div class="field">
            <label>排序策略</label>
            <el-select v-model="noteForm.note_sort_strategy">
              <el-option label="动态排序" value="dynamic" />
              <el-option label="最新优先" value="latest" />
              <el-option label="热度优先" value="hot" />
            </el-select>
          </div>
          <FieldSwitch label="开启广告" desc="在笔记列表或详情内展示广告" v-model="noteForm.enable_ads" />
          <FieldSwitch label="显示浏览量" desc="笔记详情和列表展示浏览次数" v-model="noteForm.show_view_count" />
          <div class="field">
            <label>浏览量计数模式</label>
            <el-select v-model="noteForm.view_count_mode">
              <el-option label="不限制" value="unlimited" />
              <el-option label="每人仅计一次" value="once_per_user" />
              <el-option label="限时去重" value="time_limited" />
            </el-select>
            <small>控制同一用户重复浏览是否累加</small>
          </div>
          <FieldSwitch label="允许举报" desc="用户可举报笔记或评论" v-model="noteForm.enable_report" />
          <FieldSwitch label="允许转发分享" desc="笔记可转发给好友或生成海报" v-model="noteForm.allow_friend_share" />
          <FieldSwitch label="评论图片过滤" desc="评论中的图片也执行二维码过滤" v-model="noteForm.enable_comment_qrcode_filter" />
          <div class="field">
            <label>卡片广告内容</label>
            <el-input v-model="noteForm.card_ad_content" placeholder="广告单元 ID，或通过下方上传广告图" />
            <ImageUploadBox
              v-model="cardAdImageValue"
              scene="config"
              shape="wide"
              :max-size="3"
              placeholder="上传卡片广告图"
              tip="如果使用广告单元 ID，可继续保留上方文本"
            />
          </div>
          <div class="field">
            <label>瀑布流广告内容</label>
            <el-input v-model="noteForm.waterfall_ad_content" placeholder="广告单元 ID，或通过下方上传广告图" />
            <ImageUploadBox
              v-model="waterfallAdImageValue"
              scene="config"
              shape="wide"
              :max-size="3"
              placeholder="上传瀑布流广告图"
              tip="上传后会自动写入上方字段"
            />
          </div>
          <div class="field field-wide">
            <label>内容声明</label>
            <el-input v-model="noteForm.content_declaration" type="textarea" :rows="3" maxlength="255" show-word-limit placeholder="展示在笔记发布或详情页的内容安全提示" />
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-title">
          <h3>编辑权限</h3>
          <p>控制用户发布后能否修改或删除，以及区域负责人后台管理范围。</p>
        </div>
        <div class="form-grid compact">
          <FieldSwitch label="允许用户编辑" desc="用户可编辑已发布笔记" v-model="noteForm.allow_edit" />
          <div class="field">
            <label>可编辑时间（小时）</label>
            <el-input-number v-model="noteForm.editable_hours" :min="0" :max="720" controls-position="right" />
          </div>
          <FieldSwitch label="允许用户删除" desc="用户可删除已发布笔记" v-model="noteForm.allow_delete" />
          <div class="field">
            <label>可删除时间（小时）</label>
            <el-input-number v-model="noteForm.deletable_hours" :min="0" :max="720" controls-position="right" />
          </div>
          <FieldSwitch label="负责人可编辑" desc="区域负责人可编辑用户笔记" v-model="noteForm.manager_can_edit_note" />
          <FieldSwitch label="负责人可删除" desc="区域负责人可删除用户笔记" v-model="noteForm.manager_can_delete_note" />
        </div>
      </section>
    </div>

    <div v-if="activeTab === 'circle'" v-loading="loadingCircle" class="settings-stack">
      <div class="insight-grid">
        <div class="insight-card primary">
          <span>圈子入口</span>
          <strong>{{ circleForm.enable_circle ? '开启' : '关闭' }}</strong>
          <small>控制圈子频道整体开放状态</small>
        </div>
        <div class="insight-card">
          <span>创建权限</span>
          <strong>{{ circleForm.allow_user_create_circle ? '用户可创建' : '仅后台创建' }}</strong>
          <small>{{ circleForm.create_audit_type === 'manual' ? '创建后人工审核' : '快速创建' }}</small>
        </div>
        <div class="insight-card">
          <span>加入方式</span>
          <strong>{{ joinMethodText }}</strong>
          <small>控制默认加入门槛</small>
        </div>
        <div class="insight-card">
          <span>群聊能力</span>
          <strong>{{ circleForm.allow_group_chat ? '可建群聊' : '不建群聊' }}</strong>
          <small>圈主运营能力</small>
        </div>
      </div>

      <section class="settings-section">
        <div class="section-title">
          <h3>圈子基础规则</h3>
          <p>控制圈子频道、用户创建、默认布局、默认加入方式和审核规则。</p>
        </div>
        <div class="form-grid">
          <FieldSwitch label="开启圈子频道" desc="关闭后圈子入口可隐藏或置灰" v-model="circleForm.enable_circle" />
          <FieldSwitch label="允许用户创建" desc="关闭后只有后台可创建圈子" v-model="circleForm.allow_user_create_circle" />
          <div class="field">
            <label>默认布局</label>
            <el-select v-model="circleForm.circle_default_layout">
              <el-option label="单列展示" value="single" />
              <el-option label="双列卡片" value="grid" />
              <el-option label="紧凑列表" value="compact" />
            </el-select>
          </div>
          <div class="field">
            <label>创建审核</label>
            <el-select v-model="circleForm.create_audit_type">
              <el-option label="人工审核" value="manual" />
              <el-option label="AI 审核" value="ai" />
              <el-option label="无需审核" value="none" />
            </el-select>
          </div>
          <div class="field">
            <label>默认加入方式</label>
            <el-select v-model="circleForm.default_join_method">
              <el-option label="自由加入" value="free" />
              <el-option label="申请加入" value="approval" />
              <el-option label="邀请码加入" value="invite" />
              <el-option label="付费加入" value="paid" />
            </el-select>
          </div>
          <div class="field">
            <label>默认圈子 ID</label>
            <el-input v-model="circleForm.default_circle_id" placeholder="留空则不指定默认圈子" />
            <small>发布笔记未选圈子时可作为兜底</small>
          </div>
          <div class="field field-wide">
            <label>圈子提示文案</label>
            <el-input v-model="circleForm.circle_notice" type="textarea" :rows="3" maxlength="255" show-word-limit placeholder="展示给用户的圈子说明" />
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-title">
          <h3>创建限制与资料要求</h3>
          <p>控制圈子名称、简介、人数、每个用户可创建/管理数量和资料完整度。</p>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>名称最小字数</label>
            <el-input-number v-model="circleForm.circle_name_min_length" :min="1" :max="20" controls-position="right" />
          </div>
          <div class="field">
            <label>名称最大字数</label>
            <el-input-number v-model="circleForm.circle_name_max_length" :min="2" :max="50" controls-position="right" />
          </div>
          <div class="field">
            <label>简介最大字数</label>
            <el-input-number v-model="circleForm.circle_desc_max_length" :min="20" :max="2000" controls-position="right" />
          </div>
          <div class="field">
            <label>最大成员数</label>
            <el-input-number v-model="circleForm.max_members_per_circle" :min="1" :max="100000" controls-position="right" />
          </div>
          <div class="field">
            <label>每人最多创建</label>
            <el-input-number v-model="circleForm.max_circles_per_user" :min="0" :max="100" controls-position="right" />
          </div>
          <div class="field">
            <label>每人最多管理</label>
            <el-input-number v-model="circleForm.max_manage_circles_per_user" :min="0" :max="100" controls-position="right" />
          </div>
          <FieldSwitch label="创建需学生认证" desc="用户创建圈子前必须完成学生认证" v-model="circleForm.require_student_auth_create" />
          <FieldSwitch label="必须上传图标" desc="创建圈子时必须上传圈子图标" v-model="circleForm.circle_icon_required" />
          <FieldSwitch label="必须上传封面" desc="创建圈子时必须上传封面图" v-model="circleForm.circle_cover_required" />
        </div>
      </section>

      <section class="settings-section">
        <div class="section-title">
          <h3>成员、发帖与安全</h3>
          <p>控制私密圈子、邀请、群聊、圈内发帖、二维码过滤和话题分组。</p>
        </div>
        <div class="form-grid">
          <FieldSwitch label="允许私密圈子" desc="用户可创建不公开展示的圈子" v-model="circleForm.allow_private_circle" />
          <FieldSwitch label="圈主邀请成员" desc="圈主可以邀请用户加入" v-model="circleForm.owner_can_invite" />
          <FieldSwitch label="加入需要审核" desc="默认进入成员申请流程" v-model="circleForm.member_approval_required" />
          <FieldSwitch label="允许圈子群聊" desc="圈主可以创建圈子群聊" v-model="circleForm.allow_group_chat" />
          <FieldSwitch label="允许圈内发帖" desc="用户可发布圈内笔记" v-model="circleForm.allow_circle_post" />
          <FieldSwitch label="圈内二维码过滤" desc="圈内笔记图片执行二维码过滤" v-model="circleForm.qrcode_filter_in_circle" />
          <FieldSwitch label="允许付费圈子" desc="开启后圈子可配置付费加入" v-model="circleForm.allow_paid_circle" />
          <FieldSwitch label="付费圈需审核" desc="付费圈创建或改价进入审核" v-model="circleForm.paid_circle_requires_audit" />
          <div class="field">
            <label>最低加入价格（元）</label>
            <el-input-number v-model="circleForm.min_join_price" :min="0" :max="9999" :precision="2" controls-position="right" />
            <small>付费圈子的最低定价，0 表示不限制</small>
          </div>
          <div class="field">
            <label>最高加入价格（元）</label>
            <el-input-number v-model="circleForm.max_join_price" :min="0" :max="9999" :precision="2" controls-position="right" />
            <small>付费圈子的最高定价，防止误操作</small>
          </div>
          <div class="field">
            <label>圈内发帖权限</label>
            <el-select v-model="circleForm.circle_post_permission">
              <el-option label="所有人" value="all" />
              <el-option label="仅成员" value="members" />
              <el-option label="仅圈主/管理员" value="owner" />
            </el-select>
          </div>
          <FieldSwitch label="开启话题分栏" desc="圈内可以按话题分组展示" v-model="circleForm.enable_topic_headers" />
          <div class="field">
            <label>最多话题分栏</label>
            <el-input-number v-model="circleForm.max_topic_headers" :min="0" :max="20" controls-position="right" />
          </div>
          <div class="field">
            <label>每栏最多话题</label>
            <el-input-number v-model="circleForm.max_topics_per_header" :min="0" :max="100" controls-position="right" />
          </div>
          <div class="field field-wide">
            <label>默认话题分栏名称</label>
            <el-input v-model="circleTopicHeaderText" type="textarea" :rows="3" placeholder="每行一个名称，例如：公告、交流、问答" />
          </div>
        </div>
      </section>
    </div>

    <div v-if="activeTab === 'anonymous'">
      <div class="section-actions">
        <el-button type="primary" @click="showAnonymousDialog = true">新增身份</el-button>
      </div>
      <div class="glass-card table-card">
        <el-table :data="anonymousList" v-loading="loadingAnonymous" border stripe>
          <el-table-column label="头像" width="80">
            <template #default="{ row }">
              <el-avatar :size="40" :src="row.avatar">{{ (row.name || '?')[0] }}</el-avatar>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="150" />
          <el-table-column label="创建时间" width="160">
            <template #default="{ row }">
              <TimeText :time="row.createdAt" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button size="small" link @click="editAnonymous(row)">编辑</el-button>
              <el-button size="small" link type="danger" @click="deleteAnonymous(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <div v-if="activeTab === 'poster'">
      <div class="settings-section narrow">
        <div class="section-title">
          <h3>笔记海报配置</h3>
          <p>分享笔记或生成海报时使用的品牌素材。</p>
        </div>
        <el-form :model="posterForm" label-width="120px" class="simple-form">
          <el-form-item label="背景色">
            <el-color-picker v-model="posterForm.bgColor" />
            <el-input v-model="posterForm.bgColor" style="width: 140px; margin-left: 8px;" />
          </el-form-item>
          <el-form-item label="海报 Logo">
            <ImageUploadBox v-model="posterForm.logoUrl" scene="config" shape="square" :max-size="2" placeholder="上传海报 Logo" tip="建议透明 PNG 或方形图片" />
          </el-form-item>
          <el-form-item label="尾部文案">
            <el-input v-model="posterForm.footerText" placeholder="扫码查看更多" />
          </el-form-item>
          <el-form-item label="二维码位置">
            <el-select v-model="posterForm.qrcodePosition" style="width: 100%">
              <el-option label="左上" value="top-left" />
              <el-option label="右上" value="top-right" />
              <el-option label="左下" value="bottom-left" />
              <el-option label="右下" value="bottom-right" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="savePoster" :loading="savingPoster">保存配置</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <div v-if="activeTab === 'reward'">
      <div class="settings-section narrow">
        <div class="section-title">
          <h3>内容奖励配置</h3>
          <p>用积分奖励鼓励真实发布、互动和签到。</p>
        </div>
        <el-form :model="rewardForm" label-width="120px" class="simple-form">
          <el-form-item label="发帖奖励"><el-input-number v-model="rewardForm.postPublishReward" :min="0" /><span class="unit">积分</span></el-form-item>
          <el-form-item label="评论奖励"><el-input-number v-model="rewardForm.commentReward" :min="0" /><span class="unit">积分</span></el-form-item>
          <el-form-item label="首帖奖励"><el-input-number v-model="rewardForm.firstPostReward" :min="0" /><span class="unit">积分</span></el-form-item>
          <el-form-item label="签到奖励"><el-input-number v-model="rewardForm.dailyCheckInReward" :min="0" /><span class="unit">积分</span></el-form-item>
          <el-form-item><el-button type="primary" @click="saveReward" :loading="savingReward">保存配置</el-button></el-form-item>
        </el-form>
      </div>
    </div>

    <div v-if="activeTab === 'badge'">
      <div class="section-actions">
        <el-button type="primary" @click="showBadgeDialog = true">新增徽章</el-button>
      </div>
      <div class="glass-card table-card">
        <el-table :data="badgeList" v-loading="loadingBadge" border stripe>
          <el-table-column label="图标" width="80">
            <template #default="{ row }">
              <el-avatar :size="40" :src="row.icon">{{ (row.name || '?')[0] }}</el-avatar>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" width="150" />
          <el-table-column prop="description" label="描述" min-width="200" />
          <el-table-column label="用户数" width="100">
            <template #default="{ row }">{{ row._count?.users || 0 }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button size="small" link type="danger" @click="deleteBadge(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <div v-if="activeTab === 'notification'">
      <div class="glass-card table-card">
        <el-table :data="notificationList" v-loading="loadingNotification" border stripe>
          <el-table-column prop="title" label="标题" min-width="150" />
          <el-table-column prop="content" label="内容" min-width="200" />
          <el-table-column label="接收用户" width="120">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column label="时间" width="160">
            <template #default="{ row }"><TimeText :time="row.createdAt" /></template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button size="small" link type="danger" @click="deleteNotification(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="table-footer">
          <el-pagination
            v-model:current-page="notificationPage"
            v-model:page-size="notificationPageSize"
            :total="notificationTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @current-change="loadNotifications"
            @size-change="loadNotifications"
          />
        </div>
      </div>
    </div>

    <el-dialog v-model="showAnonymousDialog" :title="editingAnonymous ? '编辑匿名身份' : '新增匿名身份'" width="500px">
      <el-form :model="anonymousForm" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="anonymousForm.name" placeholder="请输入名称" /></el-form-item>
        <el-form-item label="头像">
          <ImageUploadBox v-model="anonymousForm.avatar" scene="config" shape="square" :max-size="2" placeholder="上传匿名头像" tip="建议 200x200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAnonymousDialog = false">取消</el-button>
        <el-button type="primary" @click="saveAnonymous" :loading="savingAnonymous">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBadgeDialog" title="新增徽章" width="500px">
      <el-form :model="badgeForm" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="badgeForm.name" placeholder="请输入徽章名称" /></el-form-item>
        <el-form-item label="图标">
          <ImageUploadBox v-model="badgeForm.icon" scene="config" shape="square" :max-size="2" placeholder="上传徽章图标" tip="建议 200x200" />
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="badgeForm.description" type="textarea" :rows="3" placeholder="徽章描述" /></el-form-item>
        <el-form-item label="条件"><el-input v-model="badgeForm.condition" placeholder="获得条件" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBadgeDialog = false">取消</el-button>
        <el-button type="primary" @click="saveBadge" :loading="savingBadge">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref, watch } from 'vue'
import { ElButton, ElMessage, ElMessageBox, ElSwitch } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import TimeText from '@/components/common/TimeText.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

const FieldSwitch = defineComponent({
  name: 'FieldSwitch',
  props: {
    modelValue: { type: Number, default: 0 },
    label: { type: String, required: true },
    desc: { type: String, default: '' }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('div', { class: 'field switch-field' }, [
      h('div', { class: 'switch-copy' }, [
        h('label', props.label),
        props.desc ? h('small', props.desc) : null
      ]),
      h(ElSwitch, {
        modelValue: props.modelValue,
        activeValue: 1,
        inactiveValue: 0,
        onChange: (value: number | boolean) => emit('update:modelValue', value ? 1 : 0)
      })
    ])
  }
})

const isImageMaterialValue = (value?: string) => {
  const text = String(value || '').trim()
  return /^data:image\//i.test(text)
    || /^blob:/i.test(text)
    || /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(text)
    || /^\/uploads\//i.test(text)
    || /^uploads\//i.test(text)
}

const NOTE_DEFAULTS = {
  enable_region_posting: 1,
  min_length: 1,
  max_length: 5000,
  enable_note_title: 0,
  title_min_length: 0,
  title_max_length: 50,
  publish_interval_seconds: 0,
  allow_images: 1,
  max_images_per_note: 9,
  allow_download_image: 0,
  allow_videos: 1,
  allow_audio: 1,
  allow_pure_text_notes: 1,
  image_compression_ratio: 0.8,
  enable_qrcode_filter: 0,
  qrcode_replace_image_url: '',
  qrcode_whitelist_user_ids: [] as string[],
  enable_topics: 1,
  max_topics_per_note: 3,
  allow_anonymous_notes: 0,
  anonymous_default_name: '匿名用户',
  enable_note_location: 0,
  enable_note_group: 0,
  enable_note_top: 0,
  enable_co_create_note: 0,
  enable_vote: 0,
  note_approval_type: 'manual',
  require_phone_before_publish: 0,
  require_student_auth_before_publish: 0,
  daily_publish_limit: 10,
  default_note_prompt: '',
  content_declaration: '发布校园生活、经验和新鲜事',
  allow_comments: 1,
  max_comments: 100,
  comment_length_limit: 500,
  allow_anonymous_comments: 0,
  allow_author_pin_comment: 0,
  allow_manager_delete_comment: 1,
  comment_approval_type: 'manual',
  random_comment_enabled: 0,
  enable_ads: 0,
  card_ad_content: '',
  waterfall_ad_content: '',
  note_list_style: 'waterfall',
  note_sort_strategy: 'latest',
  allow_edit: 1,
  editable_hours: 24,
  allow_delete: 1,
  deletable_hours: 72,
  manager_can_edit_note: 1,
  manager_can_delete_note: 1,
  show_view_count: 1,
  view_count_mode: 'unlimited',
  enable_report: 1,
  allow_friend_share: 1,
  enable_comment_qrcode_filter: 0
}

const cardAdImageValue = computed({
  get: () => isImageMaterialValue(noteForm.card_ad_content) ? noteForm.card_ad_content : '',
  set: (value: string) => {
    noteForm.card_ad_content = value
  }
})

const waterfallAdImageValue = computed({
  get: () => isImageMaterialValue(noteForm.waterfall_ad_content) ? noteForm.waterfall_ad_content : '',
  set: (value: string) => {
    noteForm.waterfall_ad_content = value
  }
})

const CIRCLE_DEFAULTS = {
  enable_circle: 1,
  circle_default_layout: 'single',
  allow_user_create_circle: 1,
  create_audit_type: 'manual',
  circle_audit_type: 'manual',
  default_circle_id: '',
  default_join_method: 'free',
  circle_name_min_length: 2,
  circle_name_max_length: 20,
  circle_desc_max_length: 300,
  max_members_per_circle: 500,
  max_circles_per_user: 5,
  max_manage_circles_per_user: 3,
  allow_paid_circle: 0,
  paid_circle_requires_audit: 1,
  min_join_price: 0,
  max_join_price: 999,
  require_student_auth_create: 0,
  circle_icon_required: 0,
  circle_cover_required: 0,
  allow_circle_announcement: 1,
  allow_group_chat: 1,
  allow_private_circle: 1,
  owner_can_invite: 1,
  member_approval_required: 0,
  qrcode_filter_in_circle: 1,
  allow_circle_post: 1,
  circle_post_permission: 'members',
  enable_topic_headers: 1,
  max_topic_headers: 5,
  max_topics_per_header: 20,
  default_topic_header_names: ['公告', '交流', '问答'] as string[],
  circle_notice: '加入圈子后可以参与圈内笔记、话题和同校交流。'
}

const activeTab = ref('note')
const regions = ref<any[]>([])
const selectedRegionId = ref(localStorage.getItem('LM_SELECTED_REGION_ID') || '')
const refreshing = ref(false)
const loadingNote = ref(false)
const savingNote = ref(false)
const loadingCircle = ref(false)
const savingCircle = ref(false)
const qrcodeWhitelistText = ref('')
const circleTopicHeaderText = ref('')
const noteForm = reactive<any>({ ...NOTE_DEFAULTS })
const circleForm = reactive<any>({ ...CIRCLE_DEFAULTS })

const selectedRegion = computed(() => regions.value.find((item) => item.id === selectedRegionId.value))
const enabledMediaText = computed(() => {
  const enabled = [
    noteForm.allow_images ? '图片' : '',
    noteForm.allow_videos ? '视频' : '',
    noteForm.allow_audio ? '音频' : ''
  ].filter(Boolean)
  return enabled.length ? enabled.join(' / ') : '仅文字'
})
const joinMethodText = computed(() => {
  const map: Record<string, string> = { free: '自由加入', approval: '申请加入', invite: '邀请码', paid: '付费加入' }
  return map[circleForm.default_join_method] || '自由加入'
})

function unwrapData(res: any) {
  return res?.data?.data || res?.data || res
}

function normalizeRegionList(res: any) {
  const list = res?.data?.list || res?.list || res?.data || []
  return Array.isArray(list)
    ? list.map((item: any) => ({
        ...item,
        statusText: item.statusText || (item.isOpen === false || item.status === 'disabled' ? '已关闭' : '运营中')
      }))
    : []
}

const loadRegions = async () => {
  try {
    const res: any = await request.get('/admin/regions', { params: { page: 1, pageSize: 300 } })
    regions.value = normalizeRegionList(res)
    if (!selectedRegionId.value && regions.value.length) {
      selectedRegionId.value = regions.value[0].id
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载区域失败')
  }
}

const handleRegionChange = async () => {
  if (selectedRegionId.value) localStorage.setItem('LM_SELECTED_REGION_ID', selectedRegionId.value)
  await refreshCurrent()
}

const loadNoteConfig = async () => {
  if (!selectedRegionId.value) return
  loadingNote.value = true
  try {
    const res: any = await request.get(`/admin/note-settings/${selectedRegionId.value}`)
    const data = unwrapData(res)
    Object.assign(noteForm, NOTE_DEFAULTS, data || {})
    qrcodeWhitelistText.value = Array.isArray(noteForm.qrcode_whitelist_user_ids)
      ? noteForm.qrcode_whitelist_user_ids.join('\n')
      : String(noteForm.qrcode_whitelist_user_ids || '')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载笔记配置失败')
  } finally {
    loadingNote.value = false
  }
}

const saveNoteConfig = async () => {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  savingNote.value = true
  try {
    const payload = {
      ...noteForm,
      qrcode_whitelist_user_ids: qrcodeWhitelistText.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean)
    }
    const res: any = await request.put(`/admin/note-settings/${selectedRegionId.value}`, payload)
    const data = unwrapData(res)
    Object.assign(noteForm, NOTE_DEFAULTS, data || payload)
    ElMessage.success('笔记配置已保存，小程序发布页会读取新规则')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存笔记配置失败')
  } finally {
    savingNote.value = false
  }
}

const loadCircleConfig = async () => {
  if (!selectedRegionId.value) return
  loadingCircle.value = true
  try {
    const res: any = await request.get('/admin/circles/config', { params: { regionId: selectedRegionId.value } })
    const data = unwrapData(res)
    Object.assign(circleForm, CIRCLE_DEFAULTS, data || {})
    circleTopicHeaderText.value = Array.isArray(circleForm.default_topic_header_names)
      ? circleForm.default_topic_header_names.join('\n')
      : String(circleForm.default_topic_header_names || '')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载圈子配置失败')
  } finally {
    loadingCircle.value = false
  }
}

const saveCircleConfig = async () => {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  savingCircle.value = true
  try {
    const payload = {
      ...circleForm,
      default_topic_header_names: circleTopicHeaderText.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean)
    }
    const res: any = await request.put('/admin/circles/config', payload, { params: { regionId: selectedRegionId.value } })
    const data = unwrapData(res)
    Object.assign(circleForm, CIRCLE_DEFAULTS, data || payload)
    ElMessage.success('圈子配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存圈子配置失败')
  } finally {
    savingCircle.value = false
  }
}

const refreshCurrent = async () => {
  refreshing.value = true
  try {
    if (activeTab.value === 'note') await loadNoteConfig()
    else if (activeTab.value === 'circle') await loadCircleConfig()
    else if (activeTab.value === 'anonymous') await loadAnonymous()
    else if (activeTab.value === 'poster') await loadPoster()
    else if (activeTab.value === 'reward') await loadReward()
    else if (activeTab.value === 'badge') await loadBadges()
    else if (activeTab.value === 'notification') await loadNotifications()
  } finally {
    refreshing.value = false
  }
}

// ========== 匿名身份 ==========
const loadingAnonymous = ref(false)
const savingAnonymous = ref(false)
const anonymousList = ref<any[]>([])
const showAnonymousDialog = ref(false)
const editingAnonymous = ref<any>(null)
const anonymousForm = reactive({ name: '', avatar: '' })

const loadAnonymous = async () => {
  loadingAnonymous.value = true
  try {
    const res: any = await request.get('/admin/content-ext/anonymous-identities')
    anonymousList.value = res.data?.list || res.list || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
  finally { loadingAnonymous.value = false }
}

const editAnonymous = (row: any) => {
  editingAnonymous.value = row
  anonymousForm.name = row.name
  anonymousForm.avatar = row.avatar || ''
  showAnonymousDialog.value = true
}

const saveAnonymous = async () => {
  if (!anonymousForm.name) { ElMessage.warning('请输入名称'); return }
  savingAnonymous.value = true
  try {
    if (editingAnonymous.value) {
      await request.put(`/admin/content-ext/anonymous-identities/${editingAnonymous.value.id}`, anonymousForm)
      ElMessage.success('更新成功')
    } else {
      await request.post('/admin/content-ext/anonymous-identities', anonymousForm)
      ElMessage.success('创建成功')
    }
    showAnonymousDialog.value = false
    editingAnonymous.value = null
    anonymousForm.name = ''
    anonymousForm.avatar = ''
    loadAnonymous()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
  finally { savingAnonymous.value = false }
}

const deleteAnonymous = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定删除"${row.name}"？`, '确认')
    await request.delete(`/admin/content-ext/anonymous-identities/${row.id}`)
    ElMessage.success('删除成功')
    loadAnonymous()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

// ========== 海报配置 ==========
const savingPoster = ref(false)
const posterForm = reactive({ bgColor: '#ffffff', logoUrl: '', footerText: '扫码查看更多', qrcodePosition: 'bottom-right' })

const loadPoster = async () => {
  try {
    const res = await request.get('/admin/content-ext/poster-config')
    const data = unwrapData(res)
    if (data) Object.assign(posterForm, data)
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

const savePoster = async () => {
  savingPoster.value = true
  try {
    await request.put('/admin/content-ext/poster-config', posterForm)
    ElMessage.success('保存成功')
  } catch (e: any) { ElMessage.error(e?.message || '保存失败') }
  finally { savingPoster.value = false }
}

// ========== 奖励配置 ==========
const savingReward = ref(false)
const rewardForm = reactive({ postPublishReward: 5, commentReward: 2, firstPostReward: 50, dailyCheckInReward: 10 })

const loadReward = async () => {
  try {
    const res = await request.get('/admin/content-ext/reward-config')
    const data = unwrapData(res)
    if (data) Object.assign(rewardForm, data)
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

const saveReward = async () => {
  savingReward.value = true
  try {
    await request.put('/admin/content-ext/reward-config', rewardForm)
    ElMessage.success('保存成功')
  } catch (e: any) { ElMessage.error(e?.message || '保存失败') }
  finally { savingReward.value = false }
}

// ========== 徽章 ==========
const loadingBadge = ref(false)
const savingBadge = ref(false)
const badgeList = ref<any[]>([])
const showBadgeDialog = ref(false)
const badgeForm = reactive({ name: '', icon: '', description: '', condition: '' })

const loadBadges = async () => {
  loadingBadge.value = true
  try {
    const res: any = await request.get('/admin/content-ext/badges')
    badgeList.value = res.data?.list || res.list || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
  finally { loadingBadge.value = false }
}

const saveBadge = async () => {
  if (!badgeForm.name) { ElMessage.warning('请输入名称'); return }
  savingBadge.value = true
  try {
    await request.post('/admin/content-ext/badges', badgeForm)
    ElMessage.success('创建成功')
    showBadgeDialog.value = false
    badgeForm.name = ''
    badgeForm.icon = ''
    badgeForm.description = ''
    badgeForm.condition = ''
    loadBadges()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
  finally { savingBadge.value = false }
}

const deleteBadge = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定删除徽章"${row.name}"？`, '确认')
    await request.delete(`/admin/content-ext/badges/${row.id}`)
    ElMessage.success('删除成功')
    loadBadges()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

// ========== 通知记录 ==========
const loadingNotification = ref(false)
const notificationList = ref<any[]>([])
const notificationTotal = ref(0)
const notificationPage = ref(1)
const notificationPageSize = ref(20)

const loadNotifications = async () => {
  loadingNotification.value = true
  try {
    const res: any = await request.get('/admin/content-ext/notifications', { params: { page: notificationPage.value, limit: notificationPageSize.value } })
    notificationList.value = res.data?.list || res.list || []
    notificationTotal.value = res.data?.total || res.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
  finally { loadingNotification.value = false }
}

const deleteNotification = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定删除该通知？', '确认')
    await request.delete(`/admin/content-ext/notifications/${row.id}`)
    ElMessage.success('删除成功')
    loadNotifications()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

watch(activeTab, () => refreshCurrent())
watch(selectedRegionId, (id) => { if (id) localStorage.setItem('LM_SELECTED_REGION_ID', id) })

onMounted(async () => {
  await loadRegions()
  await refreshCurrent()
})
</script>

<style scoped>
.page-container {
  padding: 24px;
}

.content-settings-page {
  --panel-border: rgba(148, 163, 184, 0.24);
  color: #10203d;
}

.ops-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  margin: 18px 0 22px;
  padding: 22px 24px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, .94), rgba(236, 248, 255, .88));
  box-shadow: 0 18px 50px rgba(37, 99, 235, .10);
}

.eyebrow {
  display: block;
  margin-bottom: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.region-line {
  display: flex;
  align-items: center;
  gap: 12px;
}

.region-select {
  width: min(420px, 52vw);
}

.hero-desc {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 14px;
}

.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.config-tabs {
  margin-bottom: 18px;
}

.settings-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.insight-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.insight-card,
.settings-section,
.glass-card {
  background: rgba(255, 255, 255, .92);
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, .07);
}

.insight-card {
  padding: 18px 20px;
}

.insight-card.primary {
  background: linear-gradient(135deg, #2f78ff, #22c7e5);
  color: white;
  border-color: transparent;
}

.insight-card span,
.insight-card small {
  display: block;
  color: inherit;
  opacity: .72;
  font-size: 12px;
  font-weight: 800;
}

.insight-card strong {
  display: block;
  margin: 8px 0 6px;
  font-size: 24px;
  line-height: 1.1;
}

.settings-section {
  padding: 22px 24px;
}

.settings-section.narrow {
  max-width: 760px;
}

.section-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, .22);
}

.section-title h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
}

.section-title p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.form-grid.compact {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.field {
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, .18);
  border-radius: 14px;
  background: rgba(248, 250, 252, .7);
}

.field > label,
.switch-copy label {
  display: block;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 900;
  color: #203250;
}

.field small,
.switch-copy small {
  display: block;
  margin-top: 8px;
  color: #7b8ba5;
  font-size: 12px;
  line-height: 1.5;
}

.switch-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.field :deep(.el-select),
.field :deep(.el-input),
.field :deep(.el-input-number) {
  width: 100%;
}

.field-wide {
  grid-column: span 2;
}

.field-upload {
  grid-row: span 2;
}

.section-actions {
  margin-bottom: 16px;
}

.table-card {
  padding: 0;
  overflow: hidden;
}

.table-footer {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
}

.simple-form {
  max-width: 640px;
}

.unit {
  margin-left: 8px;
  color: #64748b;
}

@media (max-width: 1400px) {
  .insight-grid,
  .form-grid,
  .form-grid.compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 920px) {
  .ops-hero,
  .section-title {
    flex-direction: column;
    align-items: stretch;
  }
  .region-select {
    width: 100%;
  }
  .insight-grid,
  .form-grid,
  .form-grid.compact {
    grid-template-columns: 1fr;
  }
  .field-wide {
    grid-column: span 1;
  }
}
</style>

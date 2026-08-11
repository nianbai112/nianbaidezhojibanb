<template>
  <div class="page-shell">
    <GlassPageHeader title="AI运营配置" subtitle="配置内容冷启动、机器人互动、AI笔记生成、AI评论和热度规则">
      <template #actions>
        <el-button @click="handleReset" :loading="resetting">恢复默认</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="handleSave">保存配置</el-button>
      </template>
    </GlassPageHeader>

    <div class="ai-ops-layout">
      <div class="glass-card ai-ops-sidebar">
        <div class="card-body sidebar-nav">
          <button
            v-for="section in sections"
            :key="section.key"
            :class="{ active: activeSection === section.key }"
            @click="activeSection = section.key"
          >
            <el-icon><component :is="section.icon" /></el-icon>
            <span>{{ section.label }}</span>
          </button>
        </div>
      </div>

      <div class="ai-ops-main">
        <!-- 状态概览 -->
        <div class="glass-card status-card">
          <div class="card-body status-grid">
            <div class="status-item">
              <div class="status-label">AI运营状态</div>
              <el-tag :type="form.enabled ? 'success' : 'info'" size="large">
                {{ form.enabled ? '已启用' : '已禁用' }}
              </el-tag>
            </div>
            <div class="status-item">
              <div class="status-label">运营模式</div>
              <el-tag>{{ modeLabel }}</el-tag>
            </div>
            <div class="status-item">
              <div class="status-label">区域</div>
              <span>{{ form.regionId || '全局' }}</span>
            </div>
            <div class="status-item">
              <div class="status-label">冷启动</div>
              <el-tag :type="form.coldStart?.enabled ? 'success' : 'info'">
                {{ form.coldStart?.enabled ? '已启用' : '已禁用' }}
              </el-tag>
            </div>
          </div>
        </div>

        <!-- 基础信息 -->
        <div v-show="activeSection === 'basic'" class="glass-card">
          <div class="card-header">
            <div class="card-title">基础信息</div>
            <div class="card-desc">配置AI运营的基本参数和生效范围</div>
          </div>
          <div class="card-body">
            <el-form label-position="top">
              <div class="form-grid two">
                <el-form-item label="区域选择">
                  <el-select v-model="form.regionId" placeholder="选择区域（留空为全局）" clearable style="width:100%">
                    <el-option label="全局（所有区域）" value="" />
                    <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
                  </el-select>
                </el-form-item>
                <el-form-item label="运营模式">
                  <el-select v-model="form.operationMode" style="width:100%">
                    <el-option label="保守模式" value="conservative" />
                    <el-option label="标准模式" value="standard" />
                    <el-option label="激进模式" value="aggressive" />
                  </el-select>
                  <div class="form-tip">保守：低频生成；标准：平衡频率；激进：高频生成</div>
                </el-form-item>
              </div>
              <div class="switch-grid">
                <div class="switch-item">
                  <div><b>启用 AI 运营</b><p>总开关，关闭后所有AI运营功能暂停</p></div>
                  <el-switch v-model="form.enabled" />
                </div>
                <div class="switch-item">
                  <div><b>仅新区域启用</b><p>只对新创建的区域自动启用AI运营</p></div>
                  <el-switch v-model="form.onlyNewRegion" />
                </div>
                <div class="switch-item">
                  <div><b>仅测试环境</b><p>只在测试环境生效，生产环境不执行</p></div>
                  <el-switch v-model="form.onlyTestEnv" />
                </div>
              </div>
              <el-form-item label="配置说明备注" style="margin-top:16px">
                <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="记录此配置的用途或变更说明" />
              </el-form-item>
            </el-form>
          </div>
        </div>

        <!-- 内容冷启动配置 -->
        <div v-show="activeSection === 'coldStart'" class="glass-card">
          <div class="card-header">
            <div class="card-title">内容冷启动配置</div>
            <div class="card-desc">配置新区域的内容自动生成策略，帮助新区域快速积累内容</div>
          </div>
          <div class="card-body">
            <el-form label-position="top">
              <div class="switch-grid">
                <div class="switch-item">
                  <div><b>启用内容冷启动</b><p>新区域自动批量生成初始内容</p></div>
                  <el-switch v-model="form.coldStart.enabled" />
                </div>
                <div class="switch-item">
                  <div><b>内容去重</b><p>自动检测并过滤重复内容</p></div>
                  <el-switch v-model="form.coldStart.deduplication" />
                </div>
                <div class="switch-item">
                  <div><b>敏感词过滤</b><p>生成内容自动过滤敏感词</p></div>
                  <el-switch v-model="form.coldStart.sensitiveWordFilter" />
                </div>
              </div>
              <div class="form-grid two" style="margin-top:16px">
                <el-form-item label="每日生成内容总数">
                  <el-input-number v-model="form.coldStart.dailyTotal" :min="1" :max="200" style="width:100%" />
                </el-form-item>
                <el-form-item label="新区域首次生成数量">
                  <el-input-number v-model="form.coldStart.newRegionFirstCount" :min="1" :max="100" style="width:100%" />
                </el-form-item>
                <el-form-item label="每小时最小批次">
                  <el-input-number v-model="form.coldStart.minBatchPerHour" :min="0" :max="10" style="width:100%" />
                </el-form-item>
                <el-form-item label="每小时最大批次">
                  <el-input-number v-model="form.coldStart.maxBatchPerHour" :min="1" :max="20" style="width:100%" />
                </el-form-item>
                <el-form-item label="每批最小内容数">
                  <el-input-number v-model="form.coldStart.minPerBatch" :min="1" :max="20" style="width:100%" />
                </el-form-item>
                <el-form-item label="每批最大内容数">
                  <el-input-number v-model="form.coldStart.maxPerBatch" :min="1" :max="50" style="width:100%" />
                </el-form-item>
              </div>
              <el-form-item label="禁用生成时间段">
                <div v-for="(range, idx) in form.coldStart.disabledTimeRanges" :key="idx" class="time-range-item">
                  <el-time-picker v-model="range.start" placeholder="开始时间" format="HH:mm" style="width:140px" />
                  <span style="margin:0 8px">至</span>
                  <el-time-picker v-model="range.end" placeholder="结束时间" format="HH:mm" style="width:140px" />
                  <el-button type="danger" text @click="form.coldStart.disabledTimeRanges.splice(idx, 1)">删除</el-button>
                </div>
                <el-button size="small" @click="form.coldStart.disabledTimeRanges.push({ start: '', end: '' })">添加时间段</el-button>
              </el-form-item>

              <div class="section-divider">内容类型比例</div>
              <div class="ratio-grid">
                <div class="ratio-item">
                  <span>校园生活笔记</span>
                  <el-input-number v-model="form.coldStart.contentRatio.campusLife" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>二手交易内容</span>
                  <el-input-number v-model="form.coldStart.contentRatio.secondHand" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>跑腿生活内容</span>
                  <el-input-number v-model="form.coldStart.contentRatio.errand" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>商家探店内容</span>
                  <el-input-number v-model="form.coldStart.contentRatio.merchantReview" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>圈子话题内容</span>
                  <el-input-number v-model="form.coldStart.contentRatio.circleTopic" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>活动内容</span>
                  <el-input-number v-model="form.coldStart.contentRatio.activity" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
              </div>
            </el-form>
          </div>
        </div>

        <!-- AI笔记生成配置 -->
        <div v-show="activeSection === 'noteGen'" class="glass-card">
          <div class="card-header">
            <div class="card-title">AI笔记生成配置</div>
            <div class="card-desc">配置AI自动生成笔记的内容规范和发布策略</div>
          </div>
          <div class="card-body">
            <el-form label-position="top">
              <div class="switch-grid">
                <div class="switch-item">
                  <div><b>启用 AI 笔记</b><p>允许AI自动生成笔记内容</p></div>
                  <el-switch v-model="form.noteGeneration.enabled" />
                </div>
                <div class="switch-item">
                  <div><b>自动配图</b><p>为生成的笔记自动匹配图片</p></div>
                  <el-switch v-model="form.noteGeneration.autoAttachImage" />
                </div>
                <div class="switch-item">
                  <div><b>自动发布</b><p>生成后直接发布，无需人工审核</p></div>
                  <el-switch v-model="form.noteGeneration.autoPublish" />
                </div>
                <div class="switch-item">
                  <div><b>需要人工审核</b><p>生成后进入待审核队列</p></div>
                  <el-switch v-model="form.noteGeneration.requireReview" />
                </div>
              </div>
              <div class="form-grid two" style="margin-top:16px">
                <el-form-item label="标题最小字数">
                  <el-input-number v-model="form.noteGeneration.titleMinLength" :min="2" :max="50" style="width:100%" />
                </el-form-item>
                <el-form-item label="标题最大字数">
                  <el-input-number v-model="form.noteGeneration.titleMaxLength" :min="5" :max="100" style="width:100%" />
                </el-form-item>
                <el-form-item label="内容最小字数">
                  <el-input-number v-model="form.noteGeneration.contentMinLength" :min="10" :max="500" style="width:100%" />
                </el-form-item>
                <el-form-item label="内容最大字数">
                  <el-input-number v-model="form.noteGeneration.contentMaxLength" :min="50" :max="5000" style="width:100%" />
                </el-form-item>
                <el-form-item label="生成超时时间（秒）">
                  <el-input-number v-model="form.noteGeneration.generateTimeout" :min="5" :max="120" style="width:100%" />
                </el-form-item>
                <el-form-item label="默认发布状态">
                  <el-select v-model="form.noteGeneration.defaultStatus" style="width:100%">
                    <el-option label="待审核" value="pending" />
                    <el-option label="已发布" value="published" />
                    <el-option label="草稿" value="draft" />
                  </el-select>
                </el-form-item>
                <el-form-item label="图片数量最小值">
                  <el-input-number v-model="form.noteGeneration.imageCountMin" :min="0" :max="9" style="width:100%" />
                </el-form-item>
                <el-form-item label="图片数量最大值">
                  <el-input-number v-model="form.noteGeneration.imageCountMax" :min="1" :max="9" style="width:100%" />
                </el-form-item>
              </div>

              <div class="section-divider">口吻配置</div>
              <div class="ratio-grid">
                <div class="ratio-item">
                  <span>学生口吻</span>
                  <el-input-number v-model="form.noteGeneration.toneRatio.student" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>商家推荐口吻</span>
                  <el-input-number v-model="form.noteGeneration.toneRatio.merchantRecommend" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>校园吐槽口吻</span>
                  <el-input-number v-model="form.noteGeneration.toneRatio.campusRoast" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>求助互助口吻</span>
                  <el-input-number v-model="form.noteGeneration.toneRatio.helpMutual" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>生活分享口吻</span>
                  <el-input-number v-model="form.noteGeneration.toneRatio.lifeShare" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
              </div>
            </el-form>
          </div>
        </div>

        <!-- AI评论配置 -->
        <div v-show="activeSection === 'comment'" class="glass-card">
          <div class="card-header">
            <div class="card-title">AI评论配置</div>
            <div class="card-desc">配置AI自动评论的频率、风格和互动规则</div>
          </div>
          <div class="card-body">
            <el-form label-position="top">
              <div class="switch-grid">
                <div class="switch-item">
                  <div><b>启用 AI 评论</b><p>允许AI自动生成评论互动</p></div>
                  <el-switch v-model="form.commentConfig.enabled" />
                </div>
                <div class="switch-item">
                  <div><b>允许连续评论</b><p>同一机器人可在同一篇内容下多次评论</p></div>
                  <el-switch v-model="form.commentConfig.allowConsecutive" />
                </div>
                <div class="switch-item">
                  <div><b>允许机器人互评</b><p>机器人之间可以互相评论</p></div>
                  <el-switch v-model="form.commentConfig.allowBotInteraction" />
                </div>
              </div>
              <div class="form-grid two" style="margin-top:16px">
                <el-form-item label="每条内容最小评论数">
                  <el-input-number v-model="form.commentConfig.minCommentsPerPost" :min="0" :max="20" style="width:100%" />
                </el-form-item>
                <el-form-item label="每条内容最大评论数">
                  <el-input-number v-model="form.commentConfig.maxCommentsPerPost" :min="1" :max="50" style="width:100%" />
                </el-form-item>
                <el-form-item label="评论执行间隔（分钟）">
                  <el-input-number v-model="form.commentConfig.commentInterval" :min="1" :max="120" style="width:100%" />
                </el-form-item>
                <el-form-item label="低热度内容评论数">
                  <el-input-number v-model="form.commentConfig.lowHeatComments" :min="0" :max="10" style="width:100%" />
                </el-form-item>
                <el-form-item label="中热度内容评论数">
                  <el-input-number v-model="form.commentConfig.midHeatComments" :min="0" :max="20" style="width:100%" />
                </el-form-item>
                <el-form-item label="高热度内容评论数">
                  <el-input-number v-model="form.commentConfig.highHeatComments" :min="0" :max="50" style="width:100%" />
                </el-form-item>
                <el-form-item label="评论最小字数">
                  <el-input-number v-model="form.commentConfig.commentMinLength" :min="1" :max="50" style="width:100%" />
                </el-form-item>
                <el-form-item label="评论最大字数">
                  <el-input-number v-model="form.commentConfig.commentMaxLength" :min="5" :max="200" style="width:100%" />
                </el-form-item>
              </div>

              <div class="section-divider">评论风格比例</div>
              <div class="ratio-grid">
                <div class="ratio-item">
                  <span>真实学生风格</span>
                  <el-input-number v-model="form.commentConfig.commentStyle.realStudent" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>简短互动风格</span>
                  <el-input-number v-model="form.commentConfig.commentStyle.shortInteraction" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>提问式评论</span>
                  <el-input-number v-model="form.commentConfig.commentStyle.questionStyle" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>认可式评论</span>
                  <el-input-number v-model="form.commentConfig.commentStyle.approvalStyle" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
                <div class="ratio-item">
                  <span>补充信息式评论</span>
                  <el-input-number v-model="form.commentConfig.commentStyle.supplementInfo" :min="0" :max="100" size="small" />
                  <span>%</span>
                </div>
              </div>
            </el-form>
          </div>
        </div>

        <!-- 机器人配置 -->
        <div v-show="activeSection === 'bot'" class="glass-card">
          <div class="card-header">
            <div class="card-title">机器人配置</div>
            <div class="card-desc">配置机器人账号的行为规则和互动策略</div>
          </div>
          <div class="card-body">
            <el-form label-position="top">
              <div class="form-grid two">
                <el-form-item label="机器人总数上限">
                  <el-input-number v-model="form.botConfig.totalBotLimit" :min="1" :max="1000" style="width:100%" />
                </el-form-item>
                <el-form-item label="每区域机器人数量上限">
                  <el-input-number v-model="form.botConfig.perRegionBotLimit" :min="1" :max="200" style="width:100%" />
                </el-form-item>
                <el-form-item label="机器人统一默认密码">
                  <el-input v-model="form.botConfig.defaultPassword" type="password" show-password placeholder="留空则使用随机密码" />
                </el-form-item>
                <el-form-item label="机器人昵称前缀">
                  <el-input v-model="form.botConfig.nicknamePrefix" placeholder="如：萌友" />
                </el-form-item>
                <el-form-item label="头像生成方式">
                  <el-select v-model="form.botConfig.avatarGenerateMethod" style="width:100%">
                    <el-option label="随机头像" value="random" />
                    <el-option label="AI生成" value="ai" />
                    <el-option label="预设头像池" value="preset" />
                  </el-select>
                </el-form-item>
              </div>
              <div class="switch-grid" style="margin-top:16px">
                <div class="switch-item">
                  <div><b>机器人自动关注</b><p>机器人发布内容后自动关注其他用户</p></div>
                  <el-switch v-model="form.botConfig.autoFollow" />
                </div>
              </div>
              <div class="form-grid two" style="margin-top:16px">
                <el-form-item label="每篇笔记最小关注数">
                  <el-input-number v-model="form.botConfig.minFollowsPerNote" :min="0" :max="50" style="width:100%" />
                </el-form-item>
                <el-form-item label="每篇笔记最大关注数">
                  <el-input-number v-model="form.botConfig.maxFollowsPerNote" :min="0" :max="100" style="width:100%" />
                </el-form-item>
                <el-form-item label="每 N 字最小关注">
                  <el-input-number v-model="form.botConfig.minFollowPerNChars" :min="10" :max="1000" style="width:100%" />
                </el-form-item>
                <el-form-item label="每 N 字最大关注">
                  <el-input-number v-model="form.botConfig.maxFollowPerNChars" :min="10" :max="2000" style="width:100%" />
                </el-form-item>
                <el-form-item label="字符计算单位">
                  <el-input-number v-model="form.botConfig.charUnit" :min="10" :max="500" style="width:100%" />
                </el-form-item>
              </div>
            </el-form>
          </div>
        </div>

        <!-- 热度规则配置 -->
        <div v-show="activeSection === 'heat'" class="glass-card">
          <div class="card-header">
            <div class="card-title">热度规则配置</div>
            <div class="card-desc">配置内容热度计算规则，影响推荐排序和曝光策略</div>
          </div>
          <div class="card-body">
            <el-form label-position="top">
              <div class="switch-grid">
                <div class="switch-item">
                  <div><b>启用自动热度计算</b><p>根据互动数据自动更新内容热度值</p></div>
                  <el-switch v-model="form.heatRules.enabled" />
                </div>
              </div>
              <div class="section-divider">互动权重</div>
              <div class="form-grid two">
                <el-form-item label="点赞热度权重">
                  <el-input-number v-model="form.heatRules.likeWeight" :min="0" :max="10" :step="0.1" :precision="1" style="width:100%" />
                </el-form-item>
                <el-form-item label="浏览热度权重">
                  <el-input-number v-model="form.heatRules.viewWeight" :min="0" :max="10" :step="0.1" :precision="1" style="width:100%" />
                </el-form-item>
                <el-form-item label="评论热度权重">
                  <el-input-number v-model="form.heatRules.commentWeight" :min="0" :max="10" :step="0.1" :precision="1" style="width:100%" />
                </el-form-item>
                <el-form-item label="收藏热度权重">
                  <el-input-number v-model="form.heatRules.favoriteWeight" :min="0" :max="10" :step="0.1" :precision="1" style="width:100%" />
                </el-form-item>
                <el-form-item label="分享热度权重">
                  <el-input-number v-model="form.heatRules.shareWeight" :min="0" :max="10" :step="0.1" :precision="1" style="width:100%" />
                </el-form-item>
                <el-form-item label="新内容基础热度">
                  <el-input-number v-model="form.heatRules.newPostBaseHeat" :min="0" :max="100" style="width:100%" />
                </el-form-item>
                <el-form-item label="热度衰减周期（小时）">
                  <el-input-number v-model="form.heatRules.decayPeriodHours" :min="1" :max="720" style="width:100%" />
                </el-form-item>
              </div>
              <div class="section-divider">热度阈值</div>
              <div class="form-grid three">
                <el-form-item label="低热度阈值">
                  <el-input-number v-model="form.heatRules.lowHeatThreshold" :min="0" :max="1000" style="width:100%" />
                </el-form-item>
                <el-form-item label="中热度阈值">
                  <el-input-number v-model="form.heatRules.midHeatThreshold" :min="0" :max="5000" style="width:100%" />
                </el-form-item>
                <el-form-item label="高热度阈值">
                  <el-input-number v-model="form.heatRules.highHeatThreshold" :min="0" :max="10000" style="width:100%" />
                </el-form-item>
              </div>
            </el-form>
          </div>
        </div>

        <!-- 商家/二手/跑腿专项配置 -->
        <div v-show="activeSection === 'business'" class="glass-card">
          <div class="card-header">
            <div class="card-title">商家/二手/跑腿专项配置</div>
            <div class="card-desc">配置各业务模块的曝光助推和内容生成策略</div>
          </div>
          <div class="card-body">
            <el-form label-position="top">
              <div class="section-divider">商家气氛组</div>
              <div class="switch-grid">
                <div class="switch-item">
                  <div><b>启用探店文案生成</b><p>为新商家自动生成探店推荐文案</p></div>
                  <el-switch v-model="form.businessConfig.merchant.enableReviewCopywriting" />
                </div>
              </div>
              <div class="form-grid three" style="margin-top:12px">
                <el-form-item label="新商家基础浏览数">
                  <el-input-number v-model="form.businessConfig.merchant.newMerchantBaseViews" :min="0" :max="1000" style="width:100%" />
                </el-form-item>
                <el-form-item label="新商家基础收藏数">
                  <el-input-number v-model="form.businessConfig.merchant.newMerchantBaseFavorites" :min="0" :max="100" style="width:100%" />
                </el-form-item>
                <el-form-item label="新商家基础评论数">
                  <el-input-number v-model="form.businessConfig.merchant.newMerchantBaseComments" :min="0" :max="50" style="width:100%" />
                </el-form-item>
              </div>

              <div class="section-divider">二手市场</div>
              <div class="switch-grid">
                <div class="switch-item">
                  <div><b>自动评论</b><p>为二手内容自动生成咨询评论</p></div>
                  <el-switch v-model="form.businessConfig.secondHand.autoComments" />
                </div>
                <div class="switch-item">
                  <div><b>启用闲置推荐文案</b><p>为闲置商品生成推荐文案</p></div>
                  <el-switch v-model="form.businessConfig.secondHand.enableRecommendCopywriting" />
                </div>
              </div>
              <div class="form-grid two" style="margin-top:12px">
                <el-form-item label="二手内容基础浏览">
                  <el-input-number v-model="form.businessConfig.secondHand.baseViews" :min="0" :max="500" style="width:100%" />
                </el-form-item>
                <el-form-item label="二手内容基础咨询">
                  <el-input-number v-model="form.businessConfig.secondHand.baseInquiries" :min="0" :max="50" style="width:100%" />
                </el-form-item>
              </div>

              <div class="section-divider">跑腿服务</div>
              <div class="switch-grid">
                <div class="switch-item">
                  <div><b>曝光助推</b><p>为跑腿服务内容增加曝光权重</p></div>
                  <el-switch v-model="form.businessConfig.errand.exposureBoost" />
                </div>
                <div class="switch-item">
                  <div><b>AI生成已完成订单展示</b><p>展示AI生成的已完成跑腿订单（需配置AI后生效）</p></div>
                  <el-switch v-model="form.businessConfig.errand.simulateCompletedOrders" />
                </div>
                <div class="switch-item">
                  <div><b>跑腿需求内容生成</b><p>自动生成跑腿需求相关内容</p></div>
                  <el-switch v-model="form.businessConfig.errand.generateDemandContent" />
                </div>
                <div class="switch-item">
                  <div><b>安全提示文案生成</b><p>自动为跑腿内容添加安全提示</p></div>
                  <el-switch v-model="form.businessConfig.errand.safetyTipsGeneration" />
                </div>
              </div>
            </el-form>
          </div>
        </div>

        <!-- 安全与审核 -->
        <div v-show="activeSection === 'safety'" class="glass-card">
          <div class="card-header">
            <div class="card-title">安全与审核</div>
            <div class="card-desc">配置AI内容审核规则和机器人行为限制</div>
          </div>
          <div class="card-body">
            <el-form label-position="top">
              <div class="switch-grid">
                <div class="switch-item">
                  <div><b>AI生成内容进入待审核</b><p>所有AI生成内容需要人工审核后才能发布</p></div>
                  <el-switch v-model="form.safetyConfig.aiContentRequireReview" />
                </div>
                <div class="switch-item">
                  <div><b>敏感词过滤</b><p>自动过滤AI生成内容中的敏感词</p></div>
                  <el-switch v-model="form.safetyConfig.sensitiveWordFilter" />
                </div>
                <div class="switch-item">
                  <div><b>重复内容检测</b><p>检测并阻止重复内容发布</p></div>
                  <el-switch v-model="form.safetyConfig.deduplication" />
                </div>
                <div class="switch-item">
                  <div><b>机器人行为频控</b><p>限制机器人的操作频率，防止异常行为</p></div>
                  <el-switch v-model="form.safetyConfig.botBehaviorRateLimit" />
                </div>
                <div class="switch-item">
                  <div><b>异常行为自动暂停</b><p>检测到异常行为时自动暂停机器人</p></div>
                  <el-switch v-model="form.safetyConfig.autoPauseOnAnomaly" />
                </div>
                <div class="switch-item">
                  <div><b>管理员手动一键暂停</b><p>紧急情况下一键暂停所有AI运营</p></div>
                  <el-switch v-model="form.safetyConfig.manualPauseAll" />
                </div>
              </div>
              <div class="form-grid three" style="margin-top:16px">
                <el-form-item label="单机器人每日发帖上限">
                  <el-input-number v-model="form.safetyConfig.botDailyPostLimit" :min="0" :max="100" style="width:100%" />
                </el-form-item>
                <el-form-item label="单机器人每日评论上限">
                  <el-input-number v-model="form.safetyConfig.botDailyCommentLimit" :min="0" :max="500" style="width:100%" />
                </el-form-item>
                <el-form-item label="单机器人每日点赞上限">
                  <el-input-number v-model="form.safetyConfig.botDailyLikeLimit" :min="0" :max="1000" style="width:100%" />
                </el-form-item>
              </div>
            </el-form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import { Check, Setting, Monitor, Document, ChatDotRound, User, TrendCharts, ShoppingBag, Warning } from '@element-plus/icons-vue'
import { fetchAiOpsConfig, saveAiOpsConfig, resetAiOpsConfig, fetchRegions } from '@/api/admin'

const sections = [
  { key: 'basic', label: '基础信息', icon: Setting },
  { key: 'coldStart', label: '内容冷启动', icon: Monitor },
  { key: 'noteGen', label: 'AI笔记生成', icon: Document },
  { key: 'comment', label: 'AI评论配置', icon: ChatDotRound },
  { key: 'bot', label: '机器人配置', icon: User },
  { key: 'heat', label: '热度规则', icon: TrendCharts },
  { key: 'business', label: '商家/二手/跑腿', icon: ShoppingBag },
  { key: 'safety', label: '安全与审核', icon: Warning }
]

const activeSection = ref('basic')
const saving = ref(false)
const resetting = ref(false)
const loading = ref(false)
const regions = ref<any[]>([])

const defaultForm = () => ({
  regionId: '',
  enabled: false,
  onlyNewRegion: false,
  onlyTestEnv: false,
  operationMode: 'standard',
  remark: '',
  coldStart: {
    enabled: true,
    dailyTotal: 20,
    minBatchPerHour: 1,
    maxBatchPerHour: 3,
    minPerBatch: 2,
    maxPerBatch: 5,
    disabledTimeRanges: [],
    newRegionFirstCount: 10,
    deduplication: true,
    sensitiveWordFilter: true,
    contentRatio: { campusLife: 30, secondHand: 15, errand: 10, merchantReview: 15, circleTopic: 20, activity: 10 }
  },
  noteGeneration: {
    enabled: true,
    titleMinLength: 8,
    titleMaxLength: 30,
    contentMinLength: 50,
    contentMaxLength: 500,
    generateTimeout: 30,
    autoAttachImage: true,
    imageCountMin: 1,
    imageCountMax: 4,
    autoPublish: false,
    requireReview: true,
    defaultStatus: 'pending',
    toneRatio: { student: 40, merchantRecommend: 15, campusRoast: 15, helpMutual: 15, lifeShare: 15 }
  },
  commentConfig: {
    enabled: true,
    minCommentsPerPost: 2,
    maxCommentsPerPost: 8,
    commentInterval: 30,
    lowHeatComments: 2,
    midHeatComments: 5,
    highHeatComments: 8,
    allowConsecutive: false,
    allowBotInteraction: false,
    commentMinLength: 5,
    commentMaxLength: 50,
    commentStyle: { realStudent: 40, shortInteraction: 25, questionStyle: 15, approvalStyle: 10, supplementInfo: 10 }
  },
  botConfig: {
    totalBotLimit: 100,
    perRegionBotLimit: 20,
    defaultPassword: '',
    nicknamePrefix: '萌友',
    avatarGenerateMethod: 'random',
    autoFollow: true,
    minFollowsPerNote: 2,
    maxFollowsPerNote: 8,
    minFollowPerNChars: 100,
    maxFollowPerNChars: 300,
    charUnit: 100
  },
  heatRules: {
    enabled: true,
    likeWeight: 1.0,
    viewWeight: 0.1,
    commentWeight: 2.0,
    favoriteWeight: 1.5,
    shareWeight: 3.0,
    newPostBaseHeat: 10,
    decayPeriodHours: 72,
    lowHeatThreshold: 20,
    midHeatThreshold: 50,
    highHeatThreshold: 100
  },
  businessConfig: {
    merchant: { newMerchantBaseViews: 50, newMerchantBaseFavorites: 5, newMerchantBaseComments: 3, enableReviewCopywriting: true },
    secondHand: { baseViews: 30, baseInquiries: 3, autoComments: true, enableRecommendCopywriting: true },
    errand: { exposureBoost: true, simulateCompletedOrders: false, generateDemandContent: true, safetyTipsGeneration: true }
  },
  safetyConfig: {
    aiContentRequireReview: true,
    sensitiveWordFilter: true,
    deduplication: true,
    botBehaviorRateLimit: true,
    botDailyPostLimit: 5,
    botDailyCommentLimit: 20,
    botDailyLikeLimit: 50,
    autoPauseOnAnomaly: true,
    manualPauseAll: false
  }
})

const form = reactive(defaultForm())

const modeLabel = computed(() => {
  const map: Record<string, string> = { conservative: '保守模式', standard: '标准模式', aggressive: '激进模式' }
  return map[form.operationMode] || '标准模式'
})

function deepMerge(target: any, source: any) {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {}
      deepMerge(target[key], source[key])
    } else {
      if (target[key] === undefined || target[key] === null) {
        target[key] = source[key]
      }
    }
  }
  return target
}

async function loadConfig() {
  loading.value = true
  try {
    const res: any = await fetchAiOpsConfig()
    const data = res?.data || res
    if (data && typeof data === 'object') {
      const defaults = defaultForm()
      const merged = deepMerge(JSON.parse(JSON.stringify(defaults)), data)
      Object.assign(form, merged)
    }
  } catch (e: any) {
    ElMessage.error('加载配置失败: ' + (e?.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

async function loadRegions() {
  try {
    const data = await fetchRegions()
    regions.value = Array.isArray(data) ? data : (data as any)?.list || []
  } catch {
    regions.value = []
  }
}

async function handleSave() {
  saving.value = true
  try {
    await saveAiOpsConfig(JSON.parse(JSON.stringify(form)))
    ElMessage.success('AI运营配置已保存')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

async function handleReset() {
  try {
    await ElMessageBox.confirm('确定要恢复默认配置吗？当前配置将被覆盖。', '恢复默认', { type: 'warning' })
    resetting.value = true
    const res: any = await resetAiOpsConfig()
    const data = res?.data || res
    if (data && typeof data === 'object') {
      Object.assign(form, defaultForm(), data)
    } else {
      Object.assign(form, defaultForm())
    }
    ElMessage.success('已恢复默认配置')
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error('重置失败: ' + (e?.message || '未知错误'))
    }
  } finally {
    resetting.value = false
  }
}

onMounted(() => {
  loadConfig()
  loadRegions()
})
</script>

<style scoped>
.ai-ops-layout {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.ai-ops-sidebar {
  position: sticky;
  top: 80px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px !important;
}

.sidebar-nav button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #606266;
  text-align: left;
  transition: all 0.2s;
}

.sidebar-nav button:hover {
  background: #f5f7fa;
}

.sidebar-nav button.active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}

.ai-ops-main {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

.status-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 20px !important;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-label {
  font-size: 12px;
  opacity: 0.8;
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.card-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.card-body {
  padding: 20px;
}

.form-grid {
  display: grid;
  gap: 16px;
}

.form-grid.two {
  grid-template-columns: repeat(2, 1fr);
}

.form-grid.three {
  grid-template-columns: repeat(3, 1fr);
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.switch-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 6px;
}

.switch-item b {
  font-size: 14px;
  color: #303133;
}

.switch-item p {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.section-divider {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 24px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}

.ratio-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.ratio-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 6px;
}

.ratio-item span:first-child {
  flex: 1;
  font-size: 13px;
  color: #606266;
}

.time-range-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

@media (max-width: 1200px) {
  .ai-ops-layout {
    grid-template-columns: 1fr;
  }

  .ai-ops-sidebar {
    position: static;
  }

  .sidebar-nav {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .status-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .ratio-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .form-grid.two,
  .form-grid.three {
    grid-template-columns: 1fr;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }

  .ratio-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<template>
  <main class="lottery-admin">
    <header class="page-header">
      <div>
        <p class="eyebrow">校小伴 / 校园活动</p>
        <h1>校园福利抽奖</h1>
        <p class="subtitle">
          一份好礼，一份校园期待。报名、开奖、领奖在这里统一管理。
        </p>
      </div>
      <div class="actions">
        <el-button @click="wecomOpen = true">企业微信群</el-button>
        <el-button @click="checkinsOpen = true">线下签到</el-button>
        <el-button v-if="canEdit" @click="redeemOpen = true">自提核销</el-button
        ><el-button v-if="canEdit" type="primary" @click="create"
          >＋ 新建活动</el-button
        >
      </div>
    </header>
    <section class="workflow">
      <div>
        <span>01</span><b>报名参与</b>
        <p>每人每活动一次，资格在报名时核验</p>
      </div>
      <div>
        <span>02</span><b>自动随机开奖</b>
        <p>按公示时间执行，开奖结果只生成一次</p>
      </div>
      <div>
        <span>03</span><b>奖品送达</b>
        <p>邮寄收货、现场核销、优惠券自动到账</p>
      </div>
    </section>
    <section class="panel">
      <div class="filters">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索活动名称"
          @keyup.enter="search"
        /><el-select v-model="status" clearable placeholder="全部状态"
          ><el-option
            v-for="(label, key) in statuses"
            :key="key"
            :label="label"
            :value="key" /></el-select
        ><el-button type="primary" @click="search">查询</el-button
        ><el-button @click="load">刷新</el-button>
      </div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-table
        v-loading="loading"
        :data="rows"
        empty-text="还没有活动，创建第一份校园惊喜吧"
      >
        <el-table-column label="活动与奖品" min-width="260"
          ><template #default="{ row }"
            ><div class="activity-cell">
              <img
                v-if="row.cover || row.prizes[0]?.image"
                :src="row.cover || row.prizes[0]?.image"
              />
              <div v-else class="cover-mark">礼</div>
              <div>
                <b>{{ row.title }}</b>
                <p>
                  {{ row.prizes.length }} 个奖项 ·
                  {{
                    row.prizes.reduce((n: number, p: any) => n + p.quantity, 0)
                  }}
                  份奖品
                </p>
              </div>
            </div></template
          ></el-table-column
        >
        <el-table-column label="状态" width="115"
          ><template #default="{ row }"
            ><el-tag
              :type="
                row.status === 'finished'
                  ? 'success'
                  : row.status === 'cancelled'
                    ? 'info'
                    : 'warning'
              "
              >{{ statuses[row.status] }}</el-tag
            ></template
          ></el-table-column
        >
        <el-table-column label="报名人数" width="150"
          ><template #default="{ row }"
            >{{ row.entryCount }} / {{ row.maxEntries }}
            <p v-if="row.minParticipants > 0" class="muted">
              满 {{ row.minParticipants }} 人开奖<span v-if="row.extensionCount > 0"
                > · 已顺延 {{ row.extensionCount }} 次</span
              >
            </p></template
          ></el-table-column
        >
        <el-table-column label="报名截止 / 开奖" min-width="190"
          ><template #default="{ row }"
            ><div>{{ time(row.endAt) }}</div>
            <p class="muted">{{ time(row.drawAt) }} 开奖</p>
            <p v-if="row.lastError" class="error">
              任务异常，请查看详情
            </p></template
          ></el-table-column
        >
        <el-table-column label="领取方式" width="105"
          ><template #default="{ row }">{{
            row.prizes?.some((p: any) => p.kind === 'manual')
              ? "现场核销"
              : row.claimMethod === "shipping"
                ? "邮寄"
                : "校内自提"
          }}</template></el-table-column
        >
        <el-table-column label="操作" width="170" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="open(row.id, 'config')">{{
              row.status === "draft" && canEdit ? "编辑" : "详情"
            }}</el-button
            ><el-button link type="primary" @click="open(row.id, 'entries')"
              >参与与领奖</el-button
            ></template
          ></el-table-column
        > </el-table
      ><el-pagination
        v-model:current-page="page"
        :page-size="20"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="load"
      />
    </section>
    <el-drawer
      v-model="drawer"
      :title="form.id ? form.title : '新建校园福利活动'"
      size="min(1100px, 96vw)"
      :close-on-click-modal="false"
    >
      <div v-loading="detailLoading">
        <el-alert
          v-if="form.publishedAt"
          title="活动已发布，奖品、参与条件与开奖时间已锁定。暂停仅停止新增报名，仍按时开奖。"
          type="info"
          :closable="false"
        /><el-alert
          v-if="form.lastError"
          :title="form.lastError"
          type="error"
          :closable="false"
        /><el-alert
          v-if="form.pendingAwards"
          :title="`${form.pendingAwards} 份优惠券正在发放，请检查优惠券有效期和状态。`"
          type="warning"
          :closable="false"
        />
        <el-tabs v-model="tab" @tab-change="tabChanged">
          <el-tab-pane label="活动与奖品" name="config"
            ><el-form
              label-position="top"
              :disabled="!editable"
              class="activity-form"
            >
              <div class="section-label">
                <span>01</span>
                <h3>活动信息</h3>
              </div>
              <div class="grid">
                <el-form-item label="活动名称"
                  ><el-input
                    v-model="form.title"
                    maxlength="80"
                    show-word-limit
                    placeholder="例如：校小伴开学好礼" /></el-form-item
                ><el-form-item label="活动校区"
                  ><el-select
                    v-model="form.regionId"
                    :empty-values="[null, undefined]"
                    filterable
                    placeholder="选择校区"
                    ><el-option
                      v-if="options.canGlobal"
                      label="全部校区"
                      value="" /><el-option
                      v-for="r in options.regions"
                      :key="r.id"
                      :value="r.id"
                      :label="r.name" /></el-select
                ></el-form-item>
              </div>
              <el-form-item label="活动主图"
                ><ImageUploadBox
                  v-if="editable"
                  v-model="form.cover"
                  shape="wide"
                  scene="activity"
                  :max-size="2"
                  tip="建议上传清晰的奖品展示图；不上传时使用奖品图片"
                /><img
                  v-else-if="form.cover"
                  class="cover-preview"
                  :src="form.cover"
                /><span v-else class="muted">使用奖品图片</span></el-form-item
              >
              <div class="share-card-settings">
                <div class="share-card-heading">
                  <div>
                    <b>分享卡片设置</b>
                    <p class="hint">用户分享到微信群时使用。留空会自动使用活动名称和活动主图。</p>
                  </div>
                  <div class="share-card-preview">
                    <div class="share-card-preview-copy">
                      <b>{{ form.shareTitle?.trim() || form.title || "一起参与校园抽奖" }}</b>
                    </div>
                    <img :src="form.shareCover || form.cover || form.prizes[0]?.image || shareMascot" alt="分享卡片封面预览" />
                    <span class="share-card-footer">小程序 · 展示示意，以微信实际效果为准</span>
                  </div>
                </div>
                <div class="grid">
                  <el-form-item label="分享卡片标题">
                    <el-input
                      v-model="form.shareTitle"
                      maxlength="80"
                      show-word-limit
                      placeholder="留空使用活动名称"
                    />
                  </el-form-item>
                  <el-form-item label="分享卡片封面">
                    <ImageUploadBox
                      v-if="editable"
                      v-model="form.shareCover"
                      shape="wide"
                      scene="activity"
                      :max-size="2"
                      tip="建议 5:4 横图，例如 1000×800；不超过 2MB；留空使用活动主图或首个奖品图片"
                    /><img
                      v-else-if="form.shareCover"
                      :src="form.shareCover"
                      class="cover-preview"
                    /><span v-else class="muted">使用活动主图</span>
                  </el-form-item>
                </div>
              </div>
              <div class="grid">
                <el-form-item label="报名开始"
                  ><el-date-picker
                    v-model="form.startAt"
                    type="datetime"
                    value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item
                ><el-form-item label="报名截止"
                  ><el-date-picker
                    v-model="form.endAt"
                    type="datetime"
                    value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item
                ><el-form-item label="自动开奖时间"
                  ><el-date-picker
                    v-model="form.drawAt"
                    type="datetime"
                    value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item
                ><el-form-item label="领奖截止"
                  ><el-date-picker
                    v-model="form.claimUntil"
                    type="datetime"
                    value-format="YYYY-MM-DDTHH:mm:ssZ"
                /></el-form-item>
              </div>
              <p class="hint">
                按当前电脑时区 {{ timezone }} 编辑。报名截止 ≤ 开奖时间 &lt;
                领奖截止。
              </p>
              <div class="grid">
                <el-form-item label="报名人数上限"
                  ><el-input-number
                    v-model="form.maxEntries"
                    :min="1"
                    :max="10000" /></el-form-item
                ><el-form-item label="参与条件"
                  ><el-checkbox v-model="form.requireStudent"
                    >需要有效学生认证</el-checkbox
                  ><el-checkbox v-model="form.requireOfficial"
                    >需绑定公众号</el-checkbox
                  ><el-checkbox v-model="form.memberOnly"
                    >有效会员专属</el-checkbox
                  ><el-checkbox v-model="form.requireProfile"
                    >完善个人资料（头像＋昵称）</el-checkbox
                  ><el-checkbox v-model="form.requirePost"
                    >发一篇帖子</el-checkbox
                  ><p v-if="form.requirePost" class="hint">活动发布后须在{{ form.regionId ? '本活动校区' : '校园社区' }}发至少一篇审核通过且仍可见的帖子；以前发的帖子不计入。开奖前再次核验，删除或下架后没有其他合格帖子将取消资格。</p></el-form-item
                >
              </div>
              <div class="grid">
                <el-form-item label="注册天数条件">
                  <el-checkbox v-model="registrationLimitEnabled">需要注册满指定天数</el-checkbox>
                  <el-input-number
                    v-if="registrationLimitEnabled"
                    v-model="form.minRegistrationDays"
                    :min="1"
                    :max="3650"
                    :precision="0"
                    :step="1"
                    aria-label="最低注册天数"
                  />
                  <p class="hint">开启默认 7 天，可单独设置；关闭则不限。每满 24 小时计一天，报名时核验。</p>
                </el-form-item>
                <el-form-item label="开奖人数门槛">
                  <el-checkbox v-model="participantThresholdEnabled">满指定人数才开奖</el-checkbox>
                  <template v-if="participantThresholdEnabled">
                    <div class="threshold-row">
                      <span>满</span>
                      <el-input-number v-model="form.minParticipants" :min="1" :max="form.maxEntries || 10000" :precision="0" aria-label="开奖人数门槛" />
                      <span>人开奖；不足时顺延</span>
                      <el-input-number v-model="form.extendHours" :min="1" :max="168" :precision="0" aria-label="每次顺延小时数" />
                      <span>小时，最多</span>
                      <el-input-number v-model="form.maxExtensions" :min="0" :max="30" :precision="0" aria-label="最多顺延次数" />
                      <span>次</span>
                    </div>
                    <p class="hint">按开奖时有资格的报名人数判断。不足时报名截止和开奖时间一起顺延；最多次数填 0 表示一直顺延，直到人数够了或手动取消。次数用完仍不足，活动自动取消并通知报名者，优惠券预留退回。</p>
                  </template>
                </el-form-item>
                <el-form-item label="资料完善说明">
                  <p class="hint">头像与昵称均已填写才算完成，默认头像和系统自动生成的昵称不计入。用户可从活动页前往完善。</p>
                </el-form-item>
              </div>
              <el-form-item label="线下签到条件（可选）">
                <el-select v-model="form.checkinSessionId" clearable filterable remote :remote-method="loadCheckinOptions" @focus="loadCheckinOptions('')" :loading="checkinOptionsLoading" placeholder="不限制签到，或搜索并选择签到场次" style="width:100%">
                  <el-option v-for="item in availableCheckins" :key="item.id" :value="item.id" :label="`${item.title} · ${time(item.startAt)}${item.status==='paused'?'（已暂停）':''}`" :disabled="item.status==='paused'" />
                </el-select>
                <p class="hint">先通过页面顶部“线下签到”建立场次，再关联到本活动。两种签到方式任意完成一次即可；报名时服务器核验记录。</p>
              </el-form-item>
              <div class="section-label">
                <span>02</span>
                <h3>奖品配置</h3>
                <el-button
                  v-if="editable"
                  :disabled="form.prizes.length >= 12"
                  @click="addPrize"
                  >＋ 添加奖项</el-button
                >
              </div>
              <div
                v-for="(prize, i) in form.prizes"
                :key="i"
                class="prize-editor"
              >
                <div class="section-head">
                  <b>奖项 {{ i + 1 }}</b
                  ><el-button
                    v-if="editable"
                    link
                    type="danger"
                    :disabled="form.prizes.length === 1"
                    @click="form.prizes.splice(i, 1)"
                    >移除</el-button
                  >
                </div>
                <div class="grid">
                  <el-form-item label="奖品名称"
                    ><el-input
                      v-model="prize.name"
                      maxlength="80" /></el-form-item
                  ><el-form-item label="奖品类型"
                    ><el-select v-model="prize.kind" @change="normalizeClaimMethod"
                      ><el-option label="实物奖品" value="physical" /><el-option
                        label="优惠券"
                        value="coupon" /><el-option
                        label="人工兑奖（如奶茶）"
                        value="manual" /></el-select></el-form-item
                  ><el-form-item label="中奖名额"
                    ><el-input-number
                      v-model="prize.quantity"
                      :min="1"
                      :max="1000" /></el-form-item
                  ><el-form-item
                    v-if="prize.kind === 'coupon'"
                    label="关联优惠券"
                    ><el-select v-model="prize.couponId" filterable
                      ><el-option
                        v-for="c in options.coupons"
                        :key="c.id"
                        :value="c.id"
                        :label="`${c.name} · 剩余 ${Math.max(0, c.totalCount - c.receivedCount)}`" /></el-select
                  ></el-form-item>
                </div>
                <el-form-item label="指定核销员（可选，每个奖品 1 人）">
                  <el-select
                    v-model="prize.verifierUserIds"
                    filterable
                    remote
                    clearable
                    reserve-keyword
                    :remote-method="searchVerifiers"
                    @focus="searchVerifiers('')"
                    :loading="verifierLoading"
                    placeholder="搜索普通小程序用户"
                    style="max-width: 520px"
                  >
                    <el-option
                      v-for="u in verifierOptions"
                      :key="u.id"
                      :value="u.id"
                      :label="`${u.nickname || '未命名用户'} · UID ${u.uid || '—'}`"
                    />
                  </el-select>
                  <div class="hint">
                    该用户登录小程序后，可用“扫一扫”扫描中奖码并确认核销；留空时仅后台管理员可核销。
                  </div>
                </el-form-item>
                <el-form-item label="奖品图片"
                  ><ImageUploadBox
                    v-if="editable"
                    v-model="prize.image"
                    shape="square"
                    scene="activity"
                    :max-size="2" /><img
                    v-else-if="prize.image"
                    :src="prize.image"
                    class="prize-preview"
                /></el-form-item>
              </div>
              <div class="section-label">
                <span>03</span>
                <h3>领取与说明</h3>
              </div>
              <el-form-item label="领取方式"
                ><el-radio-group v-model="form.claimMethod" @change="normalizeClaimMethod"
                  ><el-radio-button
                    value="shipping"
                    :disabled="form.prizes.some((p: any) => p.kind === 'manual')"
                    >邮寄 · 选择已有地址</el-radio-button
                  ><el-radio-button value="pickup"
                    >现场/到店 · 凭码核销</el-radio-button
                  ></el-radio-group
                ></el-form-item
              >
              <div class="grid">
                <el-form-item
                  v-if="form.claimMethod === 'pickup'"
                  label="领取地点" required
                  ><el-input
                    v-model="form.pickupLocation"
                    maxlength="200"
                    placeholder="例如：学生活动中心101室" /></el-form-item
                ><el-form-item
                  :label="hasManualPrize ? '管理员联系方式（中奖用户可见）' : '活动联系说明'"
                  ><el-input
                    v-model="form.contact"
                    maxlength="100"
                    placeholder="供用户咨询领奖事宜"
                /></el-form-item>
              </div>
              <div v-if="hasManualPrize" class="grid">
                <el-form-item label="管理员联系二维码（与文字联系方式至少填一项）">
                  <ImageUploadBox
                    v-if="editable"
                    v-model="form.claimContactImage"
                    shape="square"
                    scene="activity"
                    :max-size="2"
                    tip="上传你的微信联系二维码，中奖页面显示，支持长按识别"
                  /><img
                    v-else-if="form.claimContactImage"
                    :src="form.claimContactImage"
                    class="contact-qr-preview"
                  />
                  <span v-else class="muted">未上传二维码</span>
                </el-form-item>
                <el-form-item label="人工兑奖说明（活动页展示）">
                  <el-input
                    v-model="form.claimInstructions"
                    type="textarea"
                    :rows="3"
                    maxlength="500"
                    show-word-limit
                    placeholder="例如：凭中奖页面和领奖码，到奶茶店前台联系管理员领取。"
                  />
                </el-form-item>
              </div>
              <el-form-item label="奖品介绍与活动规则"
                ><el-input
                  v-model="form.description"
                  type="textarea"
                  :rows="6"
                  maxlength="5000"
                  show-word-limit
                  placeholder="写清奖品规格、领取流程与活动须知。每人一次、随机开奖等固定规则会自动展示。" /></el-form-item
              ><el-alert
                title="固定规则：免费报名，每人每活动一次；按时随机开奖；分享不增加次数。实物邮寄不向中奖用户收取领奖费用。"
                type="info"
                :closable="false"
              /> </el-form
          ></el-tab-pane>
          <el-tab-pane v-if="form.id" label="内定用户" name="reserved">
            <p class="hint">输入小程序个人主页的完整 UID 查找，也支持昵称或报名编号。仅已报名用户可选；名单修改立即生效，开奖后或活动取消后不可修改。</p>
            <el-form label-position="top" :disabled="!reservedEditable">
              <template v-for="(prize, i) in form.prizes" :key="prize.id || i">
                <div v-if="prize.id" class="prize-editor">
                <el-form-item :label="prize.name || `奖项 ${i + 1}`">
                  <div class="reserved-users-section">
                    <div v-if="reservedEditable" class="reserved-users-header">
                      <el-select
                        v-model="prize._selectedUserId"
                        filterable
                        remote
                        clearable
                        reserve-keyword
                        :remote-method="(q: string) => searchEntriesForReserved(q, i)"
                        @focus="searchEntriesForReserved('', i)"
                        :loading="reservedSearchState[prize.id]?.loading"
                        :no-data-text="reservedSearchState[prize.id]?.error || '未找到报名用户，请核对 UID 及报名情况'"
                        placeholder="输入完整 UID / 昵称 / 报名编号"
                        aria-label="搜索内定用户"
                        class="reserved-user-select"
                        :disabled="prize.reservedUsers && prize.reservedUsers.length >= prize.quantity"
                      >
                        <el-option
                          v-for="entry in reservedSearchState[prize.id]?.options || []"
                          :key="entry.userId"
                          :value="entry.userId"
                          :label="`${entry.nickname || entry.user?.nickname || '未命名用户'} · UID ${entry.user?.uid ?? '未分配'}`"
                          :disabled="prize.reservedUsers?.some((user: any) => user.userId === entry.userId)"
                        />
                      </el-select>
                      <el-button
                        type="primary"
                        :disabled="!prize._selectedUserId || (prize.reservedUsers && prize.reservedUsers.length >= prize.quantity)"
                        :loading="reservedSaving"
                        @click="addReservedUser(i)"
                      >添加内定</el-button>
                    </div>
                    <div class="reserved-users-stats">
                      <div class="reserved-stats-header">
                        <span class="reserved-stats-label">内定名额使用情况</span>
                        <span class="reserved-stats-count">
                          <strong>{{ prize.reservedUsers?.length || 0 }}</strong> / {{ prize.quantity }} 人
                        </span>
                      </div>
                      <el-progress 
                        :percentage="prize.reservedUsers ? Math.round(prize.reservedUsers.length / prize.quantity * 100) : 0"
                        :show-text="false"
                        :status="prize.reservedUsers && prize.reservedUsers.length >= prize.quantity ? 'success' : ''"
                      />
                      <div class="reserved-stats-footer">
                        <span class="reserved-users-remaining" v-if="prize.reservedUsers && prize.reservedUsers.length < prize.quantity">
                          还可内定 <strong>{{ prize.quantity - prize.reservedUsers.length }}</strong> 人
                        </span>
                        <span class="reserved-users-full" v-else-if="prize.reservedUsers && prize.reservedUsers.length >= prize.quantity">
                          ✓ 所有名额已用于内定用户
                        </span>
                        <span class="reserved-users-empty" v-else>
                          未设置内定用户，所有名额将随机分配
                        </span>
                      </div>
                    </div>
                    <div v-if="prize.reservedUsers && prize.reservedUsers.length > 0" class="reserved-users-list">
                      <div v-for="(ru, index) in prize.reservedUsers" :key="ru.userId" class="reserved-user-item">
                        <span class="reserved-user-index">{{ index + 1 }}</span>
                        <span class="reserved-user-name">{{ ru.user?.nickname || '未命名用户' }}</span>
                        <span class="reserved-user-uid">UID {{ ru.user?.uid ?? '未分配' }}</span>
                        <el-button
                          v-if="reservedEditable"
                          link
                          type="danger"
                          size="small"
                          :loading="reservedSaving"
                          @click="removeReservedUser(i, ru.userId)"
                        >移除</el-button>
                      </div>
                    </div>
                    <div class="hint">内定用户将在开奖时优先中奖，剩余名额随机分配。最多可内定 {{ prize.quantity }} 人（等于奖项名额）。</div>
                  </div>
                </el-form-item>
                </div>
              </template>
            </el-form>
          </el-tab-pane>
          <el-tab-pane label="官方群与入群引导" name="groups"
            ><el-form label-position="top" :disabled="!editable"
              ><el-form-item
                ><el-switch
                  v-model="form.requireGroup"
                  active-text="报名时必须完成官方群验证" /></el-form-item
              ><el-form-item v-if="form.requireGroup" label="群验证方式"
                ><el-radio-group v-model="form.groupVerificationMode" @change="changeGroupMode">
                  <el-radio value="wecom_member">企业微信群成员自动核验（推荐）</el-radio>
                  <el-radio value="wechat_card">微信群内卡片验证</el-radio>
                </el-radio-group>
              </el-form-item
              ><el-form-item v-if="form.requireGroup && form.groupVerificationMode==='wecom_member'" label="开奖资格"
                ><el-tag type="success">开奖前再次核验；退群取消资格</el-tag>
                <p class="hint" style="width:100%">此规则将向参与者公示。企业微信查询失败时暂缓开奖并自动重试。</p>
              </el-form-item
              ><el-form-item label="入群说明"
                ><el-input
                  v-model="form.joinGuide"
                  type="textarea"
                  :rows="4"
                  maxlength="500"
                  show-word-limit
                  :placeholder="form.groupVerificationMode==='wecom_member'?'说明如何入群、无法扫码时联系谁邀请；入群后返回小程序即可验证。':'说明如何入群；无法扫码时联系谁邀请；入群后点击群内活动卡片完成验证。'" /></el-form-item
              ><el-form-item label="入群二维码（可选）"
                ><ImageUploadBox
                  v-if="editable"
                  v-model="form.joinImage"
                  shape="square"
                  scene="activity"
                  :max-size="2" /><img
                  v-else-if="form.joinImage"
                  :src="form.joinImage"
                  class="prize-preview" /></el-form-item
              ><el-alert
                :title="form.groupVerificationMode==='wecom_member'?'入群二维码与资格名单分别管理。活码自动创建新群后，请导入新群并追加到活动。':'二维码只负责入群或申请入群，不能代替群内身份核验。群人数较多或超过二维码限制时，请在入群说明中填写管理员邀请方式。'"
                type="info"
                :closable="false"
              />
            </el-form>
            <div v-if="form.groupVerificationMode==='wecom_member'" class="binding-panel">
              <h3>本活动的企业微信官方群</h3>
              <p>用户在任意一个选定群中即可通过。系统识别微信身份，用户无需点击群里的活动卡片。</p>
              <el-alert v-if="!wecomConfigured" title="企业微信尚未启用。请先完成接入配置，再选择官方群发布活动。" type="warning" :closable="false" />
              <el-select v-model="form.groupIds" multiple filterable placeholder="选择已导入的官方群" style="width:100%; margin:16px 0" :loading="wecomLoading" :disabled="!editable && !wecomAppendable">
                <el-option v-for="group in availableWecomGroups" :key="group.id" :value="group.id" :label="group.name+(group.isDismissed?'（已解散）':'（'+group.memberCount+'人）')" :disabled="group.isDismissed || (!editable && savedWecomGroups.includes(group.id))" />
              </el-select>
              <div class="actions">
                <el-button @click="wecomOpen=true">管理官方群与接入配置</el-button>
                <el-button :loading="wecomLoading" @click="loadWecomGroups">刷新群列表</el-button>
                <el-button v-if="wecomAppendable" type="primary" :loading="saving" @click="appendWecomGroups">保存追加的官方群</el-button>
              </div>
              <p class="hint">草稿可调整群名单。发布后仅可在报名截止前追加官方群，原有群继续有效。每个活动最多100个群。</p>
            </div>
            <div v-else class="binding-panel">
              <h3>已绑定 {{ form.groupIds?.length || 0 }} 个官方群</h3>
              <p>
                管理员扫码打开绑定页面 → 将绑定卡片发到目标群 →
                从该群内点开并提交 → 回到这里确认。
              </p>
              <p class="hint">
                上传入群二维码不会自动绑定。群标识由微信验证，普通用户提交的链接参数不能代替群验证。
              </p>
              <div v-if="editable" class="actions">
                <el-select v-model="envVersion" style="width: 150px"
                  ><el-option label="体验版" value="trial" /><el-option
                    label="开发版"
                    value="develop" /><el-option
                    label="正式版"
                    value="release" /></el-select
                ><el-button
                  :loading="bindingBusy"
                  :disabled="!form.id"
                  @click="startBinding"
                  >生成绑定入口</el-button
                ><el-button
                  v-if="form.groupIds?.length"
                  type="danger"
                  plain
                  @click="clearGroups"
                  >清空绑定</el-button
                >
              </div>
              <p v-if="!form.id" class="hint">先保存草稿，再生成绑定入口。</p>
              <div v-if="binding.image" class="binding-session">
                <img :src="binding.image" />
                <div>
                  <b>入口有效期15分钟</b>
                  <p>
                    {{
                      binding.ready
                        ? "已收到群信息，请核对后确认。"
                        : "在微信内完成操作后，点击检查。"
                    }}
                  </p>
                  <p v-if="binding.candidate" class="group-id">
                    {{ binding.candidate.gid }}
                  </p>
                  <div class="actions">
                    <el-button :loading="bindingBusy" @click="inspectBinding"
                      >检查提交结果</el-button
                    ><el-button
                      v-if="binding.ready"
                      type="primary"
                      :loading="bindingBusy"
                      @click="confirmBinding"
                      >确认绑定这个群</el-button
                    >
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane v-if="form.id" label="参与与领奖" name="entries"
            ><div class="filters entry-filters">
              <el-input
                v-model="entryKeyword"
                clearable
                maxlength="100"
                placeholder="完整 UID / 昵称 / 报名编号"
                aria-label="搜索参与与领奖记录"
                @keyup.enter="searchEntries"
                @clear="searchEntries"
              />
              <el-select
                v-model="outcome"
                clearable
                placeholder="全部结果"
                @change="
                  entryPage = 1;
                  loadEntries();
                "
                ><el-option
                  v-for="(v, k) in outcomes"
                  :key="k"
                  :value="k"
                  :label="v" /></el-select
              ><el-button type="primary" @click="searchEntries">查询用户</el-button>
              <el-button @click="loadEntries">刷新记录</el-button>
            </div>
            <p class="hint">UID 与小程序个人主页一致；报名编号是该用户参加本次活动的记录编号。可结合抽奖结果筛选。</p>
            <p v-if="entriesError" class="error" role="alert">{{ entriesError }}</p>
            <el-table :data="entries" v-loading="recordsLoading" :empty-text="entriesError || (entryKeyword ? '未找到匹配记录，请核对 UID 及报名情况' : '暂无参与记录')"
              ><el-table-column
                prop="nickname"
                label="用户"
                min-width="100"
              /><el-table-column label="用户 UID" min-width="125"
                ><template #default="{ row }">{{ row.user?.uid ?? '未分配' }}</template></el-table-column
              ><el-table-column label="报名编号" min-width="190"
                ><template #default="{ row }"
                  ><small>{{ row.id }}</small></template
                ></el-table-column
              ><el-table-column label="抽奖结果" width="105"
                ><template #default="{ row }">{{
                  outcomes[row.outcome]
                }}</template></el-table-column
              ><el-table-column
                prop="prize.name"
                label="奖品"
                min-width="150"
              /><el-table-column label="领取状态" width="115"
                ><template #default="{ row }">{{
                  claims[row.claimStatus] || row.claimStatus
                }}</template></el-table-column
              ><el-table-column label="操作" width="120"
                ><template #default="{ row }"
                  ><el-button
                    v-if="
                      canEdit &&
                      row.outcome === 'won' &&
                      ['physical', 'manual'].includes(row.prize?.kind) &&
                      form.claimMethod === 'shipping'
                    "
                    link
                    type="primary"
                    @click="showShipping(row)"
                    >{{
                      row.claimStatus === "processing"
                        ? "查看并发货"
                        : "收货与物流"
                    }}</el-button
                  ></template
                ></el-table-column
              ></el-table
            ><el-pagination
              v-model:current-page="entryPage"
              :page-size="20"
              :total="entryTotal"
              layout="total, prev, pager, next"
              @current-change="loadEntries"
          /></el-tab-pane>
          <el-tab-pane v-if="form.id" label="分享访问统计" name="sharing">
            <el-alert title="只统计登录后打开分享卡片的去重人数，不代表分享成功次数或群内曝光人数。" type="info" :closable="false" />
            <div class="filters" style="margin-top:16px"><el-button :loading="shareLoading" @click="loadSharing">刷新统计</el-button></div>
            <el-alert v-if="shareError" :title="shareError" type="error" :closable="false" />
            <template v-if="shareStats">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="分享带来访问人数">{{shareStats.visitors}}</el-descriptions-item>
                <el-descriptions-item label="有效转化报名人数">{{shareStats.qualifiedReferrals}}</el-descriptions-item>
                <el-descriptions-item label="其他已验证群人数">{{shareStats.external}}</el-descriptions-item>
                <el-descriptions-item label="官方群人数">{{shareStats.official}}</el-descriptions-item>
                <el-descriptions-item label="来源未识别人数">{{shareStats.unknown}}</el-descriptions-item>
              </el-descriptions>
              <p class="hint">有效转化只统计被分享者在其他群打开、完成本活动全部报名条件并成功报名的用户；单纯打开不计入。每个被邀请用户只归属首次有效分享者，分享数据仅用于宣传效果分析，不改变中奖概率。</p>
              <el-table :data="shareStats.groups" v-loading="shareLoading">
                <el-table-column prop="group" label="来源群编号" min-width="180" />
                <el-table-column label="来源类型"><template #default="{row}">{{shareSources[row.source]}}</template></el-table-column>
                <el-table-column prop="visitors" label="去重访问人数" />
              </el-table>
            </template>
          </el-tab-pane>
          <el-tab-pane v-if="form.id" label="开奖与操作记录" name="logs"
            ><el-descriptions v-if="form.draw" :column="2" border
              ><el-descriptions-item label="符合资格人数">{{
                form.draw.candidateCount
              }}</el-descriptions-item
              ><el-descriptions-item label="实际开奖时间">{{
                time(form.draw.createdAt)
              }}</el-descriptions-item
              ><el-descriptions-item label="随机中奖人数">{{
                form.draw.randomWinners
              }}</el-descriptions-item
              ><el-descriptions-item label="开奖方式"
                >系统随机 · 每人最多一份</el-descriptions-item
              ></el-descriptions
            ><el-empty v-else description="尚未执行统一开奖" /><el-table
              :data="logs"
              ><el-table-column label="操作"
                ><template #default="{ row }">{{
                  logLabels[row.action] || row.action
                }}</template></el-table-column
              ><el-table-column
                prop="accountId"
                label="管理员编号"
              /><el-table-column label="时间"
                ><template #default="{ row }">{{
                  time(row.createdAt)
                }}</template></el-table-column
              ></el-table
            ></el-tab-pane
          >
        </el-tabs>
      </div>
      <template #footer
        ><div class="actions drawer-actions">
          <el-button @click="drawer = false">关闭</el-button
          ><template v-if="canEdit"
            ><el-button
              v-if="editable"
              type="primary"
              :loading="saving"
              @click="save"
              >保存草稿</el-button
            ><el-button
              v-if="editable && form.id"
              type="success"
              :loading="saving"
              @click="publish"
              >保存并发布</el-button
            ><el-button
              v-if="form.status === 'published'"
              :loading="saving"
              @click="act('pause')"
              >暂停报名</el-button
            ><el-button
              v-if="form.status === 'paused'"
              :loading="saving"
              @click="act('resume')"
              >恢复报名</el-button
            ><el-button
              v-if="['published', 'paused'].includes(form.status)"
              type="danger"
              plain
              :loading="saving"
              @click="act('cancel')"
              >取消活动</el-button
            ><el-button
              v-if="form.lastError"
              :loading="saving"
              @click="act('retry')"
              >重试任务</el-button
            ></template
          >
        </div></template
      >
    </el-drawer>
    <el-dialog
      v-model="shippingOpen"
      title="中奖奖品 · 收货与发货"
      width="560px"
      ><template v-if="shipment"
        ><el-descriptions :column="1" border
          ><el-descriptions-item label="收件人">{{
            shipment.recipientName || "尚未提交"
          }}</el-descriptions-item
          ><el-descriptions-item label="手机">{{
            shipment.recipientPhone || "—"
          }}</el-descriptions-item
          ><el-descriptions-item label="收货地址">{{
            shipment.recipientAddress || "—"
          }}</el-descriptions-item
          ><el-descriptions-item label="状态">{{
            claims[shipment.claimStatus]
          }}</el-descriptions-item></el-descriptions
        ><el-form label-position="top" class="shipping-form"
          ><el-form-item label="快递公司"
            ><el-input
              v-model="shippingCarrier"
              :disabled="shipment.claimStatus !== 'processing'"
              maxlength="40" /></el-form-item
          ><el-form-item label="物流单号"
            ><el-input
              v-model="trackingNumber"
              :disabled="shipment.claimStatus !== 'processing'"
              maxlength="60" /></el-form-item></el-form></template
      ><template #footer
        ><el-button @click="shippingOpen = false">关闭</el-button
        ><el-button
          v-if="shipment?.claimStatus === 'processing'"
          type="primary"
          :loading="saving"
          @click="ship"
          >确认已发货</el-button
        ></template
      ></el-dialog
    >
    <el-dialog v-model="redeemOpen" title="校内自提核销" width="480px"
      ><p>核对奖品和领取人，确认交付后再核销。</p>
      <el-input
        v-model="redeemCode"
        maxlength="24"
        placeholder="填写24位领取码"
      /><template #footer
        ><el-button @click="redeemOpen = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="redeem"
          >确认核销</el-button
        ></template
      ></el-dialog
    >
    <WelfareCheckins v-if="checkinsOpen" :can-edit="canEdit" :options="options" @close="checkinsOpen=false" @changed="loadCheckinOptions('')" />
    <WelfareWecomPanel v-if="wecomOpen" :can-configure="isSuperAdmin" :can-edit="canEdit" :options="options" @close="wecomOpen=false" @changed="loadWecomGroups" />
  </main>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { request } from "@/api/request";
import ImageUploadBox from "@/components/common/ImageUploadBox.vue";
import shareMascot from "@/assets/welfare/sprout-gift.png";
import { useAuthStore } from "@/stores/auth";
import WelfareCheckins from "./WelfareCheckins.vue";
import WelfareWecomPanel from "./WelfareWecomPanel.vue";
const auth = useAuthStore(),
  isSuperAdmin = ref(false);
const canEdit = computed(
  () =>
    isSuperAdmin.value ||
    auth.permissions.includes("activity:edit") ||
    auth.permissions.includes("*"),
);
const options = ref<any>({ regions: [], coupons: [], canGlobal: false }),
  rows = ref<any[]>([]),
  total = ref(0),
  page = ref(1),
  keyword = ref(""),
  status = ref(""),
  loading = ref(false),
  error = ref("");
const drawer = ref(false),
  tab = ref("config"),
  form = ref<any>({ prizes: [] }),
  saving = ref(false),
  detailLoading = ref(false);
const entries = ref<any[]>([]),
  logs = ref<any[]>([]),
  outcome = ref(""),
  entryKeyword = ref(""),
  entriesError = ref(""),
  entryPage = ref(1),
  entryTotal = ref(0),
  recordsLoading = ref(false);
const shareStats = ref<any>(null), shareLoading = ref(false), shareError = ref("");
const shareSources: Record<string,string> = {official:"官方群",other_group:"其他已验证群",unknown:"未识别"};
const binding = ref<any>({}),
  bindingBusy = ref(false),
  envVersion = ref("trial");
const verifierOptions = ref<any[]>([]),
  verifierLoading = ref(false);
const reservedSearchState = ref<Record<string, { options: any[]; loading: boolean; error: string; version: number }>>({});
const reservedSaving = ref(false);
const shippingOpen = ref(false),
  shipment = ref<any>(null),
  shippingCarrier = ref(""),
  trackingNumber = ref(""),
  redeemOpen = ref(false),
  redeemCode = ref("");
const statuses: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  paused: "报名暂停",
  finished: "已开奖",
  cancelled: "已取消",
};
const outcomes: Record<string, string> = {
  waiting: "等待开奖",
  won: "已中奖",
  lost: "未中奖",
  excluded: "资格失效",
  cancelled: "已取消",
};
const claims: Record<string, string> = {
  none: "—",
  pending: "待领取",
  processing: "待发货",
  shipped: "已发货",
  delivered: "券已到账",
  redeemed: "已核销",
  expired: "领奖截止",
};
const logLabels: Record<string, string> = {
  WELFARE_SAVE: "保存活动",
  WELFARE_PUBLISH: "发布活动",
  WELFARE_PAUSE: "暂停报名",
  WELFARE_RESUME: "恢复报名",
  WELFARE_CANCEL: "取消活动",
  WELFARE_RETRY: "重试任务",
  WELFARE_GROUP_BIND: "绑定官方群",
  WELFARE_GROUP_CLEAR: "清空群绑定",
  WELFARE_SHIP: "奖品发货",
  WELFARE_REDEEM: "自提核销",
};
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const checkinsOpen = ref(false), checkinOptions = ref<any[]>([]), checkinOptionsLoading = ref(false);
const wecomOpen=ref(false), wecomGroups=ref<any[]>([]), wecomConfigured=ref(false), wecomLoading=ref(false), savedWecomGroups=ref<string[]>([]);
const availableWecomGroups=computed(()=>wecomGroups.value.filter(group=>!group.regionId||group.regionId===form.value.regionId));
const wecomAppendable=computed(()=>canEdit.value && !!form.value.id && form.value.groupVerificationMode==='wecom_member' && ['published','paused'].includes(form.value.status) && Date.now()<new Date(form.value.endAt).getTime());
async function loadWecomGroups(){wecomLoading.value=true;try{const result:any=await request.get('/admin/welfare/wecom/groups',{skipGetDeduplication:true});wecomGroups.value=result.list;wecomConfigured.value=result.configured;}catch(e){ElMessage.error(message(e));}finally{wecomLoading.value=false;}}
function changeGroupMode(){form.value.groupIds=[];savedWecomGroups.value=[];binding.value={};form.value.groupRecheckAtDraw=form.value.groupVerificationMode==='wecom_member';form.value.joinGuide=form.value.groupVerificationMode==='wecom_member'?'请加入本活动官方群；无法扫码时联系管理员邀请。入群后返回小程序即可核验。开奖前须保持在群，退群将取消资格。':'请先加入官方群；无法扫码时联系管理员邀请。入群后点击群内活动小程序卡片完成报名验证。';}
async function appendWecomGroups(){if(saving.value||!wecomAppendable.value)return;if(savedWecomGroups.value.some(id=>!form.value.groupIds.includes(id))){ElMessage.error('发布后只能追加官方群，原有群不能移除');return;}saving.value=true;try{await post('/campaigns/'+form.value.id+'/wecom-groups',{groupIds:form.value.groupIds});savedWecomGroups.value=[...form.value.groupIds];ElMessage.success('官方群已追加');}catch(e){ElMessage.error(message(e));}finally{saving.value=false;}}
let checkinOptionsVersion = 0;
const availableCheckins = computed(() => {
  const items = [...checkinOptions.value];
  if (form.value.checkinSession && !items.some(row => row.id === form.value.checkinSession.id)) items.push(form.value.checkinSession);
  return items.filter(row => !row.regionId || row.regionId === form.value.regionId);
});
async function loadCheckinOptions(keyword = "") {
  const version = ++checkinOptionsVersion;
  checkinOptionsLoading.value = true;
  try {
    const result: any = await request.get("/admin/welfare/checkins", {params: {keyword}, skipGetDeduplication: true});
    if (version === checkinOptionsVersion) checkinOptions.value = result.list;
  } catch (e) { if (version === checkinOptionsVersion) ElMessage.error(message(e)); }
  finally { if (version === checkinOptionsVersion) checkinOptionsLoading.value = false; }
}
const editable = computed(
  () =>
    canEdit.value &&
    !form.value.publishedAt &&
    (!form.value.id || form.value.status === "draft"),
);
// 名单在开奖前独立管理，不受已发布活动配置锁定的影响。
const reservedEditable = computed(
  () => canEdit.value && !!form.value.id && !form.value.drawnAt &&
    ["draft", "published", "paused"].includes(form.value.status),
);
const registrationLimitEnabled = computed({
  get: () => Number(form.value.minRegistrationDays) > 0,
  set: (enabled: boolean) => { form.value.minRegistrationDays = enabled ? 7 : 0; },
});
const participantThresholdEnabled = computed({
  get: () => Number(form.value.minParticipants) > 0,
  set: (enabled: boolean) => {
    form.value.minParticipants = enabled ? Math.min(10, Number(form.value.maxEntries) || 10) : 0;
  },
});
const base = "/admin/welfare",
  get = (p: string, params?: any) =>
    request.get<any, any>(base + p, { params, skipGetDeduplication: true }),
  post = (p: string, data?: any) =>
    request.post<any, any>(base + p, data, { timeout: 60000 });
const time = (v: any) =>
  v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "—";
const message = (e: any) => {
  const m = e?.response?.data?.message || e?.message;
  return Array.isArray(m) ? m.join("；") : m || "操作失败，请重试";
};
let detailVersion = 0,
  listVersion = 0,
  entriesVersion = 0;
async function load() {
  const version = ++listVersion;
  loading.value = true;
  error.value = "";
  try {
    const r = await get("/campaigns", {
      page: page.value,
      keyword: keyword.value,
      status: status.value,
    });
    if (version !== listVersion) return;
    rows.value = r.list;
    total.value = r.total;
  } catch (e) {
    if (version === listVersion) error.value = message(e);
  } finally {
    if (version === listVersion) loading.value = false;
  }
}
function search() {
  page.value = 1;
  load();
}
function addPrize() {
  form.value.prizes.push({
    name: "",
    kind: "physical",
    image: "",
    quantity: 1,
    couponId: "",
    verifierUserIds: "",
  });
}
function create() {
  detailVersion++;
  detailLoading.value = false;
  entries.value = [];
  logs.value = [];
  const now = Date.now();
  form.value = {
    title: "",
    shareTitle: "",
    description: "",
    cover: "",
    shareCover: "",
    mode: "scheduled",
    status: "draft",
    regionId: options.value.canGlobal ? "" : options.value.regions[0]?.id || "",
    requireStudent: true,
    requireProfile: false,
    requirePost: false,
    minRegistrationDays: 0,
    checkinSessionId: "",
    requireOfficial: true,
    memberOnly: false,
    requireGroup: true,
    groupVerificationMode: "wecom_member",
    groupRecheckAtDraw: true,
    groupIds: [],
    joinImage: "",
    joinGuide:
      "请加入本活动官方群；无法扫码时联系管理员邀请。入群后返回小程序即可核验。开奖前须保持在群，退群将取消资格。",
    claimMethod: "shipping",
    startAt: new Date(now + 3600000).toISOString(),
    endAt: new Date(now + 86400000).toISOString(),
    drawAt: new Date(now + 86400000).toISOString(),
    claimUntil: new Date(now + 8 * 86400000).toISOString(),
    maxEntries: 1000,
    minParticipants: 0,
    extendHours: 24,
    maxExtensions: 0,
    pickupLocation: "",
    contact: "",
    claimContactImage: "",
    claimInstructions: "",
    prizes: [],
  };
  addPrize();
  binding.value = {};
  savedWecomGroups.value=[];
  loadWecomGroups();
  tab.value = "config";
  drawer.value = true;
}
function assign(row: any) {
  for (const p of row.prizes || []) {
    for (const verifier of p.verifiers || []) {
      if (!verifier.user) continue;
      const user = verifier.user;
      if (!verifierOptions.value.some((item) => item.id === user.id))
        verifierOptions.value.push(user);
    }
  }
  form.value = {
    ...row,
    groupVerificationMode: row.groupVerificationMode || "wechat_card",
    groupRecheckAtDraw: row.groupRecheckAtDraw === true,
    requireProfile: row.requireProfile === true,
    requirePost: row.requirePost === true,
    minRegistrationDays: row.minRegistrationDays || 0,
    minParticipants: row.minParticipants || 0,
    extendHours: row.extendHours || 24,
    maxExtensions: row.maxExtensions || 0,
    checkinSessionId: row.checkinSessionId || "",
    regionId: row.regionId || "",
    shareTitle: row.shareTitle || "",
    shareCover: row.shareCover || "",
    claimContactImage: row.claimContactImage || "",
    claimInstructions: row.claimInstructions || "",
    prizes: row.prizes.map((p: any) => ({
      ...p,
      verifierUserIds:
        p.verifierUserIds || p.verifiers?.[0]?.userId || "",
      _selectedUserId: "",
      reservedUsers: p.reservedUsers || [],
    })),
  };
  savedWecomGroups.value=[...(row.groupIds || [])];
  if(row.groupVerificationMode==='wecom_member')loadWecomGroups();
}
async function searchVerifiers(keyword = "") {
  verifierLoading.value = true;
  try {
    const r = await request.get<any, any>("/admin/users", {
      params: {
        keyword: String(keyword || "").trim(),
        status: "active",
        userType: "normal",
        page: 1,
        pageSize: 30,
      },
    });
    const list = Array.isArray(r?.list) ? r.list : [];
    const merged = [...verifierOptions.value];
    for (const user of list) {
      if (!merged.some((item) => item.id === user.id)) merged.push(user);
    }
    verifierOptions.value = merged;
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    verifierLoading.value = false;
  }
}

// ========== 内定用户管理 ==========

async function searchEntriesForReserved(keyword = "", prizeIndex: number) {
  const campaignId = form.value.id;
  const prizeId = form.value.prizes[prizeIndex]?.id;
  if (!campaignId || !prizeId) return;
  reservedSearchState.value[prizeId] ||= { options: [], loading: false, error: "", version: 0 };
  const state = reservedSearchState.value[prizeId];
  const version = ++state.version;
  state.loading = true;
  state.error = "";
  state.options = [];
  const isCurrent = () => campaignId === form.value.id && reservedSearchState.value[prizeId] === state && version === state.version;
  try {
    const r = await get("/campaigns/" + campaignId + "/entries-for-reserved", {
      keyword: String(keyword || "").trim(),
    });
    if (isCurrent()) state.options = Array.isArray(r) ? r : [];
  } catch (e) {
    if (isCurrent()) {
      state.error = "查询失败，请重新输入 UID 重试";
      ElMessage.error(message(e));
    }
  } finally {
    if (isCurrent()) state.loading = false;
  }
}

async function addReservedUser(prizeIndex: number) {
  if (!reservedEditable.value) return;
  const prize = form.value.prizes[prizeIndex];
  if (!prize?.id || !prize._selectedUserId) return;
  
  // 检查内定名额是否已满
  if (prize.reservedUsers && prize.reservedUsers.length >= prize.quantity) {
    ElMessage.warning("内定名额已满，不能超过奖项总名额");
    return;
  }
  
  reservedSaving.value = true;
  try {
    await post("/prizes/" + prize.id + "/reserved", {
      userId: prize._selectedUserId,
    });
    ElMessage.success("内定用户已添加");
    prize._selectedUserId = "";
    // 重新加载内定用户列表
    await loadReservedUsers(prizeIndex);
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    reservedSaving.value = false;
  }
}

async function removeReservedUser(prizeIndex: number, userId: string) {
  if (!reservedEditable.value) return;
  const prize = form.value.prizes[prizeIndex];
  if (!prize) return;
  
  reservedSaving.value = true;
  try {
    await post("/prizes/" + prize.id + "/reserved/" + userId + "/delete");
    ElMessage.success("内定用户已移除");
    // 重新加载内定用户列表
    await loadReservedUsers(prizeIndex);
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    reservedSaving.value = false;
  }
}

async function loadReservedUsers(prizeIndex: number) {
  const prize = form.value.prizes[prizeIndex];
  if (!prize || !prize.id) return;
  
  try {
    const r = await get("/prizes/" + prize.id + "/reserved");
    prize.reservedUsers = r.reservedUsers || [];
  } catch (e) {
    console.error("加载内定用户失败", e);
  }
}

async function loadAllReservedUsers() {
  if (!form.value.prizes) return;
  for (let i = 0; i < form.value.prizes.length; i++) {
    await loadReservedUsers(i);
  }
}

async function open(id: string, which: string) {
  const version = ++detailVersion;
  drawer.value = true;
  detailLoading.value = true;
  tab.value = which;
  entriesVersion++;
  entries.value = [];
  entryTotal.value = 0;
  entriesError.value = "";
  entryKeyword.value = "";
  reservedSearchState.value = {};
  entryPage.value = 1;
  outcome.value = "";
  binding.value = {};
  try {
    const row = await get("/campaigns/" + id);
    if (version !== detailVersion) return;
    assign(row);
    await tabChanged();
    // 加载内定用户列表
    await loadAllReservedUsers();
  } catch (e) {
    if (version === detailVersion) {
      ElMessage.error(message(e));
      drawer.value = false;
    }
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}
async function persist() {
  normalizeClaimMethod();
  const payload = {
    ...form.value,
    mode: "scheduled",
    groupRecheckAtDraw: form.value.requireGroup && form.value.groupVerificationMode==='wecom_member',
    prizes: form.value.prizes.map((p: any) => ({ ...p })),
  };
  const row = form.value.id
    ? await request.put<any, any>(base + "/campaigns/" + form.value.id, payload)
    : await post("/campaigns", payload);
  assign(row);
  return row;
}
function normalizeClaimMethod() {
  if (
    form.value.prizes?.some((p: any) => p.kind === "manual") &&
    form.value.claimMethod === "shipping"
  )
    form.value.claimMethod = "pickup";
}
const hasManualPrize = computed(() =>
  form.value.prizes?.some((p: any) => p.kind === "manual"),
);
function validateClaimContact() {
  if (!hasManualPrize.value) return true;
  if (String(form.value.contact || "").trim() || form.value.claimContactImage)
    return true;
  ElMessage.error("人工兑奖请填写管理员联系方式或上传联系二维码");
  return false;
}
async function save() {
  if (saving.value) return;
  if (!validateClaimContact()) return;
  saving.value = true;
  try {
    await persist();
    ElMessage.success("草稿已保存");
    await load();
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    saving.value = false;
  }
}
async function publish() {
  if (saving.value) return;
  if (!validateClaimContact()) return;
  try {
    await ElMessageBox.confirm(
      "发布后奖品、参与条件、截止与开奖时间将锁定，确认发布？",
      "发布活动",
      { type: "warning" },
    );
  } catch {
    return;
  }
  saving.value = true;
  try {
    await persist();
    await post("/campaigns/" + form.value.id + "/publish");
    assign(await get("/campaigns/" + form.value.id));
    ElMessage.success("活动已发布");
    await load();
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    saving.value = false;
  }
}
async function act(action: string) {
  if (saving.value) return;
  if (action === "cancel") {
    try {
      await ElMessageBox.confirm(
        "取消后将通知已报名用户，活动不能恢复。确认取消？",
        "取消活动",
        { type: "warning" },
      );
    } catch {
      return;
    }
  }
  saving.value = true;
  try {
    await post("/campaigns/" + form.value.id + "/" + action);
    assign(await get("/campaigns/" + form.value.id));
    await load();
    ElMessage.success("操作成功");
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    saving.value = false;
  }
}
function searchEntries() {
  entryKeyword.value = entryKeyword.value.trim();
  entryPage.value = 1;
  loadEntries();
}
async function loadEntries() {
  if (!form.value.id) return;
  const id = form.value.id,
    version = ++entriesVersion;
  recordsLoading.value = true;
  entriesError.value = "";
  entries.value = [];
  try {
    const r = await get("/campaigns/" + id + "/entries", {
      page: entryPage.value,
      outcome: outcome.value,
      keyword: entryKeyword.value.trim(),
    });
    if (id === form.value.id && version === entriesVersion) {
      entries.value = r.list;
      entryTotal.value = r.total;
    }
  } catch (e) {
    if (id === form.value.id && version === entriesVersion) {
      entriesError.value = "记录查询失败，请点击刷新记录重试";
      ElMessage.error(message(e));
    }
  } finally {
    if (version === entriesVersion) recordsLoading.value = false;
  }
}
async function loadSharing() {
  const id = form.value.id;
  if (!id) return;
  shareLoading.value = true;
  shareError.value = "";
  shareStats.value = null;
  try { const r = await get("/campaigns/" + id + "/share-analytics"); if (form.value.id === id) shareStats.value = r; }
  catch (e) { if (form.value.id === id) shareError.value = message(e); }
  finally { if (form.value.id === id) shareLoading.value = false; }
}
async function tabChanged() {
  if (!form.value.id) return;
  if (tab.value === "entries") await loadEntries();
  if (tab.value === "sharing") await loadSharing();
  if (tab.value === "logs") {
    try {
      logs.value = (await get("/campaigns/" + form.value.id + "/logs")).list;
    } catch (e) {
      ElMessage.error(message(e));
    }
  }
}
async function startBinding() {
  if (bindingBusy.value) return;
  bindingBusy.value = true;
  try {
    binding.value = await post(
      "/campaigns/" + form.value.id + "/group-binding/start",
      { envVersion: envVersion.value },
    );
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    bindingBusy.value = false;
  }
}
async function inspectBinding() {
  bindingBusy.value = true;
  try {
    binding.value = {
      ...binding.value,
      ...(await get(
        "/campaigns/" + form.value.id + "/group-binding/" + binding.value.token,
      )),
    };
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    bindingBusy.value = false;
  }
}
async function confirmBinding() {
  bindingBusy.value = true;
  try {
    await post("/campaigns/" + form.value.id + "/group-binding/confirm", {
      token: binding.value.token,
    });
    const row = await get("/campaigns/" + form.value.id);
    form.value.groupIds = row.groupIds;
    binding.value = {};
    ElMessage.success("官方群已绑定");
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    bindingBusy.value = false;
  }
}
async function clearGroups() {
  try {
    await ElMessageBox.confirm(
      "清空后需重新绑定才能发布需要入群的活动。",
      "清空绑定",
      { type: "warning" },
    );
  } catch {
    return;
  }
  try {
    await post("/campaigns/" + form.value.id + "/group-binding/clear");
    form.value.groupIds = [];
    binding.value = {};
  } catch (e) {
    ElMessage.error(message(e));
  }
}
function showShipping(row: any) {
  shipment.value = row;
  shippingCarrier.value = row.shippingCarrier || "";
  trackingNumber.value = row.trackingNumber || "";
  shippingOpen.value = true;
}
async function ship() {
  if (saving.value) return;
  saving.value = true;
  try {
    await post("/entries/" + shipment.value.id + "/ship", {
      carrier: shippingCarrier.value,
      trackingNumber: trackingNumber.value,
    });
    shippingOpen.value = false;
    await loadEntries();
    ElMessage.success("已记录发货");
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    saving.value = false;
  }
}
async function redeem() {
  if (saving.value) return;
  saving.value = true;
  try {
    await post("/redeem", { code: redeemCode.value });
    redeemCode.value = "";
    redeemOpen.value = false;
    ElMessage.success("核销成功");
    if (form.value.id) await loadEntries();
  } catch (e) {
    ElMessage.error(message(e));
  } finally {
    saving.value = false;
  }
}
onMounted(async () => {
  await load();
  const results = await Promise.allSettled([
    get("/options"),
    get("/capabilities"),
  ]);
  if (results[0].status === "fulfilled") options.value = results[0].value;
  else error.value = message(results[0].reason);
  if (results[1].status === "fulfilled")
    isSuperAdmin.value = !!results[1].value.isSuperAdmin;
  else error.value = message(results[1].reason);
});
</script>
<style scoped>
.lottery-admin {
  padding: 26px;
  max-width: 1560px;
  margin: auto;
  color: var(--mx-text);
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 26px;
}
.eyebrow {
  font-size: 12px;
  color: var(--mx-primary);
  letter-spacing: 2px;
  margin: 0 0 10px;
}
h1 {
  font-size: 24px;
  letter-spacing: -0.5px;
  margin: 0;
}
.subtitle {
  color: var(--mx-sub);
  font-size: 14px;
  margin: 12px 0 0;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.workflow {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-bottom: 24px;
}
.workflow > div {
  background: var(--mx-card);
  border: 1px solid var(--mx-border);
  border-radius: var(--mx-radius-lg);
  padding: 22px;
}
.workflow span {
  color: var(--mx-primary);
  font-size: 12px;
  font-weight: 700;
  display: block;
  margin-bottom: 10px;
}
.workflow b {
  font-size: 16px;
}
.workflow p {
  font-size: 13px;
  color: var(--mx-sub);
  line-height: 1.6;
  margin: 8px 0 0;
}
.panel {
  background: var(--mx-card);
  border: 1px solid var(--mx-border);
  border-radius: var(--mx-radius-lg);
  padding: 22px;
}
.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.filters .el-input {
  max-width: 280px;
}
.filters .el-select {
  width: 180px;
}
.entry-filters {
  flex-wrap: wrap;
}
.entry-filters :deep(.el-button + .el-button) {
  margin-left: 0;
}
.activity-cell {
  display: flex;
  gap: 14px;
  align-items: center;
}
.activity-cell img,
.cover-mark {
  width: 65px;
  height: 65px;
  border-radius: 14px;
  object-fit: cover;
  flex-shrink: 0;
}
.cover-mark {
  background: var(--mx-hover);
  display: grid;
  place-items: center;
  font-size: 25px;
  color: var(--mx-primary);
}
.activity-cell p,
.muted {
  font-size: 12px;
  color: var(--mx-muted);
  margin: 7px 0 0;
}
.error {
  font-size: 13px;
  color: var(--el-color-danger);
}
.el-pagination {
  justify-content: flex-end;
  margin-top: 20px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 22px;
}
.grid :deep(.el-select),
.grid :deep(.el-date-editor) {
  width: 100%;
}
.section-label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 24px 0 18px;
}
.section-label span {
  color: var(--mx-primary);
  background: var(--mx-hover);
  border-radius: 7px;
  padding: 5px 7px;
  font-size: 12px;
}
.section-label h3 {
  font-size: 17px;
  margin: 0;
  flex: 1;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.prize-editor {
  border: 1px solid var(--mx-border);
  background: var(--mx-soft);
  border-radius: var(--mx-radius-md);
  padding: 20px;
  margin-bottom: 18px;
}
.threshold-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.hint {
  font-size: 12px;
  color: var(--mx-sub);
  line-height: 1.8;
  margin: 12px 0 20px;
}
.cover-preview {
  width: 260px;
  max-height: 170px;
  object-fit: cover;
  border-radius: 12px;
}
.share-card-settings {
  margin: 2px 0 20px;
  padding: 18px;
  border: 1px solid var(--mx-border);
  border-radius: var(--mx-radius-md);
  background: var(--mx-soft);
}
.share-card-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.share-card-heading .hint {
  margin-bottom: 0;
}
.share-card-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 250px;
  max-width: 100%;
  margin-bottom: 18px;
  padding: 8px;
  border: 1px solid var(--mx-border);
  border-radius: 12px;
  background: var(--mx-card);
  flex-shrink: 0;
}
.share-card-preview img {
  width: 100%;
  aspect-ratio: 5 / 4;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.share-card-preview-mark {
  display: grid;
  place-items: center;
  color: var(--mx-primary);
  background: var(--mx-hover);
  font-size: 22px;
}
.share-card-preview-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}
.share-card-preview-copy b {
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
}
.share-card-footer {
  color: var(--mx-muted);
  font-size: 12px;
}
.prize-preview {
  width: 130px;
  height: 130px;
  object-fit: contain;
  border-radius: 10px;
}
.contact-qr-preview {
  width: 150px;
  height: 150px;
  object-fit: contain;
  border: 1px solid var(--mx-border);
  border-radius: var(--mx-radius-md);
  background: var(--mx-card);
}
.binding-panel {
  background: var(--mx-soft);
  border: 1px solid var(--mx-border);
  padding: 24px;
  border-radius: 16px;
  line-height: 1.7;
}
.binding-panel h3 {
  margin-top: 0;
}
.binding-panel p {
  font-size: 14px;
  color: var(--mx-sub);
}
.binding-session {
  margin-top: 25px;
  display: flex;
  gap: 22px;
  align-items: center;
}
.binding-session > img {
  width: 180px;
  height: 180px;
  border-radius: 14px;
}
.group-id {
  word-break: break-all;
  font-family: monospace;
}
.drawer-actions {
  justify-content: flex-end;
}
.shipping-form {
  margin-top: 22px;
}
.activity-form {
  padding-bottom: 20px;
}

/* 内定用户样式 */
.reserved-users-section {
  width: 100%;
}
.reserved-users-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}
.reserved-user-select {
  flex: 1 1 260px;
  min-width: 0;
  max-width: 400px;
}
.reserved-users-stats {
  margin-bottom: 16px;
  background: var(--mx-card);
  border: 1px solid var(--mx-border);
  border-radius: var(--mx-radius-md);
  padding: 16px;
}
.reserved-stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.reserved-stats-label {
  font-size: 13px;
  color: var(--mx-sub);
  font-weight: 500;
}
.reserved-stats-count {
  font-size: 14px;
  color: var(--mx-text);
}
.reserved-stats-count strong {
  color: var(--mx-primary);
  font-size: 18px;
}
.reserved-stats-footer {
  margin-top: 12px;
  font-size: 13px;
}
.reserved-users-remaining {
  color: var(--mx-primary);
  font-weight: 500;
}
.reserved-users-remaining strong {
  color: var(--mx-primary);
  font-size: 16px;
}
.reserved-users-full {
  color: var(--el-color-success);
  font-weight: 500;
}
.reserved-users-empty {
  color: var(--mx-muted);
}
.reserved-users-list {
  background: var(--mx-soft);
  border: 1px solid var(--mx-border);
  border-radius: var(--mx-radius-md);
  padding: 12px;
  margin-top: 8px;
}
.reserved-user-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--mx-border);
}
.reserved-user-item:last-child {
  border-bottom: none;
}
.reserved-user-index {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--mx-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.reserved-user-name {
  font-weight: 500;
  min-width: 0;
  overflow-wrap: anywhere;
}
.reserved-user-uid {
  font-size: 14px;
  color: var(--mx-sub);
  flex: 1 0 120px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .workflow {
    grid-template-columns: 1fr;
  }
  .grid {
    grid-template-columns: 1fr;
  }
  .lottery-admin {
    padding: 16px;
  }
  .filters {
    flex-wrap: wrap;
  }
}
</style>

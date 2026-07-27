<template>
  <div class="page-shell">
    <GlassPageHeader title="用户管理" subtitle="管理小程序用户、机器人账号、学生认证、余额状态、内容与交易行为">
      <template #actions>
        <el-button :icon="Refresh" @click="loadUsers">刷新</el-button>
      </template>
    </GlassPageHeader>

    <StatGrid :items="statsItems" />

    <div class="page-main-col">
      <SearchPanel :fields="searchFields" @search="onSearch" />

      <div class="action-bar">
        <div class="btn-row">
          <el-button type="primary" :icon="Plus" @click="showRobotDialog = true">添加机器人</el-button>
          <el-button type="warning" :icon="Open" @click="batchAction('enable')">批量启用</el-button>
          <el-button type="warning" :icon="Close" @click="batchAction('disable')">批量禁用</el-button>
          <el-button type="danger" :icon="Lock" @click="batchAction('ban')">批量封禁</el-button>
          <el-button :icon="Download" @click="handleExport">导出数据</el-button>
        </div>
        <div class="action-bar-right">
          <span class="muted">共 {{ total }} 条</span>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="users"
        style="width: 100%"
        @selection-change="handleSelectionChange"
        border
        stripe
      >
        <el-table-column type="selection" width="55" />
        <el-table-column label="头像/昵称" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :src="row.avatar" :size="40">{{ (row.nickname || '?')[0] }}</el-avatar>
              <div class="user-info">
                <div class="nickname">{{ row.nickname || '-' }}</div>
                <div class="user-id">{{ uidText(row) }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="UID" prop="uid" min-width="90">
          <template #default="{ row }">{{ row.uid || '-' }}</template>
        </el-table-column>
        <el-table-column label="手机号" prop="phone" min-width="130">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column label="绑定状态" min-width="150">
          <template #default="{ row }">
            <div class="tag-stack">
              <el-tag :type="row.phoneBound ? 'success' : 'info'" size="small" effect="plain">
                {{ row.phoneBound ? '已绑手机号' : '未绑手机号' }}
              </el-tag>
              <el-tag :type="row.wxBound ? 'success' : 'warning'" size="small" effect="plain">
                {{ row.wxBound ? '已绑微信' : '待绑微信' }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="用户类型" min-width="100">
          <template #default="{ row }">
            <el-tag :type="row.userType === 'robot' ? 'info' : 'success'" size="small">
              {{ row.typeLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="会员/标签" min-width="160">
          <template #default="{ row }">
            <div class="tag-stack">
              <el-tag v-if="row.membershipLabel" type="warning" size="small">{{ row.membershipLabel }}</el-tag>
              <el-tag v-for="tag in (row.tags || []).slice(0, 2)" :key="tag.id || tag.name" size="small" effect="plain">
                {{ tag.name }}
              </el-tag>
              <span v-if="!row.membershipLabel && !(row.tags || []).length" class="muted">-</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="归属区域" prop="regionName" min-width="150">
          <template #default="{ row }">
            <div class="region-cell">
              <span>{{ row.ownedRegionName || row.regionName || '未归属' }}</span>
              <small v-if="row.currentRegionName" class="muted">
                当前：{{ row.currentRegionName }}
              </small>
              <el-tag v-if="row.currentRegionSource && row.currentRegionSource !== 'profile' && row.currentRegionSource !== 'none'" size="small" type="info" effect="plain">
                {{ regionSourceLabel(row.currentRegionSource) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="学生认证" min-width="100">
          <template #default="{ row }">
            <el-tag :type="certTagType(row.studentCertStatus)" size="small">
              {{ certLabel(row.studentCertStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="余额" min-width="100">
          <template #default="{ row }">
            <span class="money">¥{{ formatCents(row.balance) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="内容数据" min-width="140">
          <template #default="{ row }">
            <div class="data-cell">
              <span>帖 {{ row.postCount || 0 }}</span>
              <span>评 {{ row.commentCount || 0 }}</span>
              <span>举报 {{ row.reportCount || 0 }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="订单数据" min-width="140">
          <template #default="{ row }">
            <div class="data-cell">
              <span>单 {{ row.orderCount || 0 }}</span>
              <span>退 {{ row.refundCount || 0 }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="账号状态" min-width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="风险" min-width="90">
          <template #default="{ row }">
            <el-tag :type="Number(row.reportedCount || 0) > 0 || row.status !== 'active' ? 'danger' : 'success'" size="small">
              {{ Number(row.reportedCount || 0) > 0 ? `被举报 ${row.reportedCount}` : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" prop="createdAt" min-width="160">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="最后登录" prop="lastLoginAt" min-width="160">
          <template #default="{ row }">{{ row.lastLoginAt ? formatDate(row.lastLoginAt) : '-' }}</template>
        </el-table-column>
        <el-table-column label="登录IP" prop="lastLoginIp" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.lastLoginIp || '-' }}</template>
        </el-table-column>
        <el-table-column v-if="ipGeoDisplay.enabled" :label="ipLocationColumnLabel" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">{{ formatIpLocation(row) }}</template>
        </el-table-column>
        <el-table-column label="登录设备" prop="lastLoginDevice" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.lastLoginDevice || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" min-width="200">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button link :type="row.status === 'active' ? 'warning' : 'success'" size="small" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
            <el-button link :type="row.status === 'banned' ? 'success' : 'danger'" size="small" @click="toggleBan(row)">
              {{ row.status === 'banned' ? '解封' : '封禁' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadUsers"
          @size-change="loadUsers"
        />
      </div>
    </div>

    <el-drawer v-model="detailVisible" title="用户运营详情" size="760px" direction="rtl">
      <template v-if="detailUser">
        <div class="detail-profile">
          <el-avatar :src="detailUser.avatar" :size="58">{{ (detailUser.nickname || '?')[0] }}</el-avatar>
          <div class="detail-profile-main">
            <div class="profile-title">
              <span>{{ detailUser.nickname || '-' }}</span>
              <el-tag :type="statusTagType(detailUser.status)" size="small">{{ statusLabel(detailUser.status) }}</el-tag>
              <el-tag v-if="detailUser.activeMembership" type="warning" size="small">{{ detailUser.activeMembership.planName }}</el-tag>
            </div>
            <div class="profile-sub">
              {{ uidText(detailUser) }} · {{ detailUser.phone || '未绑定手机号' }} · 归属：{{ detailUser.ownedRegionName || detailUser.regionName || '未归属' }}
            </div>
            <div class="profile-tags">
              <el-tag v-for="tag in detailUser.tags || []" :key="tag.id || tag.name" size="small" effect="plain">{{ tag.name }}</el-tag>
              <el-tag v-for="tag in detailUser.valueLabels || []" :key="tag" type="success" size="small" effect="plain">{{ tag }}</el-tag>
              <el-tag v-for="tag in detailUser.riskLabels || []" :key="tag" type="danger" size="small" effect="plain">{{ tag }}</el-tag>
            </div>
          </div>
        </div>

        <div class="drawer-actions">
          <el-button v-if="canAdjustBalance" size="small" type="primary" @click="openBalanceDialog">调整余额</el-button>
          <el-button size="small" type="primary" plain @click="openCouponDialog">发放优惠券</el-button>
          <el-button size="small" type="warning" plain @click="openMembershipDialog">赠送会员</el-button>
          <el-button size="small" @click="openRegionDialog">变更区域</el-button>
          <el-button size="small" type="primary" @click="openTagDialog">编辑标签</el-button>
          <el-button size="small" @click="goPrivateMessages">私信记录</el-button>
          <el-button size="small" :type="detailUser.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(detailUser)">
            {{ detailUser.status === 'active' ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" :type="detailUser.status === 'banned' ? 'success' : 'danger'" @click="toggleBan(detailUser)">
            {{ detailUser.status === 'banned' ? '解封' : '封禁' }}
          </el-button>
        </div>

        <el-tabs v-model="detailTab">
          <el-tab-pane label="概览" name="overview">
            <div class="mini-stat-grid">
              <div class="mini-stat"><span>消费金额</span><strong>¥{{ formatCents(detailUser.tradeOverview?.totalPaidCents) }}</strong></div>
              <div class="mini-stat"><span>钱包余额</span><strong>¥{{ formatCents(detailUser.balance) }}</strong></div>
              <div class="mini-stat"><span>内容互动</span><strong>{{ (detailUser.postCount || 0) + (detailUser.commentCount || 0) }}</strong></div>
              <div class="mini-stat"><span>私信会话</span><strong>{{ detailUser.messageOverview?.conversationCount || 0 }}</strong></div>
            </div>
            <div class="detail-section">
              <h4>基础画像</h4>
              <div class="detail-grid">
                <div class="detail-item"><span class="label">UID</span><span class="id-text">{{ uidText(detailUser) }}</span></div>
                <div class="detail-item"><span class="label">手机号绑定</span><el-tag :type="detailUser.phoneBound ? 'success' : 'info'" size="small">{{ detailUser.phoneBound ? detailUser.phone : '未绑定' }}</el-tag></div>
                <div class="detail-item"><span class="label">微信绑定</span><el-tag :type="detailUser.wxBound ? 'success' : 'warning'" size="small">{{ detailUser.wxBound ? '已绑定' : '待绑定' }}</el-tag></div>
                <div class="detail-item"><span class="label">登录标识</span><span>{{ detailUser.loginIdentifierType === 'phone' ? '手机号账号' : '微信账号' }}</span></div>
                <div class="detail-item"><span class="label">OpenID</span><span class="id-text">{{ detailUser.openid || '-' }}</span></div>
                <div class="detail-item"><span class="label">用户类型</span><span>{{ detailUser.typeLabel || '-' }}</span></div>
                <div class="detail-item"><span class="label">学校</span><span>{{ detailUser.school || '-' }}</span></div>
                <div class="detail-item"><span class="label">学生认证</span><el-tag :type="certTagType(detailUser.studentCertStatus)" size="small">{{ certLabel(detailUser.studentCertStatus) }}</el-tag></div>
                <div class="detail-item"><span class="label">正式归属区域</span><span>{{ detailUser.ownedRegionName || detailUser.regionName || '未归属' }}</span></div>
                <div class="detail-item"><span class="label">当前访问/推断区域</span><span>{{ detailUser.currentRegionName || '-' }}</span></div>
                <div class="detail-item"><span class="label">当前区域来源</span><span>{{ regionSourceLabel(detailUser.currentRegionSource || detailUser.regionSource) }}</span></div>
                <div class="detail-item"><span class="label">最后登录</span><span>{{ detailUser.lastLoginAt ? formatDate(detailUser.lastLoginAt) : '-' }}</span></div>
                <div class="detail-item"><span class="label">注册时间</span><span>{{ formatDate(detailUser.createdAt) }}</span></div>
                <div class="detail-item"><span class="label">最后登录IP</span><span>{{ detailUser.lastLoginIp || '-' }}</span></div>
                <div v-if="ipGeoDisplay.enabled" class="detail-item detail-item-wide"><span class="label">{{ ipLocationColumnLabel }}</span><span>{{ formatIpLocation(detailUser) }}</span></div>
                <div class="detail-item"><span class="label">登录设备</span><span>{{ detailUser.lastLoginDevice || '-' }}</span></div>
                <div class="detail-item detail-item-wide"><span class="label">登录User-Agent</span><span class="id-text">{{ detailUser.lastLoginUserAgent || '-' }}</span></div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="内容" name="content">
            <div class="mini-stat-grid">
              <div class="mini-stat"><span>发帖</span><strong>{{ detailUser.postCount || 0 }}</strong></div>
              <div class="mini-stat"><span>评论</span><strong>{{ detailUser.commentCount || 0 }}</strong></div>
              <div class="mini-stat"><span>点赞</span><strong>{{ detailUser.likeCount || 0 }}</strong></div>
              <div class="mini-stat"><span>被举报</span><strong>{{ detailUser.reportedCount || 0 }}</strong></div>
            </div>
            <div class="detail-actions">
              <el-button size="small" @click="goUserPosts">查看该用户帖子</el-button>
              <el-button size="small" @click="goUserComments">查看该用户评论</el-button>
              <el-button size="small" @click="goContentAudit">审核举报台</el-button>
            </div>
            <h4 class="block-title">最近帖子</h4>
            <el-table :data="detailUser.contentOverview?.latestPosts || []" size="small" border empty-text="暂无帖子">
              <el-table-column prop="summary" label="内容" min-width="220" show-overflow-tooltip />
              <el-table-column prop="auditStatus" label="审核" width="90" />
              <el-table-column prop="viewCount" label="浏览" width="80" />
              <el-table-column label="时间" width="150"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
            </el-table>
            <h4 class="block-title">最近评论</h4>
            <el-table :data="detailUser.contentOverview?.latestComments || []" size="small" border empty-text="暂无评论">
              <el-table-column prop="summary" label="评论内容" min-width="240" show-overflow-tooltip />
              <el-table-column prop="auditStatus" label="审核" width="90" />
              <el-table-column label="时间" width="150"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="交易" name="trade">
            <div class="mini-stat-grid">
              <div class="mini-stat"><span>总支付</span><strong>¥{{ formatCents(detailUser.tradeOverview?.totalPaidCents) }}</strong></div>
              <div class="mini-stat"><span>退款相关</span><strong>{{ detailUser.tradeOverview?.refundCount || 0 }}</strong></div>
              <div class="mini-stat"><span>平台补贴</span><strong>¥{{ formatCents(detailUser.tradeOverview?.subsidy?.amount) }}</strong></div>
              <div class="mini-stat"><span>权益使用</span><strong>{{ detailUser.membership?.usages?.length || 0 }}</strong></div>
            </div>
            <h4 class="block-title">业务消费分布</h4>
            <el-table :data="detailUser.tradeOverview?.modules || []" size="small" border empty-text="暂无交易">
              <el-table-column prop="label" label="业务" />
              <el-table-column prop="count" label="订单数" width="90" />
              <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ formatCents(row.amount) }}</template></el-table-column>
            </el-table>
            <h4 class="block-title">钱包流水</h4>
            <el-table :data="detailUser.walletLogs || []" size="small" border empty-text="暂无流水">
              <el-table-column prop="description" label="说明" min-width="180" show-overflow-tooltip />
              <el-table-column prop="type" label="类型" width="100" />
              <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ formatCents(row.amount) }}</template></el-table-column>
              <el-table-column label="时间" width="150"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="会员" name="membership">
            <el-alert v-if="detailUser.activeMembership" type="success" show-icon :closable="false">
              <template #title>{{ detailUser.activeMembership.planName }} · 到期 {{ formatDate(detailUser.activeMembership.expiredAt) }}</template>
            </el-alert>
            <EmptyState v-else description="当前不是有效会员" :image-size="72" />
            <h4 class="block-title">可用权益</h4>
            <el-table :data="detailUser.membership?.grants || []" size="small" border empty-text="暂无可用权益">
              <el-table-column prop="benefitName" label="权益" min-width="160" />
              <el-table-column prop="category" label="分类" width="90" />
              <el-table-column label="剩余额度" width="110"><template #default="{ row }">{{ row.unlimited ? '不限' : row.remainingQuota }}</template></el-table-column>
              <el-table-column label="到期" width="150"><template #default="{ row }">{{ formatDate(row.expiredAt) }}</template></el-table-column>
            </el-table>
            <h4 class="block-title">权益使用记录</h4>
            <el-table :data="detailUser.membership?.usages || []" size="small" border empty-text="暂无使用记录">
              <el-table-column prop="benefitName" label="权益" min-width="160" />
              <el-table-column prop="targetType" label="对象" width="100" />
              <el-table-column label="金额" width="100"><template #default="{ row }">{{ row.amount ? `¥${formatCents(row.amount)}` : '-' }}</template></el-table-column>
              <el-table-column label="时间" width="150"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
            </el-table>
            <h4 class="block-title">会员订单</h4>
            <el-table :data="detailUser.membership?.orders || []" size="small" border empty-text="暂无会员订单">
              <el-table-column prop="orderNo" label="订单号" min-width="160" />
              <el-table-column prop="planName" label="套餐" width="110" />
              <el-table-column prop="status" label="状态" width="90" />
              <el-table-column label="金额" width="100"><template #default="{ row }">¥{{ formatCents(row.amount) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="券与权益" name="coupons">
            <div class="detail-actions">
              <el-button size="small" type="primary" @click="openCouponDialog">发放优惠券</el-button>
            </div>
            <el-table :data="userCouponBenefitRows" size="small" border empty-text="暂无券与权益">
              <el-table-column prop="sourceLabel" label="来源" width="100" />
              <el-table-column label="名称" min-width="190">
                <template #default="{ row }">{{ row.name || '-' }}</template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="90" />
              <el-table-column prop="scope" label="适用" min-width="150" show-overflow-tooltip />
              <el-table-column prop="valueText" label="面额/额度" width="120" />
              <el-table-column label="有效/发放时间" width="180"><template #default="{ row }">{{ row.timeText }}</template></el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="风险记录" name="risk">
            <h4 class="block-title">被举报记录</h4>
            <el-table :data="detailUser.contentOverview?.reportsAgainst || []" size="small" border empty-text="暂无举报">
              <el-table-column prop="reason" label="原因" min-width="160" show-overflow-tooltip />
              <el-table-column prop="targetType" label="对象" width="90" />
              <el-table-column prop="status" label="状态" width="90" />
              <el-table-column label="时间" width="150"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
            </el-table>
            <h4 class="block-title">后台操作记录</h4>
            <el-table :data="detailUser.operationLogs || []" size="small" border empty-text="暂无后台操作">
              <el-table-column prop="operator" label="操作人" width="110" />
              <el-table-column prop="action" label="动作" width="110" />
              <el-table-column prop="module" label="模块" width="100" />
              <el-table-column label="时间" width="150"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>

    <el-dialog v-model="tagDialogVisible" title="编辑用户标签" width="460px">
      <el-alert
        v-if="!tagOptions.length"
        class="dialog-alert"
        type="info"
        :closable="false"
        title="暂无用户标签，可在下方快速创建一个标签后再保存到当前用户。"
        show-icon
      />
      <el-select v-model="tagForm.tagIds" multiple filterable placeholder="选择用户标签" style="width: 100%">
        <el-option v-for="tag in tagOptions" :key="tag.id || tag.name" :label="tag.name" :value="tag.id || tag.name" />
      </el-select>
      <div class="quick-create-row">
        <el-input v-model="quickTagName" clearable placeholder="快速新增标签，例如：高价值用户" @keyup.enter="createQuickTag" />
        <el-button :loading="tagCreating" @click="createQuickTag">新增标签</el-button>
        <el-button link type="primary" @click="goUserTagConfig">标签配置</el-button>
      </div>
      <template #footer>
        <el-button @click="tagDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="tagSaving" @click="saveUserTags">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="balanceDialogVisible" title="调整用户余额" width="480px">
      <el-form :model="balanceForm" label-width="90px">
        <el-form-item label="调整类型">
          <el-radio-group v-model="balanceForm.direction">
            <el-radio-button label="increase">增加</el-radio-button>
            <el-radio-button label="decrease">扣减</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="金额" required>
          <el-input-number v-model="balanceForm.amount" :min="0.01" :precision="2" :step="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="原因" required>
          <el-input v-model="balanceForm.reason" type="textarea" :rows="3" placeholder="例如：客服补偿、活动奖励、违规扣减" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="balanceDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="operationSaving" @click="submitBalanceAdjust">确认调整</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="couponDialogVisible" title="发放优惠券" width="560px">
      <el-alert
        v-if="couponForm.grantType === 'marketing' && !couponOptions.length"
        class="dialog-alert"
        type="warning"
        :closable="false"
        title="暂无可发放优惠券，请先创建并启用未过期、仍有库存的优惠券。"
        show-icon
      />
      <el-form :model="couponForm" label-width="100px">
        <el-form-item label="发放类型" required>
          <el-radio-group v-model="couponForm.grantType">
            <el-radio-button label="marketing">营销优惠券</el-radio-button>
            <el-radio-button label="membership">会员权益券</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-alert
          v-if="couponForm.grantType === 'membership'"
          class="dialog-alert"
          type="info"
          :closable="false"
          title="会员权益券会写入用户会员权益额度，可在小程序票夹和会员中心同步看到。"
          show-icon
        />
        <el-form-item v-if="couponForm.grantType === 'marketing'" label="优惠券" required>
          <el-select v-model="couponForm.couponId" filterable placeholder="选择可发放优惠券" style="width: 100%">
            <el-option
              v-for="coupon in couponOptions"
              :key="coupon.id"
              :label="couponOptionLabel(coupon)"
              :value="coupon.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="会员权益" required>
          <el-select v-model="couponForm.benefitKey" filterable placeholder="选择会员权益券/权益额度" style="width: 100%">
            <el-option
              v-for="benefit in grantableBenefitOptions"
              :key="benefit.key"
              :label="`${benefit.name} · ${benefit.category} · ${benefit.type}`"
              :value="benefit.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="数量" required>
          <el-input-number v-model="couponForm.quantity" :min="1" :max="100" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="couponForm.grantType === 'membership'" label="有效天数" required>
          <el-input-number v-model="couponForm.durationDays" :min="1" :max="3650" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="couponForm.grantType === 'membership' && couponForm.benefitKey === 'member_coupon_monthly'" label="券面额">
          <el-input-number v-model="couponForm.amount" :min="0" :precision="2" :step="1" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="couponForm.grantType === 'membership' && selectedBenefitType === 'discount'" label="折扣率">
          <el-input-number v-model="couponForm.discountRate" :min="0.1" :max="10" :precision="1" :step="0.1" style="width: 100%" />
          <div class="form-hint">例如 9.5 表示 9.5 折，跑腿服务费折扣会按这个值自动抵扣。</div>
        </el-form-item>
        <el-form-item v-if="couponForm.grantType === 'marketing'" label="忽略限领">
          <el-switch v-model="couponForm.ignoreLimit" />
        </el-form-item>
        <el-form-item label="原因" required>
          <el-input v-model="couponForm.reason" type="textarea" :rows="3" placeholder="例如：会员补偿、活动奖励、售后安抚" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="couponForm.grantType === 'marketing'" @click="goCouponConfig">去创建优惠券</el-button>
        <el-button @click="couponDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="couponGrantDisabled" :loading="operationSaving" @click="submitCouponGrant">确认发放</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="membershipDialogVisible" title="赠送会员" width="520px">
      <el-form :model="membershipForm" label-width="100px">
        <el-form-item label="会员套餐">
          <el-select v-model="membershipForm.planId" clearable filterable placeholder="可选，不选则按自定义名称赠送" style="width: 100%" @change="syncMembershipPlan">
            <el-option v-for="plan in membershipPlans" :key="plan.id" :label="`${plan.name} · ${plan.durationDays}天`" :value="plan.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="会员名称" required>
          <el-input v-model="membershipForm.planName" />
        </el-form-item>
        <el-form-item label="天数" required>
          <el-input-number v-model="membershipForm.days" :min="1" :max="3650" style="width: 100%" />
        </el-form-item>
        <el-form-item label="原因" required>
          <el-input v-model="membershipForm.reason" type="textarea" :rows="3" placeholder="例如：运营赠送、投诉补偿、活动奖励" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="membershipDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="operationSaving" @click="submitMembershipGrant">确认赠送</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="regionDialogVisible" title="变更归属区域" width="480px">
      <el-form :model="regionForm" label-width="90px">
        <el-form-item label="归属区域" required>
          <el-select v-model="regionForm.regionId" filterable placeholder="选择区域" style="width: 100%">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="原因" required>
          <el-input v-model="regionForm.reason" type="textarea" :rows="3" placeholder="例如：用户主动切换、运营迁移、区域纠错" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="regionDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="operationSaving" @click="submitRegionChange">确认变更</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showRobotDialog" title="添加机器人用户" width="600px">
      <el-form :model="robotForm" label-width="120px">
        <el-form-item label="所属区域" required>
          <el-select v-model="robotForm.regionId" placeholder="选择区域" style="width: 100%">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="机器人数量" required>
          <el-input-number v-model="robotForm.count" :min="1" :max="500" style="width: 100%" />
        </el-form-item>
        <el-form-item label="昵称前缀">
          <el-input v-model="robotForm.nicknamePrefix" placeholder="萌友" />
        </el-form-item>
        <el-form-item label="性别">
          <el-select v-model="robotForm.gender" style="width: 100%">
            <el-option label="随机" value="random" />
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
          </el-select>
        </el-form-item>
        <el-form-item label="头像生成">
          <el-select v-model="robotForm.avatarMode" style="width: 100%">
            <el-option label="随机头像" value="random" />
            <el-option label="使用默认头像" value="default" />
          </el-select>
        </el-form-item>
        <el-form-item label="是否启用">
          <el-switch v-model="robotForm.enabled" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="robotForm.remark" type="textarea" :rows="2" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRobotDialog = false">取消</el-button>
        <el-button type="primary" :loading="robotLoading" @click="handleCreateRobots">确认创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus, Open, Close, Lock, Download } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import EmptyState from '@/components/common/EmptyState.vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import SearchPanel from '@/components/glass/SearchPanel.vue'
import {
  fetchModulePage,
  fetchUserStats,
  createRobots,
  fetchUserDetail,
  fetchRegions,
  runModuleAction,
  exportRows,
  fetchUserTags,
  createUserTag,
  setUserTags,
  adjustUserBalance,
  fetchUserCouponOptions,
  fetchMembershipBenefitCatalog,
  grantUserCoupons,
  grantUserMembershipBenefit,
  grantUserMembership,
  updateUserRegion,
  fetchMembershipPlans,
  fetchConfigGroup,
} from '@/api/admin'
import type { SearchField } from '@/types/admin'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canAdjustBalance = computed(() => auth.user.role === '超级管理员' || auth.permissions.includes('finance:balance-adjust'))
const loading = ref(false)
const users = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedRows = ref<any[]>([])
const ipGeoDisplay = reactive({ enabled: false, showCountry: true, showProvince: true, showCity: true, showDistrict: false })
const ipLocationColumnLabel = computed(() => {
  const labels = [
    ipGeoDisplay.showCountry ? '国家/地区' : '',
    ipGeoDisplay.showProvince ? '省/州/区域' : '',
    ipGeoDisplay.showCity ? '城市' : '',
    ipGeoDisplay.showDistrict ? '区/县' : '',
  ].filter(Boolean)
  return labels.length ? `登录属地（${labels.join('、')}）` : '登录属地'
})

const routeParam = (key: string) => {
  const value = route.query[key]
  return Array.isArray(value) ? String(value[0] || '') : String(value || '')
}

const lastQuery = ref<Record<string, any>>(routeParam('userId') ? { userId: routeParam('userId') } : {})

const stats = ref({
  totalUsers: 0,
  realUsers: 0,
  robotUsers: 0,
  todayNewUsers: 0,
  verifiedUsers: 0,
  disabledUsers: 0,
  activeUsers: 0,
  memberUsers: 0,
  riskUsers: 0,
})

const statsItems = computed(() => [
  { label: '总用户数', value: stats.value.totalUsers.toLocaleString(), delta: '-', tone: 'blue' as const, icon: 'User' },
  { label: '真实用户', value: stats.value.realUsers.toLocaleString(), delta: '-', tone: 'green' as const, icon: 'UserFilled' },
  { label: '有效会员', value: (stats.value.memberUsers || 0).toLocaleString(), delta: '-', tone: 'purple' as const, icon: 'Avatar' },
  { label: '7日活跃', value: (stats.value.activeUsers || 0).toLocaleString(), delta: '-', tone: 'cyan' as const, icon: 'TrendCharts' },
  { label: '今日新增', value: stats.value.todayNewUsers.toLocaleString(), delta: '-', tone: 'orange' as const, icon: 'Plus' },
  { label: '风险用户', value: (stats.value.riskUsers || stats.value.disabledUsers || 0).toLocaleString(), delta: '-', tone: 'red' as const, icon: 'Warning' },
])

const searchFields: SearchField[] = [
  { key: 'keyword', label: '关键词', type: 'input', placeholder: '搜索昵称、手机号、UID、openid' },
  { key: 'userId', label: '用户ID', type: 'input', placeholder: '精确搜索UID' },
  { key: 'userType', label: '用户类型', type: 'select', options: [
    { label: '全部', value: '' },
    { label: '小程序用户', value: 'normal' },
    { label: '机器人用户', value: 'robot' },
    { label: '商家用户', value: 'merchant' },
    { label: '骑手用户', value: 'rider' },
    { label: '区域代理', value: 'agent' },
  ]},
  { key: 'regionId', label: '区域筛选', type: 'select', options: [] },
  { key: 'studentCertStatus', label: '学生认证', type: 'select', options: [
    { label: '全部', value: '' },
    { label: '未认证', value: 'none' },
    { label: '待审核', value: 'pending' },
    { label: '已认证', value: 'approved' },
    { label: '已驳回', value: 'rejected' },
  ]},
  { key: 'status', label: '账号状态', type: 'select', options: [
    { label: '全部', value: '' },
    { label: '正常', value: 'active' },
    { label: '禁用', value: 'disabled' },
    { label: '封禁', value: 'banned' },
  ]},
  { key: 'balanceSort', label: '余额排序', type: 'select', options: [
    { label: '默认', value: '' },
    { label: '余额从高到低', value: 'desc' },
    { label: '余额从低到高', value: 'asc' },
  ]},
  { key: 'startDate', label: '注册开始时间', type: 'date' },
  { key: 'endDate', label: '注册结束时间', type: 'date' },
  { key: 'lastLoginStart', label: '最后登录开始', type: 'date' },
  { key: 'lastLoginEnd', label: '最后登录结束', type: 'date' },
  { key: 'loginIp', label: '登录IP', type: 'input', placeholder: '按最近登录IP搜索' },
  { key: 'loginDevice', label: '登录设备', type: 'input', placeholder: '按手机型号/系统搜索' },
]

const detailVisible = ref(false)
const detailUser = ref<any>(null)
const detailTab = ref('overview')
const tagDialogVisible = ref(false)
const tagSaving = ref(false)
const tagCreating = ref(false)
const tagOptions = ref<any[]>([])
const tagForm = reactive({ tagIds: [] as string[] })
const quickTagName = ref('')
const operationSaving = ref(false)
const balanceDialogVisible = ref(false)
const couponDialogVisible = ref(false)
const membershipDialogVisible = ref(false)
const regionDialogVisible = ref(false)
const couponOptions = ref<any[]>([])
const benefitCatalog = ref<any[]>([])
const membershipPlans = ref<any[]>([])
const balanceForm = reactive({ direction: 'increase', amount: 1, reason: '' })
const couponForm = reactive({ grantType: 'marketing', couponId: '', benefitKey: '', quantity: 1, durationDays: 30, amount: 5, discountRate: 9.5, ignoreLimit: false, reason: '' })
const membershipForm = reactive({ planId: '', planName: '运营赠送会员', days: 30, reason: '' })
const regionForm = reactive({ regionId: '', reason: '' })

const showRobotDialog = ref(false)
const robotLoading = ref(false)
const robotForm = reactive({
  regionId: '',
  count: 10,
  nicknamePrefix: '萌友',
  gender: 'random',
  avatarMode: 'random',
  enabled: true,
  remark: '',
})

const regions = ref<any[]>([])
const grantableBenefitOptions = computed(() => benefitCatalog.value.filter((item: any) => ['quota', 'limit', 'discount', 'flag'].includes(item.type)))
const selectedBenefitMeta = computed(() => benefitCatalog.value.find((item: any) => item.key === couponForm.benefitKey) || null)
const selectedBenefitType = computed(() => selectedBenefitMeta.value?.type || '')
const couponGrantDisabled = computed(() => {
  if (couponForm.grantType === 'marketing') return !couponOptions.value.length
  return !grantableBenefitOptions.value.length
})

const benefitScopeMap: Record<string, string> = {
  delivery_free_quota: '外卖/小店配送费',
  member_coupon_monthly: '优惠券钱包/平台订单',
  mall_member_price: '商城/外卖会员价',
  errand_service_discount: '跑腿订单服务费',
  post_pin_free_quota: '帖子置顶',
  activity_ticket_coupon_monthly: '活动报名券',
  activity_ticket_discount: '活动付费票',
}

const couponBusinessScopeLabels: Record<string, string> = {
  all: '通用',
  shop: '外卖/小店',
  mall: '商城',
  errand: '跑腿',
  activity: '活动',
  membership: '会员权益',
}

function couponBusinessScopeLabel(scope: any) {
  return couponBusinessScopeLabels[String(scope || 'all')] || '通用'
}

function couponOptionLabel(coupon: any) {
  return `${coupon.name} · ${couponBusinessScopeLabel(coupon.businessScope)} · 剩余 ${coupon.remainCount}`
}

const userCouponBenefitRows = computed(() => {
  const coupons = (detailUser.value?.coupons || []).map((item: any) => ({
    id: `coupon-${item.id}`,
    sourceLabel: '优惠券',
    name: item.coupon?.name || '优惠券',
    status: item.status || '-',
    scope: couponBusinessScopeLabel(item.coupon?.businessScope),
    valueText: `¥${formatCents(item.coupon?.value)}`,
    timeText: `${formatDate(item.createdAt)} / 至 ${formatDate(item.coupon?.endAt)}`,
  }))
  const grants = (detailUser.value?.membership?.grants || []).map((item: any) => {
    const remain = item.unlimited ? '不限' : `${Number(item.remainingQuota || 0)}/${Number(item.totalQuota || 0)}`
    const valueText = item.discountRate ? `${Number(item.discountRate)}折` : (item.amount ? `¥${formatCents(item.amount)}` : remain)
    return {
      id: `benefit-${item.id}`,
      sourceLabel: '会员权益',
      name: item.benefitName || item.benefitKey || '会员权益',
      status: item.status || 'active',
      scope: benefitScopeMap[item.benefitKey] || item.category || '会员权益',
      valueText,
      timeText: `${formatDate(item.startedAt || item.createdAt)} / 至 ${formatDate(item.expiredAt)}`,
    }
  })
  return [...coupons, ...grants]
})

function formatDate(date: string | Date | null | undefined) {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatCents(value: any) {
  const amount = Number(value)
  return Number.isFinite(amount) ? (amount / 100).toFixed(2) : '0.00'
}

function uidText(user: any) {
  const uid = user?.uid || user?.publicUid || user?.public_uid || user?.displayUid
  return uid ? `UID ${uid}` : (user?.id ? String(user.id).slice(0, 8) : '-')
}

function formatIpLocation(user: any) {
  const values = [
    ipGeoDisplay.showCountry ? user?.lastLoginCountry : '',
    ipGeoDisplay.showProvince ? user?.lastLoginProvince : '',
    ipGeoDisplay.showCity ? user?.lastLoginCity : '',
    ipGeoDisplay.showDistrict ? user?.lastLoginDistrict : '',
  ].filter(Boolean)
  return values.join(' ') || '-'
}

function certTagType(status: string) {
  const map: Record<string, string> = { approved: 'success', pending: 'warning', rejected: 'danger', none: 'info' }
  return map[status] || 'info'
}

function certLabel(status: string) {
  const map: Record<string, string> = { approved: '已认证', pending: '待审核', rejected: '已驳回', none: '未认证' }
  return map[status] || '未认证'
}

function statusTagType(status: string) {
  const map: Record<string, string> = { active: 'success', banned: 'danger', disabled: 'warning' }
  return map[status] || 'info'
}

function statusLabel(status: string) {
  const map: Record<string, string> = { active: '正常', banned: '封禁', disabled: '禁用' }
  return map[status] || '未知'
}

function regionSourceLabel(source: string) {
  const map: Record<string, string> = {
    profile: '正式归属',
    address: '默认地址推断',
    robot: '机器人区域',
    post: '内容发布区域',
    profile_text: '资料文本推断',
    none: '未设置',
  }
  return map[source] || '未设置'
}

function goUserTagConfig() {
  router.push('/user/tags')
}

function goCouponConfig() {
  router.push('/marketing/coupons')
}

async function loadStats() {
  try {
    const data = await fetchUserStats()
    if (data) stats.value = data as any
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function loadRegions() {
  try {
    const data = await fetchRegions()
    regions.value = Array.isArray(data) ? data : []
    const regionField = searchFields.find(f => f.key === 'regionId')
    if (regionField) {
      regionField.options = [{ label: '全部', value: '' }, ...regions.value.map(r => ({ label: r.name, value: r.id }))]
    }
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function loadIpGeoDisplay() {
  try {
    const res: any = await fetchConfigGroup('ip_geo')
    const data = res?.data || res
    const config = data?.ip_geo || data
    if (config && typeof config === 'object') Object.assign(ipGeoDisplay, config)
  } catch {
    // 未配置时按关闭处理，用户列表不显示空的属地列。
  }
}

async function loadTagOptions() {
  try {
    tagOptions.value = await fetchUserTags()
  } catch (e: any) {
    tagOptions.value = []
  }
}

async function loadCouponOptions() {
  try {
    const res: any = await fetchUserCouponOptions()
    couponOptions.value = Array.isArray(res) ? res : (res?.list || [])
  } catch {
    couponOptions.value = []
  }
}

async function loadMembershipBenefitCatalog() {
  try {
    const res: any = await fetchMembershipBenefitCatalog()
    benefitCatalog.value = Array.isArray(res) ? res : (res?.list || [])
  } catch {
    benefitCatalog.value = []
  }
}

async function loadMembershipPlans() {
  try {
    const res: any = await fetchMembershipPlans()
    membershipPlans.value = Array.isArray(res) ? res : (res?.list || [])
  } catch {
    membershipPlans.value = []
  }
}

async function loadUsers() {
  loading.value = true
  try {
    const params = { ...lastQuery.value, page: page.value, pageSize: pageSize.value }
    const data = await fetchModulePage('users', params)
    users.value = data.rows
    total.value = data.total
  } catch (e: any) {
    ElMessage.error('加载用户列表失败: ' + (e?.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

function onSearch(params: Record<string, any>) {
  lastQuery.value = params
  page.value = 1
  loadUsers()
}

function handleSelectionChange(rows: any[]) {
  selectedRows.value = rows
}

async function loadUserDetail(id: string) {
  try {
    const data = await fetchUserDetail(id)
    detailUser.value = data
    detailTab.value = 'overview'
    detailVisible.value = true
  } catch (e: any) {
    ElMessage.error('加载用户详情失败: ' + (e?.message || '未知错误'))
  }
}

function openDetail(row: any) {
  loadUserDetail(row.id)
}

function goUserPosts() {
  if (!detailUser.value?.id) return
  router.push({ path: '/content/posts', query: { userId: detailUser.value.id } })
}

function goUserComments() {
  if (!detailUser.value?.id) return
  router.push({ path: '/content/comments', query: { userId: detailUser.value.id } })
}

function goContentAudit() {
  router.push({ path: '/content/audit', query: { userId: detailUser.value?.id || '' } })
}

function goMembership() {
  if (!detailUser.value?.id) return
  router.push({ path: '/membership/overview', query: { userId: detailUser.value.id } })
}

function goWalletLogs() {
  if (!detailUser.value?.id) return
  router.push({ path: '/finance/wallet-logs', query: { userId: detailUser.value.id } })
}

function goPrivateMessages() {
  if (!detailUser.value?.id) return
  router.push({ path: '/user/private-messages', query: { userId: detailUser.value.id, keyword: detailUser.value.uid || detailUser.value.nickname || '' } })
}

function openTagDialog() {
  if (!detailUser.value?.id) return
  tagForm.tagIds = (detailUser.value.tags || []).map((tag: any) => String(tag.id || tag.name)).filter(Boolean)
  quickTagName.value = ''
  tagDialogVisible.value = true
}

function openBalanceDialog() {
  balanceForm.direction = 'increase'
  balanceForm.amount = 1
  balanceForm.reason = ''
  balanceDialogVisible.value = true
}

async function openCouponDialog() {
  await Promise.all([loadCouponOptions(), loadMembershipBenefitCatalog()])
  couponForm.grantType = 'marketing'
  couponForm.couponId = ''
  couponForm.benefitKey = 'member_coupon_monthly'
  couponForm.quantity = 1
  couponForm.durationDays = 30
  couponForm.amount = 5
  couponForm.ignoreLimit = false
  couponForm.reason = ''
  couponDialogVisible.value = true
}

async function openMembershipDialog() {
  await loadMembershipPlans()
  membershipForm.planId = ''
  membershipForm.planName = '运营赠送会员'
  membershipForm.days = 30
  membershipForm.reason = ''
  membershipDialogVisible.value = true
}

function openRegionDialog() {
  regionForm.regionId = detailUser.value?.ownedRegionId || detailUser.value?.regionId || ''
  regionForm.reason = ''
  regionDialogVisible.value = true
}

function syncMembershipPlan() {
  const plan = membershipPlans.value.find((item: any) => item.id === membershipForm.planId)
  if (!plan) return
  membershipForm.planName = plan.name
  membershipForm.days = Number(plan.durationDays || 30)
}

async function refreshCurrentUser() {
  if (detailUser.value?.id) await loadUserDetail(detailUser.value.id)
  await loadUsers()
  await loadStats()
}

async function saveUserTags() {
  if (!detailUser.value?.id) return
  tagSaving.value = true
  try {
    await setUserTags(detailUser.value.id, tagForm.tagIds)
    ElMessage.success('标签已保存')
    tagDialogVisible.value = false
    await loadUserDetail(detailUser.value.id)
    await loadUsers()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存标签失败')
  } finally {
    tagSaving.value = false
  }
}

async function createQuickTag() {
  const name = quickTagName.value.trim()
  if (!name) {
    ElMessage.warning('请填写标签名称')
    return
  }
  tagCreating.value = true
  try {
    const res: any = await createUserTag({ name })
    await loadTagOptions()
    const created = res?.data || res
    const tag = tagOptions.value.find((item: any) => item.name === name) || created
    const value = String(tag?.id || tag?.name || name)
    if (!tagForm.tagIds.includes(value)) tagForm.tagIds.push(value)
    quickTagName.value = ''
    ElMessage.success('标签已创建')
  } catch (e: any) {
    ElMessage.error(e?.message || '创建标签失败')
  } finally {
    tagCreating.value = false
  }
}

async function submitBalanceAdjust() {
  if (!detailUser.value?.id) return
  if (!balanceForm.reason.trim()) { ElMessage.warning('请填写调整原因'); return }
  operationSaving.value = true
  try {
    const signedAmount = balanceForm.direction === 'decrease' ? -Math.abs(balanceForm.amount) : Math.abs(balanceForm.amount)
    await adjustUserBalance({ userId: detailUser.value.id, amount: signedAmount, reason: balanceForm.reason })
    ElMessage.success('余额已调整')
    balanceDialogVisible.value = false
    await refreshCurrentUser()
  } catch (e: any) {
    ElMessage.error(e?.message || '余额调整失败')
  } finally {
    operationSaving.value = false
  }
}

async function submitCouponGrant() {
  if (!detailUser.value?.id) return
  if (couponForm.grantType === 'marketing' && !couponForm.couponId) { ElMessage.warning('请选择优惠券'); return }
  if (couponForm.grantType === 'membership' && !couponForm.benefitKey) { ElMessage.warning('请选择会员权益券'); return }
  if (!couponForm.reason.trim()) { ElMessage.warning('请填写发放原因'); return }
  operationSaving.value = true
  try {
    if (couponForm.grantType === 'membership') {
      await grantUserMembershipBenefit(detailUser.value.id, {
        benefitKey: couponForm.benefitKey,
        quantity: couponForm.quantity,
        durationDays: couponForm.durationDays,
        amount: couponForm.amount,
        discountRate: selectedBenefitType.value === 'discount' ? couponForm.discountRate : undefined,
        reason: couponForm.reason,
      })
      ElMessage.success('会员权益券已发放')
    } else {
      await grantUserCoupons(detailUser.value.id, couponForm)
      ElMessage.success('优惠券已发放')
    }
    couponDialogVisible.value = false
    await loadCouponOptions()
    await refreshCurrentUser()
  } catch (e: any) {
    ElMessage.error(e?.message || '优惠券发放失败')
  } finally {
    operationSaving.value = false
  }
}

async function submitMembershipGrant() {
  if (!detailUser.value?.id) return
  if (!membershipForm.planName.trim()) { ElMessage.warning('请输入会员名称'); return }
  if (!membershipForm.reason.trim()) { ElMessage.warning('请填写赠送原因'); return }
  operationSaving.value = true
  try {
    const plan = membershipPlans.value.find((item: any) => item.id === membershipForm.planId)
    await grantUserMembership(detailUser.value.id, {
      planName: membershipForm.planName,
      days: membershipForm.days,
      level: plan?.level || 1,
      entitlements: plan?.entitlements,
      reason: membershipForm.reason,
    })
    ElMessage.success('会员已赠送')
    membershipDialogVisible.value = false
    await refreshCurrentUser()
  } catch (e: any) {
    ElMessage.error(e?.message || '会员赠送失败')
  } finally {
    operationSaving.value = false
  }
}

async function submitRegionChange() {
  if (!detailUser.value?.id) return
  if (!regionForm.regionId) { ElMessage.warning('请选择归属区域'); return }
  if (!regionForm.reason.trim()) { ElMessage.warning('请填写变更原因'); return }
  operationSaving.value = true
  try {
    await updateUserRegion(detailUser.value.id, regionForm)
    ElMessage.success('归属区域已变更')
    regionDialogVisible.value = false
    await refreshCurrentUser()
  } catch (e: any) {
    ElMessage.error(e?.message || '区域变更失败')
  } finally {
    operationSaving.value = false
  }
}

async function toggleStatus(row: any) {
  const newStatus = row.status === 'active' ? 'disabled' : 'active'
  const label = newStatus === 'active' ? '启用' : '禁用'
  try {
    await ElMessageBox.confirm(`确认${label}用户 "${row.nickname || row.id}" 吗？`, '确认操作', { type: 'warning' })
    await runModuleAction('users', 'update', { row, data: { status: newStatus } })
    ElMessage.success(`${label}成功`)
    loadUsers()
    loadStats()
    if (detailVisible.value && detailUser.value?.id === row.id) loadUserDetail(row.id)
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

async function toggleBan(row: any) {
  const isBanned = row.status === 'banned'
  const label = isBanned ? '解封' : '封禁'
  try {
    const { value: reason } = await ElMessageBox.prompt(`确认${label}用户 "${row.nickname || row.id}" 吗？`, label + '用户', {
      inputType: 'textarea',
      inputPlaceholder: '请输入原因（可选）',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    }).catch(() => ({ value: '' }))
    await runModuleAction('users', 'update', { row, data: { status: isBanned ? 'active' : 'banned' } })
    ElMessage.success(`${label}成功`)
    loadUsers()
    loadStats()
    if (detailVisible.value && detailUser.value?.id === row.id) loadUserDetail(row.id)
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

async function batchAction(action: string) {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择要操作的用户')
    return
  }
  const labels: Record<string, string> = { enable: '启用', disable: '禁用', ban: '封禁' }
  const label = labels[action] || action
  try {
    await ElMessageBox.confirm(`确认对 ${selectedRows.value.length} 个用户执行「${label}」操作吗？`, '批量操作', { type: 'warning' })
    await runModuleAction('users', `batch${action.charAt(0).toUpperCase() + action.slice(1)}` as any, { rows: selectedRows.value })
    ElMessage.success('操作成功')
    loadUsers()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

function handleExport() {
  exportRows('用户数据', users.value)
}

async function handleCreateRobots() {
  if (!robotForm.regionId) {
    ElMessage.warning('请选择所属区域')
    return
  }
  robotLoading.value = true
  try {
    const res = await createRobots(robotForm)
    ElMessage.success(`成功创建 ${(res as any)?.created || 0} 个机器人用户`)
    showRobotDialog.value = false
    loadUsers()
    loadStats()
  } catch (e: any) {
    ElMessage.error('创建失败: ' + (e?.message || '未知错误'))
  } finally {
    robotLoading.value = false
  }
}

onMounted(() => {
  loadStats()
  loadRegions()
  loadIpGeoDisplay()
  loadTagOptions()
  loadCouponOptions()
  loadMembershipPlans()
  loadUsers()
})
</script>

<style scoped>
.page-main-col {
  display: grid;
  gap: 24px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.nickname {
  font-weight: 600;
  font-size: 14px;
}

.user-id {
  font-size: 12px;
  color: var(--mx-muted);
}

.region-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.data-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.tag-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.money {
  color: var(--el-color-warning);
  font-weight: 600;
}

.id-text {
  font-size: 12px;
  color: var(--mx-muted);
  word-break: break-all;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-profile {
  display: flex;
  gap: 14px;
  padding: 14px;
  margin-bottom: 14px;
  background: var(--mx-soft);
  border: 1px solid var(--mx-border);
  border-radius: 6px;
}

.detail-profile-main {
  flex: 1;
  min-width: 0;
}

.profile-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--mx-text);
}

.profile-sub {
  margin-top: 6px;
  color: var(--mx-sub);
  font-size: 13px;
}

.profile-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.mini-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.mini-stat {
  padding: 12px;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  background: var(--mx-card);
}

.mini-stat span {
  display: block;
  color: var(--mx-sub);
  font-size: 12px;
}

.mini-stat strong {
  display: block;
  margin-top: 6px;
  color: var(--mx-text);
  font-size: 18px;
}

.block-title {
  margin: 18px 0 10px;
  font-size: 14px;
  color: var(--mx-text);
}

.detail-section h4 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--mx-border);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item-wide {
  grid-column: 1 / -1;
}

.detail-item .label {
  font-size: 12px;
  color: var(--mx-muted);
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.dialog-alert {
  margin-bottom: 12px;
}

.quick-create-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  margin-top: 12px;
  align-items: center;
}

.muted {
  color: var(--mx-muted);
  font-size: 13px;
}
</style>

<template>
  <div class="page-shell">
    <PageHeader title="会员运营" subtitle="管理会员套餐、订单、有效会员和手动赠送" icon="Crown">
      <template #actions>
        <el-button v-if="hasEditPermission" type="primary" @click="openPlan()">新增套餐</el-button>
        <el-button v-if="hasGrantPermission" @click="openGrant">赠送会员</el-button>
      </template>
    </PageHeader>

    <div class="metric-grid">
      <MetricCard label="上架套餐" :value="overview.planCount || 0" icon="Tickets" tone="blue" />
      <MetricCard label="有效会员" :value="overview.activeUsers || 0" icon="User" tone="green" />
      <MetricCard label="会员收入" :value="`¥${overview.revenue || 0}`" icon="Money" tone="orange" />
      <MetricCard label="平台补贴" :value="`¥${subsidyOverview.amount || 0}`" icon="Wallet" tone="cyan" />
      <MetricCard label="待支付订单" :value="overview.pendingOrders || 0" icon="Clock" tone="cyan" />
      <MetricCard label="有效权益额度" :value="overview.grantCount || 0" icon="Medal" tone="purple" />
      <MetricCard label="权益使用次数" :value="overview.usageCount || 0" icon="DataAnalysis" tone="blue" />
    </div>

    <el-tabs v-model="activeTab" class="ops-tabs" @tab-change="loadCurrent">
      <el-tab-pane label="套餐配置" name="plans">
        <el-table :data="plans" v-loading="loading" border stripe>
          <el-table-column prop="name" label="套餐" min-width="150" />
          <el-table-column prop="code" label="编码" width="120" />
          <el-table-column prop="level" label="等级" width="80" />
          <el-table-column label="价格" width="130">
            <template #default="{ row }">¥{{ row.price }}</template>
          </el-table-column>
          <el-table-column prop="durationDays" label="有效天数" width="110" />
          <el-table-column label="权益" min-width="240">
            <template #default="{ row }">
              <el-tag v-for="item in row.benefits.slice(0, 5)" :key="item" class="benefit-tag" type="info">{{ item }}</el-tag>
              <el-tag v-if="row.benefits.length > 5" class="benefit-tag" type="warning">+{{ row.benefits.length - 5 }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="次数/折扣" min-width="220">
            <template #default="{ row }">
              <div v-for="item in row.entitlements?.filter((i:any) => i.enabled).slice(0, 4)" :key="item.key" class="quota-line">
                {{ item.name }}：{{ formatEntitlementValue(item) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? '上架' : '下架' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openPlan(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="deletePlan(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="权益展示" name="display">
        <div class="filter-bar">
          <el-button type="primary" @click="openDisplayItem()">新增权益卡片</el-button>
          <el-button @click="loadDisplayItems">刷新</el-button>
        </div>
        <el-table :data="displayItems" v-loading="loading" border stripe>
          <el-table-column label="卡片" min-width="260">
            <template #default="{ row }">
              <div class="display-preview">
                <img :src="row.imageUrl || '/static/logo.jpg'" alt="" />
                <div>
                  <b>{{ row.title }}</b>
                  <p>{{ row.subtitle || '-' }}</p>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="benefitKey" label="绑定权益" min-width="190" />
          <el-table-column label="适用板块" min-width="180">
            <template #default="{ row }">{{ benefitLanding(row.benefitKey).scope }}</template>
          </el-table-column>
          <el-table-column label="消耗方式" min-width="160">
            <template #default="{ row }">{{ benefitLanding(row.benefitKey).consume }}</template>
          </el-table-column>
          <el-table-column label="落地状态" width="120">
            <template #default="{ row }">
              <el-tag :type="benefitLanding(row.benefitKey).statusType" effect="light">
                {{ benefitLanding(row.benefitKey).status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="展示值" width="150">
            <template #default="{ row }">{{ row.priceText || '-' }} <span class="muted">{{ row.originalPriceText }}</span></template>
          </el-table-column>
          <el-table-column prop="buttonText" label="按钮" width="100" />
          <el-table-column prop="actionUrl" label="跳转" min-width="220" show-overflow-tooltip />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="row.isEnabled ? 'success' : 'info'">{{ row.isEnabled ? '显示' : '隐藏' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="80" />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openDisplayItem(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="deleteDisplayItem(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="常见问题" name="faqs">
        <div class="filter-bar">
          <el-button type="primary" @click="openFaq()">新增问题</el-button>
          <el-button @click="loadFaqs">刷新</el-button>
        </div>
        <el-table :data="faqs" v-loading="loading" border stripe>
          <el-table-column prop="question" label="问题" min-width="220" />
          <el-table-column prop="answer" label="答案" min-width="360" show-overflow-tooltip />
          <el-table-column prop="scene" label="适用端" width="110" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="row.isEnabled ? 'success' : 'info'">{{ row.isEnabled ? '启用' : '停用' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="80" />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openFaq(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="deleteFaq(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="订单记录" name="orders">
        <div class="filter-bar">
          <el-input v-model="orderQuery.keyword" placeholder="订单号/套餐名" clearable style="width: 240px" @keyup.enter="loadOrders" />
          <el-select v-model="orderQuery.status" placeholder="状态" clearable style="width: 160px">
            <el-option label="待支付" value="pending" />
            <el-option label="已支付" value="paid" />
            <el-option label="已取消" value="cancelled" />
            <el-option label="已关闭" value="closed" />
            <el-option label="已退款" value="refunded" />
            <el-option label="支付失败" value="failed" />
          </el-select>
          <el-button @click="loadOrders">查询</el-button>
        </div>
        <el-table :data="orders" v-loading="loading" border stripe>
          <el-table-column prop="orderNo" label="订单号" min-width="170" />
          <el-table-column label="用户" min-width="150"><template #default="{ row }">{{ row.user?.nickname || row.userId }}</template></el-table-column>
          <el-table-column prop="planName" label="套餐" width="140" />
          <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ row.amount }}</template></el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="orderStatusType(row.status)" effect="light">
                {{ orderStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="paymentNo" label="支付单号" min-width="160" />
          <el-table-column prop="createdAt" label="创建时间" min-width="180" />
          <el-table-column v-if="hasRefundPermission || hasGrantPermission" label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button v-if="hasRefundPermission && row.status === 'paid'" type="danger" size="small" @click="refundMembershipOrder(row)">退款</el-button>
              <el-button v-if="hasGrantPermission && ['paid', 'refunding', 'refunded'].includes(row.status) && !row.membership" size="small" @click="linkHistoricalMembershipOrder(row)">关联会员</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination v-model:current-page="orderQuery.page" v-model:page-size="orderQuery.pageSize" :total="orderTotal" layout="total, sizes, prev, pager, next" @current-change="loadOrders" @size-change="loadOrders" />
      </el-tab-pane>

      <el-tab-pane label="有效会员" name="users">
        <el-table :data="members" v-loading="loading" border stripe>
          <el-table-column label="用户" min-width="160"><template #default="{ row }">{{ row.user?.nickname || row.userId }}</template></el-table-column>
          <el-table-column prop="planName" label="会员" width="150" />
          <el-table-column prop="level" label="等级" width="80" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="memberStatusType(row.status)" effect="light">
                {{ memberStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="剩余天数" width="110"><template #default="{ row }">{{ row.membership?.remainingDays ?? '-' }}</template></el-table-column>
          <el-table-column prop="expiredAt" label="到期时间" min-width="180" />
          <el-table-column prop="source" label="来源" min-width="140" />
          <el-table-column v-if="hasGrantPermission" label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="adjustMembershipExpiry(row)">调整期限</el-button>
              <el-button v-if="row.status === 'active'" type="danger" size="small" @click="revokeMembership(row)">撤销</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination v-model:current-page="memberQuery.page" v-model:page-size="memberQuery.pageSize" :total="memberTotal" layout="total, sizes, prev, pager, next" @current-change="loadMembers" @size-change="loadMembers" />
      </el-tab-pane>

      <el-tab-pane label="权益使用记录" name="usage">
        <div class="filter-bar">
          <el-select v-model="usageQuery.benefitKey" placeholder="权益类型" clearable filterable style="width: 260px">
            <el-option v-for="item in benefitCatalog" :key="item.key" :label="item.name" :value="item.key" />
          </el-select>
          <el-input v-model="usageQuery.userId" placeholder="用户ID" clearable style="width: 240px" @keyup.enter="loadUsage" />
          <el-button @click="loadUsage">查询</el-button>
        </div>
        <el-table :data="usageList" v-loading="loading" border stripe>
          <el-table-column label="用户" min-width="160"><template #default="{ row }">{{ row.user?.nickname || row.userId }}</template></el-table-column>
          <el-table-column prop="benefitName" label="权益" min-width="180" />
          <el-table-column prop="category" label="分类" width="130" />
          <el-table-column prop="quantity" label="扣减" width="80" />
          <el-table-column label="对象" min-width="160"><template #default="{ row }">{{ row.targetType || '-' }} {{ row.targetId || '' }}</template></el-table-column>
          <el-table-column prop="createdAt" label="使用时间" min-width="180" />
        </el-table>
        <el-pagination v-model:current-page="usageQuery.page" v-model:page-size="usageQuery.pageSize" :total="usageTotal" layout="total, sizes, prev, pager, next" @current-change="loadUsage" @size-change="loadUsage" />
      </el-tab-pane>

      <el-tab-pane label="补贴账本" name="subsidies">
        <div class="subsidy-summary">
          <div>
            <b>补贴总额</b>
            <strong>¥{{ subsidyOverview.amount || 0 }}</strong>
          </div>
          <div>
            <b>补贴笔数</b>
            <strong>{{ subsidyOverview.count || 0 }}</strong>
          </div>
          <div>
            <b>补给骑手</b>
            <strong>¥{{ subsidyReceiverAmount('rider') }}</strong>
          </div>
          <div>
            <b>补给商家</b>
            <strong>¥{{ subsidyReceiverAmount('merchant') }}</strong>
          </div>
        </div>
        <div class="filter-bar">
          <el-input v-model="subsidyQuery.keyword" placeholder="补贴单/订单号/用户ID" clearable style="width: 240px" @keyup.enter="loadSubsidies" />
          <el-select v-model="subsidyQuery.sourceType" placeholder="补贴来源" clearable style="width: 150px">
            <el-option label="会员权益" value="membership" />
            <el-option label="优惠券" value="coupon" />
            <el-option label="新用户活动" value="new_user" />
            <el-option label="拉新活动" value="referral" />
            <el-option label="运营活动" value="campaign" />
          </el-select>
          <el-select v-model="subsidyQuery.receiverType" placeholder="补贴对象" clearable style="width: 140px">
            <el-option label="骑手" value="rider" />
            <el-option label="商家" value="merchant" />
            <el-option label="平台" value="platform" />
            <el-option label="用户" value="user" />
          </el-select>
          <el-select v-model="subsidyQuery.status" placeholder="状态" clearable style="width: 140px">
            <el-option label="待结算" value="pending" />
            <el-option label="已锁定" value="locked" />
            <el-option label="已结算" value="settled" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
          <el-button @click="loadSubsidies">查询</el-button>
        </div>
        <el-table :data="subsidies" v-loading="loading" border stripe>
          <el-table-column prop="subsidyNo" label="补贴单号" min-width="180" />
          <el-table-column label="来源" width="120"><template #default="{ row }">{{ row.sourceText || row.sourceType }}</template></el-table-column>
          <el-table-column prop="benefitKey" label="权益键" min-width="170" />
          <el-table-column label="订单" min-width="170"><template #default="{ row }">{{ row.orderNo || row.orderId }}</template></el-table-column>
          <el-table-column label="对象" width="100"><template #default="{ row }">{{ row.receiverText || row.receiverType }}</template></el-table-column>
          <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ row.amount }}</template></el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }"><el-tag :type="subsidyStatusType(row.status)" effect="light">{{ row.statusText || row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="description" label="说明" min-width="210" show-overflow-tooltip />
          <el-table-column prop="createdAt" label="创建时间" min-width="180" />
        </el-table>
        <el-pagination v-model:current-page="subsidyQuery.page" v-model:page-size="subsidyQuery.pageSize" :total="subsidyTotal" layout="total, sizes, prev, pager, next" @current-change="loadSubsidies" @size-change="loadSubsidies" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="planDialog" :title="editingPlan ? '编辑会员套餐' : '新增会员套餐'" width="680px">
      <el-form :model="planForm" label-width="96px">
        <el-form-item label="套餐名称" required><el-input v-model="planForm.name" /></el-form-item>
        <el-form-item label="套餐编码" required><el-input v-model="planForm.code" placeholder="monthly / yearly" /></el-form-item>
        <el-form-item label="价格">
          <el-input-number v-model="planForm.price" :min="0" :precision="2" />
          <span class="form-hint">元</span>
        </el-form-item>
        <el-form-item label="原价"><el-input-number v-model="planForm.originalPrice" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="有效天数"><el-input-number v-model="planForm.durationDays" :min="1" /></el-form-item>
        <el-form-item label="等级"><el-input-number v-model="planForm.level" :min="1" /></el-form-item>
        <el-form-item label="权益">
          <el-input v-model="benefitText" type="textarea" :rows="4" placeholder="每行一个权益" />
        </el-form-item>
        <el-form-item label="权益配置">
          <el-table :data="planForm.entitlements" border size="small" class="entitlement-table">
            <el-table-column label="启用" width="70">
              <template #default="{ row }"><el-switch v-model="row.enabled" /></template>
            </el-table-column>
            <el-table-column prop="name" label="权益" min-width="180" />
            <el-table-column prop="category" label="分类" width="120" />
            <el-table-column label="适用/状态" min-width="210">
              <template #default="{ row }">
                <div class="landing-line">{{ benefitLanding(row.key).scope }}</div>
                <el-tag size="small" :type="benefitLanding(row.key).statusType" effect="light">{{ benefitLanding(row.key).status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="次数" width="120">
              <template #default="{ row }"><el-input-number v-model="row.quota" :min="0" :disabled="row.unlimited" size="small" /></template>
            </el-table-column>
            <el-table-column label="折扣" width="120">
              <template #default="{ row }"><el-input-number v-model="row.discountRate" :min="0" :max="10" :precision="1" :disabled="row.type !== 'discount'" size="small" /></template>
            </el-table-column>
            <el-table-column label="数值" width="120">
              <template #default="{ row }"><el-input-number v-model="row.amount" :min="0" :precision="0" :disabled="!['boost','limit'].includes(row.type)" size="small" /></template>
            </el-table-column>
          </el-table>
        </el-form-item>
        <el-form-item label="上架"><el-switch v-model="planForm.isActive" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="planDialog = false">取消</el-button>
        <el-button type="primary" @click="savePlan">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="grantDialog" title="赠送会员" width="520px">
      <el-form :model="grantForm" label-width="90px">
        <el-form-item label="用户ID" required><el-input v-model="grantForm.userId" /></el-form-item>
        <el-form-item label="会员名称"><el-input v-model="grantForm.planName" /></el-form-item>
        <el-form-item label="天数"><el-input-number v-model="grantForm.days" :min="1" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="grantDialog = false">取消</el-button>
        <el-button type="primary" @click="grantMember">确定赠送</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="displayDialog" :title="editingDisplay ? '编辑权益卡片' : '新增权益卡片'" width="640px">
      <el-form :model="displayForm" label-width="100px">
        <el-form-item label="标题" required><el-input v-model="displayForm.title" /></el-form-item>
        <el-form-item label="副标题"><el-input v-model="displayForm.subtitle" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="图片">
          <div class="display-image-field">
            <ImageUploadBox
              v-model="displayForm.imageUrl"
              scene="membership-benefit"
              shape="wide"
              placeholder="上传权益卡片图片"
              tip="建议 500x300 或横向卡片图，可替换、预览、删除"
              :max-size="3"
            />
            <el-input v-model="displayForm.imageUrl" placeholder="也可以粘贴图片地址，如 /static/logo.jpg" />
          </div>
        </el-form-item>
        <el-form-item label="绑定权益">
          <el-select v-model="displayForm.benefitKey" clearable filterable placeholder="不绑定则按固定展示值显示">
            <el-option v-for="item in benefitCatalog" :key="item.key" :label="`${item.name}（${item.category}）`" :value="item.key" />
          </el-select>
        </el-form-item>
        <el-alert
          v-if="displayForm.benefitKey"
          class="benefit-landing-alert"
          :type="benefitLanding(displayForm.benefitKey).statusType === 'success' ? 'success' : benefitLanding(displayForm.benefitKey).statusType === 'warning' ? 'warning' : 'info'"
          :closable="false"
          show-icon
        >
          <template #title>
            适用：{{ benefitLanding(displayForm.benefitKey).scope }}；消耗：{{ benefitLanding(displayForm.benefitKey).consume }}；状态：{{ benefitLanding(displayForm.benefitKey).status }}
          </template>
          <template #default>{{ benefitLanding(displayForm.benefitKey).note }}</template>
        </el-alert>
        <el-form-item label="展示值">
          <el-input v-model="displayForm.priceText" placeholder="如 2张 / 4次 / 49.9" style="width: 180px" />
          <el-input v-model="displayForm.originalPriceText" placeholder="如 每月 / 原价99.9" style="width: 220px; margin-left: 8px" />
        </el-form-item>
        <el-form-item label="按钮文案"><el-input v-model="displayForm.buttonText" placeholder="可用 / 去使用 / 去报名" /></el-form-item>
        <el-form-item label="跳转类型">
          <el-select v-model="displayForm.actionType" style="width: 160px">
            <el-option label="普通页面" value="navigate" />
            <el-option label="Tabbar" value="switchTab" />
            <el-option label="不跳转" value="none" />
          </el-select>
          <el-input v-model="displayForm.actionUrl" placeholder="/pages/..." style="width: 340px; margin-left: 8px" />
        </el-form-item>
        <el-form-item label="目标">
          <el-input v-model="displayForm.targetType" placeholder="coupon/activity/post/shop" style="width: 180px" />
          <el-input v-model="displayForm.targetId" placeholder="目标ID，可为空" style="width: 220px; margin-left: 8px" />
        </el-form-item>
        <el-form-item label="仅会员可见"><el-switch v-model="displayForm.memberOnly" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="displayForm.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="显示"><el-switch v-model="displayForm.isEnabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="displayDialog = false">取消</el-button>
        <el-button type="primary" @click="saveDisplayItem">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="faqDialog" :title="editingFaq ? '编辑常见问题' : '新增常见问题'" width="620px">
      <el-form :model="faqForm" label-width="90px">
        <el-form-item label="问题" required><el-input v-model="faqForm.question" /></el-form-item>
        <el-form-item label="答案" required><el-input v-model="faqForm.answer" type="textarea" :rows="5" /></el-form-item>
        <el-form-item label="适用端">
          <el-select v-model="faqForm.scene" style="width: 180px">
            <el-option label="小程序" value="miniapp" />
            <el-option label="全部" value="all" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="faqForm.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="faqForm.isEnabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="faqDialog = false">取消</el-button>
        <el-button type="primary" @click="saveFaq">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import MetricCard from '@/components/common/MetricCard.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { request } from '@/api/request'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('membership:plan:create') || auth.permissions.includes('membership:grant'))
const hasGrantPermission = ref(auth.permissions.includes('membership:grant'))
const hasRefundPermission = ref(auth.permissions.includes('order:refund'))
const activeTab = ref('plans')
const loading = ref(false)
const overview = ref<any>({})
const subsidyOverview = ref<any>({})
const plans = ref<any[]>([])
const orders = ref<any[]>([])
const members = ref<any[]>([])
const usageList = ref<any[]>([])
const subsidies = ref<any[]>([])
const displayItems = ref<any[]>([])
const faqs = ref<any[]>([])
const benefitCatalog = ref<any[]>([])
const orderTotal = ref(0)
const memberTotal = ref(0)
const usageTotal = ref(0)
const subsidyTotal = ref(0)
const planDialog = ref(false)
const grantDialog = ref(false)
const displayDialog = ref(false)
const faqDialog = ref(false)
const editingPlan = ref<any>(null)
const editingDisplay = ref<any>(null)
const editingFaq = ref<any>(null)
const benefitText = ref('')

const orderQuery = reactive({ page: 1, pageSize: 20, keyword: '', status: '' })
const memberQuery = reactive({ page: 1, pageSize: 20 })
const usageQuery = reactive({ page: 1, pageSize: 20, benefitKey: '', userId: '' })
const subsidyQuery = reactive({ page: 1, pageSize: 20, keyword: '', sourceType: '', receiverType: '', status: '' })
const planForm = reactive<any>({ name: '', code: '', price: 0, originalPrice: 0, durationDays: 30, level: 1, sortOrder: 0, isActive: true, entitlements: [] })
const grantForm = reactive({ userId: '', planName: '运营赠送会员', days: 30 })
const displayForm = reactive<any>({ title: '', subtitle: '', imageUrl: '/static/logo.jpg', priceText: '', originalPriceText: '', buttonText: '可用', actionType: 'navigate', actionUrl: '', targetType: '', targetId: '', benefitKey: '', memberOnly: false, sortOrder: 0, isEnabled: true })
const faqForm = reactive<any>({ question: '', answer: '', scene: 'miniapp', sortOrder: 0, isEnabled: true })

const benefitLandingMap: Record<string, { scope: string; consume: string; status: string; statusType: 'success' | 'warning' | 'info'; note: string }> = {
  delivery_free_quota: { scope: '外卖/小店配送费', consume: '下单自动抵扣，每单1次，取消返还', status: '已接入', statusType: 'success', note: '用于配送费抵扣，不等同于普通优惠券。' },
  member_coupon_monthly: { scope: '优惠券钱包/外卖/商城', consume: '发放为用户优惠券，由用户自主选择', status: '部分接入', statusType: 'warning', note: '已发成真实优惠券；跑腿优惠券需要单独接券选择链路。' },
  mall_member_price: { scope: '商城订单', consume: '下单自动按折扣价记录', status: '已接入', statusType: 'success', note: '取消订单会标记权益使用记录已返还。' },
  errand_service_discount: { scope: '跑腿订单服务费', consume: '下单自动折扣，取消返还', status: '已接入', statusType: 'success', note: '小程序跑腿下单页会展示预计会员权益减免。' },
  refund_priority: { scope: '商城/售后', consume: '退款申请进入优先标识', status: '已接入', statusType: 'success', note: '用于后台退款列表优先识别。' },
  post_pin_free_quota: { scope: '帖子置顶', consume: '用户选择会员置顶时扣减', status: '已接入', statusType: 'success', note: '用于内容置顶订单。' },
  content_exposure_boost: { scope: '内容/二手曝光', consume: '发布时加权标记', status: '部分接入', statusType: 'warning', note: '已有轻量加权标记，排序权重仍需继续细化。' },
  comment_member_highlight: { scope: '评论/回复', consume: '会员身份展示', status: '部分接入', statusType: 'warning', note: '当前按会员身份展示，未按单独权益键开关。' },
  advanced_content_tools: { scope: '帖子投票', consume: '创建高级组件时校验', status: '已接入', statusType: 'success', note: '用于高级内容能力开关。' },
  content_audit_priority: { scope: '内容审核', consume: '审核记录优先标记', status: '部分接入', statusType: 'warning', note: '已有优先标记，队列排序仍可继续增强。' },
  second_hand_refresh_quota: { scope: '二手商品刷新', consume: '每次刷新扣1次', status: '已接入', statusType: 'success', note: '用于二手商品免费刷新。' },
  second_hand_exposure_boost: { scope: '二手商品曝光', consume: '发布/刷新时加权标记', status: '部分接入', statusType: 'warning', note: '已有轻量加权，推荐权重可继续增强。' },
  second_hand_publish_limit: { scope: '二手发布数量', consume: '提升发布上限', status: '已接入', statusType: 'success', note: '用于发布数量上限计算。' },
  second_hand_fee_discount: { scope: '二手交易服务费', consume: '待接入交易收费链路', status: '待完善', statusType: 'info', note: '当前不要作为已落地权益重点展示。' },
  dispute_priority: { scope: '举报/纠纷', consume: '纠纷记录优先标记', status: '已接入', statusType: 'success', note: '用于举报纠纷优先识别。' },
  activity_priority_join: { scope: '活动报名', consume: '待接入报名排序/名额锁定', status: '待完善', statusType: 'info', note: '当前不要写成 guaranteed 优先报名。' },
  member_only_activity: { scope: '会员专属活动', consume: '报名时校验会员权益', status: '已接入', statusType: 'success', note: '非会员无法报名会员专属活动。' },
  activity_ticket_discount: { scope: '活动付费票', consume: '下单自动折扣，退款返还记录', status: '已接入', statusType: 'success', note: '用于活动票价折扣。' },
  activity_ticket_coupon_monthly: { scope: '活动付费票', consume: '单张票可抵扣为0元，退款返还', status: '已接入', statusType: 'success', note: '适合展示为活动报名券。' },
  activity_waitlist_priority: { scope: '活动候补', consume: '待接入候补队列排序', status: '待完善', statusType: 'info', note: '当前不要作为强承诺权益展示。' },
  member_badge: { scope: '会员身份展示', consume: '会员状态展示', status: '部分接入', statusType: 'warning', note: '当前按会员身份展示，未按单独权益键控制。' },
  profile_member_badge: { scope: '个人主页', consume: '会员状态展示', status: '部分接入', statusType: 'warning', note: '当前按会员身份展示。' },
  message_member_badge: { scope: '消息/私信', consume: '会员状态展示', status: '部分接入', statusType: 'warning', note: '当前按会员身份展示。' },
  verified_member_identity: { scope: '认证身份组合展示', consume: '身份标识展示', status: '部分接入', statusType: 'warning', note: '当前更多是展示层能力。' },
}
const benefitLanding = (key?: string) => benefitLandingMap[String(key || '')] || { scope: '未绑定具体权益', consume: '按卡片固定展示', status: '展示项', statusType: 'info' as const, note: '该卡片只负责展示，不会自动产生权益扣减。' }

const loadOverview = async () => { overview.value = await request.get('/admin/membership/overview') }
const loadSubsidyOverview = async () => { subsidyOverview.value = await request.get('/admin/finance/subsidies/overview') }
const loadPlans = async () => { const res: any = await request.get('/admin/membership/plans'); plans.value = res.list || [] }
const loadCatalog = async () => { const res: any = await request.get('/admin/membership/benefit-catalog'); benefitCatalog.value = res.list || [] }
const loadDisplayItems = async () => { const res: any = await request.get('/admin/membership/display-items'); displayItems.value = res.list || [] }
const loadFaqs = async () => { const res: any = await request.get('/admin/membership/faqs'); faqs.value = res.list || [] }
const loadOrders = async () => {
  const res: any = await request.get('/admin/membership/orders', { params: orderQuery })
  orders.value = res.list || []
  orderTotal.value = res.total || 0
}
const loadMembers = async () => {
  const res: any = await request.get('/admin/membership/users', { params: memberQuery })
  members.value = res.list || []
  memberTotal.value = res.total || 0
}
const loadUsage = async () => {
  const res: any = await request.get('/admin/membership/usage', { params: usageQuery })
  usageList.value = res.list || []
  usageTotal.value = res.total || 0
}
const loadSubsidies = async () => {
  const res: any = await request.get('/admin/finance/subsidies', { params: subsidyQuery })
  subsidies.value = res.list || []
  subsidyTotal.value = res.total || 0
  await loadSubsidyOverview()
}
const loadCurrent = async () => {
  loading.value = true
  try {
    await loadOverview()
    await loadSubsidyOverview()
    if (!benefitCatalog.value.length) await loadCatalog()
    if (activeTab.value === 'plans') await loadPlans()
    if (activeTab.value === 'display') await loadDisplayItems()
    if (activeTab.value === 'faqs') await loadFaqs()
    if (activeTab.value === 'orders') await loadOrders()
    if (activeTab.value === 'users') await loadMembers()
    if (activeTab.value === 'usage') await loadUsage()
    if (activeTab.value === 'subsidies') await loadSubsidies()
  } finally { loading.value = false }
}

const buildDefaultEntitlements = () => benefitCatalog.value.map(item => ({
  ...item,
  enabled: true,
  cycle: ['quota'].includes(item.type) ? 'monthly' : 'membership',
  quota: item.type === 'quota' ? 1 : 0,
  unlimited: item.type !== 'quota',
  discountRate: item.type === 'discount' ? 9 : null,
  amount: item.type === 'boost' ? 10 : item.type === 'limit' ? 20 : null,
  config: {}
}))
const formatEntitlementValue = (item: any) => {
  if (item.unlimited) return item.discountRate ? `${item.discountRate}折` : (item.amount ? item.amount : '不限')
  return `${item.quota || 0}${item.unit || '次'}`
}
const orderStatusText = (status: string) => ({
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  canceled: '已取消',
  closed: '已关闭',
  refunded: '已退款',
  refunding: '退款中',
  failed: '支付失败',
  expired: '已过期',
}[status] || status || '-')
const orderStatusType = (status: string) => ({
  pending: 'warning',
  paid: 'success',
  cancelled: 'info',
  canceled: 'info',
  closed: 'info',
  refunded: 'primary',
  refunding: 'warning',
  failed: 'danger',
  expired: 'info',
}[status] || 'info')
const memberStatusText = (status: string) => ({
  active: '有效',
  expired: '已过期',
  cancelled: '已取消',
  canceled: '已取消',
  disabled: '已停用',
}[status] || status || '-')
const memberStatusType = (status: string) => ({
  active: 'success',
  expired: 'info',
  cancelled: 'info',
  canceled: 'info',
  disabled: 'danger',
}[status] || 'info')
const subsidyStatusType = (status: string) => ({
  pending: 'warning',
  locked: 'primary',
  settled: 'success',
  cancelled: 'info',
}[status] || 'info')
const subsidyReceiverAmount = (key: string) => {
  const item = (subsidyOverview.value?.byReceiver || []).find((row: any) => row.key === key)
  return item?.amount || 0
}
const openPlan = (row?: any) => {
  editingPlan.value = row || null
  const entitlements = row?.entitlements?.length ? row.entitlements : buildDefaultEntitlements()
  Object.assign(planForm, row ? { ...row, entitlements } : { name: '', code: '', price: 0, originalPrice: 0, durationDays: 30, level: 1, sortOrder: 0, isActive: true, entitlements })
  benefitText.value = (row?.benefits || ['会员身份标识', '专属活动优先报名', '会员商品价格', '专属客服服务']).join('\n')
  planDialog.value = true
}
const savePlan = async () => {
  const payload = { ...planForm, benefits: benefitText.value.split('\n').map(i => i.trim()).filter(Boolean), entitlements: planForm.entitlements }
  if (!payload.name || !payload.code) { ElMessage.warning('请填写套餐名称和编码'); return }
  if (editingPlan.value) await request.patch(`/admin/membership/plans/${editingPlan.value.id}`, payload)
  else await request.post('/admin/membership/plans', payload)
  ElMessage.success('已保存')
  planDialog.value = false
  await loadCurrent()
}
const deletePlan = async (row: any) => {
  await ElMessageBox.confirm(`确定删除或下架「${row.name}」？`, '确认操作')
  await request.delete(`/admin/membership/plans/${row.id}`)
  ElMessage.success('已处理')
  await loadCurrent()
}
const openGrant = () => { grantDialog.value = true }
const grantMember = async () => {
  if (!grantForm.userId.trim()) { ElMessage.warning('请输入用户ID'); return }
  await request.post('/admin/membership/grant', grantForm)
  ElMessage.success('会员已赠送')
  grantDialog.value = false
  activeTab.value = 'users'
  await loadCurrent()
}

const refundMembershipOrder = async (row: any) => {
  const { value } = await ElMessageBox.prompt('退款成功后会撤销该订单发放的会员和未消费权益。', '会员订单退款', {
    inputPlaceholder: '请输入退款原因',
    inputValidator: (reason: string) => reason?.trim() ? true : '请填写退款原因',
  })
  await request.post('/wxpay/refund', {
    bizType: 'membership_order',
    bizId: row.id,
    amount: Number(row.amount),
    reason: value.trim(),
  })
  ElMessage.success('退款已提交，请等待支付渠道确认')
  await loadOrders()
}

const revokeMembership = async (row: any) => {
  const { value } = await ElMessageBox.prompt('此操作不会退款，只会立即停用会员和未消费权益。', '人工撤销会员', {
    inputPlaceholder: '请输入撤销原因',
    inputValidator: (reason: string) => reason?.trim() ? true : '请填写撤销原因',
  })
  await request.post(`/admin/membership/users/${row.id}/revoke`, { reason: value.trim() })
  ElMessage.success('会员已撤销')
  await loadMembers()
}

const adjustMembershipExpiry = async (row: any) => {
  const { value: dayValue } = await ElMessageBox.prompt('输入正数延长、负数缩短；单次最多 3650 天。', '调整会员有效期', {
    inputPlaceholder: '例如：30 或 -7',
    inputValidator: (value: string) => /^-?\d+$/.test(value?.trim()) && Number(value) !== 0 && Math.abs(Number(value)) <= 3650 ? true : '请输入 -3650 到 3650 之间的非零整数',
  })
  const { value: reason } = await ElMessageBox.prompt('本操作会记录调整前后到期时间和操作原因。', '填写调整原因', {
    inputPlaceholder: '请输入调整原因',
    inputValidator: (value: string) => value?.trim() ? true : '请填写调整原因',
  })
  await request.post(`/admin/membership/users/${row.id}/adjust-expiry`, { adjustmentDays: Number(dayValue), reason: reason.trim() })
  ElMessage.success('会员有效期已调整')
  await loadMembers()
}

const linkHistoricalMembershipOrder = async (row: any) => {
  const { value: membershipId } = await ElMessageBox.prompt('请输入同一用户且未关联订单的会员记录 ID。系统不会自动猜测匹配关系。', '关联历史会员订单', {
    inputPlaceholder: '会员记录 ID',
    inputValidator: (value: string) => value?.trim() ? true : '请输入会员记录 ID',
  })
  const { value: reason } = await ElMessageBox.prompt('请填写已核对的支付凭证或人工处理依据。', '填写关联原因', {
    inputPlaceholder: '请输入关联原因',
    inputValidator: (value: string) => value?.trim() ? true : '请填写关联原因',
  })
  await request.post(`/admin/membership/orders/${row.id}/link-membership`, { membershipId: membershipId.trim(), reason: reason.trim() })
  ElMessage.success('历史订单已关联会员记录')
  await loadOrders()
}

const openDisplayItem = async (row?: any) => {
  if (!benefitCatalog.value.length) await loadCatalog()
  editingDisplay.value = row || null
  Object.assign(displayForm, row ? { ...row } : { title: '', subtitle: '', imageUrl: '/static/logo.jpg', priceText: '', originalPriceText: '', buttonText: '可用', actionType: 'navigate', actionUrl: '', targetType: '', targetId: '', benefitKey: '', memberOnly: false, sortOrder: 0, isEnabled: true })
  displayDialog.value = true
}
const saveDisplayItem = async () => {
  if (!displayForm.title.trim()) { ElMessage.warning('请填写卡片标题'); return }
  if (editingDisplay.value) await request.patch(`/admin/membership/display-items/${editingDisplay.value.id}`, displayForm)
  else await request.post('/admin/membership/display-items', displayForm)
  ElMessage.success('已保存')
  displayDialog.value = false
  await loadDisplayItems()
}
const deleteDisplayItem = async (row: any) => {
  await ElMessageBox.confirm(`确定删除「${row.title}」？`, '确认操作')
  await request.delete(`/admin/membership/display-items/${row.id}`)
  ElMessage.success('已删除')
  await loadDisplayItems()
}

const openFaq = (row?: any) => {
  editingFaq.value = row || null
  Object.assign(faqForm, row ? { ...row } : { question: '', answer: '', scene: 'miniapp', sortOrder: 0, isEnabled: true })
  faqDialog.value = true
}
const saveFaq = async () => {
  if (!faqForm.question.trim() || !faqForm.answer.trim()) { ElMessage.warning('请填写问题和答案'); return }
  if (editingFaq.value) await request.patch(`/admin/membership/faqs/${editingFaq.value.id}`, faqForm)
  else await request.post('/admin/membership/faqs', faqForm)
  ElMessage.success('已保存')
  faqDialog.value = false
  await loadFaqs()
}
const deleteFaq = async (row: any) => {
  await ElMessageBox.confirm(`确定删除「${row.question}」？`, '确认操作')
  await request.delete(`/admin/membership/faqs/${row.id}`)
  ElMessage.success('已删除')
  await loadFaqs()
}

onMounted(loadCurrent)
</script>

<style scoped>
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}
.ops-tabs {
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 16px;
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.benefit-tag {
  margin: 0 6px 6px 0;
}
.display-preview {
  display: flex;
  align-items: center;
  gap: 10px;
}
.display-preview img {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
  background: #f5f7fa;
}
.display-preview p,
.muted {
  margin: 4px 0 0;
  color: #8a94a6;
  font-size: 12px;
}
.display-image-field {
  width: 100%;
  display: grid;
  gap: 10px;
}
.landing-line {
  margin-bottom: 4px;
  color: #344054;
  font-size: 12px;
}
.benefit-landing-alert {
  margin: -6px 0 14px 100px;
  width: calc(100% - 100px);
}
.form-hint {
  margin-left: 8px;
  color: #667085;
}
@media (max-width: 1200px) {
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>

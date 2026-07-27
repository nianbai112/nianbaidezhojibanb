<template>
  <div class="page-shell">
    <PageHeader title="二手交易" subtitle="审核闲置发布、查看交易意向、处理风险和区域规则" icon="ShoppingCart" />

    <StatGrid :items="statItems" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="运营总览" name="overview">
        <div class="overview-grid">
          <section class="panel">
            <div class="panel-head">
              <div>
                <h3>待审核队列</h3>
                <p>先处理影响用户发布的内容</p>
              </div>
              <el-button text type="primary" @click="jumpToStatus('PENDING')">去处理</el-button>
            </div>
            <div v-if="pendingPreview.length" class="mini-list">
              <button v-for="item in pendingPreview" :key="item.id" class="mini-row" type="button" @click="openProductDetail(item.id)">
                <el-image v-if="item.cover" :src="item.cover" fit="cover" class="mini-cover" />
                <div v-else class="mini-cover empty-cover">无图</div>
                <div class="mini-main">
                  <strong>{{ item.title || '未命名商品' }}</strong>
                  <span>{{ item.sellerName }} · ¥{{ money(item.price) }}</span>
                </div>
                <el-tag size="small" type="warning">待审核</el-tag>
              </button>
            </div>
            <EmptyState v-else description="暂无待审核商品" :image-size="64" />
          </section>

          <section class="panel">
            <div class="panel-head">
              <div>
                <h3>风险提示</h3>
                <p>联系方式、举报、无图商品会在这里露出</p>
              </div>
              <el-button text type="primary" @click="jumpToReports()">查看</el-button>
            </div>
            <div v-if="riskPreview.length" class="mini-list">
              <button v-for="item in riskPreview" :key="item.id" class="mini-row" type="button" @click="openProductDetail(item.id)">
                <div class="risk-dot"></div>
                <div class="mini-main">
                  <strong>{{ item.title || '未命名商品' }}</strong>
                  <span>{{ (item.riskTags || []).map((risk) => risk.label).join('、') }}</span>
                </div>
              </button>
            </div>
            <EmptyState v-else description="当前列表暂无明显风险" :image-size="64" />
          </section>

          <section class="panel">
            <div class="panel-head">
              <div>
                <h3>运营状态</h3>
                <p>二手模块当前运行概况</p>
              </div>
              <el-button text type="primary" @click="activeTab = 'settings'; loadSetting()">配置</el-button>
            </div>
            <div class="ops-grid">
              <div><strong>{{ stats.productTotal }}</strong><span>商品总数</span></div>
              <div><strong>{{ stats.todayNew }}</strong><span>今日新增</span></div>
              <div><strong>{{ stats.offline }}</strong><span>已下架</span></div>
              <div><strong>{{ stats.rejected }}</strong><span>未通过</span></div>
              <div><strong>{{ stats.enabledRegions }}</strong><span>已启用区域</span></div>
              <div><strong>{{ stats.contacting }}</strong><span>沟通中</span></div>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="商品管理" name="products">
        <div class="tab-toolbar">
          <el-input v-model="prodFilters.keyword" placeholder="搜索标题、描述、卖家" clearable style="width:240px" @keyup.enter="loadProducts" />
          <el-select v-model="prodFilters.status" clearable placeholder="商品状态" style="width:140px" @change="loadProducts">
            <el-option v-for="item in productStatuses" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select v-model="prodFilters.regionId" clearable filterable placeholder="选择区域" style="width:180px" @change="loadProducts">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-select v-model="prodFilters.deliveryType" clearable placeholder="交易方式" style="width:150px" @change="loadProducts">
            <el-option v-for="item in deliveryTypes" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-button type="primary" @click="loadProducts" :loading="prodLoading">查询</el-button>
          <el-button @click="resetProductFilters">重置</el-button>
        </div>

        <div class="batch-bar" v-if="selectedProducts.length">
          <span>已选 {{ selectedProducts.length }} 个商品</span>
          <el-button size="small" type="success" @click="batchSetStatus('ON_SALE')">批量通过/上架</el-button>
          <el-button size="small" type="warning" @click="batchReject">批量驳回</el-button>
          <el-button size="small" @click="batchSetStatus('OFFLINE')">批量下架</el-button>
        </div>

        <el-table :data="products" v-loading="prodLoading" stripe row-key="id" @selection-change="handleProductSelection">
          <el-table-column type="selection" width="44" />
          <el-table-column label="商品信息" min-width="320">
            <template #default="{ row }">
              <div class="product-cell">
                <el-image v-if="row.cover" :src="row.cover" fit="cover" class="cover" :preview-src-list="row.images" preview-teleported />
                <div v-else class="cover empty-cover">无图</div>
                <div class="product-main">
                  <div class="product-title">{{ row.title || row.description || '未命名商品' }}</div>
                  <div class="muted line-clamp">{{ row.description || '-' }}</div>
                  <div class="tag-row">
                    <el-tag v-if="row.category" size="small" type="info">{{ row.category }}</el-tag>
                    <el-tag v-if="row.condition" size="small" type="info">{{ conditionText(row.condition) }}</el-tag>
                    <el-tag v-if="row.deliveryType" size="small" :type="deliveryTypeTag(row.deliveryType).type">{{ deliveryTypeTag(row.deliveryType).label }}</el-tag>
                    <el-tag v-if="row.onlinePaymentEligible" size="small" type="success">可在线支付</el-tag>
                    <el-tag v-else size="small" type="info">私信交易</el-tag>
                    <el-tag v-for="tag in row.tags || []" :key="tag" size="small" type="info">{{ tag }}</el-tag>
                  </div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="卖家" width="160">
            <template #default="{ row }">
              <div class="user-line">
                <el-avatar :size="28" :src="row.user?.avatar || ''">{{ firstName(row.sellerName) }}</el-avatar>
                <div>
                  <div>{{ row.user?.nickname || row.sellerName || '匿名用户' }}</div>
                  <div class="muted">UID {{ row.user?.uid || row.sellerUid || '-' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="区域/交易" min-width="150">
            <template #default="{ row }">
              <div>{{ row.region?.name || row.regionName || '-' }}</div>
              <div class="muted">{{ locationText(row.location) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="价格" width="120">
            <template #default="{ row }">
              <div class="price">¥{{ money(row.price) }}</div>
              <div v-if="row.originPrice" class="muted">原价 ¥{{ money(row.originPrice) }}</div>
              <div v-if="Number(row.freight || 0) > 0" class="muted">运费 ¥{{ money(row.freight) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="数据" width="120">
            <template #default="{ row }">
              <div>{{ row.wantCount || 0 }} 想要</div>
              <div class="muted">{{ row.viewCount || 0 }} 浏览 · {{ row.orderCount || 0 }} 意向</div>
            </template>
          </el-table-column>
          <el-table-column label="风险" min-width="160">
            <template #default="{ row }">
              <div v-if="row.riskTags?.length" class="tag-row">
                <el-tag v-for="risk in row.riskTags" :key="risk.label" size="small" :type="riskTagType(risk.level)">
                  {{ risk.label }}
                </el-tag>
              </div>
              <span v-else class="muted">暂无风险</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="productStatus(row.status).type" size="small">{{ productStatus(row.status).label }}</el-tag>
              <div v-if="row.auditReason" class="muted reason">{{ row.auditReason }}</div>
            </template>
          </el-table-column>
          <el-table-column label="发布时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openProductDetail(row.id)">详情</el-button>
              <el-button v-if="row.status === 'PENDING' || row.status === 'REJECTED'" size="small" type="success" link @click="setProductStatus(row.id, 'ON_SALE')">通过</el-button>
              <el-dropdown v-if="row.status === 'PENDING' || row.status === 'ON_SALE'" trigger="click" @command="(reason) => rejectProduct(row.id, reason)">
                <el-button size="small" type="danger" link>驳回</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-for="reason in quickRejectReasons" :key="reason" :command="reason">{{ reason }}</el-dropdown-item>
                    <el-dropdown-item command="">自定义原因</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button v-if="row.status === 'ON_SALE'" size="small" type="warning" link @click="setProductStatus(row.id, 'OFFLINE', '运营下架')">下架</el-button>
              <el-button v-if="row.status === 'OFFLINE'" size="small" type="success" link @click="setProductStatus(row.id, 'ON_SALE')">上架</el-button>
              <el-button v-if="row.status === 'ON_SALE'" size="small" type="primary" link @click="setProductStatus(row.id, 'SOLD', '运营标记售出')">标记售出</el-button>
              <el-popconfirm title="确定删除这个商品？" @confirm="deleteProduct(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-wrap">
          <el-pagination v-model:current-page="prodPage" v-model:page-size="prodPageSize" :total="prodTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadProducts" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="交易/意向" name="orders">
        <div class="tab-toolbar">
          <el-input v-model="orderFilters.keyword" placeholder="搜索订单号" clearable style="width:220px" @keyup.enter="loadOrders" />
          <el-select v-model="orderFilters.status" clearable placeholder="订单状态" style="width:150px" @change="loadOrders">
            <el-option v-for="item in orderStatuses" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select v-model="orderFilters.deliveryType" clearable placeholder="交易方式" style="width:150px" @change="loadOrders">
            <el-option v-for="item in deliveryTypes" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-button type="primary" @click="loadOrders" :loading="orderLoading">查询</el-button>
          <el-button @click="resetOrderFilters">重置</el-button>
        </div>
        <el-table :data="orders" v-loading="orderLoading" stripe row-key="id">
          <el-table-column prop="orderNo" label="单号" width="190" />
          <el-table-column label="商品" min-width="240">
            <template #default="{ row }">
              <div class="product-cell small">
                <el-image v-if="row.product?.cover" :src="row.product.cover" fit="cover" class="cover mini" />
                <div v-else class="cover mini empty-cover">无图</div>
                <div>
                  <div class="product-title">{{ row.product?.title || row.productId }}</div>
                  <div class="muted">{{ row.product?.category || '-' }}</div>
                  <div class="tag-row">
                    <el-tag v-if="row.deliveryType" size="small" :type="deliveryTypeTag(row.deliveryType).type">{{ row.tradeKind || deliveryTypeTag(row.deliveryType).label }}</el-tag>
                    <el-tag size="small" :type="row.onlinePaymentOrder ? 'success' : 'info'">{{ row.onlinePaymentOrder ? '在线支付订单' : '私信沟通' }}</el-tag>
                  </div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="买家" width="150">
            <template #default="{ row }">{{ row.buyer?.nickname || row.user?.nickname || row.buyerId }}</template>
          </el-table-column>
          <el-table-column label="卖家" width="150">
            <template #default="{ row }">{{ row.seller?.nickname || row.sellerId }}</template>
          </el-table-column>
          <el-table-column label="金额" width="110">
            <template #default="{ row }">¥{{ money(row.price) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="130">
            <template #default="{ row }">
              <el-tag :type="orderStatus(row.status).type" size="small">{{ orderStatus(row.status).label }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="支付/备注" min-width="180">
            <template #default="{ row }">
              <div>{{ row.paymentNo || (row.onlinePaymentOrder ? '待生成支付单号' : '无需支付单号') }}</div>
              <div class="muted line-clamp">{{ row.remark || '无备注' }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openOrderDetail(row.id)">详情</el-button>
              <el-dropdown trigger="click" @command="(status) => setOrderStatus(row.id, status)">
                <el-button size="small" type="primary" link>处理</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="shipped" :disabled="row.status !== 'paid' || row.deliveryType !== '包邮'">标记发货</el-dropdown-item>
                    <el-dropdown-item command="completed" :disabled="!['contacting','paid','shipped'].includes(row.status)">确认完成</el-dropdown-item>
                    <el-dropdown-item command="cancelled" :disabled="!['contacting','pending_pay'].includes(row.status)">取消订单</el-dropdown-item>
                    <el-dropdown-item command="refunded" :disabled="!['refunding'].includes(row.status) || !row.onlinePaymentOrder">标记已退款</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="orderPage" v-model:page-size="orderPageSize" :total="orderTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadOrders" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="举报/纠纷" name="reports">
        <div class="tab-toolbar">
          <el-input v-model="reportFilters.keyword" placeholder="搜索商品标题/描述" clearable style="width:240px" @keyup.enter="loadReports" />
          <el-select v-model="reportFilters.status" clearable placeholder="处理状态" style="width:150px" @change="loadReports">
            <el-option label="待处理" value="pending" />
            <el-option label="处理中" value="processing" />
            <el-option label="已处理" value="resolved" />
            <el-option label="无效举报" value="rejected" />
          </el-select>
          <el-select v-model="reportFilters.regionId" clearable filterable placeholder="选择区域" style="width:180px" @change="loadReports">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-button type="primary" @click="loadReports" :loading="reportLoading">查询</el-button>
          <el-button @click="resetReportFilters">重置</el-button>
        </div>

        <el-table :data="reports" v-loading="reportLoading" stripe row-key="id">
          <el-table-column label="举报商品" min-width="300">
            <template #default="{ row }">
              <div class="product-cell">
                <el-image v-if="row.product?.cover" :src="row.product.cover" fit="cover" class="cover mini" />
                <div v-else class="cover mini empty-cover">无图</div>
                <div class="product-main">
                  <div class="product-title">{{ row.product?.title || row.productTitle || row.targetId }}</div>
                  <div class="muted line-clamp">{{ row.product?.description || row.detail || '-' }}</div>
                  <div class="tag-row">
                    <el-tag size="small" :type="productStatus(row.product?.status).type">{{ productStatus(row.product?.status).label }}</el-tag>
                    <el-tag v-if="row.product?.regionName" size="small" type="info">{{ row.product.regionName }}</el-tag>
                  </div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="举报人" width="150">
            <template #default="{ row }">{{ row.reporter?.nickname || row.reporterName || row.reporterId }}</template>
          </el-table-column>
          <el-table-column label="被举报人" width="150">
            <template #default="{ row }">{{ row.reported?.nickname || row.reportedName || '-' }}</template>
          </el-table-column>
          <el-table-column label="原因" min-width="220">
            <template #default="{ row }">
              <div>{{ row.reason || '用户举报' }}</div>
              <div class="muted line-clamp">{{ row.detail || '无补充说明' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="reportStatus(row.status).type" size="small">{{ reportStatus(row.status).label }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="300" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="row.product?.id && openProductDetail(row.product.id)">商品</el-button>
              <el-button size="small" type="primary" link @click="openReportMessages(row)">私信排查</el-button>
              <el-dropdown trigger="click" @command="(action) => handleReport(row, action)">
                <el-button size="small" type="danger" link>处理</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="record">仅记录</el-dropdown-item>
                    <el-dropdown-item command="offline">下架商品</el-dropdown-item>
                    <el-dropdown-item command="reject">驳回商品</el-dropdown-item>
                    <el-dropdown-item command="mute_user">禁言卖家</el-dropdown-item>
                    <el-dropdown-item command="ban_user">封禁卖家</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="reportPage" v-model:page-size="reportPageSize" :total="reportTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadReports" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="区域配置" name="settings">
        <div class="tab-toolbar">
          <el-select v-model="settingRegionId" filterable placeholder="选择区域" style="width:240px" @change="loadSetting">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-button type="primary" @click="saveSetting" :loading="settingSaving" :disabled="!settingRegionId">保存配置</el-button>
        </div>
        <el-form v-if="settingRegionId" :model="settingForm" label-width="160px" class="setting-form">
          <div class="setting-section">
            <h3>基础运营规则</h3>
            <el-form-item label="启用二手交易"><el-switch v-model="settingForm.enableSecondHand" /></el-form-item>
            <el-form-item label="每人最多在架">
              <el-input-number v-model="settingForm.maxListings" :min="1" :max="999" />
            </el-form-item>
            <el-form-item label="发布需绑定手机"><el-switch v-model="settingForm.requirePhone" /></el-form-item>
            <el-form-item label="发布需后台审核"><el-switch v-model="settingForm.requireAudit" /></el-form-item>
          </div>
          <div class="setting-section">
            <h3>预留增长功能</h3>
            <p class="muted">默认关闭，运营跑顺后可以直接打开。</p>
            <el-form-item label="包邮在线支付"><el-switch v-model="settingForm.enableOnlinePayment" /></el-form-item>
            <el-form-item label="售后退款处理"><el-switch v-model="settingForm.enableAfterSale" /></el-form-item>
            <el-form-item label="平台担保说明"><el-switch v-model="settingForm.enablePlatformGuarantee" /></el-form-item>
            <el-form-item label="自动推荐闲置"><el-switch v-model="settingForm.enableAutoRecommend" /></el-form-item>
          </div>
        </el-form>
        <EmptyState v-else description="请先选择区域" />
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="productDrawerVisible" title="商品详情" size="680px">
      <div class="drawer-shell" v-loading="productDetailLoading" v-if="selectedProduct">
        <div class="detail-hero">
          <el-image v-if="selectedProduct.cover" :src="selectedProduct.cover" fit="cover" class="detail-cover" :preview-src-list="selectedProduct.images" preview-teleported />
          <div v-else class="detail-cover empty-cover">无图</div>
          <div class="detail-title">
            <h2>{{ selectedProduct.title || '未命名商品' }}</h2>
            <p>{{ selectedProduct.description || '暂无描述' }}</p>
            <div class="tag-row">
              <el-tag :type="productStatus(selectedProduct.status).type">{{ productStatus(selectedProduct.status).label }}</el-tag>
              <el-tag type="info">{{ selectedProduct.regionName || '-' }}</el-tag>
              <el-tag v-if="selectedProduct.deliveryType" :type="deliveryTypeTag(selectedProduct.deliveryType).type">{{ deliveryTypeTag(selectedProduct.deliveryType).label }}</el-tag>
              <el-tag :type="selectedProduct.onlinePaymentEligible ? 'success' : 'info'">{{ selectedProduct.onlinePaymentEligible ? '包邮在线支付' : '私信线下交易' }}</el-tag>
            </div>
          </div>
          <div class="detail-price">¥{{ money(selectedProduct.price) }}</div>
        </div>

        <section class="detail-section">
          <h3>商品信息</h3>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="卖家">{{ selectedProduct.user?.nickname || selectedProduct.sellerName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="卖家UID">{{ selectedProduct.user?.uid || '-' }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{ selectedProduct.user?.phone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="分类">{{ selectedProduct.category || '-' }}</el-descriptions-item>
            <el-descriptions-item label="成色">{{ conditionText(selectedProduct.condition) }}</el-descriptions-item>
            <el-descriptions-item label="原价">{{ selectedProduct.originPrice ? `¥${money(selectedProduct.originPrice)}` : '-' }}</el-descriptions-item>
            <el-descriptions-item label="运费">{{ Number(selectedProduct.freight || 0) > 0 ? `¥${money(selectedProduct.freight)}` : '无' }}</el-descriptions-item>
            <el-descriptions-item label="交易方式">{{ deliveryTypeTag(selectedProduct.deliveryType).label }}</el-descriptions-item>
            <el-descriptions-item label="交易位置">{{ locationText(selectedProduct.location) }}</el-descriptions-item>
            <el-descriptions-item label="后台规则">{{ tradeRuleText(selectedProduct) }}</el-descriptions-item>
            <el-descriptions-item label="浏览/想要">{{ selectedProduct.viewCount || 0 }} / {{ selectedProduct.wantCount || 0 }}</el-descriptions-item>
            <el-descriptions-item label="发布时间">{{ formatDate(selectedProduct.createdAt) }}</el-descriptions-item>
          </el-descriptions>
        </section>

        <section class="detail-section" v-if="selectedProduct.images?.length">
          <h3>商品图片</h3>
          <div class="image-grid">
            <el-image v-for="img in selectedProduct.images" :key="img" :src="img" fit="cover" :preview-src-list="selectedProduct.images" preview-teleported />
          </div>
        </section>

        <section class="detail-section">
          <h3>风险巡检</h3>
          <div v-if="selectedProduct.riskTags?.length" class="tag-row">
            <el-tag v-for="risk in selectedProduct.riskTags" :key="risk.label" :type="riskTagType(risk.level)">
              {{ risk.label }}
            </el-tag>
          </div>
          <el-alert v-else title="当前未发现明显风险" type="success" :closable="false" show-icon />
        </section>

        <section class="detail-section">
          <h3>卖家概况</h3>
          <div class="ops-grid compact">
            <div><strong>{{ selectedProduct.sellerStats?.totalListings || 0 }}</strong><span>累计发布</span></div>
            <div><strong>{{ selectedProduct.sellerStats?.onSaleListings || 0 }}</strong><span>正在出售</span></div>
            <div><strong>{{ selectedProduct.orderCount || 0 }}</strong><span>交易意向</span></div>
            <div><strong>{{ selectedProduct.reportCount || 0 }}</strong><span>举报记录</span></div>
          </div>
        </section>

        <section class="detail-section">
          <div class="section-head">
            <h3>审核记录</h3>
            <span class="muted">记录每次通过、驳回、下架</span>
          </div>
          <el-timeline v-if="selectedProduct.auditRecords?.length">
            <el-timeline-item v-for="record in selectedProduct.auditRecords" :key="record.id" :timestamp="formatDate(record.createdAt)">
              <div>{{ auditStatusText(record.status) }} · {{ record.reviewerName || '系统' }}</div>
              <div class="muted">{{ record.reason || '无备注' }}</div>
            </el-timeline-item>
          </el-timeline>
          <EmptyState v-else description="暂无审核记录" :image-size="64" />
        </section>

        <section class="detail-section">
          <div class="section-head">
            <h3>交易意向</h3>
            <span class="muted">{{ selectedProduct.orders?.length || 0 }} 条</span>
          </div>
          <el-table v-if="selectedProduct.orders?.length" :data="selectedProduct.orders" size="small">
            <el-table-column prop="orderNo" label="单号" min-width="160" />
            <el-table-column label="买家" width="120">
              <template #default="{ row }">{{ row.buyer?.nickname || row.buyerId }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><el-tag size="small" :type="orderStatus(row.status).type">{{ orderStatus(row.status).label }}</el-tag></template>
            </el-table-column>
            <el-table-column label="类型" width="130">
              <template #default="{ row }">{{ row.tradeKind || deliveryTypeTag(row.deliveryType).label }}</template>
            </el-table-column>
            <el-table-column label="时间" width="150">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <EmptyState v-else description="暂无交易意向" :image-size="64" />
        </section>

        <section class="detail-section">
          <div class="section-head">
            <h3>举报记录</h3>
            <span class="muted">{{ selectedProduct.reports?.length || 0 }} 条</span>
          </div>
          <div v-if="selectedProduct.reports?.length" class="report-list">
            <div v-for="report in selectedProduct.reports" :key="report.id" class="report-row">
              <strong>{{ report.reason || '举报' }}</strong>
              <span>{{ report.reporter?.nickname || '用户' }} · {{ formatDate(report.createdAt) }}</span>
              <p>{{ report.detail || '无补充说明' }}</p>
            </div>
          </div>
          <EmptyState v-else description="暂无举报" :image-size="64" />
        </section>

        <div class="drawer-actions">
          <el-button v-if="selectedProduct.status === 'PENDING' || selectedProduct.status === 'REJECTED'" type="success" @click="setProductStatus(selectedProduct.id, 'ON_SALE')">通过/上架</el-button>
          <el-button v-if="selectedProduct.status === 'PENDING' || selectedProduct.status === 'ON_SALE'" type="danger" @click="rejectProduct(selectedProduct.id)">驳回</el-button>
          <el-button v-if="selectedProduct.status === 'ON_SALE'" type="warning" @click="setProductStatus(selectedProduct.id, 'OFFLINE', '运营下架')">下架</el-button>
          <el-button v-if="selectedProduct.status === 'ON_SALE'" type="primary" @click="setProductStatus(selectedProduct.id, 'SOLD', '运营标记售出')">标记售出</el-button>
        </div>
      </div>
    </el-drawer>

    <el-drawer v-model="orderDrawerVisible" title="交易/意向详情" size="620px">
      <div class="drawer-shell" v-loading="orderDetailLoading" v-if="selectedOrder">
        <section class="detail-section">
          <h3>订单信息</h3>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="单号">{{ selectedOrder.orderNo }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ orderStatus(selectedOrder.status).label }}</el-descriptions-item>
            <el-descriptions-item label="交易方式">{{ deliveryTypeTag(selectedOrder.deliveryType).label }}</el-descriptions-item>
            <el-descriptions-item label="业务类型">{{ selectedOrder.tradeKind || '-' }}</el-descriptions-item>
            <el-descriptions-item label="金额">¥{{ money(selectedOrder.price) }}</el-descriptions-item>
            <el-descriptions-item label="支付单号">{{ selectedOrder.paymentNo || (selectedOrder.onlinePaymentOrder ? '-' : '无需支付单号') }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDate(selectedOrder.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="支付时间">{{ formatDate(selectedOrder.payTime) }}</el-descriptions-item>
          </el-descriptions>
        </section>

        <section class="detail-section">
          <h3>商品</h3>
          <div class="product-cell">
            <el-image v-if="selectedOrder.product?.cover" :src="selectedOrder.product.cover" fit="cover" class="cover" />
            <div v-else class="cover empty-cover">无图</div>
            <div>
              <div class="product-title">{{ selectedOrder.product?.title || selectedOrder.productId }}</div>
              <div class="muted">{{ selectedOrder.product?.description || '-' }}</div>
            </div>
          </div>
        </section>

        <section class="detail-section">
          <h3>买卖双方</h3>
          <div class="party-grid">
            <div class="party-card">
              <span>买家</span>
              <strong>{{ selectedOrder.buyer?.nickname || selectedOrder.buyerId }}</strong>
              <em>UID {{ selectedOrder.buyer?.uid || '-' }}</em>
              <em>{{ selectedOrder.buyer?.phone || '未绑定手机号' }}</em>
            </div>
            <div class="party-card">
              <span>卖家</span>
              <strong>{{ selectedOrder.seller?.nickname || selectedOrder.sellerId }}</strong>
              <em>UID {{ selectedOrder.seller?.uid || '-' }}</em>
              <em>{{ selectedOrder.seller?.phone || '未绑定手机号' }}</em>
            </div>
          </div>
        </section>

        <section class="detail-section">
          <h3>交易补充</h3>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="交易位置">{{ locationText(selectedOrder.product?.location) }}</el-descriptions-item>
            <el-descriptions-item label="收货地址">{{ addressText(selectedOrder.shippingAddress) }}</el-descriptions-item>
            <el-descriptions-item label="后台规则">{{ tradeRuleText(selectedOrder.product || selectedOrder) }}</el-descriptions-item>
            <el-descriptions-item label="备注">{{ selectedOrder.remark || '-' }}</el-descriptions-item>
          </el-descriptions>
        </section>

        <div class="drawer-actions">
          <el-button type="primary" @click="openPrivateMessages(selectedOrder)">去私信管理排查</el-button>
          <el-button v-if="selectedOrder.product?.id" @click="openProductDetail(selectedOrder.product.id)">查看商品</el-button>
          <el-button v-if="selectedOrder.onlinePaymentOrder && ['paid','shipped'].includes(selectedOrder.status)" type="warning" @click="requestOrderRefund(selectedOrder)">发起退款</el-button>
          <el-button v-if="['contacting','paid','shipped'].includes(selectedOrder.status)" type="success" @click="setOrderStatus(selectedOrder.id, 'completed')">确认完成</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { StatItem } from '@/types/admin'

const router = useRouter()
const activeTab = ref('overview')
const formatDate = (d: string) => d ? new Date(d).toLocaleString('zh-CN') : '-'
const money = (value: any) => Number(value || 0).toFixed(2)
const firstName = (value: string) => String(value || '用').slice(0, 1)

const productStatuses = [
  { label: '待审核', value: 'PENDING', type: 'warning' },
  { label: '在售', value: 'ON_SALE', type: 'success' },
  { label: '已售出', value: 'SOLD', type: 'info' },
  { label: '已下架', value: 'OFFLINE', type: 'info' },
  { label: '未通过', value: 'REJECTED', type: 'danger' },
]
const orderStatuses = [
  { label: '待沟通', value: 'contacting', type: 'warning' },
  { label: '待支付', value: 'pending_pay', type: 'warning' },
  { label: '已支付', value: 'paid', type: 'success' },
  { label: '已发货', value: 'shipped', type: 'primary' },
  { label: '已完成', value: 'completed', type: 'success' },
  { label: '已取消', value: 'cancelled', type: 'info' },
  { label: '退款中', value: 'refunding', type: 'warning' },
  { label: '已退款', value: 'refunded', type: 'info' },
]
const deliveryTypes = [
  { label: '校内交易', value: '校内交易', type: 'primary' },
  { label: '包邮', value: '包邮', type: 'success' },
  { label: '买家自提', value: '买家自提', type: 'warning' },
]
const reportStatuses = [
  { label: '待处理', value: 'pending', type: 'warning' },
  { label: '处理中', value: 'processing', type: 'primary' },
  { label: '已处理', value: 'resolved', type: 'success' },
  { label: '无效举报', value: 'rejected', type: 'info' },
]
const quickRejectReasons = ['图片不清晰', '疑似联系方式/导流', '商品描述不完整', '价格或商品信息异常', '不符合二手发布规范']

const productStatus = (status: string) => productStatuses.find((item) => item.value === status) || { label: status || '未知', type: 'info' }
const orderStatus = (status: string) => orderStatuses.find((item) => item.value === status) || { label: status || '未知', type: 'info' }
const deliveryTypeTag = (deliveryType: string) => deliveryTypes.find((item) => item.value === deliveryType) || { label: deliveryType || '未设置', type: 'info' }
const reportStatus = (status: string) => reportStatuses.find((item) => item.value === status) || { label: status || '未知', type: 'info' }
const riskTagType = (level: string) => level === 'danger' ? 'danger' : level === 'warning' ? 'warning' : 'info'
const auditStatusText = (status: string) => ({ approved: '审核通过', rejected: '审核不通过/下架', pending: '待审核' } as Record<string, string>)[status] || status || '审核记录'
const conditionText = (value: string) => ({ new: '全新', like_new: '几乎全新', good: '轻微使用', fair: '明显使用' } as Record<string, string>)[value] || value || '-'

const regions = ref<any[]>([])
const stats = reactive({
  productTotal: 0,
  pending: 0,
  onSale: 0,
  sold: 0,
  offline: 0,
  rejected: 0,
  todayNew: 0,
  orderTotal: 0,
  todayOrders: 0,
  contacting: 0,
  pendingPay: 0,
  paid: 0,
  reportPending: 0,
  enabledRegions: 0,
})

const statItems = computed<StatItem[]>(() => [
  { label: '待审核商品', value: stats.pending, tone: 'orange', sub: '需要运营处理' },
  { label: '在售商品', value: stats.onSale, sub: '用户可浏览沟通' },
  { label: '交易意向/订单', value: stats.orderTotal, sub: `今日 ${stats.todayOrders} 单` },
  { label: '待处理举报', value: stats.reportPending, tone: 'red', sub: '优先排查风险' },
  { label: '已售出', value: stats.sold, sub: '累计成交闭环' },
])

const products = ref<any[]>([])
const selectedProducts = ref<any[]>([])
const prodLoading = ref(false)
const prodPage = ref(1)
const prodPageSize = ref(20)
const prodTotal = ref(0)
const prodFilters = reactive({ keyword: '', status: '', regionId: '', deliveryType: '' })

const orders = ref<any[]>([])
const orderLoading = ref(false)
const orderPage = ref(1)
const orderPageSize = ref(20)
const orderTotal = ref(0)
const orderFilters = reactive({ keyword: '', status: '', deliveryType: '' })

const reports = ref<any[]>([])
const reportLoading = ref(false)
const reportPage = ref(1)
const reportPageSize = ref(20)
const reportTotal = ref(0)
const reportFilters = reactive({ keyword: '', status: 'pending', regionId: '' })

const productDrawerVisible = ref(false)
const productDetailLoading = ref(false)
const selectedProduct = ref<any | null>(null)
const orderDrawerVisible = ref(false)
const orderDetailLoading = ref(false)
const selectedOrder = ref<any | null>(null)

const settingRegionId = ref('')
const settingForm = reactive({
  enableSecondHand: true,
  maxListings: 10 as number | null,
  requirePhone: false,
  requireAudit: false,
  enableOnlinePayment: false,
  enableAfterSale: false,
  enablePlatformGuarantee: false,
  enableAutoRecommend: false,
})
const settingSaving = ref(false)

const pendingPreview = computed(() => products.value.filter((item) => item.status === 'PENDING').slice(0, 5))
const riskPreview = computed(() => products.value.filter((item) => item.riskTags?.length).slice(0, 5))

function listFrom(res: any) {
  return res?.list || res?.data?.list || (Array.isArray(res) ? res : [])
}

function locationText(value: any) {
  if (!value) return '-'
  if (typeof value === 'string') return value
  const text = [value.name, value.address, value.detail].filter(Boolean).join(' ')
  if (text) return text
  if (value.latitude && value.longitude) return `${value.latitude}, ${value.longitude}`
  return '-'
}

function tradeRuleText(value: any) {
  const deliveryType = value?.deliveryType || ''
  if (deliveryType === '包邮') return '允许在线支付；交易位置非必填'
  if (deliveryType === '校内交易') return '必须有交易位置；不走在线支付，买卖双方私信确认'
  if (deliveryType === '买家自提') return '必须有自提位置；不走在线支付，买卖双方私信确认'
  return '按普通交易意向处理'
}

function addressText(value: any) {
  if (!value) return '-'
  if (typeof value === 'string') return value
  return [value.name, value.phone, value.address, value.detail, value.fullAddress].filter(Boolean).join(' ') || '-'
}

async function loadRegions() {
  try {
    const res: any = await request.get('/admin/regions')
    regions.value = listFrom(res)
    if (!settingRegionId.value && regions.value[0]?.id) settingRegionId.value = regions.value[0].id
  } catch (e: any) {
    ElMessage.error(e?.message || '加载区域失败')
    regions.value = []
  }
}

async function loadStats() {
  try {
    const res: any = await request.get('/admin/second-hand/stats')
    Object.assign(stats, res || {})
  } catch (e: any) {
    ElMessage.error(e?.message || '加载二手统计失败')
  }
}

async function loadProducts() {
  prodLoading.value = true
  try {
    const params = { page: prodPage.value, pageSize: prodPageSize.value, ...prodFilters }
    const res: any = await request.get('/admin/second-hand/products', { params })
    products.value = listFrom(res)
    prodTotal.value = res.total || res.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载商品失败')
    products.value = []
  } finally {
    prodLoading.value = false
  }
}

function resetProductFilters() {
  Object.assign(prodFilters, { keyword: '', status: '', regionId: '', deliveryType: '' })
  prodPage.value = 1
  loadProducts()
}

function handleProductSelection(rows: any[]) {
  selectedProducts.value = rows
}

async function refreshAfterChange() {
  await Promise.all([loadProducts(), loadStats()])
  if (productDrawerVisible.value && selectedProduct.value?.id) {
    await openProductDetail(selectedProduct.value.id, false)
  }
}

async function setProductStatus(id: string, status: string, auditReason = '') {
  try {
    await request.put(`/admin/second-hand/products/${id}/status`, { status, auditReason })
    ElMessage.success('操作成功')
    await refreshAfterChange()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

async function rejectProduct(id: string, presetReason = '') {
  try {
    let reason = presetReason
    if (!reason) {
      const { value } = await ElMessageBox.prompt('请输入驳回原因，用户和运营后台都会看到', '驳回二手商品', {
        confirmButtonText: '驳回',
        cancelButtonText: '取消',
        inputPlaceholder: '例如：图片不清晰、含联系方式、商品信息不完整',
      })
      reason = value || ''
    }
    await setProductStatus(id, 'REJECTED', reason || '商品信息不符合发布规范')
  } catch {
    // 用户取消
  }
}

async function batchSetStatus(status: string) {
  if (!selectedProducts.value.length) return
  try {
    await ElMessageBox.confirm(`确定处理选中的 ${selectedProducts.value.length} 个商品？`, '批量处理', {
      type: status === 'ON_SALE' ? 'success' : 'warning',
    })
    await request.post('/admin/second-hand/products/batch-status', {
      ids: selectedProducts.value.map((item) => item.id),
      status,
      auditReason: status === 'ON_SALE' ? '批量审核通过' : '批量运营处理',
    })
    ElMessage.success('批量处理完成')
    selectedProducts.value = []
    await refreshAfterChange()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '批量处理失败')
  }
}

async function batchReject() {
  if (!selectedProducts.value.length) return
  try {
    const { value } = await ElMessageBox.prompt('请输入批量驳回原因', '批量驳回', {
      confirmButtonText: '驳回',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：含联系方式、商品信息不完整',
    })
    await request.post('/admin/second-hand/products/batch-status', {
      ids: selectedProducts.value.map((item) => item.id),
      status: 'REJECTED',
      auditReason: value || '商品信息不符合发布规范',
    })
    ElMessage.success('批量驳回完成')
    selectedProducts.value = []
    await refreshAfterChange()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '批量驳回失败')
  }
}

async function deleteProduct(id: string) {
  try {
    await request.delete(`/admin/second-hand/products/${id}`)
    ElMessage.success('已删除')
    await refreshAfterChange()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败')
  }
}

async function openProductDetail(id: string, showDrawer = true) {
  if (showDrawer) productDrawerVisible.value = true
  productDetailLoading.value = true
  try {
    selectedProduct.value = await request.get(`/admin/second-hand/products/${id}`)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载商品详情失败')
  } finally {
    productDetailLoading.value = false
  }
}

async function loadOrders() {
  orderLoading.value = true
  try {
    const params = {
      page: orderPage.value,
      pageSize: orderPageSize.value,
      orderNo: orderFilters.keyword || undefined,
      status: orderFilters.status || undefined,
      deliveryType: orderFilters.deliveryType || undefined,
    }
    const res: any = await request.get('/admin/second-hand/orders', { params })
    orders.value = listFrom(res)
    orderTotal.value = res.total || res.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载订单失败')
    orders.value = []
  } finally {
    orderLoading.value = false
  }
}

function resetOrderFilters() {
  Object.assign(orderFilters, { keyword: '', status: '', deliveryType: '' })
  orderPage.value = 1
  loadOrders()
}

async function openOrderDetail(id: string) {
  orderDrawerVisible.value = true
  orderDetailLoading.value = true
  try {
    selectedOrder.value = await request.get(`/admin/second-hand/orders/${id}`)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载交易详情失败')
  } finally {
    orderDetailLoading.value = false
  }
}

async function setOrderStatus(id: string, status: string) {
  const label = orderStatus(status).label
  try {
    let reason = `运营标记${label}`
    if (['cancelled', 'refunded'].includes(status)) {
      const { value } = await ElMessageBox.prompt(`请输入${label}原因`, '处理二手订单', {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        inputPlaceholder: '例如：双方协商取消、退款已完成',
      })
      reason = value || reason
    } else {
      await ElMessageBox.confirm(`确定将订单标记为「${label}」？`, '处理二手订单')
    }
    await request.put(`/admin/second-hand/orders/${id}/status`, { status, reason })
    ElMessage.success('订单已更新')
    await Promise.all([loadOrders(), loadStats()])
    if (orderDrawerVisible.value && selectedOrder.value?.id) await openOrderDetail(selectedOrder.value.id)
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '订单处理失败')
  }
}

async function requestOrderRefund(row: any) {
  try {
    const { value } = await ElMessageBox.prompt('请输入退款原因，系统会按订单金额发起退款', '二手订单退款', {
      confirmButtonText: '发起退款',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：举报成立，买卖双方协商退款',
    })
    await request.post('/wxpay/refund', {
      bizType: 'second_hand',
      bizId: row.id,
      amount: Number(row.price || 0),
      reason: value || '二手订单运营退款',
    })
    ElMessage.success('退款已发起')
    await Promise.all([loadOrders(), loadStats()])
    if (orderDrawerVisible.value && selectedOrder.value?.id) await openOrderDetail(selectedOrder.value.id)
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '退款失败')
  }
}

async function loadReports() {
  reportLoading.value = true
  try {
    const params = { page: reportPage.value, pageSize: reportPageSize.value, ...reportFilters }
    const res: any = await request.get('/admin/second-hand/reports', { params })
    reports.value = listFrom(res)
    reportTotal.value = res.total || res.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载举报失败')
    reports.value = []
  } finally {
    reportLoading.value = false
  }
}

function resetReportFilters() {
  Object.assign(reportFilters, { keyword: '', status: 'pending', regionId: '' })
  reportPage.value = 1
  loadReports()
}

async function handleReport(row: any, action: string) {
  try {
    const prompts: Record<string, string> = {
      record: '请输入处理备注',
      offline: '请输入下架原因',
      reject: '请输入驳回原因',
      mute_user: '请输入禁言原因',
      ban_user: '请输入封禁原因',
    }
    const { value } = await ElMessageBox.prompt(prompts[action] || '请输入处理备注', '处理二手举报', {
      confirmButtonText: '确认处理',
      cancelButtonText: '取消',
      inputPlaceholder: '运营处理说明，后续可追溯',
    })
    await request.put(`/admin/second-hand/reports/${row.id}/handle`, {
      action,
      result: value || '二手举报处理完成',
      muteDays: action === 'mute_user' ? 7 : undefined,
    })
    ElMessage.success('举报已处理')
    await Promise.all([loadReports(), loadProducts(), loadStats()])
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '处理举报失败')
  }
}

function openPrivateMessages(row: any) {
  const keyword = row?.buyer?.nickname || row?.seller?.nickname || row?.buyerId || row?.sellerId || ''
  router.push({ path: '/user/private-messages', query: keyword ? { keyword } : {} })
}

function openReportMessages(row: any) {
  const keyword = row?.reporter?.nickname || row?.reported?.nickname || row?.reporterId || row?.reportedId || ''
  router.push({ path: '/user/private-messages', query: keyword ? { keyword } : {} })
}

async function loadSetting() {
  if (!settingRegionId.value) return
  try {
    const res: any = await request.get(`/admin/second-hand/settings/${settingRegionId.value}`)
    if (res) Object.assign(settingForm, res)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载配置失败')
  }
}

async function saveSetting() {
  if (!settingRegionId.value) return
  settingSaving.value = true
  try {
    const payload = {
      enableSecondHand: settingForm.enableSecondHand,
      maxListings: settingForm.maxListings,
      requirePhone: settingForm.requirePhone,
      requireAudit: settingForm.requireAudit,
      enableOnlinePayment: settingForm.enableOnlinePayment,
      enableAfterSale: settingForm.enableAfterSale,
      enablePlatformGuarantee: settingForm.enablePlatformGuarantee,
      enableAutoRecommend: settingForm.enableAutoRecommend,
    }
    await request.put(`/admin/second-hand/settings/${settingRegionId.value}`, payload)
    ElMessage.success('保存成功')
    await loadStats()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    settingSaving.value = false
  }
}

function handleTabChange() {
  const loaders: Record<string, () => void> = {
    overview: () => { loadStats(); loadProducts() },
    products: loadProducts,
    orders: loadOrders,
    reports: loadReports,
    settings: loadSetting,
  }
  loaders[activeTab.value]?.()
}

function jumpToStatus(status: string) {
  activeTab.value = 'products'
  prodFilters.status = status
  prodPage.value = 1
  loadProducts()
}

function jumpToRisk() {
  activeTab.value = 'products'
  Object.assign(prodFilters, { keyword: '', status: '', regionId: '', deliveryType: '' })
  prodPage.value = 1
  loadProducts()
}

function jumpToReports() {
  activeTab.value = 'reports'
  reportFilters.status = 'pending'
  reportPage.value = 1
  loadReports()
}

onMounted(async () => {
  await loadRegions()
  await Promise.all([loadStats(), loadProducts(), loadReports(), loadSetting()])
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.panel { background: var(--mx-card); border: 1px solid var(--mx-border); border-radius: 6px; padding: 18px; min-height: 280px; }
.panel:nth-child(3) { grid-column: 1 / -1; min-height: 180px; }
.panel-head, .section-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.panel h3, .detail-section h3, .setting-section h3 { margin: 0; font-size: 16px; color: var(--mx-text); }
.panel p { margin: 6px 0 0; color: var(--mx-muted); font-size: 13px; }
.mini-list { display: flex; flex-direction: column; gap: 10px; }
.mini-row { width: 100%; border: 1px solid var(--mx-border); background: var(--mx-soft); border-radius: 6px; padding: 10px; display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer; }
.mini-row:hover { border-color: var(--el-color-primary-light-7); background: var(--mx-hover); }
.mini-cover { width: 44px; height: 44px; border-radius: 6px; background: var(--mx-soft); flex: 0 0 auto; }
.mini-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.mini-main strong, .mini-main span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-main span { color: var(--mx-muted); font-size: 12px; }
.risk-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--el-color-danger); flex: 0 0 auto; }
.ops-grid { display: grid; grid-template-columns: repeat(6, minmax(120px, 1fr)); gap: 12px; }
.ops-grid.compact { grid-template-columns: repeat(4, minmax(100px, 1fr)); }
.ops-grid div { border: 1px solid var(--mx-border); background: var(--mx-soft); border-radius: 6px; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.ops-grid strong { color: var(--mx-text); font-size: 22px; }
.ops-grid span { color: var(--mx-muted); font-size: 12px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.batch-bar { display: flex; align-items: center; gap: 10px; background: var(--mx-soft); border: 1px solid var(--mx-border-strong); border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; color: var(--mx-sub); }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.product-cell { display: flex; gap: 12px; align-items: center; min-width: 0; }
.product-cell.small { gap: 8px; }
.product-main { min-width: 0; }
.cover { width: 64px; height: 64px; border-radius: 6px; background: var(--mx-soft); flex: 0 0 auto; }
.cover.mini { width: 42px; height: 42px; }
.empty-cover { display: flex; align-items: center; justify-content: center; color: var(--mx-muted); font-size: 12px; }
.product-title { font-weight: 700; color: var(--mx-text); margin-bottom: 4px; }
.muted { color: var(--mx-muted); font-size: 12px; }
.line-clamp { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-row { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
.price { font-weight: 800; color: var(--mx-text); }
.reason { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px; }
.user-line { display: flex; align-items: center; gap: 8px; }
.drawer-shell { padding: 4px 4px 24px; }
.detail-hero { display: grid; grid-template-columns: 104px 1fr auto; gap: 14px; align-items: center; border: 1px solid var(--mx-border); background: var(--mx-card); border-radius: 6px; padding: 14px; }
.detail-cover { width: 104px; height: 104px; border-radius: 6px; background: var(--mx-soft); }
.detail-title { min-width: 0; }
.detail-title h2 { margin: 0 0 8px; font-size: 20px; color: var(--mx-text); }
.detail-title p { margin: 0; color: var(--mx-sub); line-height: 1.6; max-height: 52px; overflow: hidden; }
.detail-price { color: var(--mx-text); font-size: 24px; font-weight: 800; white-space: nowrap; }
.detail-section { margin-top: 16px; border: 1px solid var(--mx-border); background: var(--mx-card); border-radius: 6px; padding: 16px; }
.image-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.image-grid :deep(.el-image) { aspect-ratio: 1; border-radius: 6px; background: var(--mx-soft); }
.report-list { display: flex; flex-direction: column; gap: 10px; }
.report-row { border: 1px solid var(--mx-border); border-radius: 6px; padding: 10px; background: var(--mx-soft); }
.report-row strong { color: var(--mx-text); display: block; margin-bottom: 4px; }
.report-row span { color: var(--mx-muted); font-size: 12px; }
.report-row p { margin: 6px 0 0; color: var(--mx-sub); }
.drawer-actions { position: sticky; bottom: 0; background: var(--mx-card); border-top: 1px solid var(--mx-border); padding: 12px 0 0; margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px; }
.party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.party-card { border: 1px solid var(--mx-border); border-radius: 6px; padding: 14px; background: var(--mx-soft); display: flex; flex-direction: column; gap: 6px; }
.party-card span, .party-card em { color: var(--mx-muted); font-size: 12px; font-style: normal; }
.party-card strong { color: var(--mx-text); font-size: 16px; }
.setting-form { max-width: 760px; }
.setting-section { background: var(--mx-card); border: 1px solid var(--mx-border); border-radius: 6px; padding: 18px 18px 4px; margin-bottom: 14px; }
.setting-section h3 { margin-bottom: 12px; }

@media (max-width: 1200px) {
  .overview-grid { grid-template-columns: 1fr; }
  .panel:nth-child(3) { grid-column: auto; }
  .ops-grid { grid-template-columns: repeat(3, minmax(120px, 1fr)); }
}
</style>

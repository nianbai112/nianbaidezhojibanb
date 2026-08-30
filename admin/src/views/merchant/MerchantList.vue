<template>
  <div class="page-shell">
    <PageHeader
      :title="pageTitle"
      :subtitle="pageSubtitle"
      :icon="isDormShopPage ? 'House' : 'Shop'"
    />
    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索商家名称/联系人/手机号"
        clearable
        style="width: 260px"
        @clear="loadData"
        @keyup.enter="loadData"
      />
      <el-select
        v-model="filters.regionId"
        placeholder="区域"
        clearable
        style="width: 150px"
        @change="loadData"
      >
        <el-option
          v-for="r in regionList"
          :key="r.id"
          :label="r.name"
          :value="r.id"
        />
      </el-select>
      <el-select
        v-model="filters.categoryId"
        placeholder="分类"
        clearable
        style="width: 150px"
        @change="loadData"
      >
        <el-option
          v-for="c in categoryList"
          :key="c.id"
          :label="c.name"
          :value="c.id"
        />
      </el-select>
      <el-select
        v-model="filters.auditStatus"
        placeholder="状态"
        clearable
        style="width: 120px"
        @change="loadData"
      >
        <el-option label="待审核" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已拒绝" value="rejected" />
        <el-option label="已关闭" value="closed" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="primary" @click="openEdit()">{{
        isDormShopPage ? "新增小店" : "新增商家"
      }}</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="logo" label="Logo" width="70">
        <template #default="{ row }">
          <el-image
            v-if="row.logo"
            :src="row.logo"
            style="width: 40px; height: 40px; border-radius: 6px"
          />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="name"
        label="商家名称"
        min-width="140"
        show-overflow-tooltip
      />
      <el-table-column
        :label="isDormShopPage ? '店主小程序用户' : '商家小程序用户'"
        min-width="190"
      >
        <template #default="{ row }">
          <div v-if="merchantOwner(row)" class="user-cell">
            <el-avatar :size="32" :src="merchantOwner(row).avatar">{{
              userInitial(merchantOwner(row))
            }}</el-avatar>
            <div class="user-meta">
              <div class="user-name">
                {{ merchantOwner(row).nickname || "未设置昵称" }}
              </div>
              <div class="user-sub">
                {{
                  merchantOwner(row).phone ||
                  `UID ${merchantOwner(row).uid || merchantOwner(row).id}`
                }}
              </div>
            </div>
          </div>
          <el-tag v-else type="danger" size="small">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="contactPerson" label="联系人" width="100" />
      <el-table-column prop="phone" label="手机号" width="120" />
      <el-table-column
        prop="regionName"
        label="区域"
        width="120"
        show-overflow-tooltip
      />
      <el-table-column
        prop="categoryName"
        label="分类"
        width="100"
        show-overflow-tooltip
      />
      <el-table-column
        prop="address"
        label="地址"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="isDormShopPage"
        prop="dormBuilding"
        label="宿舍楼"
        width="90"
      >
        <template #default="{ row }">{{ row.dormBuilding || "-" }}</template>
      </el-table-column>
      <el-table-column
        v-if="isDormShopPage"
        prop="dormRoom"
        label="房间"
        width="90"
      >
        <template #default="{ row }">{{ row.dormRoom || "-" }}</template>
      </el-table-column>
      <el-table-column
        v-if="isDormShopPage"
        prop="studentVerified"
        label="平台审核"
        width="100"
      >
        <template #default="{ row }">
          <el-tag
            :type="row.studentVerified ? 'success' : 'warning'"
            size="small"
            >{{ row.studentVerified ? "已认证" : "未确认" }}</el-tag
          >
        </template>
      </el-table-column>
      <el-table-column
        v-if="isDormShopPage"
        prop="deliveryMode"
        label="配送方式"
        width="110"
      >
        <template #default="{ row }">
          <el-tag type="success" size="small">{{
            deliveryModeLabel(row.deliveryMode)
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        v-if="isDormShopPage"
        prop="deliveryFee"
        label="配送费"
        width="90"
      >
        <template #default="{ row }"
          >¥{{ Number(row.deliveryFee || 0).toFixed(2) }}</template
        >
      </el-table-column>
      <el-table-column
        v-if="isDormShopPage"
        prop="businessHours"
        label="营业时间"
        width="130"
      >
        <template #default="{ row }">
          <el-tag v-if="row.businessHours" type="info" size="small">{{
            businessHoursLabel(row.businessHours)
          }}</el-tag>
          <el-tag v-else type="danger" size="small">未设置</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        v-if="isDormShopPage"
        prop="closedNotice"
        label="关闭提示"
        width="160"
        show-overflow-tooltip
      >
        <template #default="{ row }">
          <span v-if="row.auditStatus === 'closed'">{{
            row.closedNotice || "-"
          }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="score" label="评分" width="80">
        <template #default="{ row }">{{
          row.score || row.rating || "-"
        }}</template>
      </el-table-column>
      <el-table-column prop="orderCount" label="销量" width="80">
        <template #default="{ row }">{{
          row.orderCount || row.saleCount || 0
        }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag
            :type="statusTypeMap[row.auditStatus || row.status]"
            size="small"
            >{{
              statusMap[row.auditStatus || row.status] || row.status
            }}</el-tag
          >
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
          <el-button size="small" @click="managePrinters(row)">设备</el-button>
          <el-button size="small" type="primary" @click="openEdit(row)"
            >编辑</el-button
          >
          <el-button
            v-if="row.auditStatus === 'pending'"
            size="small"
            type="success"
            @click="audit(row, 'approved')"
            >通过</el-button
          >
          <el-button
            v-if="row.auditStatus === 'pending'"
            size="small"
            type="danger"
            @click="audit(row, 'rejected')"
            >拒绝</el-button
          >
          <el-button
            v-if="row.auditStatus === 'approved'"
            size="small"
            type="warning"
            @click="toggleStatus(row)"
            >关闭</el-button
          >
          <el-button
            v-if="row.auditStatus === 'closed'"
            size="small"
            type="success"
            @click="toggleStatus(row)"
            >启用</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @size-change="loadData"
        @current-change="loadData"
      />
    </div>

    <el-dialog
      v-model="editVisible"
      :title="
        editingId
          ? isDormShopPage
            ? '编辑宿舍小店'
            : '编辑商家'
          : isDormShopPage
            ? '新增宿舍小店'
            : '新增商家'
      "
      width="760px"
      :close-on-click-modal="false"
    >
      <el-form
        :model="form"
        label-width="100px"
        :rules="formRules"
        ref="formRef"
      >
        <el-form-item
          :label="isDormShopPage ? '店主用户' : '商家用户'"
          prop="userId"
        >
          <el-select
            v-model="form.userId"
            filterable
            clearable
            placeholder="选择对应的小程序用户"
            style="width: 100%"
          >
            <el-option
              v-for="user in miniUsers"
              :key="user.id"
              :label="userOptionLabel(user)"
              :value="user.id"
            />
          </el-select>
          <div class="form-tip">
            后台必须知道这个小店/商家对应哪个小程序用户，后续订单通知、权限和纠纷追踪都靠它。
          </div>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="商家名称" prop="name"
              ><el-input v-model="form.name" placeholder="请输入商家名称"
            /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系人" prop="contactPerson"
              ><el-input
                v-model="form.contactPerson"
                placeholder="请输入联系人"
            /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="手机号" prop="phone"
              ><el-input v-model="form.phone" placeholder="请输入手机号"
            /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select
                v-model="form.status"
                placeholder="请选择状态"
                style="width: 100%"
              >
                <el-option label="待审核" value="pending" />
                <el-option label="已通过" value="approved" />
                <el-option label="已拒绝" value="rejected" />
                <el-option label="已关闭" value="closed" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item
          v-if="isDormShopPage && form.status === 'closed'"
          label="关闭提示"
          prop="closedNotice"
        >
          <el-input
            v-model="form.closedNotice"
            type="textarea"
            :rows="3"
            maxlength="120"
            show-word-limit
            placeholder="例如：店主临时有事，今晚暂停接单，明天恢复营业。"
          />
          <div class="form-tip">
            这段文字会在小程序用户点进关闭的小店时弹窗展示。
          </div>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="区域" prop="regionId">
              <el-select
                v-model="form.regionId"
                placeholder="请选择区域"
                style="width: 100%"
                filterable
              >
                <el-option
                  v-for="r in regionList"
                  :key="r.id"
                  :label="r.name"
                  :value="r.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item
              :label="isDormShopPage ? '分类(可选)' : '分类'"
              prop="categoryId"
            >
              <el-select
                v-model="form.categoryId"
                :placeholder="
                  isDormShopPage ? '可不填，默认全部商品' : '请选择分类'
                "
                style="width: 100%"
                filterable
                clearable
                :no-data-text="isDormShopPage ? '暂无分类，可不填' : '暂无分类'"
              >
                <el-option
                  v-for="c in categoryList"
                  :key="c.id"
                  :label="c.name"
                  :value="c.id"
                />
              </el-select>
              <div v-if="isDormShopPage" class="form-tip">
                宿舍小店不强制店铺分类；后面商品分类在商品管理里单独维护。
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="地址" prop="address">
          <div class="address-picker-row">
            <el-input
              v-model="form.address"
              placeholder="可手动填写，地图选择后会自动带入"
            />
            <el-button
              type="primary"
              plain
              :icon="Location"
              @click="mapVisible = true"
              >地图选点</el-button
            >
          </div>
          <div class="form-tip">
            运营不用记经纬度，点“地图选点”搜索宿舍楼或学校位置即可自动回填。
          </div>
        </el-form-item>
        <el-row v-if="isDormShopPage" :gutter="16">
          <el-col :span="8">
            <el-form-item label="宿舍楼"
              ><el-input v-model="form.dormBuilding" placeholder="如 18"
            /></el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="房间号"
              ><el-input v-model="form.dormRoom" placeholder="如 304"
            /></el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="平台学生审核"
              ><el-switch
                v-model="form.studentVerified"
                active-text="已通过"
                inactive-text="待审核"
            /></el-form-item>
          </el-col>
        </el-row>
        <el-row v-if="isDormShopPage" :gutter="16">
          <el-col :span="12">
            <el-form-item label="配送方式">
              <el-tag type="success" size="large">小店自配送</el-tag>
              <div class="form-tip">
                由店主或店主管理的配送店员送货，不进入平台骑手池。
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="配送费">
              <el-input-number
                v-model="form.deliveryFee"
                :min="0"
                :precision="2"
                :step="0.5"
                controls-position="right"
                style="width: 100%"
              />
              <div class="form-tip">由小店自配送收取，可设为 0 元。</div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="经度"
              ><el-input
                v-model="form.longitude"
                placeholder="地图选点后自动生成"
            /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="纬度"
              ><el-input
                v-model="form.latitude"
                placeholder="地图选点后自动生成"
            /></el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="营业时间" prop="businessHoursRange">
          <div class="business-hours-range">
            <el-time-picker
              v-model="form.businessHoursRange[0]"
              placeholder="开始时间"
              format="HH:mm"
              value-format="HH:mm"
            />
            <span>至</span>
            <el-time-picker
              v-model="form.businessHoursRange[1]"
              placeholder="结束时间"
              format="HH:mm"
              value-format="HH:mm"
            />
          </div>
          <div
            v-if="isWeeklyBusinessHours(form.businessHours)"
            class="form-tip"
          >
            该商家使用每周营业计划，请在商家端维护；本次保存会保留原计划。
          </div>
          <div v-if="isDormShopPage" class="form-tip">
            宿舍小店必须选择真实营业时间，小程序只会在这个时间范围内生成配送时间；结束时间早于开始时间表示跨午夜营业（如 18:00 至 01:00）。
          </div>
        </el-form-item>
        <el-form-item label="描述"
          ><el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="商家描述"
        /></el-form-item>
        <el-form-item label="Logo">
          <ImageUploadBox
            v-model="form.logo"
            scene="merchant-logo"
            shape="square"
            placeholder="上传商家 Logo"
            tip="建议 200x200，可替换和删除"
            :max-size="2"
          />
        </el-form-item>
        <el-form-item label="封面">
          <ImageUploadBox
            v-model="form.cover"
            scene="merchant-cover"
            shape="wide"
            placeholder="上传商家封面"
            tip="建议 750x350，可替换和删除"
            :max-size="5"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <AmapLocationPicker
      v-model:visible="mapVisible"
      :default-center="mapDefaultCenter"
      :default-city="mapDefaultCity"
      @confirm="onMapConfirm"
    />

    <el-dialog
      v-model="detailVisible"
      :title="detail ? `商家档案 · ${detail.name}` : '商家档案'"
      width="860px"
      destroy-on-close
    >
      <el-tabs
        v-if="detail"
        v-model="detailTab"
        v-loading="detailContextLoading"
      >
        <el-tab-pane label="经营档案" name="overview">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="商家名称">{{
              detail.name
            }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{
              statusMap[detail.status] || detail.status
            }}</el-descriptions-item>
            <el-descriptions-item
              :label="isDormShopPage ? '店主小程序用户' : '商家小程序用户'"
              :span="2"
            >
              <div v-if="merchantOwner(detail)" class="user-cell">
                <el-avatar :size="36" :src="merchantOwner(detail).avatar">{{
                  userInitial(merchantOwner(detail))
                }}</el-avatar>
                <div class="user-meta">
                  <div class="user-name">
                    {{ merchantOwner(detail).nickname || "未设置昵称" }}
                  </div>
                  <div class="user-sub">
                    用户ID：{{ merchantOwner(detail).id }}
                  </div>
                </div>
              </div>
              <el-tag v-else type="danger" size="small"
                >未绑定小程序用户</el-tag
              >
            </el-descriptions-item>
            <el-descriptions-item label="小程序手机号">{{
              merchantOwner(detail)?.phone || "-"
            }}</el-descriptions-item>
            <el-descriptions-item label="小程序UID">{{
              merchantOwner(detail)?.uid
                ? `UID ${merchantOwner(detail).uid}`
                : "-"
            }}</el-descriptions-item>
            <el-descriptions-item label="联系人">{{
              detail.contactPerson || "-"
            }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{
              detail.phone || "-"
            }}</el-descriptions-item>
            <el-descriptions-item label="区域">{{
              detail.region?.name || detail.regionName || "-"
            }}</el-descriptions-item>
            <el-descriptions-item label="分类">{{
              detail.category?.name || detail.categoryName || "-"
            }}</el-descriptions-item>
            <el-descriptions-item label="地址" :span="2">{{
              detail.address || "-"
            }}</el-descriptions-item>
            <el-descriptions-item v-if="isDormShopPage" label="配送方式"
              >小店自配送（店主/配送店员）</el-descriptions-item
            >
            <el-descriptions-item v-if="isDormShopPage" label="配送费"
              >¥{{
                Number(detail.deliveryFee || 0).toFixed(2)
              }}</el-descriptions-item
            >
            <el-descriptions-item label="营业时间">{{
              businessHoursLabel(detail.businessHours)
            }}</el-descriptions-item>
            <el-descriptions-item
              v-if="detail.status === 'closed'"
              label="关闭提示"
              :span="2"
              >{{ detail.closedNotice || "-" }}</el-descriptions-item
            >
            <el-descriptions-item label="评分">{{
              detail.rating || "-"
            }}</el-descriptions-item>
            <el-descriptions-item label="销量">{{
              detail.saleCount || 0
            }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{
              formatDate(detail.createdAt)
            }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{
              formatDate(detail.updatedAt)
            }}</el-descriptions-item>
            <el-descriptions-item label="描述" :span="2">{{
              detail.description || "-"
            }}</el-descriptions-item>
          </el-descriptions>
          <div class="detail-action">
            <el-button
              type="primary"
              plain
              @click="openMerchantScope('/finance/merchant-settle')"
              >查看该商家结算</el-button
            >
          </div>
        </el-tab-pane>
        <el-tab-pane
          :label="`商品（${detailProducts.length}）`"
          name="products"
        >
          <el-table :data="detailProducts" size="small" max-height="300"
            ><el-table-column
              prop="name"
              label="商品"
              min-width="180"
            /><el-table-column prop="price" label="售价" width="100"
              ><template #default="{ row }"
                >¥{{ Number(row.price || 0).toFixed(2) }}</template
              ></el-table-column
            ><el-table-column
              prop="stock"
              label="库存"
              width="80"
            /><el-table-column prop="status" label="状态" width="90"
              ><template #default="{ row }"
                ><el-tag
                  size="small"
                  :type="row.status === 'on_sale' ? 'success' : 'info'"
                  >{{ row.status === "on_sale" ? "上架" : "下架" }}</el-tag
                ></template
              ></el-table-column
            ></el-table
          >
          <el-empty
            v-if="!detailProducts.length && !detailContextLoading"
            description="暂未添加商品"
          />
          <div class="detail-action">
            <el-button
              type="primary"
              plain
              @click="openMerchantScope('/merchant/products')"
              >管理该商家商品</el-button
            >
          </div>
        </el-tab-pane>
        <el-tab-pane :label="`订单（${detailOrders.length}）`" name="orders">
          <el-table :data="detailOrders" size="small" max-height="300"
            ><el-table-column
              prop="orderNo"
              label="订单号"
              min-width="180"
            /><el-table-column label="实付" width="100"
              ><template #default="{ row }"
                >¥{{
                  Number(row.payAmount || row.amount || 0).toFixed(2)
                }}</template
              ></el-table-column
            ><el-table-column label="状态" width="130"
              ><template #default="{ row }">{{
                orderStatusLabel(row)
              }}</template></el-table-column
            ><el-table-column label="下单时间" width="170"
              ><template #default="{ row }">{{
                formatDate(row.createdAt)
              }}</template></el-table-column
            ></el-table
          >
          <el-empty
            v-if="!detailOrders.length && !detailContextLoading"
            description="暂未产生订单"
          />
          <div class="detail-action">
            <el-button
              type="primary"
              plain
              @click="openMerchantScope('/merchant/orders')"
              >查看该商家履约订单</el-button
            >
          </div>
        </el-tab-pane>
        <el-tab-pane
          :label="`打印设备（${detailPrinters.length}）`"
          name="printers"
        >
          <el-table :data="detailPrinters" size="small" max-height="300"
            ><el-table-column
              prop="name"
              label="设备名称"
              min-width="180"
            /><el-table-column prop="brand" label="品牌" width="110"
              ><template #default="{ row }">{{
                printerBrandLabel(row.brand)
              }}</template></el-table-column
            ><el-table-column
              prop="sn"
              label="设备编号"
              min-width="160"
            /><el-table-column label="状态" width="90"
              ><template #default="{ row }"
                ><el-tag
                  size="small"
                  :type="row.status === 'active' ? 'success' : 'info'"
                  >{{ row.status === "active" ? "启用" : "停用" }}</el-tag
                ></template
              ></el-table-column
            ></el-table
          >
          <el-empty
            v-if="!detailPrinters.length && !detailContextLoading"
            description="暂未配置打印设备"
          />
          <div class="detail-action">
            <el-button
              type="primary"
              plain
              @click="openMerchantScope('/merchant/printers')"
              >配置该商家设备</el-button
            >
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import {
  getMerchants,
  createMerchant,
  updateMerchant,
  auditMerchant,
  updateMerchantStatus,
  getMerchantDetail,
  getProducts,
  getMerchantOrders,
  getPrinters,
} from "@/api/merchant";
import { getCategories } from "@/api/merchant";
import { fetchRegions } from "@/api/admin";
import { request } from "@/api/request";
import { ElMessage, ElMessageBox } from "element-plus";
import { Location } from "@element-plus/icons-vue";
import ImageUploadBox from "@/components/common/ImageUploadBox.vue";
import AmapLocationPicker from "@/components/common/AmapLocationPicker.vue";

const statusMap: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
  closed: "已关闭",
};
const statusTypeMap: Record<string, string> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  closed: "info",
};
const route = useRoute();
const router = useRouter();
const isDormShopPage = computed(() => route.path.includes("/dorm-"));
const businessType = computed(() =>
  isDormShopPage.value ? "dorm_shop" : "takeaway",
);
const pageTitle = computed(() =>
  isDormShopPage.value ? "宿舍小店" : "商家管理",
);
const pageSubtitle = computed(() =>
  isDormShopPage.value
    ? "管理学生运营的小店、楼栋范围和审核状态"
    : "管理入驻审核、营业状态与经营资料",
);

const loading = ref(false);
const list = ref<any[]>([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const filters = reactive({
  keyword: "",
  regionId: "",
  categoryId: "",
  auditStatus: "",
});
const regionList = ref<any[]>([]);
const categoryList = ref<any[]>([]);
const miniUsers = ref<any[]>([]);

const editVisible = ref(false);
const mapVisible = ref(false);
const editingId = ref("");
const form = reactive<any>({
  userId: "",
  name: "",
  contactPerson: "",
  phone: "",
  regionId: "",
  categoryId: "",
  address: "",
  dormBuilding: "",
  dormRoom: "",
  studentVerified: false,
  deliveryMode: "self_delivery",
  deliveryFee: 0,
  latitude: "",
  longitude: "",
  businessHours: "",
  businessHoursRange: [],
  closedNotice: "",
  description: "",
  logo: "",
  cover: "",
  status: "pending",
});
const formRef = ref<any>(null);
const baseRules = {
  userId: [
    { required: true, message: "请选择对应的小程序用户", trigger: "change" },
  ],
  name: [{ required: true, message: "请输入商家名称", trigger: "blur" }],
  regionId: [{ required: true, message: "请选择区域", trigger: "change" }],
};
const validateBusinessHoursRange = (
  _rule: any,
  value: string[],
  callback: (error?: Error) => void,
) => {
  if (isWeeklyBusinessHours(form.businessHours)) return callback();
  if (!isDormShopPage.value && (!value || value.length === 0))
    return callback();
  if (!Array.isArray(value) || value.length !== 2 || !value[0] || !value[1]) {
    return callback(new Error("请选择营业时间"));
  }
  if (value[0] === value[1]) {
    return callback(new Error("开始时间与结束时间不能相同"));
  }
  callback();
};
const validateClosedNotice = (
  _rule: any,
  value: string,
  callback: (error?: Error) => void,
) => {
  if (!isDormShopPage.value || form.status !== "closed") return callback();
  if (!String(value || "").trim()) {
    return callback(new Error("请输入小程序关闭提示"));
  }
  callback();
};
const formRules = computed(() => ({
  ...baseRules,
  ...(isDormShopPage.value
    ? {
        businessHoursRange: [
          { validator: validateBusinessHoursRange, trigger: "change" },
        ],
        closedNotice: [{ validator: validateClosedNotice, trigger: "blur" }],
      }
    : {
        categoryId: [
          { required: true, message: "请选择分类", trigger: "change" },
        ],
      }),
}));

const detailVisible = ref(false);
const detail = ref<any>(null);
const detailTab = ref("overview");
const detailContextLoading = ref(false);
const detailProducts = ref<any[]>([]);
const detailOrders = ref<any[]>([]);
const detailPrinters = ref<any[]>([]);

const formatDate = (d: any) => (d ? new Date(d).toLocaleString("zh-CN") : "-");
const orderStatusLabel = (row: any) =>
  ({
    PENDING_PAY: "待付款",
    PAID: "待商家接单",
    SHIPPED: "配送中",
    DELIVERED: "已送达",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    REFUNDING: "退款中",
    REFUNDED: "已退款",
  })[row?.status] ||
  row?.status ||
  "-";
const printerBrandLabel = (brand?: string) =>
  ({ feie: "飞鹅云", yly: "易联云", xpyun: "芯烨云", gprinter: "佳博云" })[
    String(brand || "")
  ] ||
  brand ||
  "-";
const deliveryModeLabel = (value?: string) =>
  value === "platform_rider" ? "平台配送" : "小店自配送";
const merchantOwner = (row: any) => row?.ownerUser || row?.user || null;
const userInitial = (user: any) => String(user?.nickname || "用").slice(0, 1);
const ensureMiniUserOption = (user: any) => {
  if (!user?.id || miniUsers.value.some((item: any) => item.id === user.id))
    return;
  miniUsers.value.unshift(user);
};
const userOptionLabel = (user: any) => {
  const name = user?.nickname || "未设置昵称";
  const phone = user?.phone ? ` · ${user.phone}` : "";
  const uid = user?.uid ? `UID ${user.uid}` : user?.id;
  return `${name}${phone} · ${uid}`;
};
const parseBusinessHoursRange = (value?: string) => {
  if (isWeeklyBusinessHours(value)) return [];
  const match = String(value || "").match(
    /(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/,
  );
  if (!match) return [];
  return [match[1].padStart(5, "0"), match[2].padStart(5, "0")];
};
const isWeeklyBusinessHours = (value?: string) => {
  try {
    const schedule = JSON.parse(String(value || ""));
    return (
      Array.isArray(schedule) &&
      schedule.length === 7 &&
      schedule.every((item) => Array.isArray(item) && item.length === 3)
    );
  } catch {
    return false;
  }
};
const businessHoursLabel = (value?: string) =>
  isWeeklyBusinessHours(value) ? "每周计划（商家端维护）" : value || "-";
const formatBusinessHoursRange = (range: string[] = []) => {
  if (!Array.isArray(range) || range.length !== 2 || !range[0] || !range[1])
    return "";
  return `${range[0]}-${range[1]}`;
};
const selectedRegion = computed(() =>
  regionList.value.find((item: any) => item.id === form.regionId),
);
const mapDefaultCenter = computed(() => {
  const formLng = Number(form.longitude);
  const formLat = Number(form.latitude);
  if (
    Number.isFinite(formLng) &&
    Number.isFinite(formLat) &&
    formLng &&
    formLat
  )
    return [formLng, formLat] as [number, number];
  const regionLng = Number(selectedRegion.value?.longitude);
  const regionLat = Number(selectedRegion.value?.latitude);
  if (
    Number.isFinite(regionLng) &&
    Number.isFinite(regionLat) &&
    regionLng &&
    regionLat
  )
    return [regionLng, regionLat] as [number, number];
  return undefined;
});
const mapDefaultCity = computed(
  () => selectedRegion.value?.city || selectedRegion.value?.name || "全国",
);

const loadData = async () => {
  loading.value = true;
  try {
    const res: any = await getMerchants({
      page: page.value,
      pageSize: pageSize.value,
      businessType: businessType.value,
      ...filters,
    });
    list.value = res?.list || res?.data?.list || [];
    total.value = res?.total ?? res?.data?.total ?? 0;
  } catch (e: any) {
    ElMessage.error(e?.message || "加载商家列表失败");
  } finally {
    loading.value = false;
  }
};

const resetFilters = () => {
  Object.assign(filters, {
    keyword: "",
    regionId: "",
    categoryId: "",
    auditStatus: "",
  });
  page.value = 1;
  loadData();
};

const applyRouteFilters = () => {
  if (isDormShopPage.value) return;
  const auditStatus =
    typeof route.query.auditStatus === "string" ? route.query.auditStatus : "";
  filters.auditStatus = ["pending", "approved", "rejected", "closed"].includes(
    auditStatus,
  )
    ? auditStatus
    : "";
};

const loadOptions = async () => {
  try {
    const [regions, catRes, userRes]: any[] = await Promise.all([
      fetchRegions(),
      getCategories({ businessType: businessType.value }),
      request.get("/admin/users", {
        params: { page: 1, pageSize: 300, status: "active", userType: 1 },
      }),
    ]);
    regionList.value = regions;
    categoryList.value = catRes?.list || catRes?.data?.list || [];
    miniUsers.value = Array.isArray(userRes)
      ? userRes
      : userRes?.list || userRes?.data?.list || [];
  } catch (e: any) {
    ElMessage.error(e?.message || "加载选项失败");
  }
};

const openEdit = (row?: any) => {
  editingId.value = row?.id || "";
  if (row) {
    ensureMiniUserOption(merchantOwner(row));
    Object.assign(form, {
      userId:
        row.userId ||
        row.ownerUserId ||
        row.user?.id ||
        row.ownerUser?.id ||
        "",
      name: row.name || "",
      contactPerson: row.contactPerson || "",
      phone: row.phone || "",
      regionId: row.regionId || "",
      categoryId: row.categoryId || "",
      address: row.address || "",
      dormBuilding: row.dormBuilding || "",
      dormRoom: row.dormRoom || "",
      studentVerified: !!row.studentVerified,
      deliveryMode: isDormShopPage.value
        ? "self_delivery"
        : row.deliveryMode || "platform_rider",
      deliveryFee: Number(row.deliveryFee || 0),
      latitude: row.latitude || "",
      longitude: row.longitude || "",
      businessHours: row.businessHours || "",
      businessHoursRange: parseBusinessHoursRange(row.businessHours),
      closedNotice: row.closedNotice || "",
      description: row.description || "",
      logo: row.logo || "",
      cover: row.cover || "",
      status: row.auditStatus || row.status || "pending",
    });
  } else {
    Object.assign(form, {
      userId: "",
      name: "",
      contactPerson: "",
      phone: "",
      regionId: "",
      categoryId: "",
      address: "",
      dormBuilding: "",
      dormRoom: "",
      studentVerified: isDormShopPage.value,
      deliveryMode: isDormShopPage.value ? "self_delivery" : "platform_rider",
      deliveryFee: 0,
      latitude: "",
      longitude: "",
      businessHours: "",
      businessHoursRange: [],
      closedNotice: "",
      description: "",
      logo: "",
      cover: "",
      status: "pending",
    });
  }
  editVisible.value = true;
  nextTick(() => formRef.value?.clearValidate());
};

const submitEdit = async () => {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  try {
    const payload = { ...form, businessType: businessType.value };
    payload.ownerUserId = form.userId;
    payload.user_id = form.userId;
    payload.businessHours = form.businessHoursRange.length
      ? formatBusinessHoursRange(form.businessHoursRange)
      : form.businessHours;
    payload.closedNotice =
      form.status === "closed" ? String(form.closedNotice || "").trim() : null;
    delete payload.businessHoursRange;
    if (isDormShopPage.value) {
      payload.deliveryMode = "self_delivery";
      payload.deliveryFee = Number(form.deliveryFee || 0);
      if (!payload.categoryId) payload.categoryId = null;
    }
    if (payload.latitude) payload.latitude = Number(payload.latitude);
    if (payload.longitude) payload.longitude = Number(payload.longitude);
    if (editingId.value) {
      await updateMerchant(editingId.value, payload);
      ElMessage.success("更新成功");
    } else {
      await createMerchant(payload);
      ElMessage.success("创建成功");
    }
    editVisible.value = false;
    loadData();
  } catch (e: any) {
    ElMessage.error(e?.message || "保存失败");
  }
};

function onMapConfirm(location: any) {
  const lng = Number(location.longitude);
  const lat = Number(location.latitude);
  form.longitude = Number.isFinite(lng) ? lng.toFixed(6) : "";
  form.latitude = Number.isFinite(lat) ? lat.toFixed(6) : "";
  form.address = location.address || location.poiName || form.address;
  mapVisible.value = false;
}

const audit = async (row: any, status: string) => {
  try {
    const msg = status === "approved" ? "通过该商家申请？" : "拒绝该商家申请？";
    if (status === "rejected") {
      const { value: remark } = await ElMessageBox.prompt(
        "请输入拒绝原因",
        "拒绝商家",
        { inputPlaceholder: "拒绝原因", type: "warning" },
      );
      await auditMerchant(row.id, { status, remark });
    } else {
      await ElMessageBox.confirm(msg, "确认", { type: "warning" });
      await auditMerchant(row.id, { status });
    }
    ElMessage.success("操作成功");
    loadData();
  } catch (e: any) {
    if (e !== "cancel") ElMessage.error(e?.message || "操作失败");
  }
};

const toggleStatus = async (row: any) => {
  try {
    const target = row.auditStatus === "approved" ? "closed" : "approved";
    let closedNotice: string | null = null;
    if (target === "closed" && isDormShopPage.value) {
      const { value } = await ElMessageBox.prompt(
        "请输入小程序弹窗提示文案",
        "关闭宿舍小店",
        {
          type: "warning",
          inputType: "textarea",
          inputValue: row.closedNotice || "",
          inputPlaceholder: "例如：店主临时有事，今晚暂停接单，明天恢复营业。",
          inputValidator: (value) =>
            Boolean(String(value || "").trim()) || "请输入关闭提示",
        },
      );
      closedNotice = String(value || "").trim();
    } else {
      const msg = target === "closed" ? "关闭该商家？" : "启用该商家？";
      await ElMessageBox.confirm(msg, "确认", { type: "warning" });
    }
    await updateMerchantStatus(row.id, target, closedNotice);
    ElMessage.success("操作成功");
    loadData();
  } catch (e: any) {
    if (e !== "cancel") ElMessage.error(e?.message || "操作失败");
  }
};

const viewDetail = async (row: any) => {
  try {
    const res: any = await getMerchantDetail(row.id);
    detail.value = res?.data ?? res;
    detailTab.value = "overview";
    detailVisible.value = true;
    loadMerchantContext(row.id);
  } catch (e: any) {
    ElMessage.error(e?.message || "获取详情失败");
  }
};

const managePrinters = (row: any) =>
  router.push({ path: "/merchant/printers", query: { merchantId: row.id } });
const openMerchantScope = (path: string) => {
  if (!detail.value?.id) return;
  detailVisible.value = false;
  router.push({ path, query: { merchantId: detail.value.id } });
};

const pageItems = (res: any) => res?.list || res?.data?.list || [];
const loadMerchantContext = async (merchantId: string) => {
  detailContextLoading.value = true;
  const [products, orders, printers] = await Promise.all([
    getProducts({
      page: 1,
      pageSize: 5,
      merchantId,
      businessType: businessType.value,
    }).catch(() => null),
    getMerchantOrders({
      page: 1,
      pageSize: 5,
      merchantId,
      businessType: businessType.value,
    }).catch(() => null),
    getPrinters({ page: 1, pageSize: 5, merchantId }).catch(() => null),
  ]);
  detailProducts.value = pageItems(products);
  detailOrders.value = pageItems(orders);
  detailPrinters.value = pageItems(printers);
  detailContextLoading.value = false;
};

watch(
  () => route.query.auditStatus,
  () => {
    applyRouteFilters();
    page.value = 1;
    loadData();
  },
);

onMounted(() => {
  applyRouteFilters();
  loadData();
  loadOptions();
});
</script>

<style scoped>
.page-shell {
  padding: 24px;
}
.filter-bar {
  display: flex;
  gap: 12px;
  margin: 16px 0;
  flex-wrap: wrap;
  align-items: center;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.upload-wrap {
  display: flex;
  align-items: center;
}
.address-picker-row {
  display: flex;
  width: 100%;
  gap: 10px;
}
.address-picker-row .el-input {
  flex: 1;
}
.address-picker-row .el-button {
  flex: none;
}
.form-tip {
  color: #8a97aa;
  font-size: 12px;
  line-height: 18px;
  margin-top: 4px;
}
.business-hours-range {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.business-hours-range .el-date-editor {
  flex: 1;
  min-width: 0;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.user-meta {
  min-width: 0;
  line-height: 1.35;
}
.user-name {
  font-weight: 600;
  color: #172033;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-sub {
  color: #7b8798;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail-action {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>

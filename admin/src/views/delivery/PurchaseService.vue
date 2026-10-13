<template>
  <div class="purchase-page">
    <header class="purchase-header">
      <div>
        <div class="eyebrow">跑腿运营 / 代买服务</div>
        <h1>
          代买管理台
          <el-tag :type="data.policy.enabled ? 'success' : 'info'">{{
            data.policy.enabled ? "服务已开放" : "服务未开放"
          }}</el-tag>
        </h1>
        <p>维护商品与合单范围，跟进采购、差价和垫款返还。</p>
      </div>
      <div class="toolbar">
        <el-select
          v-model="regionId"
          placeholder="选择区域"
          @change="changeRegion"
          ><el-option
            v-for="r in regions"
            :key="r.id"
            :label="r.name"
            :value="r.id" /></el-select
        ><el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </header>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    />
    <div class="stats">
      <div v-for="stat in stats" :key="stat.label" class="stat">
        <span>{{ stat.label }}</span
        ><strong>{{ stat.value }}</strong
        ><small>{{ stat.hint }}</small>
      </div>
    </div>
    <el-tabs v-model="tab" class="workspace">
      <el-tab-pane label="订单与凭证" name="orders"
        ><div class="toolbar filters">
          <el-input
            v-model="keyword"
            placeholder="搜索订单号 / 店铺 / 收货人"
            clearable
          /><el-select v-model="orderFilter"
            ><el-option label="全部订单" value="all" /><el-option label="待确认收货" value="awaiting_receipt" /><el-option
              label="待审核凭证"
              value="audit" /><el-option
              label="待处理差价"
              value="change" /><el-option
              label="退款需处理"
              value="refund" /><el-option
              label="待返还垫款"
              value="reimburse" /></el-select
          ><span class="muted">当前区域全部订单 · 支持按状态查询</span>
        </div>
        <el-table
          v-loading="loading"
          :data="data.orders"
          empty-text="还没有代买订单"
          ><el-table-column label="订单" min-width="260"
            ><template #default="{ row }"
              ><strong>{{ row.order.orderNo }}</strong>
              <div class="muted">
                {{ row.stops.map((s: any) => s.snapshot.name).join(" + ") }}
              </div></template
            ></el-table-column
          ><el-table-column label="状态" width="150"
            ><template #default="{ row }"
              ><el-tag>{{ state(row.order.status) }}</el-tag></template
            ></el-table-column
          ><el-table-column label="收货确认" min-width="210"
            ><template #default="{ row }">
              <span>{{ receiptSummary(row.order) }}</span>
              <div v-if="row.order.status === 'arrived' && row.order.receiptConfirmDeadline" class="receipt-note">
                截止 {{ formatReceiptTime(row.order.receiptConfirmDeadline) }}
              </div>
            </template></el-table-column
          ><el-table-column label="商品货款" width="120"
            ><template #default="{ row }"
              >¥{{ yuan(row.approvedGoodsCents) }}</template
            ></el-table-column
          ><el-table-column label="服务及配送" width="120"
            ><template #default="{ row }"
              >¥{{ yuan(row.serviceCents)
              }}<div v-if="Number(row.order.couponDiscount) > 0" class="coupon-off">
                券 -¥{{ Number(row.order.couponDiscount).toFixed(2) }}
              </div></template
            ></el-table-column
          ><el-table-column label="凭证 / 垫款" min-width="180"
            ><template #default="{ row }"
              ><span
                >{{
                  row.stops.filter((s: any) => s.auditStatus === "pending")
                    .length
                }}
                店待审核</span
              >
              <div class="muted">
                {{ reimburseLabel(row.reimbursementStatus) }}
              </div></template
            ></el-table-column
          ><el-table-column label="操作" width="110"
            ><template #default="{ row }"
              ><el-button type="primary" link @click="openOrder(row.id)"
                >查看详情</el-button
              ></template
            ></el-table-column
          ></el-table
        >
        <el-pagination
          v-model:current-page="page"
          :page-size="20"
          :total="data.total || 0"
          layout="total, prev, pager, next"
          @current-change="load"
        />
      </el-tab-pane>
      <el-tab-pane label="店铺管理" name="shops"
        ><div class="panel-title">
          <div>
            <h2>代买店铺</h2>
            <p>骑手到店购买，店铺无需接入商家系统。</p>
          </div>
          <el-button v-if="canConfig" type="primary" @click="edit('shop')"
            >新增店铺</el-button
          >
        </div>
        <div class="shop-grid">
          <div v-for="shop in data.shops" :key="shop.id" class="shop-card">
            <el-image v-if="shop.logo" :src="shop.logo" fit="cover" />
            <div v-else class="shop-placeholder">店</div>
            <div class="grow">
              <h3>
                {{ shop.name }}
                <el-tag
                  size="small"
                  :type="shop.enabled ? 'success' : 'info'"
                  >{{ shop.enabled ? "上架" : "停用" }}</el-tag
                >
              </h3>
              <p>{{ shop.address }}</p>
              <span class="muted"
                >{{ shop.opensAt }}—{{ shop.closesAt }} ·
                {{ shop.products.length }} 种商品</span
              >
              <div class="printer-line">
                <el-tag
                  size="small"
                  :type="shop.printer?.enabled ? 'success' : 'info'"
                  >{{ printerLabel(shop.printer) }}</el-tag
                >
              </div>
            </div>
            <div v-if="canConfig" class="shop-actions">
              <el-button link type="primary" @click="edit('shop', shop)"
                >编辑</el-button
              >
              <el-button link type="primary" @click="openPrinter(shop)"
                >出单打印机</el-button
              >
            </div>
          </div>
        </div>
        <el-empty v-if="!data.shops.length" description="先添加第一家代买店铺"
      /></el-tab-pane>
      <el-tab-pane v-if="canConfig" label="出单小票" name="ticket">
        <div class="panel-title">
          <div>
            <h2>默认出单小票</h2>
            <p>
              开启出单的店铺默认用这套小票；个别店铺可以在「店铺管理 → 出单打印机 →
              小票样式」里单独设置。
            </p>
          </div>
          <div>
            <el-button
              :disabled="saving || !data.ticketTemplate?.custom"
              @click="saveRegionTemplate(null)"
              >恢复系统默认</el-button
            >
            <el-button
              type="primary"
              :loading="saving"
              @click="saveRegionTemplate(regionTemplate)"
              >保存默认小票</el-button
            >
          </div>
        </div>
        <PurchaseTicketEditor
          v-if="regionTemplate && tab === 'ticket'"
          v-model="regionTemplate"
          :region-id="regionId"
          :presets="data.ticketTemplate?.presets"
          :sources="templateSources()"
        />
      </el-tab-pane>
      <el-tab-pane label="商品分类" name="categories">
        <div class="panel-title"><div><h2>按店铺管理分类</h2><p>一级分类显示在左侧，二级分类显示在商品列表上方。停用分类会隐藏其商品，不影响历史订单。</p></div><el-button v-if="canConfig" type="primary" :disabled="!data.shops.length" @click="edit('category')">新增分类</el-button></div>
        <div class="toolbar filters"><el-select v-model="catalogShopId" placeholder="全部店铺" clearable><el-option v-for="s in data.shops" :key="s.id" :label="s.name" :value="s.id"/></el-select></div>
        <el-table :data="categoryRows" row-key="id" default-expand-all empty-text="还没有分类，请先选择店铺新增一级分类">
          <el-table-column prop="name" label="分类名称" min-width="200"/><el-table-column prop="shopName" label="所属店铺"/>
          <el-table-column label="层级"><template #default="{row}">{{row.parentId ? '二级分类' : '一级分类'}}</template></el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="100"/>
          <el-table-column label="状态" width="160"><template #default="{row}"><el-tag :type="row.enabled && row.parentEnabled ? 'success' : 'info'">{{!row.enabled ? '已停用' : !row.parentEnabled ? '上级已停用' : '启用'}}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="90"><template #default="{row}"><el-button v-if="canConfig" link type="primary" @click="edit('category', row)">编辑</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="规格库" name="modifiers">
        <div class="panel-title">
          <div>
            <h2>口味与加料</h2>
            <p>按店铺维护温度、糖度等口味属性，以及按份计价的加料，再到商品里勾选挂载。杯型和份量在商品的「杯型 / 份量」里定价。</p>
          </div>
          <el-button v-if="canConfig" type="primary" :disabled="!data.shops.length" @click="edit('modifier')">新建规格组</el-button>
        </div>
        <div class="toolbar filters">
          <el-select v-model="modifierShopId" placeholder="选择店铺"><el-option v-for="s in data.shops" :key="s.id" :label="s.name" :value="s.id" /></el-select>
          <span class="muted">售罄开关立即生效，挂载了该规格组的商品都不能再选这一项；已下单的商品不受影响。</span>
        </div>
        <div class="modifier-grid">
          <article v-for="g in modifierGroups" :key="g.id" class="modifier-card" :class="{ off: !g.enabled }">
            <div class="modifier-head">
              <div>
                <h3>
                  {{ g.name }}
                  <el-tag size="small" :type="g.type === 'extra' ? 'warning' : 'success'">{{ g.type === "extra" ? "加料" : "口味属性" }}</el-tag>
                  <el-tag v-if="!g.enabled" size="small" type="info">已停用</el-tag>
                </h3>
                <p>{{ groupRule(g) }} · {{ usageCount(g.id) }} 个商品在用</p>
              </div>
              <div v-if="canConfig" class="card-actions">
                <el-button link type="primary" @click="edit('modifier', g)">编辑</el-button>
                <el-button link type="danger" :disabled="saving" @click="removeGroup(g)">删除</el-button>
              </div>
            </div>
            <div v-for="o in g.options.filter((o: any) => o.enabled)" :key="o.id" class="modifier-option">
              <span class="grow" :class="{ sold: o.soldOut }">{{ o.name }}<small v-if="o.isDefault" class="default-mark">默认</small></span>
              <span class="muted">{{ o.priceCents ? `+¥${yuan(o.priceCents)}` : "不加价" }}{{ g.type === "extra" && o.maxQuantity > 1 ? ` · 每杯最多 ${o.maxQuantity} 份` : "" }}</span>
              <el-switch
                :model-value="!o.soldOut"
                :disabled="!canConfig || saving"
                inline-prompt
                active-text="有货"
                inactive-text="售罄"
                @change="toggleSoldOut(o, !$event)"
              />
            </div>
          </article>
        </div>
        <el-empty v-if="data.shops.length && !modifierGroups.length" description="这家店还没有规格组，先新建温度、糖度或加料" />
      </el-tab-pane>
      <el-tab-pane label="商品与规格" name="products"
        ><div class="panel-title">
          <div>
            <h2>商品目录</h2>
            <p>按店铺维护商品、杯型／份量、预付单价和重量，并挂载规格库里的口味与加料。</p>
          </div>
          <el-button
            v-if="canConfig"
            type="primary"
            :disabled="!data.shops.length"
            @click="edit('product')"
            >新增商品</el-button
          >
        </div>
        <div class="toolbar filters"><el-select v-model="catalogShopId" placeholder="全部店铺" clearable><el-option v-for="s in data.shops" :key="s.id" :label="s.name" :value="s.id"/></el-select><span class="muted">杯型、份量在商品里单独定价；温度、糖度、加料在「规格库」按店铺维护后挂载。</span></div>
        <el-table :data="products"
          ><el-table-column prop="shopName" label="店铺" /><el-table-column
            label="商品"
            ><template #default="{ row }"
              ><strong>{{ row.name }}</strong>
              <div class="muted">{{ row.category }}</div></template
            ></el-table-column
          ><el-table-column label="规格 / 单价" min-width="260"
            ><template #default="{ row }"
              ><el-tag
                v-for="sku in row.skus"
                :key="sku.id"
                class="sku-tag"
                :type="sku.enabled ? '' : 'info'"
                >{{ sku.name }} · ¥{{ yuan(sku.priceCents)
                }}{{ sku.enabled ? "" : " · 停用" }}</el-tag
              ><div v-if="(row.modifierBindings || []).length" class="muted">
                口味与加料：{{ boundGroupNames(row) }}
              </div></template
            ></el-table-column
          ><el-table-column label="状态" width="100"
            ><template #default="{ row }">{{
              row.enabled ? "上架" : "下架"
            }}</template></el-table-column
          ><el-table-column label="操作" width="90"
            ><template #default="{ row }"
              ><el-button
                v-if="canConfig"
                link
                type="primary"
                @click="edit('product', row)"
                >编辑</el-button
              ></template
            ></el-table-column
          ></el-table
        ></el-tab-pane
      >
      <el-tab-pane label="合单规则" name="combinations"
        ><div class="panel-title">
          <div>
            <h2>明确开放的店铺组合</h2>
            <p>A＋B 和 B＋C 是两条规则；三家一起购买须单独设置 A＋B＋C。</p>
          </div>
          <el-button
            v-if="canConfig"
            type="primary"
            :disabled="data.shops.length < 2"
            @click="edit('combination')"
            >新增组合</el-button
          >
        </div>
        <el-table :data="data.combinations"
          ><el-table-column prop="name" label="组合名称" /><el-table-column
            label="可以一起买的店铺"
            min-width="260"
            ><template #default="{ row }">{{
              row.shopIds.map((id: string) => shopName(id)).join(" + ")
            }}</template></el-table-column
          ><el-table-column label="附加费"
            ><template #default="{ row }"
              >¥{{ yuan(row.extraFeeCents) }}</template
            ></el-table-column
          ><el-table-column label="货款上限"
            ><template #default="{ row }"
              >¥{{ yuan(row.maxGoodsCents) }}</template
            ></el-table-column
          ><el-table-column label="状态"
            ><template #default="{ row }">{{
              row.enabled ? "启用" : "停用"
            }}</template></el-table-column
          ><el-table-column label="操作"
            ><template #default="{ row }"
              ><el-button
                v-if="canConfig"
                link
                type="primary"
                @click="edit('combination', row)"
                >编辑</el-button
              ></template
            ></el-table-column
          ></el-table
        ></el-tab-pane
      >
      <el-tab-pane label="费用与服务设置" name="settings"
        ><div class="panel-title">
          <div>
            <h2>区域服务设置</h2>
            <p>费用修改用于新建订单；自动收货时长用于之后送达的订单，已送达订单保留原截止时间。</p>
          </div>
          <el-button
            v-if="canConfig"
            type="primary"
            :loading="saving"
            @click="savePolicy"
            >保存设置</el-button
          >
        </div>
        <section class="receipt-settings" aria-labelledby="receipt-settings-title">
          <h3 id="receipt-settings-title">自动收货</h3>
          <p class="receipt-note">骑手标记送达后开始计时。未配置时为 24 小时；系统每 10 分钟检查一次，存在未处理售后、整单退款或严重风险时暂停确认。</p>
          <el-form label-position="top" :disabled="!canConfig || saving || loading">
            <el-form-item label="自动收货时长（小时）" required>
              <el-input-number v-model="data.policy.autoReceiptHours" :min="1" :max="720" :precision="0" :step="1" :value-on-clear="24" controls-position="right" aria-label="自动收货时长（小时）" />
              <span class="receipt-note receipt-range">1～720 小时，填写后点击“保存设置”生效。</span>
            </el-form-item>
          </el-form>
          <el-alert v-if="data.receiptSettings?.enabled === false" title="当前区域已暂停自动收货。保存时长不会开启自动收货，请到“跑腿配置 → 闭环与结算”开启；仍可核实后人工代确认。" type="warning" show-icon :closable="false" />
        </section>
        <el-form
          :disabled="!canConfig"
          label-position="top"
          class="settings-grid"
          ><el-form-item label="开放代买服务"
            ><el-switch
              v-model="data.policy.enabled"
              active-text="开放"
              inactive-text="关闭" /></el-form-item
          ><el-form-item
            v-for="field in policyFields"
            :key="field.key"
            :label="field.label"
            ><el-input-number
              :model-value="
                field.key.includes('Cents')
                  ? data.policy[field.key] / 100
                  : data.policy[field.key]
              "
              @update:model-value="
                data.policy[field.key] = field.key.includes('Cents')
                  ? Math.round(Number($event) * 100)
                  : $event
              "
              :min="field.key.includes('Cents') ? field.min / 100 : field.min"
              :step="1"
              :precision="field.key.includes('Cents') ? 2 : 0"
              controls-position="right"
            /><span class="muted">{{ field.help }}</span></el-form-item
          ></el-form
        ><template v-if="data.policy.riderTiers"
          ><div class="panel-title">
            <div>
              <h2>接单身份</h2>
              <p>
                开关和上限保存后立即作用于新的接单；已经接下的代买单可以继续完成。上限留空表示跟随上面的区域上限，填写后只会更严。
              </p>
            </div>
          </div>
          <el-table :data="riderTierRows" border class="rider-tiers"
            ><el-table-column label="身份" width="120"
              ><template #default="{ row }"
                ><strong>{{ row.label }}</strong></template
              ></el-table-column
            ><el-table-column label="如何认定" prop="help" min-width="220" /><el-table-column
              label="允许接代买"
              width="130"
              ><template #default="{ row }"
                ><el-switch
                  v-model="data.policy.riderTiers[row.key].enabled"
                  :disabled="!canConfig"
                  active-text="开"
                  inactive-text="关" /></template></el-table-column
            ><el-table-column
              v-for="limit in riderTierLimits"
              :key="limit.key"
              :label="limit.label"
              width="210"
              ><template #default="{ row }"
                ><el-input-number
                  :model-value="tierLimit(row.key, limit.key)"
                  @update:model-value="setTierLimit(row.key, limit.key, $event)"
                  :disabled="!canConfig || !data.policy.riderTiers[row.key].enabled"
                  :min="0.01"
                  :precision="2"
                  :value-on-clear="null"
                  placeholder="跟随区域"
                  controls-position="right" /></template></el-table-column></el-table></template
        ><el-alert
          title="骑手垫付款返还条件：订单确认收货、各店凭证审核通过、差价退款完成，且没有未处理的售后或风控记录。货款单独返还，不参与佣金计算。"
          type="info"
          :closable="false"
      /></el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="dialog"
      :title="`${form.id ? '编辑' : '新增'}${kind === 'shop' ? '店铺' : kind === 'product' ? '商品' : kind === 'category' ? '分类' : kind === 'modifier' ? '规格组' : '合单组合'}`"
      width="700px"
      :close-on-click-modal="false"
    >
      <el-form label-width="110px"
        ><el-form-item label="名称" required
          ><el-input v-model="form.name" maxlength="60" /></el-form-item
        ><el-form-item label="启用"
          ><el-switch v-model="form.enabled"
        /></el-form-item>
        <template v-if="kind === 'shop'"
          ><el-form-item label="店铺图片"
            ><ImageUploadBox
              v-model="form.logo"
              shape="square"
              scene="purchase-shop" /></el-form-item
          ><el-form-item label="地址" required
            ><el-input v-model="form.address"
              ><template #append
                ><el-button @click="mapVisible = true"
                  >地图选择</el-button
                ></template
              ></el-input
            ></el-form-item
          ><el-form-item label="经度 / 纬度"
            ><el-input-number
              v-model="form.longitude"
              :precision="6"
              :min="-180"
              :max="180" /><el-input-number
              v-model="form.latitude"
              :precision="6"
              :min="-90"
              :max="90" /></el-form-item
          ><el-form-item label="联系电话"
            ><el-input v-model="form.phone" /></el-form-item
          ><el-form-item label="营业时间"
            ><el-time-select
              v-model="form.opensAt"
              start="00:00"
              end="23:30"
              step="00:30" /><span>　至　</span
            ><el-time-select
              v-model="form.closesAt"
              start="00:00"
              end="23:30"
              step="00:30" /></el-form-item
          ><el-form-item label="展示顺序"
            ><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item
        ></template>
        <template v-else-if="kind === 'category'">
          <el-form-item label="所属店铺" required><el-select v-model="form.shopId" :disabled="!!form.id" @change="form.parentId = null"><el-option v-for="s in data.shops" :key="s.id" :label="s.name" :value="s.id"/></el-select></el-form-item>
          <el-form-item label="上级分类"><el-select v-model="form.parentId" clearable placeholder="不选择，作为一级分类"><el-option v-for="c in categoryParents" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item>
          <el-form-item label="展示顺序"><el-input-number v-model="form.sortOrder" :min="0" :max="10000"/></el-form-item>
          <el-alert title="停用一级分类时，旗下二级分类及商品一起隐藏；重新启用后按各自开关恢复。" type="info" :closable="false"/>
        </template>
        <template v-else-if="kind === 'product'"
          ><el-form-item label="所属店铺" required
            ><el-select v-model="form.shopId" :disabled="!!form.id" @change="form.categoryId = null; form.modifierBindings = []"
              ><el-option
                v-for="s in data.shops"
                :key="s.id"
                :label="s.name"
                :value="s.id" /></el-select></el-form-item
          ><el-form-item label="商品图片"
            ><ImageUploadBox
              v-model="form.image"
              shape="square"
              scene="purchase-product" /></el-form-item
          ><el-form-item label="商品分类"
            ><el-tree-select v-model="form.categoryId" :data="categoryOptions" check-strictly clearable placeholder="选择店内分类；留空归入其他商品" style="width:100%"/></el-form-item
          ><el-form-item label="展示顺序"><el-input-number v-model="form.sortOrder" :min="0" :max="10000"/></el-form-item
          ><el-table :data="form.skus"
            ><el-table-column label="杯型 / 份量"
              ><template #default="{ row }"
                ><el-input v-model="row.name" /></template></el-table-column
            ><el-table-column label="价格（元）"
              ><template #default="{ row }"
                ><el-input-number
                  :model-value="row.priceCents / 100"
                  @update:model-value="
                    row.priceCents = Math.round(Number($event) * 100)
                  "
                  :min="0.01"
                  :precision="2"
                  controls-position="right"
                  style="width: 120px" /></template></el-table-column
            ><el-table-column label="重量（克）"
              ><template #default="{ row }"
                ><el-input-number
                  v-model="row.weightGrams"
                  :min="0"
                  :precision="0"
                  controls-position="right"
                  style="width: 120px" /></template></el-table-column
            ><el-table-column label="启用" width="75"
              ><template #default="{ row }"
                ><el-switch
                  v-model="
                    row.enabled
                  " /></template></el-table-column
            ><el-table-column label="操作" width="70"
              ><template #default="{ $index }"
                ><el-button
                  link
                  type="danger"
                  :disabled="form.skus.length <= 1"
                  @click="form.skus.splice($index, 1)"
                  >删除</el-button
                ></template
              ></el-table-column
            ></el-table
          ><el-button
            class="add-sku"
            @click="
              form.skus.push({
                name: '',
                priceCents: 100,
                weightGrams: 0,
                enabled: true,
              })
            "
            >＋ 添加杯型 / 份量</el-button
          ><div class="binding-block">
            <div class="binding-title">
              <strong>口味与加料</strong>
              <span class="muted">勾选这件商品要用的规格组；点选项可设为本商品不提供，例如只做冰的饮品隐藏「热」。</span>
            </div>
            <p v-if="!productModifierGroups.length" class="muted">这家店还没有规格组，可以先到「规格库」页签新建。</p>
            <div v-for="g in productModifierGroups" :key="g.id" class="binding-row">
              <el-checkbox :model-value="isBound(g.id)" @change="toggleBinding(g.id, $event)"
                ><strong>{{ g.name }}</strong
                ><span class="muted binding-rule">{{ groupRule(g) }}{{ g.enabled ? "" : " · 已停用" }}</span></el-checkbox
              >
              <template v-if="isBound(g.id)">
                <div class="binding-options">
                  <el-tag
                    v-for="o in g.options.filter((o: any) => o.enabled)"
                    :key="o.id"
                    class="binding-tag"
                    :type="isHidden(g.id, o.id) ? 'info' : 'success'"
                    :effect="isHidden(g.id, o.id) ? 'plain' : 'light'"
                    @click="toggleHidden(g.id, o.id)"
                    >{{ o.name }}{{ o.priceCents ? ` +¥${yuan(o.priceCents)}` : "" }}{{ isHidden(g.id, o.id) ? "（不提供）" : "" }}</el-tag
                  >
                </div>
                <el-select
                  v-if="g.type === 'attribute'"
                  :model-value="bindingOf(g.id).defaultOptionId || undefined"
                  @update:model-value="setBindingDefault(g.id, $event)"
                  clearable
                  size="small"
                  placeholder="默认值沿用规格库"
                  class="binding-default"
                  ><el-option
                    v-for="o in g.options.filter((o: any) => o.enabled && !isHidden(g.id, o.id))"
                    :key="o.id"
                    :label="`默认：${o.name}`"
                    :value="o.id"
                /></el-select>
              </template>
            </div>
          </div
          ><el-alert
            title="删除的杯型 / 份量在保存后生效。已下单商品保留用户确认时的名称、口味和价格。"
            type="info"
            :closable="false"
        /></template>
        <template v-else-if="kind === 'modifier'">
          <el-form-item label="所属店铺" required
            ><el-select v-model="form.shopId" :disabled="!!form.id"
              ><el-option v-for="s in data.shops" :key="s.id" :label="s.name" :value="s.id" /></el-select
          ></el-form-item>
          <el-form-item label="类型">
            <el-radio-group v-model="form.type" @change="changeModifierType">
              <el-radio-button value="attribute">口味属性</el-radio-button>
              <el-radio-button value="extra">加料</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="选择规则">
            <div class="rule-line">
              <el-switch v-model="form.required" active-text="必选" inactive-text="可不选" />
              <template v-if="form.type === 'attribute'"
                ><span>最多选</span><el-input-number v-model="form.maxSelect" :min="1" :max="20" size="small" /><span>项</span></template
              >
              <template v-else
                ><span>每杯最多加</span><el-input-number v-model="form.maxTotalQuantity" :min="1" :max="30" size="small" /><span>份</span></template
              >
            </div>
          </el-form-item>
          <el-form-item label="展示顺序"><el-input-number v-model="form.sortOrder" :min="0" :max="10000" /></el-form-item>
          <el-table :data="form.options" size="small">
            <el-table-column label="选项">
              <template #default="{ row }"><el-input v-model="row.name" maxlength="20" placeholder="如：少冰、珍珠" /></template>
            </el-table-column>
            <el-table-column label="加价（元）" width="140">
              <template #default="{ row }"
                ><el-input-number
                  :model-value="row.priceCents / 100"
                  @update:model-value="row.priceCents = Math.round(Number($event || 0) * 100)"
                  :min="0"
                  :precision="2"
                  :step="0.5"
                  controls-position="right"
                  style="width: 120px"
              /></template>
            </el-table-column>
            <el-table-column v-if="form.type === 'attribute'" label="默认" width="64">
              <template #default="{ row }"><el-checkbox v-model="row.isDefault" @change="onDefaultChange(row)" /></template>
            </el-table-column>
            <el-table-column v-else label="每杯最多" width="118">
              <template #default="{ row }"
                ><el-input-number v-model="row.maxQuantity" :min="1" :max="10" controls-position="right" style="width: 96px"
              /></template>
            </el-table-column>
            <el-table-column label="售罄" width="64">
              <template #default="{ row }"><el-switch v-model="row.soldOut" /></template>
            </el-table-column>
            <el-table-column label="启用" width="64">
              <template #default="{ row }"><el-switch v-model="row.enabled" /></template>
            </el-table-column>
            <el-table-column label="操作" width="64">
              <template #default="{ $index }"
                ><el-button link type="danger" :disabled="form.options.length <= 1" @click="form.options.splice($index, 1)">删除</el-button></template
              >
            </el-table-column>
          </el-table>
          <el-button class="add-sku" @click="form.options.push(newModifierOption())">＋ 添加选项</el-button>
          <el-alert
            :title="
              form.type === 'attribute'
                ? '口味属性每项 1 份，适合温度、糖度、奶底；只有换燕麦奶这类选项需要填加价。删除的选项在保存后生效，已下单商品不受影响。'
                : '加料按份计价，例如珍珠 +¥1、每杯最多 2 份。删除的选项在保存后生效，已下单商品不受影响。'
            "
            type="info"
            :closable="false"
          />
        </template>
        <template v-else
          ><el-form-item label="包含店铺" required
            ><el-select v-model="form.shopIds" multiple style="width: 100%"
              ><el-option
                v-for="s in data.shops"
                :key="s.id"
                :value="s.id"
                :label="s.name" /></el-select></el-form-item
          ><el-form-item label="附加费（元）"
            ><el-input-number
              :model-value="form.extraFeeCents / 100"
              @update:model-value="
                form.extraFeeCents = Math.round(Number($event) * 100)
              "
              :min="0"
              :precision="2" /></el-form-item
          ><el-form-item label="货款上限（元）"
            ><el-input-number
              :model-value="form.maxGoodsCents / 100"
              @update:model-value="
                form.maxGoodsCents = Math.round(Number($event) * 100)
              "
              :min="0.01"
              :precision="2" /></el-form-item
          ><el-alert
            title="仅此完整组合可合单；单家店无需设置组合。"
            type="warning"
            :closable="false"
        /></template> </el-form
      ><template #footer
        ><el-button @click="dialog = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="save"
          >保存</el-button
        ></template
      >
    </el-dialog>
    <AmapLocationPicker
      v-model:visible="mapVisible"
      :default-center="
        form.longitude && form.latitude
          ? [form.longitude, form.latitude]
          : undefined
      "
      @confirm="locationSelected"
      @cancel="mapVisible = false"
    />
    <el-dialog
      v-model="printerDialog"
      :title="`${printerShop?.name || ''} · 出单打印机`"
      :width="printerTab === 'template' ? '1040px' : '560px'"
      append-to-body
    >
      <el-tabs v-model="printerTab">
      <el-tab-pane label="打印机" name="printer">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="骑手接单后，自动把这家店的商品打成出单小票，店家可提前制作；订单取消时会再打一张取消单。不需要的店铺保持关闭即可。"
      />
      <el-form label-width="96px" class="printer-form">
        <el-form-item label="开启出单"
          ><el-switch v-model="printerForm.enabled"
        /></el-form-item>
        <el-form-item label="打印机品牌"
          ><el-select v-model="printerForm.brand"
            ><el-option
              v-for="b in printerBrands"
              :key="b.value"
              :label="b.label"
              :value="b.value" /></el-select
        ></el-form-item>
        <el-form-item label="打印机名称"
          ><el-input
            v-model="printerForm.name"
            maxlength="30"
            placeholder="留空则为「店名出单机」"
        /></el-form-item>
        <el-form-item :label="printerSnLabel"
          ><el-input v-model="printerForm.sn" maxlength="64"
        /></el-form-item>
        <template v-if="printerForm.brand === 'feie'">
          <el-form-item label="USER"
            ><el-input
              v-model="printerForm.user"
              autocomplete="off"
              :placeholder="printerKeepHint('店家飞鹅云注册用户名')"
          /></el-form-item>
          <el-form-item label="UKEY"
            ><el-input
              v-model="printerForm.ukey"
              type="password"
              show-password
              autocomplete="new-password"
              :placeholder="printerKeepHint('飞鹅云后台个人中心的 UKEY')"
          /></el-form-item>
          <el-form-item label="设备 KEY"
            ><el-input
              v-model="printerForm.deviceKey"
              type="password"
              show-password
              autocomplete="new-password"
              :placeholder="printerKeepHint('机身标签上的 KEY，保存时自动添加到店家账号')"
          /></el-form-item>
        </template>
        <template v-else-if="printerForm.brand === 'yly'">
          <el-form-item label="Client ID"
            ><el-input v-model="printerForm.clientId" autocomplete="off"
          /></el-form-item>
          <el-form-item label="Client Secret"
            ><el-input
              v-model="printerForm.clientSecret"
              type="password"
              show-password
              autocomplete="new-password"
              :placeholder="printerKeepHint('')"
          /></el-form-item>
        </template>
        <template v-else-if="printerForm.brand === 'xpyun'">
          <el-form-item label="开发者 ID"
            ><el-input v-model="printerForm.xpyUser" autocomplete="off"
          /></el-form-item>
          <el-form-item label="UserKEY"
            ><el-input
              v-model="printerForm.xpyUserKey"
              type="password"
              show-password
              autocomplete="new-password"
              :placeholder="printerKeepHint('')"
          /></el-form-item>
        </template>
        <template v-else-if="printerForm.brand === 'gprinter'">
          <el-form-item label="商户编码"
            ><el-input v-model="printerForm.gpMemberCode" autocomplete="off"
          /></el-form-item>
          <el-form-item label="API 密钥"
            ><el-input
              v-model="printerForm.gpApiKey"
              type="password"
              show-password
              autocomplete="new-password"
              :placeholder="printerKeepHint('')"
          /></el-form-item>
        </template>
        <p class="muted">
          {{ printerBrandTip }}凭证加密保存，不会再显示在页面上。
        </p>
        <p v-if="printerState" class="printer-state">{{ printerState }}</p>
      </el-form>
      </el-tab-pane>
      <el-tab-pane
        label="小票样式"
        name="template"
        :disabled="!printerShop?.printer"
      >
        <el-radio-group v-model="shopTemplateMode" class="template-mode">
          <el-radio value="default">使用区域默认小票</el-radio>
          <el-radio value="custom">本店自定义</el-radio>
        </el-radio-group>
        <PurchaseTicketEditor
          v-if="shopTemplateMode === 'custom' && shopTemplate && printerTab === 'template'"
          v-model="shopTemplate"
          :region-id="regionId"
          :shop-id="printerShop?.id"
          :presets="data.ticketTemplate?.presets"
          :sources="templateSources(printerShop?.id)"
        />
        <p v-else class="muted">
          这家店沿用「出单小票」里的默认模板，修改默认模板会同时影响它。
        </p>
      </el-tab-pane>
      </el-tabs>
      <template #footer>
        <template v-if="printerTab === 'template'">
          <el-button :disabled="saving" @click="testPrinter"
            >打印测试页</el-button
          >
          <el-button type="primary" :loading="saving" @click="saveShopTemplate"
            >保存小票样式</el-button
          >
        </template>
        <template v-else>
        <el-button
          v-if="printerShop?.printer"
          type="danger"
          plain
          :disabled="saving"
          @click="removePrinter"
          >删除打印机</el-button
        >
        <el-button
          v-if="printerShop?.printer"
          :disabled="saving"
          @click="checkPrinter"
          >查询状态</el-button
        >
        <el-button
          v-if="printerShop?.printer"
          :disabled="saving"
          @click="testPrinter"
          >打印测试页</el-button
        >
        <el-button type="primary" :loading="saving" @click="savePrinter"
          >保存</el-button
        >
        </template>
      </template>
    </el-dialog>
    <el-dialog
      v-model="compensationDialog"
      title="已完成订单 · 售后补偿"
      width="520px"
      append-to-body
    >
      <el-form label-position="top"
        ><el-form-item label="原路退回金额（元）"
          ><el-input-number
            v-model="compensationForm.amount"
            :min="0.01"
            :precision="2" /></el-form-item
        ><el-form-item label="处理说明"
          ><el-input
            v-model="compensationForm.reason"
            type="textarea"
            maxlength="160" /></el-form-item
        ><el-checkbox v-model="compensationForm.agreed"
          >由平台承担本次补偿，保留骑手的服务收入及实际垫款返还</el-checkbox
        ></el-form
      >
      <template #footer
        ><el-button @click="compensationDialog = false">取消</el-button
        ><el-button
          type="primary"
          :loading="saving"
          :disabled="
            !compensationForm.agreed ||
            !compensationForm.reason ||
            compensationForm.amount <= 0
          "
          @click="submitCompensation"
          >确认补偿并原路退款</el-button
        ></template
      >
    </el-dialog>
    <el-drawer v-model="drawer" title="代买订单详情" size="min(780px, 100vw)">
      <p v-if="detailLoading" class="receipt-note" role="status">正在加载订单详情…</p>
      <el-alert v-else-if="detailError" :title="detailError" type="error" show-icon :closable="false" />
      <template v-else-if="detail"
        ><div class="detail-heading">
          <div>
            <h2>{{ detail.order.orderNo }}</h2>
            <p>{{ detail.order.title }}</p>
          </div>
          <el-tag>{{ state(detail.order.status) }}</el-tag>
        </div>
        <div class="detail-summary">
          <div>
            确认货款<strong>¥{{ yuan(detail.approvedGoodsCents) }}</strong>
          </div>
          <div>
            服务及配送<strong>¥{{ yuan(detail.serviceCents) }}</strong>
          </div>
          <div v-if="detail.couponDiscountCents > 0">
            优惠券抵扣服务费<strong>-¥{{ yuan(detail.couponDiscountCents) }}</strong>
          </div>
          <div>
            垫款返还<strong>{{
              reimburseLabel(detail.reimbursementStatus)
            }}</strong>
          </div>
        </div>
        <el-descriptions :column="1" border
          ><el-descriptions-item label="收货"
            >{{ detail.order.deliverContact }} · {{ detail.order.deliverPhone
            }}<br />{{ detail.order.deliverAddress }}</el-descriptions-item
          ><el-descriptions-item label="骑手用户编号">{{
            detail.order.riderId || "等待接单"
          }}</el-descriptions-item
          ><el-descriptions-item label="备注">{{
            detail.order.remark || "无"
          }}</el-descriptions-item></el-descriptions
        >
        <section class="stop-card receipt-card" aria-labelledby="receipt-detail-title">
          <h3 id="receipt-detail-title">收货确认</h3>
          <dl class="receipt-times">
            <div><dt>送达时间</dt><dd>{{ formatReceiptTime(detail.order.deliverTime) }}</dd></div>
            <div><dt>自动确认截止</dt><dd>{{ formatReceiptTime(detail.order.receiptConfirmDeadline) }}</dd></div>
            <div v-if="detail.order.receiptConfirmedAt"><dt>确认时间 / 方式</dt><dd>{{ formatReceiptTime(detail.order.receiptConfirmedAt) }} · {{ receiptSource(detail.order.receiptConfirmedBy) }}</dd></div>
          </dl>
          <template v-if="detail.order.status === 'arrived'">
            <p class="receipt-note">{{ receiptSummary(detail.order, detail.receiptSettings?.enabled) }}</p>
            <p v-if="detail.receiptAction?.reason" class="receipt-note">{{ detail.receiptAction.reason }}</p>
            <p class="receipt-note">人工确认前请核实用户已收到商品。确认后将完成订单，并按现有规则结算配送收益；骑手垫款仍需满足凭证审核等返还条件。</p>
            <el-button v-if="canConfig" type="primary" :disabled="saving || !detail.receiptAction?.allowed" :loading="receiptConfirming" @click="confirmAdminReceipt">代用户确认收货</el-button>
            <p v-else class="receipt-note">当前账号没有代确认收货权限，请联系有跑腿配置权限的管理员。</p>
          </template>
          <p v-else-if="detail.order.status !== 'completed'" class="receipt-note">订单送达后可确认收货。</p>
        </section>
        <section v-for="stop in detail.stops" :key="stop.id" class="stop-card">
          <div class="panel-title">
            <h3>{{ stop.snapshot.name }}</h3>
            <div>
              <el-tag
                v-if="stop.print"
                class="print-tag"
                :type="printTagType(stop.print.status)"
                >{{ printStateLabel(stop.print) }}</el-tag
              >
              <el-tag>{{ auditLabel(stop.auditStatus) }}</el-tag>
            </div>
          </div>
          <p class="muted">{{ stop.snapshot.address }}</p>
          <p v-if="stop.print?.error" class="muted">
            出单异常：{{ stop.print.error }}
          </p>
          <div v-for="item in stop.items" :key="item.id" class="detail-row">
            <span
              >{{ item.snapshot.productName }} /
              {{ item.snapshot.specText || item.snapshot.skuName }} ×
              {{ item.quantity }}</span
            ><strong
              >¥{{ yuan(item.quantity * item.approvedUnitCents) }}</strong
            >
          </div>
          <div class="proofs">
            <el-image :initial-index="previewIndex"
              v-for="(url, previewIndex) in stop.receiptUrls || []"
              :key="url"
              :src="url"
              :preview-src-list="stop.receiptUrls"
              preview-teleported
              fit="cover"
            />
          </div>
          <p v-if="stop.auditNote">审核说明：{{ stop.auditNote }}</p>
          <div
            v-if="canAudit && stop.auditStatus === 'pending'"
            class="toolbar"
          >
            <el-button
              type="success"
              :disabled="saving"
              @click="audit(stop, true)"
              >凭证通过，确认 ¥{{ yuan(stop.actualCents) }}</el-button
            ><el-button
              type="danger"
              plain
              :disabled="saving"
              @click="audit(stop, false)"
              >退回重传</el-button
            >
          </div>
        </section>
        <section class="stop-card">
          <h3>商品变更与退款</h3>
          <div v-for="c in detail.changes" :key="c.id" class="detail-row">
            <span
              >{{ c.snapshot.productName
              }}{{ c.snapshot.specText ? ` / ${c.snapshot.specText}` : "" }} ×
              {{ c.quantity }}<small
                >{{ c.reason }} · {{ changeLabel(c.status) }}</small
              ></span
            ><strong
              >{{ c.deltaCents > 0 ? "+" : "" }}¥{{
                yuan(c.deltaCents)
              }}</strong
            >
          </div>
          <div v-for="r in detail.refunds" :key="r.id" class="refund-row">
            <strong
              >退款 ¥{{ yuan(r.amountCents) }} ·
              {{ refundLabel(r.status) }}</strong
            >
            <p>{{ r.reason }}</p>
            <el-alert
              v-if="r.lastError"
              :title="r.lastError"
              type="error"
              :closable="false"
            /><el-button
              v-if="canRefund && r.status === 'attention'"
              type="warning"
              :loading="saving"
              @click="retryRefund(r.id)"
              >重试原路退款</el-button
            >
          </div>
          <p
            v-if="!detail.changes.length && !detail.refunds.length"
            class="muted"
          >
            没有商品变更或退款
          </p>
        </section>
        <section class="stop-card">
          <h3>操作记录</h3>
          <el-timeline
            ><el-timeline-item
              v-for="event in detail.events"
              :key="event.id"
              :timestamp="new Date(event.createdAt).toLocaleString()"
              >{{ eventLabel(event.kind) }}
              <span class="muted">{{ event.actorId }}</span>
              <p v-if="event.kind === 'receipt_confirmed'" class="receipt-note">{{ receiptSource(event.data?.source) }}<span v-if="event.data?.reason"> · {{ event.data.reason }}</span></p></el-timeline-item
            ></el-timeline
          >
        </section>
        <el-button
          v-if="
            canConfig &&
            ['pending_pay', 'pending_accept', 'accepted'].includes(
              detail.order.status,
            )
          "
          type="danger"
          plain
          @click="cancelOrder"
          >取消未采购订单并退款</el-button
        >
        <el-button
          v-if="canRefund && detail.order.status === 'completed'"
          type="warning"
          plain
          @click="openCompensation"
          >售后补偿</el-button
        >
      </template></el-drawer
    >
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { fetchRegions } from "@/api/admin";
import { getPage, postAction } from "@/api/request";
import { useAuthStore } from "@/stores/auth";
import { isSuperRole } from "@/router/access";
import ImageUploadBox from "@/components/common/ImageUploadBox.vue";
import AmapLocationPicker from "@/components/common/AmapLocationPicker.vue";
import PurchaseTicketEditor from "./components/PurchaseTicketEditor.vue";
const auth = useAuthStore(),
  base = "/admin/errand/purchase";
const canConfig = computed(
  () =>
    isSuperRole(auth.user.role) || auth.permissions.includes("errand:config"),
);
const canRefund = computed(
  () =>
    isSuperRole(auth.user.role) || auth.permissions.includes("order:refund"),
);
const canAudit = computed(
  () =>
    isSuperRole(auth.user.role) ||
    auth.permissions.includes("finance:settlement"),
);
const regions = ref<any[]>([]),
  regionId = ref(""),
  loading = ref(false),
  saving = ref(false),
  error = ref(""),
  tab = ref("orders"),
  keyword = ref(""),
  orderFilter = ref("all");
const data = reactive<any>({
  shops: [],
  combinations: [],
  orders: [],
  policy: { enabled: false, autoReceiptHours: 24 },
});
const catalogShopId = ref("");
const categoryParents = computed(() => (data.shops.find((s: any) => s.id === form.value.shopId)?.categories || []).filter((c: any) => !c.parentId && c.id !== form.value.id));
const categoryOptions = computed(() => {
  const list = data.shops.find((s: any) => s.id === form.value.shopId)?.categories || [];
  return list.filter((c: any) => !c.parentId).map((c: any) => ({ value: c.id, label: c.name + (c.enabled ? '' : '（停用）'), children: list.filter((x: any) => x.parentId === c.id).map((x: any) => ({value: x.id, label: x.name + (x.enabled ? '' : '（停用）')})) }));
});
const categoryRows = computed(() => data.shops.filter((s: any) => !catalogShopId.value || s.id === catalogShopId.value).flatMap((s: any) => {
  const list = s.categories || [];
  return list.filter((c: any) => !c.parentId).map((c: any) => ({...c, shopName: s.name, parentEnabled: true, children: list.filter((x: any) => x.parentId === c.id).map((x: any) => ({...x, shopName: s.name, parentEnabled: c.enabled}))}));
}));
const dialog = ref(false),
  drawer = ref(false),
  mapVisible = ref(false),
  kind = ref("shop"),
  form = ref<any>({}),
  detail = ref<any>(null);
const detailLoading = ref(false), detailError = ref(""), receiptConfirming = ref(false);
let detailRequestVersion = 0;
const formatReceiptTime = (value: any) => {
  if (!value) return "未记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未记录" : date.toLocaleString("zh-CN", { hour12: false });
};
const receiptSource = (value?: string) =>
  ({ user: "用户主动确认", rider: "骑手凭收货码确认", system: "系统自动确认", admin: "管理员代确认" }[value || ""] || "未记录确认方式");
function receiptSummary(order: any, enabled = data.receiptSettings?.enabled) {
  if (order.status === "completed") return receiptSource(order.receiptConfirmedBy);
  if (order.status !== "arrived") return "—";
  if (!order.receiptConfirmDeadline) return "未记录自动确认时间，请人工核实";
  if (enabled === false) return "自动收货已暂停，可人工核实";
  return new Date(order.receiptConfirmDeadline).getTime() <= Date.now()
    ? "已到截止时间，等待系统复核"
    : "待用户确认 / 到期自动复核";
}
const yuan = (v: any) => (Number(v || 0) / 100).toFixed(2);
const state = (v: string) =>
  (
    ({
      pending_pay: "待支付",
      pending_accept: "待接单",
      accepted: "采购中",
      in_progress: "配送中",
      arrived: "待确认收货",
      completed: "已完成",
      cancelled: "已取消",
    }) as any
  )[v] || v;
const auditLabel = (v: string) =>
  (
    ({
      unsubmitted: "待上传",
      pending: "待审核",
      approved: "审核通过",
      rejected: "退回重传",
    }) as any
  )[v] || v;
const reimburseLabel = (v: string) =>
  (({ pending: "待返还", paid: "已返还", not_required: "无需返还" }) as any)[
    v
  ] || v;
const changeLabel = (v: string) =>
  (
    ({
      pending: "待用户确认",
      awaiting_payment: "待用户补款",
      applied: "已生效",
      rejected: "已拒绝",
      expired: "已超时",
      cancelled: "已取消",
    }) as any
  )[v] || v;
const refundLabel = (v: string) =>
  (
    ({
      pending: "排队中",
      processing: "退款中",
      success: "已退款",
      attention: "需要处理",
    }) as any
  )[v] || v;
const eventLabel = (v: string) =>
  (
    ({
      created: "用户创建订单",
      prepaid: "预付到账",
      change_proposed: "骑手申请商品变更",
      change_applied: "商品变更生效",
      change_confirmed: "用户同意变更",
      change_rejected: "用户拒绝变更",
      receipt_submitted: "骑手上传凭证",
      receipt_audited: "后台审核凭证",
      receipt_confirmed: "订单确认收货",
      cancelled: "取消订单",
      reimbursed: "返还骑手货款",
      compensation_approved: "平台批准售后补偿",
      refund_retry: "后台重试退款",
    }) as any
  )[v] || v;
const shopName = (id: string) =>
  data.shops.find((s: any) => s.id === id)?.name || id;
const modifierShopId = ref("");
watch(
  () => data.shops,
  (shops: any[]) => {
    if (!shops.some((s: any) => s.id === modifierShopId.value))
      modifierShopId.value = shops[0]?.id || "";
  },
);
const shopModifierGroups = (shopId: string) =>
  data.shops.find((s: any) => s.id === shopId)?.modifierGroups || [];
const modifierGroups = computed(() => shopModifierGroups(modifierShopId.value));
const productModifierGroups = computed(() =>
  shopModifierGroups(form.value.shopId),
);
const groupRule = (g: any) =>
  g.type === "extra"
    ? `${g.required ? "必选" : "可选"} · 每杯最多 ${g.maxTotalQuantity} 份`
    : `${g.required ? "必选" : "可选"} · ${g.maxSelect > 1 ? `最多选 ${g.maxSelect} 项` : "单选"}`;
const usageCount = (groupId: string) =>
  data.shops
    .flatMap((s: any) => s.products)
    .filter((p: any) =>
      (p.modifierBindings || []).some((b: any) => b.groupId === groupId),
    ).length;
const boundGroupNames = (product: any) =>
  (product.modifierBindings || [])
    .map(
      (b: any) =>
        shopModifierGroups(product.shopId).find((g: any) => g.id === b.groupId)
          ?.name,
    )
    .filter(Boolean)
    .join("、");
const bindingOf = (groupId: string) =>
  (form.value.modifierBindings || []).find((b: any) => b.groupId === groupId);
const isBound = (groupId: string) => !!bindingOf(groupId);
const isHidden = (groupId: string, optionId: string) =>
  !!bindingOf(groupId)?.hiddenOptionIds?.includes(optionId);
// Product bindings follow the library order, so shop-wide sort order controls display.
function toggleBinding(groupId: string, on: unknown) {
  const current = form.value.modifierBindings || [];
  const next = on
    ? [...current, { groupId, hiddenOptionIds: [], defaultOptionId: null }]
    : current.filter((b: any) => b.groupId !== groupId);
  const order = productModifierGroups.value.map((g: any) => g.id);
  form.value.modifierBindings = next.sort(
    (a: any, b: any) => order.indexOf(a.groupId) - order.indexOf(b.groupId),
  );
}
function toggleHidden(groupId: string, optionId: string) {
  const binding = bindingOf(groupId);
  if (!binding) return;
  const hidden = new Set<string>(binding.hiddenOptionIds || []);
  if (hidden.has(optionId)) hidden.delete(optionId);
  else hidden.add(optionId);
  binding.hiddenOptionIds = [...hidden];
  if (binding.defaultOptionId && hidden.has(binding.defaultOptionId))
    binding.defaultOptionId = null;
}
function setBindingDefault(groupId: string, optionId: unknown) {
  const binding = bindingOf(groupId);
  if (binding) binding.defaultOptionId = optionId ? String(optionId) : null;
}
const newModifierOption = () => ({
  name: "",
  priceCents: 0,
  maxQuantity: 1,
  isDefault: false,
  soldOut: false,
  enabled: true,
});
function changeModifierType(type: unknown) {
  for (const option of form.value.options || []) {
    if (type === "extra") option.isDefault = false;
    else option.maxQuantity = 1;
  }
  if (type === "extra") form.value.required = false;
}
function onDefaultChange(row: any) {
  if (!row.isDefault || form.value.maxSelect > 1) return;
  for (const option of form.value.options || [])
    if (option !== row) option.isDefault = false;
}
async function removeGroup(group: any) {
  const used = usageCount(group.id);
  try {
    await ElMessageBox.confirm(
      used
        ? `「${group.name}」正被 ${used} 个商品使用，删除后这些商品不再显示这一组，组内选项一并删除。已下单的商品不受影响。`
        : `删除「${group.name}」及组内全部选项？已下单的商品不受影响。`,
      "删除规格组",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  saving.value = true;
  try {
    await postAction(`${base}/modifier-groups/${group.id}/delete`, {
      regionId: regionId.value,
      version: group.version,
    });
    ElMessage.success(`已删除「${group.name}」`);
    await load();
  } catch {
  } finally {
    saving.value = false;
  }
}
async function toggleSoldOut(option: any, soldOut: boolean) {
  saving.value = true;
  try {
    await postAction(`${base}/modifier-options/${option.id}/sold-out`, {
      regionId: regionId.value,
      soldOut,
    });
    ElMessage.success(soldOut ? `${option.name} 已标记售罄` : `${option.name} 恢复供应`);
    await load();
  } catch {
  } finally {
    saving.value = false;
  }
}
const printerBrands = [
  { value: "feie", label: "飞鹅云" },
  { value: "yly", label: "易联云" },
  { value: "xpyun", label: "芯烨云" },
  { value: "gprinter", label: "佳博云" },
];
const brandName = (v: string) =>
  printerBrands.find((b) => b.value === v)?.label || v;
const printerLabel = (printer: any) =>
  !printer
    ? "未接打印机"
    : `${brandName(printer.brand)} · ${printer.enabled ? "出单中" : "已关闭"}`;
const printStateLabel = (print: any) =>
  ((
    {
      queued: "等待出单",
      processing: "正在出单",
      submitted: "已发送，待确认打印",
      printed: "店家已出单",
      failed: "出单失败",
      uncertain: "出单结果未知",
      expired: "出单超时作废",
      cancelled: "已撤回",
    } as any
  )[print.status] || print.status) +
  (print.cancelStatus ? " · 已发取消单" : "");
const printTagType = (status: string) =>
  status === "printed"
    ? "success"
    : ["failed", "uncertain", "expired"].includes(status)
      ? "danger"
      : "info";
const printerDialog = ref(false),
  printerShop = ref<any>(null),
  printerState = ref(""),
  printerTab = ref("printer"),
  shopTemplateMode = ref("default"),
  shopTemplate = ref<any>(null),
  regionTemplate = ref<any>(null);
let templateRegion = "";
const cloneTemplate = (value: any) => JSON.parse(JSON.stringify(value));
const emptyPrinterForm = () => ({
  enabled: true,
  brand: "feie",
  name: "",
  sn: "",
  user: "",
  ukey: "",
  deviceKey: "",
  clientId: "",
  clientSecret: "",
  xpyUser: "",
  xpyUserKey: "",
  gpMemberCode: "",
  gpApiKey: "",
});
const printerForm = reactive<any>(emptyPrinterForm());
const printerSnLabel = computed(
  () =>
    (({ yly: "终端号", xpyun: "设备 SN", gprinter: "终端编号" }) as any)[
      printerForm.brand
    ] || "打印机 SN",
);
const printerBrandTip = computed(
  () =>
    (
      {
        feie: "填写店家自己的飞鹅云账号；填了设备 KEY 会自动把打印机添加到该账号。",
        yly: "设备需先在店家的易联云开放平台应用里添加。",
        xpyun: "设备需先在店家的芯烨云开放平台添加。",
        gprinter: "设备需先在店家的佳博云平台绑定。",
      } as any
    )[printerForm.brand] || "",
);
// Saved secrets are never sent back; blank fields keep them when the brand is unchanged.
const printerKeepHint = (hint: string) =>
  printerShop.value?.printer?.credentialConfigured &&
  printerShop.value.printer.brand === printerForm.brand
    ? "已保存，留空不修改"
    : hint;
function openPrinter(shop: any) {
  printerShop.value = shop;
  printerState.value = "";
  printerTab.value = "printer";
  shopTemplateMode.value = shop.printer?.ticketTemplate ? "custom" : "default";
  shopTemplate.value = cloneTemplate(
    shop.printer?.ticketTemplate || data.ticketTemplate?.template,
  );
  Object.assign(printerForm, emptyPrinterForm(), {
    enabled: shop.printer ? shop.printer.enabled : true,
    brand: shop.printer?.brand || "feie",
    name: shop.printer?.name || "",
    sn: shop.printer?.sn || "",
  });
  printerDialog.value = true;
}
async function savePrinter() {
  if (!printerForm.sn.trim()) return ElMessage.warning(`请填写${printerSnLabel.value}`);
  saving.value = true;
  try {
    const result: any = await postAction(
      `${base}/shops/${printerShop.value.id}/printer`,
      { ...printerForm, regionId: regionId.value },
    );
    const saved = result?.data || result;
    if (saved?.bind && !saved.bind.bound)
      ElMessage.warning(`已保存，但飞鹅云添加设备未成功：${saved.bind.message}`);
    else ElMessage.success("出单打印机已保存");
    printerDialog.value = false;
    await load();
  } catch {
  } finally {
    saving.value = false;
  }
}
// Templates that can be copied into the editor: the region default plus every shop's own.
function templateSources(excludeShopId?: string) {
  return [
    ...(excludeShopId && data.ticketTemplate
      ? [{ label: "复制区域默认小票", template: data.ticketTemplate.template }]
      : []),
    ...data.shops
      .filter((s: any) => s.id !== excludeShopId && s.printer?.ticketTemplate)
      .map((s: any) => ({
        label: `复制「${s.name}」的小票`,
        template: s.printer.ticketTemplate,
      })),
  ];
}
async function saveShopTemplate() {
  saving.value = true;
  try {
    const result: any = await postAction(
      `${base}/shops/${printerShop.value.id}/printer/template`,
      {
        regionId: regionId.value,
        template: shopTemplateMode.value === "custom" ? shopTemplate.value : null,
      },
    );
    const printer = result?.data || result;
    printerShop.value = { ...printerShop.value, printer };
    ElMessage.success(
      shopTemplateMode.value === "custom"
        ? "本店小票样式已保存"
        : "已改为使用区域默认小票",
    );
    await load();
  } catch {
  } finally {
    saving.value = false;
  }
}
async function saveRegionTemplate(template: any) {
  saving.value = true;
  try {
    const result: any = await postAction(`${base}/ticket-template`, {
      regionId: regionId.value,
      template,
    });
    const saved = result?.data || result;
    data.ticketTemplate = { ...data.ticketTemplate, ...saved };
    regionTemplate.value = cloneTemplate(saved.template);
    ElMessage.success(template ? "默认小票已保存" : "已恢复系统默认小票");
  } catch {
  } finally {
    saving.value = false;
  }
}
async function testPrinter() {
  saving.value = true;
  try {
    const result: any = await postAction(
      `${base}/shops/${printerShop.value.id}/printer/test`,
      { regionId: regionId.value },
    );
    const job = result?.data || result;
    if (job?.status === "submitted")
      ElMessage.success("测试页已发送到云打印，请查看打印机");
    else ElMessage.error(job?.error || "测试页发送失败，请检查凭证和 SN");
  } catch {
  } finally {
    saving.value = false;
  }
}
async function checkPrinter() {
  saving.value = true;
  try {
    const result: any = await getPage(
      `${base}/shops/${printerShop.value.id}/printer/status`,
      { regionId: regionId.value },
    );
    const state = result?.data || result;
    printerState.value = `在线状态：${state?.text || "未知"}`;
  } catch {
  } finally {
    saving.value = false;
  }
}
async function removePrinter() {
  try {
    await ElMessageBox.confirm(
      "删除后这家店不再出单，保存的凭证也会一并删除。",
      "删除出单打印机",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  saving.value = true;
  try {
    await postAction(`${base}/shops/${printerShop.value.id}/printer/delete`, {
      regionId: regionId.value,
    });
    ElMessage.success("已删除出单打印机");
    printerDialog.value = false;
    await load();
  } catch {
  } finally {
    saving.value = false;
  }
}
const products = computed(() =>
  data.shops.filter((s: any) => !catalogShopId.value || s.id === catalogShopId.value).flatMap((s: any) =>
    s.products.map((p: any) => ({ ...p, shopName: s.name })),
  ),
);
const stats = computed(() => [
  {
    label: "进行中的代买",
    value: data.overview?.active || 0,
    hint: "等待接单、采购或配送",
  },
  {
    label: "待审核凭证",
    value: data.overview?.audit || 0,
    hint: "核对实付金额与商品",
  },
  {
    label: "待确认差价",
    value: data.overview?.changes || 0,
    hint: "等待用户确认或补款",
  },
  {
    label: "退款需处理",
    value: data.overview?.refunds || 0,
    hint: "查看支付渠道异常原因",
  },
]);
const page = ref(1);
let filterTimer: ReturnType<typeof setTimeout>;
let requestVersion = 0;
watch([keyword, orderFilter], () => {
  page.value = 1;
  clearTimeout(filterTimer);
  filterTimer = setTimeout(load, 300);
});
onUnmounted(() => clearTimeout(filterTimer));
const compensationDialog = ref(false);
const compensationForm = reactive({
  amount: 0,
  reason: "",
  agreed: false,
  requestKey: "",
});
function openCompensation() {
  Object.assign(compensationForm, {
    amount: 0,
    reason: "",
    agreed: false,
    requestKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
  compensationDialog.value = true;
}
async function submitCompensation() {
  saving.value = true;
  try {
    await postAction(`${base}/orders/${detail.value.id}/compensation`, {
      amountCents: Math.round(compensationForm.amount * 100),
      reason: compensationForm.reason,
      costBearer: compensationForm.agreed ? "platform" : "",
      requestKey: compensationForm.requestKey,
    });
    compensationDialog.value = false;
    await openOrder(detail.value.id);
    await load();
  } catch {
  } finally {
    saving.value = false;
  }
}
const policyFields = [
  {
    key: "serviceFeeCents",
    label: "代买服务费（元）",
    min: 0,
    step: 100,
    help: "按单收取",
  },
  { key: "deliveryFeeCents", label: "基础配送费（元）", min: 0, step: 100 },
  {
    key: "distanceFeeCentsPerKm",
    label: "每公里配送费（元）",
    min: 0,
    step: 100,
  },
  { key: "maxDistanceMeters", label: "最长采购路线（米）", min: 1, step: 100 },
  { key: "maxGoodsCents", label: "每单货款上限（元）", min: 1, step: 100 },
  {
    key: "maxOutstandingCents",
    label: "骑手累计未返还货款上限（元）",
    min: 1,
    step: 100,
  },
  { key: "maxShops", label: "最多店铺数", min: 1 },
  { key: "maxQuantity", label: "最多商品件数", min: 1 },
  { key: "maxWeightGrams", label: "最大商品重量（克）", min: 1, step: 100 },
  {
    key: "changeTimeoutMinutes",
    label: "差价确认时限（分钟）",
    min: 1,
    help: "超时不自动购买，骑手需重新沟通",
  },
];
const riderTierRows = [
  { key: "official", label: "专职骑手", help: "骑手管理中设为“官方”的骑手" },
  { key: "part_time", label: "兼职骑手", help: "已认证、非官方，且没有本校有效学生认证" },
  { key: "student", label: "学生骑手", help: "已认证、非官方，且通过本区域学校的有效学生认证" },
];
const riderTierLimits = [
  { key: "maxGoodsCents", label: "单笔垫付上限（元）" },
  { key: "maxOutstandingCents", label: "累计未返还上限（元）" },
];
function tierLimit(tier: string, key: string) {
  const cents = data.policy.riderTiers[tier][key];
  return cents === null || cents === undefined ? null : cents / 100;
}
function setTierLimit(tier: string, key: string, value: number | null | undefined) {
  data.policy.riderTiers[tier][key] =
    value === null || value === undefined ? null : Math.round(Number(value) * 100);
}
async function load() {
  if (!regionId.value) return;
  loading.value = true;
  error.value = "";
  const region = regionId.value,
    version = ++requestVersion;
  try {
    const result: any = await getPage(base, {
      regionId: region,
      page: page.value,
      pageSize: 20,
      keyword: keyword.value,
      filter: orderFilter.value,
    });
    if (version === requestVersion && region === regionId.value) {
      Object.assign(data, result.data || result);
      // Keep unsaved template edits across reloads of the same region.
      if (templateRegion !== region && data.ticketTemplate) {
        templateRegion = region;
        regionTemplate.value = cloneTemplate(data.ticketTemplate.template);
      }
    }
  } catch (e: any) {
    if (version === requestVersion) error.value = e.message || "加载失败";
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}
function changeRegion() {
  catalogShopId.value = "";
  compensationDialog.value = false;
  ++detailRequestVersion;
  detailLoading.value = false;
  detailError.value = "";
  detail.value = null;
  page.value = 1;
  drawer.value = false;
  dialog.value = false;
  Object.assign(data, {
    shops: [],
    combinations: [],
    orders: [],
    total: 0,
    overview: {},
    policyVersion: null,
    policy: { enabled: false, autoReceiptHours: 24 },
    receiptSettings: undefined,
  });
  load();
}
function edit(type: string, row?: any) {
  kind.value = type;
  form.value = JSON.parse(
    JSON.stringify(
      row ||
        (type === "shop"
          ? {
              name: "",
              address: "",
              phone: "",
              logo: "",
              latitude: undefined,
              longitude: undefined,
              opensAt: "09:00",
              closesAt: "21:00",
              enabled: true,
              sortOrder: 0,
            }
          : type === "product"
            ? {
                name: "",
                shopId: catalogShopId.value || data.shops[0]?.id,
                categoryId: null,
                image: "",
                enabled: true,
                sortOrder: 0,
                skus: [
                  {
                    name: "标准规格",
                    priceCents: 100,
                    weightGrams: 0,
                    enabled: true,
                  },
                ],
              }
            : type === "category" ? { name: "", shopId: catalogShopId.value || data.shops[0]?.id, parentId: null, enabled: true, sortOrder: 0 }
            : type === "modifier"
              ? {
                  name: "",
                  shopId: modifierShopId.value || data.shops[0]?.id,
                  type: "attribute",
                  required: true,
                  maxSelect: 1,
                  maxTotalQuantity: 3,
                  enabled: true,
                  // New groups go to the end of the shop's display order.
                  sortOrder: shopModifierGroups(modifierShopId.value || data.shops[0]?.id).length,
                  options: [newModifierOption()],
                }
              : {
                name: "",
                shopIds: [],
                extraFeeCents: 200,
                maxGoodsCents: data.policy.maxGoodsCents,
                enabled: true,
              }),
    ),
  );
  dialog.value = true;
  if (type === "product") {
    delete form.value.category;
    if (!Array.isArray(form.value.modifierBindings)) form.value.modifierBindings = [];
  }
}
function locationSelected(location: any) {
  Object.assign(form.value, {
    longitude: Number(location.longitude),
    latitude: Number(location.latitude),
    address: location.address || form.value.address,
  });
  mapVisible.value = false;
}
async function save() {
  saving.value = true;
  try {
    await postAction(
      `${base}/${kind.value === "shop" ? "shops" : kind.value === "product" ? "products" : kind.value === "category" ? "categories" : kind.value === "modifier" ? "modifier-groups" : "combinations"}`,
      { ...form.value, regionId: regionId.value },
    );
    dialog.value = false;
    ElMessage.success("已保存");
    await load();
  } catch {
  } finally {
    saving.value = false;
  }
}
async function savePolicy() {
  if (saving.value || loading.value || !canConfig.value) return;
  const hours = data.policy.autoReceiptHours;
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
    ElMessage.warning("自动收货时长请填写 1～720 的整数小时");
    return;
  }
  saving.value = true;
  try {
    await postAction(`${base}/policy`, {
      regionId: regionId.value,
      policy: data.policy,
      version: data.policyVersion,
    });
    ElMessage.success("区域代买设置已保存");
    await load();
  } catch {
  } finally {
    saving.value = false;
  }
}
async function openOrder(id: string) {
  const version = ++detailRequestVersion, region = regionId.value;
  detail.value = null;
  detailError.value = "";
  detailLoading.value = true;
  drawer.value = true;
  try {
    const result: any = await getPage(`${base}/orders/${id}`);
    if (version === detailRequestVersion && region === regionId.value) detail.value = result.data || result;
  } catch (e: any) {
    if (version === detailRequestVersion && region === regionId.value) detailError.value = e.message || "订单详情加载失败，请关闭后重新打开";
  } finally {
    if (version === detailRequestVersion) detailLoading.value = false;
  }
}
async function confirmAdminReceipt() {
  if (receiptConfirming.value || saving.value || !canConfig.value || !detail.value?.receiptAction?.allowed) return;
  const purchaseId = detail.value.id, orderId = detail.value.order.id, region = regionId.value, version = detailRequestVersion;
  receiptConfirming.value = true;
  let requestSent = false;
  try {
    const { value } = await ElMessageBox.prompt(
      "请先核实用户已收到商品。确认后将完成订单并按现有规则结算配送收益；垫款仍需凭证审核等条件。请填写核实依据（1～500 字）。",
      "代用户确认收货",
      { inputType: "textarea", confirmButtonText: "确认收货", cancelButtonText: "返回", closeOnClickModal: false,
        inputValidator: (value: string) => !!value?.trim() && value.trim().length <= 500 || "请填写 1～500 字的核实说明" },
    );
    if (version !== detailRequestVersion || region !== regionId.value || !drawer.value || detail.value?.id !== purchaseId) {
      ElMessage.warning("当前查看的订单已变化，请重新打开订单后操作");
      return;
    }
    saving.value = true;
    requestSent = true;
    await postAction(`/admin/errand/orders/${orderId}/confirm-receipt`, { reason: value.trim() });
    ElMessage.success("已确认收货，记录已保存");
    if (version === detailRequestVersion && region === regionId.value && detail.value?.id === purchaseId && drawer.value) await openOrder(purchaseId);
    if (region === regionId.value) await load();
  } catch {
    // Refresh server guards after a refused or interrupted request; cancellation makes no change.
    if (requestSent && version === detailRequestVersion && region === regionId.value && detail.value?.id === purchaseId && drawer.value) await openOrder(purchaseId);
  } finally {
    receiptConfirming.value = false;
    saving.value = false;
  }
}
async function audit(stop: any, approved: boolean) {
  try {
    const { value } = await ElMessageBox.prompt(
      approved
        ? "请核对凭证、商品清单与实付金额，再填写审核说明。"
        : "请说明骑手需要补充的凭证。",
      approved ? "确认凭证通过" : "退回购买凭证",
      {
        inputValue: approved ? "商品与实付凭证核对一致" : "",
        inputPattern: /\S+/,
        inputErrorMessage: "请填写审核说明",
      },
    );
    saving.value = true;
    await postAction(
      `${base}/orders/${detail.value.id}/stops/${stop.id}/audit`,
      { approved, note: value },
    );
    await openOrder(detail.value.id);
    await load();
  } catch {
  } finally {
    saving.value = false;
  }
}
async function retryRefund(refundId: string) {
  saving.value = true;
  try {
    await postAction(
      `${base}/orders/${detail.value.id}/refunds/${refundId}/retry`,
    );
    await openOrder(detail.value.id);
    await load();
  } catch {
  } finally {
    saving.value = false;
  }
}
async function cancelOrder() {
  try {
    const { value } = await ElMessageBox.prompt(
      "仅未上传已购凭证的订单可取消。请先联系骑手确认尚未付款购买。",
      "取消代买订单",
      { inputPattern: /\S+/, inputErrorMessage: "请填写取消原因" },
    );
    await postAction(`${base}/orders/${detail.value.id}/cancel`, {
      reason: value,
    });
    await openOrder(detail.value.id);
    await load();
  } catch {}
}
onMounted(async () => {
  try {
    regions.value = await fetchRegions();
    regionId.value = regions.value[0]?.id || "";
    await load();
  } catch (e: any) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.purchase-page {
  padding: 28px;
  max-width: 1800px;
  margin: auto;
  color: #263246;
}
.purchase-header,
.toolbar,
.panel-title,
.detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.purchase-header {
  margin-bottom: 28px;
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 2px;
  color: #d67c3b;
}
h1 {
  font-size: 28px;
  margin: 10px 0;
}
h1 .el-tag {
  vertical-align: middle;
  margin-left: 12px;
}
h2 {
  font-size: 20px;
  margin: 0 0 8px;
}
h3 {
  font-size: 16px;
  margin: 0 0 8px;
}
p {
  color: #8790a0;
  font-size: 13px;
  margin: 6px 0;
  line-height: 1.7;
}
.toolbar .el-select {
  width: 190px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
  margin-bottom: 28px;
}
.stat {
  background: white;
  padding: 22px;
  border: 1px solid #eaeef4;
  border-radius: 14px;
}
.stat span,
.stat small {
  display: block;
  color: #929aa7;
  font-size: 12px;
}
.stat strong {
  display: block;
  font-size: 32px;
  margin: 12px 0;
  color: #ee853d;
}
.workspace {
  padding: 18px 24px 28px;
  border: 1px solid #eaeef4;
  background: white;
  border-radius: 16px;
}
.panel-title {
  margin: 22px 0;
}
.muted {
  font-size: 12px;
  color: #929aa7;
  margin-top: 8px;
  line-height: 1.7;
}
.filters {
  justify-content: flex-start;
  margin: 20px 0;
}
.filters .el-input {
  width: 300px;
}
.shop-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
}
.shop-card {
  border: 1px solid #eef0f3;
  padding: 22px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 18px;
}
.shop-card .el-image,
.shop-placeholder {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  flex-shrink: 0;
}
.shop-placeholder {
  background: #fff2e6;
  color: #ed873f;
  font-size: 28px;
  text-align: center;
  line-height: 64px;
}
.grow {
  flex: 1;
}
.printer-line {
  margin-top: 6px;
}
.shop-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.shop-actions .el-button + .el-button {
  margin-left: 0;
}
.printer-form {
  margin-top: 16px;
}
.printer-state {
  font-weight: 600;
}
.print-tag {
  margin-right: 6px;
}
.template-mode {
  margin-bottom: 14px;
}
.sku-tag {
  margin: 4px;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px 28px;
  padding-bottom: 20px;
}
.settings-grid .muted {
  display: block;
  width: 100%;
}
.add-sku {
  margin: 16px 0;
}
.rider-tiers {
  margin-bottom: 20px;
}
.coupon-off {
  font-size: 12px;
  color: var(--el-color-success);
}
.detail-summary {
  display: flex;
  gap: 36px;
  background: #fff7f0;
  padding: 24px;
  border-radius: 12px;
  margin: 20px 0;
  font-size: 12px;
  color: #868d99;
}
.detail-summary strong {
  display: block;
  font-size: 21px;
  color: #d97531;
  margin-top: 10px;
}
.stop-card {
  border: 1px solid #edf0f5;
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
}
.stop-card .panel-title {
  margin: 0 0 16px;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 12px 0;
  border-bottom: 1px solid #f3f5f7;
  font-size: 13px;
}
.detail-row small {
  display: block;
  color: #959ba5;
  margin-top: 8px;
}
.proofs {
  display: flex;
  gap: 12px;
  margin: 20px 0;
}
.proofs .el-image {
  width: 130px;
  height: 110px;
  border-radius: 10px;
}
.refund-row {
  padding: 15px 0;
}
.modifier-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 18px;
}
.modifier-card {
  border: 1px solid #eef0f3;
  border-radius: 14px;
  padding: 18px 20px;
}
.modifier-card.off {
  opacity: 0.6;
}
.modifier-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}
.card-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.modifier-head h3 .el-tag {
  margin-left: 6px;
  vertical-align: middle;
}
.modifier-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid #f3f5f7;
  font-size: 13px;
}
.modifier-option .muted {
  margin-top: 0;
}
.modifier-option .sold {
  color: #b4bac4;
  text-decoration: line-through;
}
.default-mark {
  margin-left: 6px;
  font-size: 11px;
  color: #3f9b6a;
  border: 1px solid #cfe8d9;
  border-radius: 4px;
  padding: 0 4px;
}
.binding-block {
  border: 1px solid #edf0f5;
  border-radius: 12px;
  padding: 14px 16px;
  margin: 4px 0 16px;
}
.binding-title .muted {
  display: block;
  margin-top: 4px;
}
.binding-row {
  padding: 10px 0;
  border-top: 1px solid #f3f5f7;
}
.binding-row:first-of-type {
  border-top: 0;
}
.binding-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 8px 24px;
}
.binding-tag {
  cursor: pointer;
}
.binding-rule {
  margin-left: 10px;
}
.binding-default {
  margin-left: 24px;
  width: 220px;
}
.rule-line {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #606875;
}
.el-form-item .el-input-number + .el-input-number {
  margin-left: 12px;
}
.receipt-settings { margin: 20px 0; padding: 20px; border: 1px solid #dde3eb; border-radius: 12px; }
.receipt-note { color: #606875; font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.receipt-range { margin-left: 14px; }
.receipt-times { margin: 16px 0; }
.receipt-times > div { display: grid; grid-template-columns: 112px 1fr; gap: 12px; margin: 12px 0; font-size: 14px; }
.receipt-times dt { color: #606875; }
.receipt-times dd { margin: 0; color: #263246; overflow-wrap: anywhere; }
.receipt-card .el-button { margin-top: 12px; }
.filters { flex-wrap: wrap; }
@media (max-width: 600px) {
  .purchase-page { padding: 14px; }
  .workspace { padding: 12px; min-width: 0; }
  .toolbar, .panel-title, .detail-heading { flex-wrap: wrap; }
  .toolbar .el-select, .filters .el-input { width: 100%; max-width: 100%; }
  .purchase-header > .toolbar { width: 100%; }
  .stats { gap: 10px; }
  .stat { padding: 14px; }
  .settings-grid { grid-template-columns: minmax(0, 1fr) !important; }
  .receipt-settings, .stop-card { padding: 14px; }
  .receipt-range { display: block; margin: 8px 0 0; }
  .detail-summary { gap: 18px; flex-wrap: wrap; padding: 16px; }
  .receipt-times > div { grid-template-columns: 1fr; gap: 4px; }
  .receipt-card .el-button { width: 100%; }
}
@media (max-width: 1100px) {
  .stats,
  .shop-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .settings-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .purchase-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

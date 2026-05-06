# 灵萌/xiaoyi 运营管理后台

基于 Vue 3 + TypeScript + Vite + Pinia + Vue Router + Ant Design Vue 构建的高效率运营管理系统。

---

## 目录结构

```
lingmeng-admin/
├── index.html
├── package.json
├── vite.config.ts              # Vite 配置 + 代理 + Antd 按需引入
├── tsconfig.json
├── .env.development / .env.production
├── src/
│   ├── main.ts                 # 应用入口
│   ├── App.vue                 # 根组件 (ConfigProvider)
│   ├── api/                    # API 请求模块
│   │   ├── index.ts            # 统一导出
│   │   ├── auth.ts             # 登录/鉴权
│   │   ├── dashboard.ts        # 仪表盘
│   │   ├── area.ts             # 区域管理
│   │   ├── user.ts             # 用户管理
│   │   ├── content.ts          # 内容管理
│   │   ├── shop.ts             # 商城/商家
│   │   ├── delivery.ts         # 跑腿配送
│   │   ├── finance.ts          # 财务中心
│   │   ├── marketing.ts        # 运营工具
│   │   ├── message.ts          # 消息中心
│   │   ├── system.ts           # 系统设置
│   │   └── upload.ts           # 文件上传
│   ├── assets/                 # 静态资源
│   ├── components/             # 组件
│   │   ├── common/             # 通用组件
│   │   │   ├── DataTable.vue       # 数据表格 (分页/排序/批量操作/插槽)
│   │   │   ├── FilterBar.vue       # 筛选栏 (搜索/重置/展开收起)
│   │   │   ├── AuditModal.vue      # 审核弹窗 (通过/拒绝/备注/图片预览)
│   │   │   ├── StatusTag.vue       # 状态标签 (审核/订单/用户/配送/支付)
│   │   │   ├── ImagePreview.vue    # 图片预览组
│   │   │   ├── OperationLog.vue    # 操作日志时间线
│   │   │   ├── UploadImage.vue     # 图片上传组件
│   │   │   └── RichEditor.vue      # 富文本编辑器
│   │   └── business/           # 业务组件 (预留)
│   ├── composables/            # 组合式函数
│   ├── directives/             # 自定义指令
│   │   └── index.ts            # v-permission / v-role / v-debounce
│   ├── layouts/
│   │   └── MainLayout.vue      # 主布局 (侧栏/顶栏/标签页/面包屑)
│   ├── router/
│   │   └── index.ts            # 全量路由 + 权限守卫 (beforeEach)
│   ├── stores/
│   │   ├── user.ts             # 用户/登录/权限 store
│   │   └── app.ts              # 应用状态 store (侧栏/标签/面包屑)
│   ├── styles/
│   │   ├── variables.less      # 设计变量 (色板/间距/阴影)
│   │   └── global.less         # 全局样式 + 布局工具类
│   ├── types/                  # TypeScript 类型定义
│   │   ├── api.d.ts            # 通用 API 响应/分页
│   │   ├── auth.d.ts           # 角色/管理员/登录/菜单
│   │   ├── user.d.ts           # 用户/标签/关注/浏览
│   │   ├── area.d.ts           # 区域/轮播图/公告/导航
│   │   ├── content.d.ts        # 帖子/评论/话题/举报/投票
│   │   ├── shop.d.ts           # 商家/类目/商品/SKU/订单/退款/评价
│   │   ├── delivery.d.ts       # 骑手/配送配置/配送订单
│   │   ├── finance.d.ts        # 支付/充值/余额/提现/退款
│   │   ├── marketing.d.ts      # 优惠券/签到/徽章/活动/团购
│   │   ├── message.d.ts        # 会话/消息/违规/未读
│   │   └── system.d.ts         # 操作日志/存储配置/支付配置/仪表盘
│   ├── utils/
│   │   ├── request.ts          # Axios 封装 (Token 刷新/拦截/错误处理)
│   │   ├── storage.ts          # localStorage 封装 (过期时间)
│   │   └── format.ts           # 金额/数字/时间/文件大小/脱敏
│   └── views/                  # 业务页面
│       ├── login/              # 登录页
│       ├── error/              # 403 / 404
│       ├── dashboard/          # 工作台仪表盘
│       ├── area/               # 区域管理 (列表/详情/装修)
│       ├── user/               # 用户管理 (列表/详情/学生认证审核)
│       ├── content/            # 内容管理 (帖子/评论/话题/举报/热榜)
│       ├── shop/               # 商城 (商家/类目/商品/订单/退款/评价/促销/运费/库存)
│       ├── delivery/           # 配送 (配置/订单池/骑手/计费规则)
│       ├── finance/            # 财务 (支付/充值/余额/提现/退款/对账)
│       ├── marketing/          # 运营 (优惠券/签到/徽章/活动/团购/分享/通知)
│       ├── message/            # 消息 (会话/违规消息)
│       └── system/             # 系统 (管理员/角色/菜单/日志/存储/支付/配置)
```

---

## 路由设计

| 路径 | 页面 | 权限 | 说明 |
|------|------|------|------|
| `/login` | 登录页 | 无 | 账号密码+验证码 |
| `/dashboard` | 工作台 | `dashboard:view` | GMV/订单/用户/待办/趋势图 |
| `/area/list` | 区域列表 | `area:view` | CRUD/开关/批量 |
| `/area/detail/:id` | 区域详情 | `area:view` | 详情+操作日志 |
| `/area/decoration/:id` | 首页装修 | `area:edit` | 轮播图/公告/导航/TabBar |
| `/user/list` | 用户列表 | `user:list` | 搜索/筛选/封禁/标签 |
| `/user/detail/:id` | 用户详情 | `user:view` | 信息/余额/关注/浏览 |
| `/user/certifications` | 学生认证审核 | `user:cert:audit` | 通过/拒绝/图片预览 |
| `/content/posts` | 帖子管理 | `content:view` | 审核/置顶/精帖/删除 |
| `/content/post/:id` | 帖子详情 | `content:view` | 详情/审核/日志 |
| `/content/comments` | 评论管理 | `content:view` | 审核/删除 |
| `/content/topics` | 话题/圈子 | `content:view` | CRUD |
| `/content/reports` | 举报管理 | `content:report:handle` | 处理/忽略 |
| `/content/hot` | 热榜管理 | `content:view` | 排序/开关 |
| `/shop/merchants` | 商家管理 | `shop:view` | 审核/开关 |
| `/shop/merchant/:id` | 商家详情 | `shop:view` | 详情 |
| `/shop/categories` | 商品类目 | `shop:category` | 树形管理 |
| `/shop/products` | 商品列表 | `shop:product:view` | SKU/上下架 |
| `/shop/product/:id` | 商品详情 | `shop:product:view` | 详情+SKU |
| `/shop/orders` | 订单管理 | `shop:order:view` | 筛选/详情 |
| `/shop/order/:id` | 订单详情 | `shop:order:view` | 详情/状态 |
| `/shop/refunds` | 退款管理 | `shop:refund` | 审核/处理 |
| `/shop/reviews` | 评价管理 | `shop:review` | 回复/删除 |
| `/shop/promotions` | 促销活动 | `shop:promotion` | CRUD |
| `/shop/freight` | 运费模板 | `shop:freight` | CRUD |
| `/shop/stock-alerts` | 库存预警 | `shop:product:view` | 预警列表 |
| `/delivery/config` | 服务配置 | `delivery:config` | 费率配置 |
| `/delivery/orders` | 配送订单 | `delivery:order:view` | 派单/转单 |
| `/delivery/order/:id` | 配送订单详情 | `delivery:order:view` | 详情 |
| `/delivery/riders` | 骑手管理 | `delivery:rider:view` | 审核/状态 |
| `/delivery/rider/:id` | 骑手详情 | `delivery:rider:view` | 详情 |
| `/delivery/fee-rules` | 计费规则 | `delivery:config` | CRUD |
| `/finance/payments` | 支付订单 | `finance:payment` | 列表 |
| `/finance/recharges` | 充值记录 | `finance:recharge` | 列表 |
| `/finance/balance-logs` | 余额流水 | `finance:balance` | 列表 |
| `/finance/withdraws` | 提现审核 | `finance:withdraw` | 审核/打款 |
| `/finance/refunds` | 退款记录 | `finance:refund` | 处理 |
| `/finance/reconciliations` | 对账导出 | `finance:reconciliation` | 生成/导出 |
| `/marketing/coupons` | 优惠券 | `marketing:coupon` | CRUD |
| `/marketing/sign` | 签到配置 | `marketing:sign` | 连续签到奖励 |
| `/marketing/badges` | 徽章头衔 | `marketing:badge` | CRUD |
| `/marketing/activities` | 活动管理 | `marketing:activity` | CRUD |
| `/marketing/group-buys` | 团购管理 | `marketing:groupbuy` | CRUD |
| `/marketing/share-invites` | 分享邀请 | `marketing:invite` | CRUD |
| `/marketing/notifications` | 系统通知 | `marketing:notification` | 发送/状态 |
| `/message/conversations` | 会话列表 | `message:conversation` | 查看/封禁 |
| `/message/violations` | 违规消息 | `message:violation` | 处理 |
| `/system/admins` | 管理员 | `system:admin` | CRUD/重置密码 |
| `/system/roles` | 角色管理 | `system:role` | CRUD/分配权限 |
| `/system/menus` | 菜单权限 | `system:menu` | 树形管理 |
| `/system/logs` | 操作日志 | `system:log` | 筛选/查看 |
| `/system/storage` | 文件存储 | `system:config` | 云存储配置 |
| `/system/wechat-pay` | 微信支付 | `system:config` | 支付配置 |
| `/system/config` | 系统配置 | `system:config` | 常规配置 |

---

## 角色权限矩阵

| 角色 | 编码 | 核心权限 |
|------|------|----------|
| 平台超级管理员 | `super_admin` | 全部 (`*`) |
| 区域管理员 | `area_admin` | 所属区域的仪表盘/区域/用户/内容/商城/配送/财务/运营/消息 |
| 商家管理员 | `merchant_admin` | 所属店铺的仪表盘/商品/订单/促销/财务/消息 |
| 骑手 | `rider` | 配送订单查看/接单 |
| 客服 | `customer_service` | 用户查看/内容举报/消息违规 |
| 审核员 | `auditor` | 内容审核/商家审核/商品审核/骑手审核 |

**权限控制方式**:
1. **路由守卫**: `router.beforeEach` 检查 `to.meta.permission`
2. **指令**: `v-permission="'content:audit'"` 控制元素显隐
3. **Store 方法**: `userStore.hasPermission()` / `hasAnyPermission()` / `hasAllPermissions()`
4. **菜单过滤**: 侧边栏菜单根据用户权限动态过滤

---

## 视觉规范

### 色彩系统
| 用途 | 色值 | 说明 |
|------|------|------|
| 主色 | `#3B82F6` | 按钮/链接/选中态 |
| 主色hover | `#2563EB` | 悬停态 |
| 成功 | `#10B981` | 通过/完成/增长 |
| 警告 | `#F59E0B` | 待审核/提醒 |
| 错误 | `#EF4444` | 拒绝/删除/封禁 |
| 页面背景 | `#F0F2F5` | 整体底色 |
| 容器背景 | `#FFFFFF` | 卡片/表格背景 |
| 文字主色 | `#1F2937` | 标题/正文 |
| 文字次要 | `#6B7280` | 辅助说明 |
| 边框 | `#E5E7EB` | 分割线/输入框 |
| 侧栏背景 | `#001529` | Antd 暗色菜单 |

### 间距系统（8px 基准）
- `xs: 4px` / `sm: 8px` / `md: 16px` / `lg: 24px` / `xl: 32px` / `2xl: 48px`
- 页面内容区 padding: `24px`
- 卡片内 padding: `20px 24px`
- 表格行高: `48px`
- 筛选项间隙: `12px`

### 表格规范
- 默认大小: `middle` (行高 48px)
- 分页: 默认 20 条/页，支持 10/20/50/100
- 固定操作列在最右
- 批量操作栏在表格上方，选中后显示
- 空状态: 居中显示 `a-empty`

### 表单规范
- 标签宽度: `100px`
- 详情页: grid 2列布局，标签-值上下排列
- 弹窗表单: 标签右对齐，宽度 `640px`

### 弹窗规范
- 审核弹窗: `520px`，radio 选择 + textarea 备注
- 表单弹窗: `640px`
- 确认弹窗: `416px`

### 详情页布局
```
[返回按钮] [标题] [状态标签]          [操作按钮组]
─────────────────────────────────────────
┌─ 基本信息 ────────────────────────────┐
│ label: value    │  label: value       │
│ label: value    │  label: value       │
└────────────────────────────────────────┘
┌─ 数据统计 ────────────────────────────┐
│ ...                                    │
└────────────────────────────────────────┘
┌─ 操作日志 ────────────────────────────┐
│ 时间线组件                              │
└────────────────────────────────────────┘
```

---

## 通用组件 API

### DataTable
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| columns | `TableColumnType[]` | - | 列定义 |
| dataSource | `any[]` | [] | 数据 |
| loading | `boolean` | false | 加载态 |
| total | `number` | 0 | 总数 |
| page/pageSize | `number` | 1/20 | 分页 |
| rowSelection | `boolean` | false | 多选 |
| batchActions | `BatchAction[]` | [] | 批量操作 |
| **Slots**: `toolbar`, `[col.dataIndex]` | 每一列均可自定义插槽 |

### FilterBar
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| showExpand | `boolean` | false | 展开收起 |
| **Events**: `search`, `reset` | | | |
| **Slots**: `default`, `expand` | | | |

### AuditModal
| Prop | 类型 | 说明 |
|------|------|------|
| visible | `boolean` | 显示 |
| title | `string` | 标题 |
| images | `string[]` | 审核图片 |
| loading | `boolean` | 提交加载 |
| **Event**: `submit(action, remark)` | | |

### StatusTag
| Prop | 类型 | 说明 |
|------|------|------|
| status | `string` | 状态值 |
| type | `'audit' \| 'order' \| 'user' \| 'delivery' \| 'payment' \| 'general'` | 预设类型 |

---

## 启动

```bash
cd lingmeng-admin
npm install
npm run dev      # http://localhost:3001
npm run build    # 生产构建
```

---

## 技术依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| Vue 3 | ^3.5 | 渐进式框架 |
| TypeScript | ^5.7 | 类型安全 |
| Vite | ^6.0 | 构建工具 |
| Pinia | ^2.3 | 状态管理 |
| Vue Router | ^4.5 | 路由管理 |
| Ant Design Vue | ^4.2 | UI 组件库 |
| ECharts | ^5.5 | 图表 |
| vue-echarts | ^7.0 | Vue3 ECharts 封装 |
| Axios | ^1.7 | HTTP 请求 |
| dayjs | ^1.11 | 日期处理 |
| Less | ^4.2 | CSS 预处理 |

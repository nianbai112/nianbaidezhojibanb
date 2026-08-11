# 后台 UI 重塑设计简报（运营驾驶舱）

> 目标气质：Linear / Vercel Dashboard 级别的克制工艺 —— **深色侧边栏 + 浅色内容区 + hairline 边框**。
> 禁令：禁止任何渐变（唯一例外见下）、禁止彩虹色、禁止卡片套卡片、禁止装饰性动画、禁止新增蓝色以外的强调色。
> 主色沿用 `--mx-primary: #2563eb`（品牌蓝），其余全部中性色。
> 所有实现必须先读现有代码，**保留全部业务逻辑**（登录、未读数、权限过滤、品牌信息加载等），只重建视觉与交互层。

---

## 1. 新增设计令牌（glass.scss `:root`）

```scss
/* 深色侧边栏 ink 系列 */
--mx-ink: #0c1322;              /* 侧边栏底色，近黑带蓝 */
--mx-ink-2: #141d33;            /* 侧边栏激活/hover 底 */
--mx-ink-3: rgba(255,255,255,.07); /* 侧边栏 hairline */
--mx-ink-text: #8a94a8;         /* 侧边栏次文本 */
--mx-ink-text-strong: #e7ebf3;  /* 侧边栏主文本 */

/* 收窄（修改现有两个值） */
--mx-radius: 12px;              /* 原 16px */
--mx-shadow-soft: 0 1px 2px rgba(16,24,40,.05);   /* 单层极浅 */
--mx-shadow: 0 6px 24px rgba(16,24,40,.10);
```

工具类：
- `.kbd`：inline-block，11px var(--mx-font-sans)，padding 1px 5px，border 1px solid var(--mx-border-strong)，radius 5px，color var(--mx-muted)，background #fff。
- `.scroll-dark` 深色滚动条：`::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14) }`，track 透明。

## 2. MainLayout（运营驾驶舱外壳）

布局：`.admin-shell { display:flex; height:100vh }`。

### 侧边栏（232px，深色，不再是 glass-card）
- 背景 `var(--mx-ink)`，右边框 1px `var(--mx-ink-3)`，flex column 全高。
- **品牌区**（56px，底部 1px `var(--mx-ink-3)`）：logo 28px 圆角 8px 方块（有图显图，无图用 accent 底白字首字母）；名称 14px/600 `#fff`；副标题 11px `var(--mx-ink-text)`。数据继续走 `fetchWebsiteInfo`。
- **菜单区**（`el-scrollbar` flex-1，配 `.scroll-dark`）：
  - 组头：11px，`var(--mx-ink-text)`，letter-spacing .04em，padding `18px 16px 6px`，可点击折叠，chevron 12px 旋转过渡。折叠状态存 localStorage(`km-nav-groups`)。**删掉**组头右侧的数量徽标和圆点光晕。
  - 菜单项：13px，`var(--mx-ink-text)`，icon 16px，padding `7px 12px`，margin `1px 8px`，radius 8px，display flex gap 10px。
    - hover：背景 `rgba(255,255,255,.05)`，文字转 `var(--mx-ink-text-strong)`。
    - 激活（router-link-active）：背景 `rgba(255,255,255,.07)`，文字 `#fff`，左侧 2px 指示条（`::before`，宽 2px 高 16px 圆角 2px，背景 `var(--mx-primary)`）。
    - **删掉**每项右侧的 chev 箭头。
  - 图标：继续使用 menus.ts 里的 Element 图标名。
- **底部用户卡**（顶部 1px `var(--mx-ink-3)`，padding 12px）：avatar 30px 圆形（accent 底白字，取用户名首字符）+ 姓名 13px/600 `var(--mx-ink-text-strong)` + 角色 11px `var(--mx-ink-text)`（单行省略，修复换行溢出）；右侧折叠/展开按钮（ghost，ink-text，hover 变白）。用户卡点击弹 dropdown（退出登录），保留现有退出逻辑。
- 折叠态（72px）：只显示图标，菜单项文字隐藏，组头隐藏，激活指示条保留；hover 项时 tooltip 显示标题（el-tooltip, effect="dark"）。
- **响应式**：<1100px 时侧边栏 `position:fixed; transform:translateX(-100%)`，带过渡；打开时滑入 + 全屏遮罩（rgba(12,19,34,.45)，点击关闭）；顶栏出现汉堡按钮。

### 顶栏（56px，白底，sticky）
- 背景 `#fff`，下边框 1px `var(--mx-border)`，z-index 20，左右 padding 16px/20px。
- 左侧：折叠按钮（≥1100px）/ 汉堡按钮（<1100px）+ **面包屑**（当前组名 / 页面标题，13px；组名 muted 可点回组内第一页，页名主色 600）。数据来源：route.path 在 visibleMenuGroups 中反查。
- 右侧（gap 10px，垂直居中）：
  - **搜索触发框**：宽 220px 高 34px，背景 `#f1f4f9`，radius 8px，Search icon 14px muted + 占位文字 "搜索菜单，快速跳转" 12.5px muted + 右侧 `.kbd` ⌘K；hover 时边框色 accent；点击打开命令面板。
  - 消息 icon-button（20px icon，badge=unreadMessages，点击 `openMessages()`）。
  - 通知 icon-button（badge=unreadNotices，点击 `openNotifications()`）。
  - 1px 竖分隔线（高 20px，var(--mx-border)）。
  - 用户 chip：avatar 26px + 姓名 13px（max-width 120px 省略），dropdown 保留现有项。
- **页面切换动效**：只保留顶部 2px 进度条（accent 色，切换时 0→80%→完成 100% 后淡出）。**删除**整页 loading 遮罩、内容位移动效、以及给"刷新/查询/搜索"按钮加白光扫过的全局监听器。

### 命令面板 CommandPalette.vue（新文件，`admin/src/layout/CommandPalette.vue`）
- teleport 到 body。遮罩 `rgba(12,19,34,.45)`，点击关闭。
- 面板：宽 560px（max 92vw），`margin: 12vh auto 0`，白底，radius 14px，border 1px `var(--mx-border)`，shadow `0 24px 64px rgba(12,19,34,.28)`，overflow hidden。
- 输入行（高 52px，底部 1px border）：Search icon + `<input>` 15px 无边框（placeholder "搜索页面，快速跳转…"）+ 右侧 `.kbd` esc。
- 结果列表（max-height 340px，滚动）：
  - query 为空 → 显示"最近访问"（localStorage `km-recent-nav`，最多 5 条，每次跳转后 unshift 去重）+ 下面接全部分组。
  - 有 query → 跨组匹配（title 小写 includes），按组分组显示，组头 11px muted padding。
  - 项：icon 16px + 标题 13px + 右侧组名 11px muted；选中项：背景 `var(--mx-hover)` + 左 2px accent 指示条。
- 底部提示行（高 36px，顶部 1px border，11.5px muted）：`↑↓ 选择 · ↵ 打开 · esc 关闭`。
- 键盘：`⌘K`/`Ctrl+K` 全局切换开关、↑↓ 移动、Enter 跳转（router.push）、Esc 关闭；打开时 nextTick 聚焦输入框；关闭时清空 query；面板打开时锁 body 滚动。
- 数据源：`visibleMenuGroups`（权限过滤后的）扁平化。MainLayout 中 `defineExpose({ open })` 或直接 props/emits 由实现者定，保持简单。

### 必须保留的现有逻辑（先读 MainLayout.vue 逐条核对）
`fetchWebsiteInfo/applyWebsiteInfo/updateFavicon/document.title`；`fetchHeaderStats` 轮询与刷新事件监听（照抄现有事件名）；`openMessages/openNotifications`；退出登录；`filterMenuGroups(menuGroups, auth.accessContext)`；auth store 的用户名/角色字段。旧的顶部搜索 dropdown 逻辑整体由命令面板取代，可删除。

## 3. Login.vue（分栏式）

- ≥900px：左右分栏全屏（100vh，不允许出现页面级滚动条外的第二滚动）。
  - **左面板**（45%，min-width 420px）：背景 `var(--mx-ink)` + 细网格纹理（两层 repeating-linear-gradient，`rgba(255,255,255,.035)` 1px 线，64px 方格）——这是全页唯一纹理。内容 padding 48px，flex column：
    - 顶：logo 36px + 品牌名 16px/600 #fff。
    - 中（flex-1 垂直居中）：`loginSlogan` 28px/600 #fff（数据来自 websiteInfo，兜底"面向校园本地生活的真实运营后台"）+ 一行 14px `var(--mx-ink-text)`。
    - 底：三个能力点（每项：6px 圆点 accent 色 + 一行 12.5px `var(--mx-ink-text-strong)`）："内容 / 用户 / 商家一体化运营"、"实时数据与异常告警"、"区域化精细运营"；最底部 © 年份 + 品牌名 11px ink-text。
  - **右面板**（flex-1，#fff）：表单垂直居中，宽 360px。
    - "欢迎回来" 22px/600 + 副文 "登录以继续运营管理" 13px muted。
    - 表单项：label 12.5px/600；`el-input` size large（40px）；密码框回车提交。
    - 主按钮：全宽 40px，accent 实心，hover 用 `var(--el-color-primary-dark-2)`，保留 loading 态。
    - 错误提示、表单校验、登录中状态全部保留现有实现。
    - 底部：版本/说明 11px muted。
- <900px：左面板隐藏，顶部 56px 白底品牌横条（logo+名），表单自适应。
- **必须保留**（先读 Login.vue 逐条核对）：auth store 登录调用、路由跳转、错误处理、表单校验规则、网站信息加载、扫码登录或其他已有 tab（若存在）。业务字段名（username/password 等）一律不变。

## 4. 验收标准
1. `cd admin && npm run build` 通过。
2. 无任何渐变出现在按钮/KPI/头像/侧栏/登录页（左面板网格纹理除外）。
3. 侧栏为深色、内容与侧栏层级分明；菜单激活态有左指示条。
4. ⌘K 面板可打开、可搜索、可键盘跳转。
5. <1100px 时侧栏抽屉化，汉堡可开关。
6. 登录页分栏呈现，表单功能正常。

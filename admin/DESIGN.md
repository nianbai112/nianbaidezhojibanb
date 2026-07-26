# Lingmeng Admin DESIGN.md

This file is the source of truth for the Lingmeng Admin visual system. Read it before changing any admin page. The goal is not to make every screen decorative; the goal is to make a dense campus-operations console feel calm, trustworthy, and fast to operate.

## Product Position

Lingmeng Admin is an operations console for a campus local-life platform. It manages regions, schools, users, student verification, merchants, mall orders, refunds, content safety, finance, marketing, AI operations, notifications, and mini-program page decoration.

The product should feel like a clean operating system for campus business, not a marketing landing page and not a demo dashboard.

Design name: **Lingmeng OS Console**.

Core feeling:
- Calm, precise, and premium.
- Real-data first.
- Operator efficient.
- Light system surface, not heavy glass decoration.
- Pages should feel related to each other even if different AI agents work on them.

## Non-Negotiable Rules

1. Never use fake KPI numbers, fake rankings, fake trends, or hardcoded demo data on production pages.
2. If there is no real data, show `0`, `暂无真实数据`, or a proper empty state.
3. Every dashboard card must have a real source endpoint or clearly say it is unavailable.
4. Do not create landing-page hero sections inside the admin.
5. Do not add decorative blobs, orbs, large gradients, or marketing illustrations.
6. Do not use nested cards except for real repeated items, drawers, or modals.
7. Do not hide failed operations in `console.error` only. User-facing operations need visible error feedback.
8. Mini-program configuration pages must show an actual preview area or a clear preview state. Do not pretend a static phone frame is live if it is not.
9. Page density is allowed, but crowding is not. Operators should scan the page in three seconds.
10. Backend API, auth, permissions, and mini-program source code must not be changed for cosmetic UI work.

## Visual Foundation

### Color

Use a restrained light system palette:
- Primary: `#2563eb`
- Primary hover: `#1d4ed8`
- Cyan accent: `#0891b2`
- Success: `#16a34a`
- Warning: `#d97706`
- Danger: `#dc2626`
- Text strong: `#0f172a`
- Text normal: `#334155`
- Text muted: `#64748b`
- Border: `#dbe4f0`
- Page background: `#f5f9ff`
- Surface: `rgba(255,255,255,.86)`

Avoid one-color domination. The admin may use blue as the primary action color, but pages should not become blue-glass walls.

### Typography

Use the existing system font stack. Do not add web fonts.

Type scale:
- Page title: 28-32px, 900 weight.
- Section title: 16-18px, 850-900 weight.
- Card metric: 24-28px, 900 weight.
- Table body: 13-14px.
- Helper text: 12-13px.

No viewport-based font scaling. No negative letter spacing.

### Radius And Shadow

Cards and controls should feel precise:
- Page cards: 16px radius.
- Buttons and inputs: 10-12px radius.
- Tags: pill radius.
- Avoid heavy shadows. Use thin borders and subtle soft shadows.

## Layout Patterns

### Standard Page

Use this structure:
1. Page header: title, short subtitle, primary actions.
2. Optional KPI strip only if numbers are real and useful.
3. Filter/search area.
4. Main table or configuration surface.
5. Drawer for detail and secondary operations.

Do not put every page inside a large floating hero card.

### Dashboard Page

Dashboard pages should answer operator questions:
- What needs attention now?
- What changed today?
- Which region or merchant is abnormal?
- What action should I take next?

Recommended layout:
- Top: 4 core KPIs max.
- Middle: trend + pending queue.
- Bottom: ranked real lists and risk lists.

Avoid six KPI cards in one row. Avoid fake charts.

### Table Workbench

For users, merchants, orders, refunds, verification, schools, content, and finance:
- Filters stay compact.
- Primary actions are at the top right.
- Bulk actions are visible but not dominant.
- Details open in a drawer.
- Destructive actions require confirmation.
- Status must use readable tags.

Tables should be the center of the page. Do not squeeze tables with permanent side panels.

### Configuration Page

For region config, system settings, AI config, notification settings:
- Use tabs or a left configuration directory.
- Split long forms into clear sections.
- Save actions should be sticky or easy to find.
- Show last saved state when useful.
- Validation errors must be close to the field.

### Mini-Program Decoration Page

This is a flagship surface.

Preferred layout:
- Left: region selector and decoration directory.
- Center: module configuration, ordering, toggles, content pickers.
- Right: mini-program preview.

Preview rules:
- If preview is live, label it as live preview.
- If preview is simulated, label it as simulated preview.
- The preview must update when fields change.
- Do not show fake product/content cards unless they are generated from actual selected data or clearly empty.

## Component Rules

### Page Header

Page headers are not hero sections. They should be compact and useful:
- Title line.
- One-line business explanation.
- Action slot.
- Optional breadcrumb.

### KPI Card

A KPI card must include:
- Label.
- Number.
- Time scope or comparison label.
- Optional delta.
- Optional tooltip explaining the metric.

If the number is not backed by a real API, remove the card.

### Empty State

Use empty states honestly:
- `暂无真实数据`
- `还没有符合条件的记录`
- `当前筛选条件下无结果`

Do not show mock samples in an empty table.

### Buttons

- Primary blue for the main action.
- Plain/secondary buttons for secondary actions.
- Danger red only for destructive actions.
- Buttons must not wrap text awkwardly.
- Icon buttons need tooltips when meaning is not obvious.

### Forms

- 2-3 columns on desktop.
- 1 column on small screens.
- Required fields must be clear.
- Image fields use upload components, not raw URL-only inputs unless URL mode is explicitly needed.

### Drawers And Modals

- Drawer: detail, edit, audit, order timeline.
- Modal: confirmation or short form only.
- Long forms should not live in small modals.

## Menu And Navigation

The left menu is an operator map, not a dumping ground.

Rules:
- Groups are collapsible.
- Keep group names short.
- Place notification center, WeChat subscribe messages, official account binding, and WebSocket sessions under System Operations or System Settings depending on whether the page is runtime monitoring or configuration.
- Region configuration, page decoration, tabbar, and share settings belong under Region Center.
- Mall and merchant operations should be separate when the workflow is different.

Global search must search menu title and path.

## Data Integrity

For every new admin page, implement this checklist:
- Frontend page path.
- Menu path.
- API function or request call.
- Backend controller route.
- Backend service method.
- Prisma model/table.
- Empty state.
- Error state.
- Permission seed.
- Build/typecheck/test verification.

## Implementation Guidance For AI Agents

Before editing a page, read:
1. `admin/DESIGN.md`
2. `admin/src/router/menus.ts`
3. `admin/src/router/index.ts`
4. The target Vue page.
5. The target backend controller/service if data is involved.

When changing UI only:
- Do not modify backend services.
- Do not modify Prisma schema.
- Do not modify mini-program source.
- Keep edits inside admin layout, styles, and target admin pages.

When changing data behavior:
- Do not use hardcoded fallback numbers.
- Add clear Chinese errors.
- Keep response shapes compatible with existing pages.

## Quality Bar

A page is acceptable when:
- It looks consistent with the rest of the admin.
- It has no fake data.
- It is not visually crowded.
- It has visible loading, empty, success, and error states.
- It can be operated repeatedly by a real admin without confusion.

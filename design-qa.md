# Campus map release cockpit QA

- Source visual truth: `/var/folders/q2/9jtstwn10xz1b__l0mxdm2980000gn/T/codex-clipboard-fd10f40e-55ef-421e-aa25-93c376654159.png`
- Implementation screenshot: `/Users/nianbaidediannao/.codex/visualizations/2026/08/27/01a042fe-9438-7b62-a8f6-cde032c89fc7/campus-map-admin-after.png`
- Focused implementation screenshot: `/Users/nianbaidediannao/.codex/visualizations/2026/08/27/01a042fe-9438-7b62-a8f6-cde032c89fc7/campus-map-action-bar-after.png`
- Route: `http://localhost:5173/admin/region/config?tab=campusMap`
- Viewport: 1581 x 1280 CSS px, device scale factor 1
- Source pixels: 1310 x 498; focused implementation pixels: 1301 x 231; full implementation pixels: 1581 x 1280
- Density normalization: both source and implementation were viewed at device scale factor 1. The focused implementation crop is nine pixels narrower than the source and represents the same release-cockpit content region.
- State: authenticated local admin, campus map tab selected, draft saved as r1, no public places, release blocked by missing place catalog.

## Full-view comparison evidence

The repaired cockpit sits inside the existing region-configuration page without horizontal overflow. The title, status pills, four workflow actions, five release stages and next-action banner form three readable rows. The editor below keeps the existing three-column workbench and the supplied vector campus artwork.

## Focused region comparison evidence

The source screenshot and focused implementation were compared together. In the source, the parent component forces every direct child of the action bar into one horizontal grid, which turns status pills into vertical text and leaves a large empty area. In the implementation, the child component owns its layout: metadata remains horizontal, stages have equal tracks, and the next action spans the card width. The focused crop is sufficient because all changed typography, spacing, state colors, icons, controls and copy are legible there.

## Required fidelity surfaces

- Fonts and typography: existing Element Plus/system typography is preserved. Pills no longer wrap character-by-character; headings, stage counts and help text retain a clear weight hierarchy.
- Spacing and layout rhythm: the cockpit now uses three compact rows with 14px section gaps, equal stage columns and a full-width next-action banner. No overlap or clipping is visible at the measured 1301px content width.
- Colors and visual tokens: existing blue primary, red blocker, amber draft and neutral border tokens are preserved. Publish remains the only primary blue workflow action.
- Image quality and asset fidelity: no image asset was recreated or substituted. The existing campus SVG remains the workbench map.
- Copy and content: `保存草稿` is explicit and separate from `发布本批`; saved revision `草稿 r1` confirms the distinction. Operator wording remains concise and task-oriented.
- Accessibility and interaction: workflow actions are semantic buttons with icon plus text. The save control disables after a successful save, avoiding duplicate requests; the release stage controls remain keyboard-reachable buttons.

## Findings

No actionable P0, P1 or P2 visual findings remain in the release cockpit.

P3 follow-up: the full workbench has not been checked at phone-sized admin widths because this admin route is desktop-oriented. The child component still defines single-column behavior below 980px.

## Comparison history

- Earlier P1: legacy parent `.map-action-bar` CSS flattened the child component into one row, producing vertical status pills, crowded controls and a large empty card.
- Fix: removed the parent-owned cockpit styles and retained layout ownership in `CampusMapActionBar.vue`; added nowrap metadata and wrapping workflow actions.
- Post-fix evidence: `campus-map-action-bar-after.png` shows a compact three-row layout at 1301px content width with no overlap or clipped text.
- Earlier P1: operators had no explicit draft-save action, and a real save request failed because the local database lacked the campus-map project tables.
- Fix: added `保存草稿` using the existing `saveDraft()` path, fixed the release migration runner's hoisted Prisma CLI resolution, and applied the local additive migrations.
- Post-fix evidence: the browser reported `校园地图草稿已保存，尚未发布到小程序`, the cockpit advanced to `草稿 r1`, and the save button became disabled until the next edit.

## Primary interactions checked

- Open authenticated campus map tab: passed.
- Render explicit save and publish actions: passed.
- Click `保存草稿` and persist through the backend: passed.
- Saved-state feedback (`草稿 r1`, save disabled, success alert): passed.
- Responsive release-cockpit layout at 1301px content width: passed.

final result: passed

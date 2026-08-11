# Campus Map Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operator guidance layer that tells customers how complete their campus map is, what is missing, and which action to take next.

**Architecture:** Implement the assistant inside `RegionCampusMapPainter.vue` as derived UI state from the existing map draft, publish checks, semantic categories, CAD import state, and calibration points. Keep it as a drawer and compact header badge so the map-first workbench stays clean. Add static minitests to protect the assistant entry, scoring, key-place coverage, and next-action wiring.

**Tech Stack:** Vue 3, Element Plus, existing campus-map admin state, Node minitest.

---

### Task 1: Assistant State

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/后端后台本地测试版/admin/src/views/region/components/RegionCampusMapPainter.vue`

- [ ] Add assistant score computed from base map readiness, drawing content, semantic key places, calibration, preview/publish readiness, and draft cleanliness.
- [ ] Add key-place coverage for library, canteen, dorm, gate, teaching, sports, express, clinic, and shop.
- [ ] Add next-action helpers that open CAD import, set drawing tool, open preview, open quality check, or publish.

### Task 2: Assistant UI

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/后端后台本地测试版/admin/src/views/region/components/RegionCampusMapPainter.vue`

- [ ] Add a compact header button showing configuration completion percentage.
- [ ] Add an assistant drawer with current score, next action, guided steps, key-place checklist, and warnings.
- [ ] Keep all text concise and operational, not tutorial-heavy.

### Task 3: Tests And Sync

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/minitest/campus-map-control.test.cjs`
- Copy changed files to `/Users/nianbaidediannao/Desktop/后端后台干净版本`

- [ ] Add minitest checks for `assistantDrawerVisible`, `mapAssistantScore`, `keyPlaceCoverage`, and action wiring.
- [ ] Run minitest and admin build.
- [ ] Sync the changed admin component and plan doc to the clean backend/admin copy.

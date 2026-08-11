# Campus Map Human Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the campus-map workbench easier for operators by replacing raw tool names with a guided CAD cleanup -> real map calibration -> content edit workflow.

**Architecture:** Keep the existing AMap, image/SVG canvas, import drawer, and publish payload unchanged. Change only the operator controls in the existing Vue components so the current backend contract remains stable.

**Tech Stack:** Vue 3, Element Plus, existing `@amap/amap-jsapi-loader`.

---

### Task 1: Human Workflow Controls

**Files:**
- Modify: `admin/src/views/region/components/campus-map/CampusMapToolRail.vue`
- Modify: `admin/src/views/region/components/campus-map/CampusMapWorkbenchHeader.vue`
- Modify: `admin/src/views/region/components/RegionCampusMapPainter.vue`

- [x] Rename tool labels into operator actions.
- [x] Add workflow stage buttons for CAD cleanup, real map calibration, content edit, and publish check.
- [x] Keep existing emitted events and payloads unchanged.
- [x] Run admin build.
- [x] Sync changed files to the clean backend copy after verification.

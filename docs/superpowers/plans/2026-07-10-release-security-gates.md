# Release Security Gates Implementation Plan

> **For Codex:** Execute this plan in the current workspace, preserving existing unrelated changes.

**Goal:** Close the remaining direct content-review bypasses before the next production release gate.

**Architecture:** The notification endpoint remains present solely to give outdated clients an explicit retirement response. The unified content-audit service is restricted to post, comment, and report workflows; merchant, withdrawal, and city-agent approvals remain in their permission-specific service routes.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3 admin.

## Tasks

1. Retire user-facing notification review writes with a 410 response and replace the historical approval test with a no-write regression test.
2. Restrict unified audit list, counters, statistics, and batch actions to the content-review scope. Reject business approvals that must use dedicated controllers.
3. Run focused tests, the full backend suite, builds, and update the market audit ledger with implementation and verification evidence.

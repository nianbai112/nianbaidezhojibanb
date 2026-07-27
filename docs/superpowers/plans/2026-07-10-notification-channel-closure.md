# Notification Channel Closure Implementation Plan

> **For agentic workers:** Execute inline with test-first checkpoints.

**Goal:** Make notification configuration drive real SMTP delivery, while preventing the unsupported SMS path from reporting false success.

**Architecture:** Keep `NotificationChannelService` as the single configuration reader. It derives email delivery from the saved `notification` settings, and `NotifyService` uses that decision for single-recipient notifications and admin broadcasts. SMS remains unavailable until an operational SMS template and provider contract exist; the API returns failure and the admin UI cannot enable it.

**Tech Stack:** NestJS, Prisma config storage, Jest, Vue 3.

## Global Constraints

- Do not add a message platform or a new dependency.
- Preserve in-app notification persistence when external delivery fails.
- Do not claim SMS delivery without a provider response.

### Task 1: Prove and close the fake-SMS behavior

**Files:**
- Modify: `backend/src/modules/notify/notification-channel.service.spec.ts`
- Modify: `backend/src/modules/notify/notification-channel.service.ts`

- [ ] Add a Jest test that enables the legacy `sms` config but expects `sendSms()` to return `false` without contacting an external provider.
- [ ] Run `npm test -- notification-channel.service.spec.ts`; it must fail because the current code returns `true`.
- [ ] Replace the simulated success with a warning plus `false`.
- [ ] Re-run the focused test; it must pass.

### Task 2: Make email configuration drive notification delivery

**Files:**
- Modify: `backend/src/modules/notify/notify.service.spec.ts`
- Modify: `backend/src/modules/notify/notification-channel.service.ts`
- Modify: `backend/src/modules/notify/notify.service.ts`

- [ ] Add a Jest test proving that `emailEnabled=true` and an enabled notification scene cause an omitted `channelMask.email` to resolve to email delivery.
- [ ] Run the focused test; it must fail because the current default mask has no `email` field.
- [ ] Add one resolver in `NotificationChannelService`; it must respect an explicit `channelMask.email=false`, the email global switch, and scene switches for order, merchant, refund, report, delivery, and system notifications.
- [ ] Use that resolver in `NotifyService.createAndDispatch()` and the existing broadcast path without changing in-app/WebSocket defaults.
- [ ] Re-run the focused test; it must pass.

### Task 3: Remove the unsupported SMS promise from the admin surface

**Files:**
- Modify: `admin/src/views/system/components/NotificationSettingsPanel.vue`
- Modify: `admin/src/views/system/components/NotificationSettingsPanel.spec.ts` if an adjacent test pattern exists; otherwise use the production build as verification.

- [ ] Disable the SMS switch and show that operational SMS is not available.
- [ ] Keep saved legacy `smsEnabled` data readable, but do not allow it to enable new sends.
- [ ] Run `npm run build` in `admin`; it must pass.

### Task 4: Verify and update the audit record

**Files:**
- Modify: `docs/市场版总审计报告.md`

- [ ] Run focused backend tests, the backend build, and the admin build.
- [ ] Record exact files, behavior, commands, and remaining limitation: real operational SMS needs an approved template contract and a provider response before it can be reopened.

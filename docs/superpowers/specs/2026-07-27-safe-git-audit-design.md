# Safe Git Upload and Code Audit Design

## Goal

Safely preserve the current backend/admin and compiled mini-program work in GitHub, audit both repositories, and repair the highest-priority reproducible defect without overwriting existing work or pushing directly to a default branch.

## Repository Boundaries

- Keep `/Users/nianbaidediannao/Desktop/后端后台本地测试版` in its existing GitHub repository.
- Publish backend/admin changes only from `codex/code-audit-20260727`; do not push directly to `main` and do not force-push.
- Keep `/Users/nianbaidediannao/Desktop/前端文件` as a separate repository so its existing history remains intact.
- Create a private GitHub repository for the compiled mini-program. Do not combine it with the backend repository.

## Upload Safety

Before staging either repository, inspect ignored and untracked files for credentials, environment files, runtime storage, uploads, generated builds, local screenshots, editor state, and oversized files. Extend `.gitignore` only for confirmed local or runtime artifacts. Never print secret values during the audit.

Use two kinds of commits:

1. A preservation commit containing the user's safe existing code changes.
2. A separate repair commit containing the regression test and the smallest root-cause fix.

This separation makes the repair reviewable and allows the preserved snapshot to remain unchanged.

## Audit Strategy

Run the checks already provided by each project before inventing new tooling. Inspect package scripts and existing focused tests, then execute the narrowest reliable sequence that covers:

- dependency and lockfile consistency;
- TypeScript or JavaScript syntax and compilation;
- existing unit and focused regression tests;
- authentication, authorization and regional data-scope boundaries;
- payment, refund, settlement and wallet mutation paths;
- WebSocket/message idempotency and lifecycle transitions;
- the eight current compiled-front-end changes and their existing mixed-media regression test.

Do not attempt an unrelated whole-system refactor. Select the highest-priority defect that is reproducible locally and can be fixed without requiring production credentials, real funds, or database writes.

## Repair Contract

For the selected defect:

1. Record the exact failing command and trace the root cause through callers and data flow.
2. Add or refine one focused regression test and observe it fail for the expected reason.
3. Implement the minimum fix at the shared root-cause boundary.
4. Re-run the focused test, relevant neighboring tests, and the project build.
5. Commit the repair separately from the preservation snapshot.

If no defect can be reproduced, do not fabricate a change. Report the evidence and leave the preservation commits as the only code upload.

## Remote Layout

- Backend/admin: existing public repository, new review branch `codex/code-audit-20260727`.
- Compiled mini-program: new private repository under the authenticated GitHub account, with the existing local branches and history preserved.
- No pull request or merge into `main` is included unless explicitly requested after review.

## Completion Criteria

- No known credential, environment, runtime-data, upload, or oversized-file leak is included in either new commit.
- Both repositories have remote branches that match the verified local commits.
- The preservation snapshot and repair are separate commits.
- Every success claim cites a fresh test, build, Git status, and remote-reference check.
- Any unverified device, WeChat Developer Tools, database, deployment, or production behavior is reported as an open gate rather than marked complete.

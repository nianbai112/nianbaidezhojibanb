# Lingmeng Admin Platform

校园本地生活平台的后端与运营后台工程。

## Workspaces

- `backend`: NestJS API, Prisma schema, business modules and admin APIs.
- `admin`: Vue 3 + Element Plus operation console.

## Common Commands

```bash
npm --workspace backend run build
npm --workspace backend test -- --runInBand
npm --workspace admin run typecheck
npm --workspace admin run build
```

## Notes

- Runtime upload files, local env files, build outputs and temporary check outputs are ignored.
- The WeChat mini-program source lives outside this repository and should not be changed from this workspace unless explicitly requested.

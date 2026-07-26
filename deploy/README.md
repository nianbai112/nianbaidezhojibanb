# Lingmeng v1.0.1 Deploy Package

这个目录用于生成宝塔部署包。

## 首次部署

```bash
bash scripts/install.sh
```

默认部署到 `/www/wwwroot/lingmeng`。

## 后续更新

```bash
bash scripts/update.sh
```

更新脚本会保留服务器 `.env`、上传文件和日志，只覆盖构建产物、Prisma 迁移和依赖描述文件。

## 文档

完整教程见：

```text
BT_DEPLOY_GUIDE.md
```

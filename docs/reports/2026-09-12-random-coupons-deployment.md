# 随机批量发券发布

2026-09-12 北京时间 20:41:48 发布完成。正式入口：https://yuntingzhe.cn/admin/marketing/perks 。

后台“运营与系统 → 优惠激励 → 优惠券”每行增加“随机发放”，填写人数和原因后随机发放同一张券，每人一张，每批最多 1000 人。结果弹窗显示用户 UID、发放成功、人数与批次编号，支持分页。同批次重试返回原结果。

从服务器当前源码建立构建基线，仅覆盖 CouponList.vue、coupon-admin.service.ts、coupon-admin.controller.ts、coupon-admin.dto.ts 及对应构建产物。部署前校验 762 个基线文件，部署后校验 332 个发布文件。备份位于 `/opt/lingmeng/releases/20260912-random-coupons/backup-before.tar.gz`；发布脚本、校验清单及服务状态同目录保存。

42 项优惠券测试、后台类型检查、后台生产构建和后端 TypeScript 构建通过；生产依赖下加载新 Controller、Service、DTO 和路由元数据检查通过。仅重启 API，Worker 与 Realtime 保持运行，服务健康检查通过。切换及启动验证窗口约 2.70 秒，此数值不是实测请求中断时长。

正式 HTTPS 页面和 CouponList JS 资源与发布包内容一致，未登录请求发券接口返回 401。Safari 中已看到随机发放按钮。未执行数据库迁移、修改优惠券配置或实际发券；UID 结果来自自动化测试验证，未通过生产发券验证。

页面验收发现现有“5元跑腿券”配置为 5 折，已提醒用户确认类型，本次未修改该券。

证据：`artifacts/2026-09-12-random-coupons/`。

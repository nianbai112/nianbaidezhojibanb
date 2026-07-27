const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const assertContains = (text, needle, label) => {
  if (!text.includes(needle)) {
    throw new Error(`${label}: missing ${needle}`);
  }
};

const assertNotContains = (text, needle, label) => {
  if (text.includes(needle)) {
    throw new Error(`${label}: should not contain ${needle}`);
  }
};

const files = [
  "admin/src/router/index.ts",
  "admin/src/router/menus.ts",
  "admin/src/views/marketing/MarketingOverview.vue",
  "admin/src/views/marketing/MarketingDashboard.vue",
  "admin/src/views/marketing/PopupList.vue",
  "admin/src/views/marketing/CampaignCenter.vue",
  "admin/src/views/ab-test/ABTestList.vue",
  "admin/src/views/system/OperationLogs.vue",
  "admin/src/components/glass/DetailDrawer.vue",
  "backend/src/modules/marketing-admin/marketing-admin.service.ts",
  "backend/src/modules/marketing-admin/marketing-admin.controller.ts",
  "backend/src/modules/system-admin/system-admin.service.ts",
  "backend/src/modules/admin/public-config-compat.controller.ts",
  "backend/src/modules/upload/upload.service.ts",
];

const combined = files.map((file) => read(file)).join("\n");

assertContains(combined, "首页权益卡片", "home benefit card label");
assertContains(read("admin/src/views/marketing/PopupList.vue"), "创建首页权益卡片", "popup editor title");
assertContains(read("admin/src/views/marketing/PopupList.vue"), "卡片已创建", "popup save message");
assertContains(read("backend/src/modules/operation/operation.service.ts"), "position: 'popup'", "runtime popup contract");
assertNotContains(read("admin/src/views/marketing/PopupList.vue"), "弹窗", "home benefit card editor copy");

for (const file of files) {
  assertNotContains(read(file), "弹窗广告", file);
}

console.log("home benefit card label checks passed");

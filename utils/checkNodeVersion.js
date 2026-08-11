#!/usr/bin/env node

const REQUIRED_MAJOR = 22;

function assertNodeVersion() {
  const version = process.versions.node || "";
  const major = Number(version.split(".")[0]);

  if (!Number.isFinite(major) || major < REQUIRED_MAJOR) {
    console.error(`[失败] 当前 Node.js 版本为 ${process.version}，项目要求 Node.js ${REQUIRED_MAJOR} 或更高版本。`);
    console.error("请先切换运行环境，例如：nvm use 22，或在服务器安装 Node.js 22 LTS 后再执行。");
    process.exit(1);
  }

  return version;
}

const version = assertNodeVersion();
if (require.main === module) {
  console.log(`OK Node.js ${version} (>=${REQUIRED_MAJOR})`);
}

module.exports = { assertNodeVersion };

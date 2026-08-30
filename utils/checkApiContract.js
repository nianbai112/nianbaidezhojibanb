#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
require("./checkNodeVersion");

const rootDir = path.resolve(__dirname, "..");
const backendRoot = path.join(rootDir, "backend", "src");
const defaultMiniappRoot = path.resolve(rootDir, "..", "前端文件");
const miniappRoot = path.resolve(process.env.MINIAPP_ROOT || defaultMiniappRoot);
const outputPath = path.join(rootDir, "contracts", "miniapp-backend-api.json");
const miniProgramCompatPath = path.join(
  backendRoot,
  "common",
  "middleware",
  "mini-program-api-compat.ts",
);
const ROOT_COMPAT_EXCEPTIONS = new Set(["api", "balance-recharge"]);

const HTTP_METHODS = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
};

function walk(dir, predicate, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, files);
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function normalizeRoute(route) {
  let value = String(route || "").trim();
  if (!value) return "/";
  value = value.replace(/^['"`]|['"`]$/g, "");
  value = value.replace(/\$\{[^}]*(query|queryString|qs|params)[^}]*\}/gi, "");
  value = value.replace(/\$\{[^}]+\}/g, ":param");
  value = value.replace(/\?.*$/, "");
  value = value.replace(/\/+/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/$/, "");
  return value;
}

function joinRoute(prefix, route) {
  const left = normalizeRoute(prefix || "/");
  const right = normalizeRoute(route || "/");
  if (left === "/") return right;
  if (right === "/") return left;
  return normalizeRoute(`${left}/${right}`);
}

function parseDecoratorArgs(raw) {
  const value = String(raw || "").trim();
  if (!value) return [""];

  const direct = value.match(/^(['"`])([\s\S]*?)\1$/);
  if (direct) return [direct[2]];

  if (value.startsWith("[") && value.endsWith("]")) {
    const routes = [];
    const routePattern = /(['"`])([\s\S]*?)\1/g;
    let match;
    while ((match = routePattern.exec(value))) {
      routes.push(match[2]);
    }
    return routes.length ? routes : [""];
  }

  return [""];
}

function parseDecoratorArg(raw) {
  return parseDecoratorArgs(raw)[0] || "";
}

function extractBackendRoutes() {
  const files = walk(backendRoot, (file) => file.endsWith(".controller.ts"));
  const routes = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    let controllerPrefix = "";

    lines.forEach((line, index) => {
      const controller = line.match(/@Controller\s*\(([^)]*)\)/);
      if (controller) {
        controllerPrefix = parseDecoratorArg(controller[1]);
      }

      const methodPattern = /@(Get|Post|Put|Patch|Delete)\s*\(([^)]{0,500})\)/g;
      let method;
      while ((method = methodPattern.exec(line))) {
        for (const route of parseDecoratorArgs(method[2])) {
          routes.push({
            method: HTTP_METHODS[method[1]],
            path: joinRoute(controllerPrefix, route),
            file: path.relative(rootDir, file),
            line: index + 1,
          });
        }
      }
    });
  }

  return routes.sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

function extractMiniProgramRootPrefixes() {
  const source = fs.readFileSync(miniProgramCompatPath, "utf8");
  const list = source.match(/MINI_PROGRAM_ROOT_PREFIX_LIST\s*=\s*\[([\s\S]*?)\];/);
  if (!list) throw new Error(`未找到小程序根路径配置：${miniProgramCompatPath}`);
  return new Set(Array.from(list[1].matchAll(/['"]([^'"]+)['"]/g), (match) => match[1]));
}

function findMissingRootCompatibility(requests) {
  const prefixes = extractMiniProgramRootPrefixes();
  const missing = new Map();
  for (const request of requests) {
    const root = routeSegments(request.path)[0];
    if (!root || prefixes.has(root) || ROOT_COMPAT_EXCEPTIONS.has(root)) continue;
    missing.set(root, request);
  }
  return [...missing.entries()]
    .map(([root, request]) => ({ root, file: request.file, line: request.line }))
    .sort((a, b) => a.root.localeCompare(b.root));
}

function findMethodNear(content, index) {
  const block = content.slice(index, index + 600);
  const match = block.match(/method\s*:\s*["'`]([A-Za-z]+)["'`]/);
  if (match) return match[1].toUpperCase();
  const prefix = content.slice(Math.max(0, index - 300), index);
  return prefix.lastIndexOf("uploadFile") > prefix.lastIndexOf("request") ? "POST" : "GET";
}

function extractMiniappRequests() {
  const apiDir = path.join(miniappRoot, "api");
  const files = walk(apiDir, (file) => file.endsWith(".js") || file.endsWith(".ts"));
  const requests = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const seen = new Set();
    const requestPattern = /request\s*\(\s*(["'`])([\s\S]*?)\1/g;
    const uploadPattern = /joinUrl\s*\(\s*apiUrl\s*,\s*(["'`])([\s\S]*?)\1\s*\)/g;

    for (const [pattern, methodHint] of [
      [requestPattern, null],
      [uploadPattern, null],
    ]) {
      let match;
      while ((match = pattern.exec(content))) {
        const rawPath = match[2].replace(/\s+/g, " ").trim();
        if (!rawPath || rawPath.startsWith("http")) continue;
        const normalized = normalizeRoute(rawPath);
        const key = `${normalized}:${match.index}`;
        if (seen.has(key)) continue;
        seen.add(key);

        requests.push({
          method: methodHint || findMethodNear(content, match.index),
          path: normalized,
          rawPath,
          file: path.relative(miniappRoot, file),
          line: lineNumberForIndex(content, match.index),
        });
      }
    }
  }

  return requests.sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

function routeSegments(route) {
  return normalizeRoute(route)
    .split("/")
    .filter(Boolean);
}

function segmentMatches(left, right) {
  return left === right || left.startsWith(":") || right.startsWith(":");
}

function routeMatches(frontend, backend) {
  if (frontend.method !== backend.method) return false;
  const a = routeSegments(frontend.path);
  const b = routeSegments(backend.path);
  if (a.length !== b.length) return false;
  return a.every((segment, index) => segmentMatches(segment, b[index]));
}

function compatibleFrontendPaths(route) {
  const normalized = normalizeRoute(route);
  const paths = new Set([normalized]);

  if (normalized.startsWith("/api/mall/admin/products/")) {
    paths.add(normalized.replace("/api/mall/admin/products/", "/mall/products/admin/"));
  } else if (normalized.startsWith("/api/mall/admin/categories")) {
    paths.add(normalized.replace("/api/mall/", "/mall/"));
  } else if (
    /^\/api\/mall\/(products|refunds|reviews|promotions|freight|distributor|merchants)\/admin(\/|$)/.test(
      normalized,
    )
  ) {
    paths.add(normalized.replace("/api/mall/", "/mall/"));
  }

  return Array.from(paths);
}

function findBackendRoute(request, backendRoutes) {
  for (const candidatePath of compatibleFrontendPaths(request.path)) {
    const route = backendRoutes.find((candidate) => routeMatches({ ...request, path: candidatePath }, candidate));
    if (route) {
      return {
        route,
        matchedPath: candidatePath,
      };
    }
  }
  return null;
}

function buildContract() {
  const miniappRequests = extractMiniappRequests();
  const backendRoutes = extractBackendRoutes();

  const matchedMiniappRequests = miniappRequests.map((request) => {
    const match = findBackendRoute(request, backendRoutes);
    return match
      ? { ...request, matchedPath: match.matchedPath, matchedBackend: match.route }
      : request;
  });

  const unmatchedMiniappRequests = matchedMiniappRequests.filter((item) => !item.matchedBackend);
  const frontendMatchedKeys = new Set(
    matchedMiniappRequests
      .filter((item) => item.matchedBackend)
      .map((item) => `${item.matchedBackend.method} ${item.matchedBackend.path}`),
  );
  const unmatchedBackendRoutes = backendRoutes.filter(
    (route) => !frontendMatchedKeys.has(`${route.method} ${route.path}`) && !route.path.startsWith("/admin"),
  );

  return {
    generatedAt: new Date().toISOString(),
    roots: {
      miniappRoot,
      backendRoot: path.join(rootDir, "backend"),
    },
    stats: {
      miniappRequests: miniappRequests.length,
      backendRoutes: backendRoutes.length,
      matchedMiniappRequests: matchedMiniappRequests.length - unmatchedMiniappRequests.length,
      unmatchedMiniappRequests: unmatchedMiniappRequests.length,
      unmatchedNonAdminBackendRoutes: unmatchedBackendRoutes.length,
    },
    unmatchedMiniappRequests,
    unmatchedNonAdminBackendRoutes: unmatchedBackendRoutes,
    miniappRequests: matchedMiniappRequests,
    backendRoutes,
  };
}

function main() {
  if (!fs.existsSync(miniappRoot)) {
    console.error(`[失败] 没有找到小程序目录：${miniappRoot}`);
    process.exit(1);
  }
  const contract = buildContract();
  const missingRootCompatibility = findMissingRootCompatibility(contract.miniappRequests);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(contract, null, 2)}\n`);
  console.log(`API 契约快照已生成：${path.relative(rootDir, outputPath)}`);
  console.log(
    `小程序请求 ${contract.stats.miniappRequests} 个，后端路由 ${contract.stats.backendRoutes} 个，已匹配 ${contract.stats.matchedMiniappRequests} 个，疑似未匹配 ${contract.stats.unmatchedMiniappRequests} 个。`,
  );
  if (contract.unmatchedMiniappRequests.length) {
    console.log("前 10 个疑似未匹配的小程序请求：");
    for (const item of contract.unmatchedMiniappRequests.slice(0, 10)) {
      console.log(`- ${item.method} ${item.path} (${item.file}:${item.line})`);
    }
  }
  if (missingRootCompatibility.length) {
    console.error("缺少小程序根路径兼容配置：");
    for (const item of missingRootCompatibility) {
      console.error(`- ${item.root} (${item.file}:${item.line})`);
    }
    if (process.argv.includes("--strict")) process.exitCode = 1;
  }
  if (contract.unmatchedMiniappRequests.length && process.argv.includes("--strict")) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildContract,
  normalizeRoute,
  routeMatches,
  parseDecoratorArgs,
  extractBackendRoutes,
  extractMiniProgramRootPrefixes,
  findMissingRootCompatibility,
  findMethodNear,
  findBackendRoute,
};

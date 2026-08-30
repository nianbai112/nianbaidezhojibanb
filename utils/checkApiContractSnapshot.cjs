#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { extractBackendRoutes, findBackendRoute } = require('./checkApiContract');

const rootDir = path.resolve(__dirname, '..');
const defaultSnapshotPath = path.join(rootDir, 'contracts', 'miniapp-backend-api.json');

function unsupportedRequests(requests, backendRoutes) {
  return requests.filter((request) => !findBackendRoute(request, backendRoutes));
}

function verifySnapshot(snapshotPath = defaultSnapshotPath) {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`API contract snapshot not found: ${snapshotPath}`);
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const requests = Array.isArray(snapshot.miniappRequests) ? snapshot.miniappRequests : [];
  if (!requests.length) {
    throw new Error(`API contract snapshot has no miniapp requests: ${snapshotPath}`);
  }

  const missing = unsupportedRequests(requests, extractBackendRoutes());
  console.log(`Committed miniapp contract: ${requests.length - missing.length}/${requests.length} requests supported.`);
  if (missing.length) {
    console.error('Backend no longer supports these committed miniapp requests:');
    for (const request of missing.slice(0, 20)) {
      console.error(`- ${request.method} ${request.path} (${request.file}:${request.line})`);
    }
    process.exitCode = 1;
  }

  return { requests: requests.length, missing };
}

if (require.main === module) {
  verifySnapshot(process.argv[2] ? path.resolve(process.argv[2]) : defaultSnapshotPath);
}

module.exports = { unsupportedRequests, verifySnapshot };

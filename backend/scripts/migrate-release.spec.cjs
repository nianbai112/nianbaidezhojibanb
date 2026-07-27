#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { rowValue } = require("./migrate-release.cjs");

assert.equal(rowValue({ COLUMN_NAME: "levelTitleId" }, "column_name"), "levelTitleId");
assert.equal(rowValue({ column_name: "levelBenefits" }, "COLUMN_NAME"), "levelBenefits");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lingmeng-migration-check-"));
fs.writeFileSync(path.join(temp, "b.sql"), "SELECT 2;");
fs.writeFileSync(path.join(temp, "a.sql"), "SELECT 1;");
assert.deepEqual(fs.readdirSync(temp).filter((name) => name.endsWith(".sql")).sort(), ["a.sql", "b.sql"]);
fs.rmSync(temp, { recursive: true, force: true });
console.log("migration runner self-check passed");

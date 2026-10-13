import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readCatalog, resolveDataDir, validateCatalog, validateDataDir } from "./validate-data.mjs";

const dataDir = resolveDataDir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const repoRoot = path.resolve(dataDir, "..");

function cloneCatalog() {
  const { datasets, schemas } = readCatalog(dataDir);
  return { datasets: structuredClone(datasets), schemas };
}

test("repository data passes schema, unique ids, categories and URLs", () => {
  assert.deepEqual(validateDataDir(dataDir), []);
});

test("legacy apps without the new optional fields still pass", () => {
  const { datasets, schemas } = cloneCatalog();
  for (const app of datasets["apps.json"]) {
    delete app.publisher;
    delete app.license;
    delete app.pricing;
    delete app.screenshots;
    delete app.addedAt;
    delete app.updatedAt;
  }
  assert.deepEqual(validateCatalog(datasets, schemas), []);
});

test("unknown category fails", () => {
  const { datasets, schemas } = cloneCatalog();
  datasets["apps.json"][0].category = "not-a-category";
  const errors = validateCatalog(datasets, schemas);
  assert.ok(errors.some((e) => e.includes("not-a-category")));
});

test("duplicate id fails", () => {
  const { datasets, schemas } = cloneCatalog();
  datasets["apps.json"][1].id = datasets["apps.json"][0].id.toUpperCase();
  const errors = validateCatalog(datasets, schemas);
  assert.ok(errors.some((e) => e.includes("duplicates")));
});

test("illegal URL fails", () => {
  const { datasets, schemas } = cloneCatalog();
  datasets["apps.json"][0].site = "not-a-url";
  const errors = validateCatalog(datasets, schemas);
  assert.ok(errors.length > 0);
});

test("unknown field fails", () => {
  const { datasets, schemas } = cloneCatalog();
  datasets["apps.json"][0].typoField = "x";
  const errors = validateCatalog(datasets, schemas);
  assert.ok(errors.some((e) => e.includes("additional")));
});

test("invalid pricing and impossible date fail", () => {
  const { datasets, schemas } = cloneCatalog();
  const app = datasets["apps.json"][0];
  app.pricing = "gratis";
  app.addedAt = "2026-02-31";
  const errors = validateCatalog(datasets, schemas);
  assert.ok(errors.some((e) => e.includes("pricing") || e.includes("gratis") || e.includes("enum")));
  assert.ok(errors.some((e) => e.includes("2026-02-31")));
});

test("cli exits non-zero when data is intentionally wrong", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tongtop-data-"));
  try {
    cpSync(dataDir, path.join(dir, "data"), { recursive: true });
    const appsPath = path.join(dir, "data", "apps.json");
    const apps = JSON.parse(readFileSync(appsPath, "utf8"));
    apps[0].site = "javascript:alert(1)";
    apps.push({ ...apps[0] });
    writeFileSync(appsPath, JSON.stringify(apps));
    const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "validate-data.mjs")], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /javascript:alert|duplicates|valid URL/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

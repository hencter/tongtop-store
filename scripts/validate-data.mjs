/**
 * 校验仓库 data/*.json。
 *
 * - 用 data/schema/*.json（JSON Schema）约束每个数据文件
 * - id 在各自集合内大小写不敏感地唯一
 * - apps.json 的 category 必须存在于 categories.json
 * - 出现的 URL 必须是合法的 http(s)（允许 cargo 的 sparse+https 与 GOPROXY 的逗号后缀）
 * - addedAt / updatedAt / verifiedAt 必须是真实日历日期
 *
 * 用法：node scripts/validate-data.mjs
 * 数据不合法时退出码为 1，CI 据此失败。
 */
import Ajv from "ajv/dist/2020.js";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FILE_SCHEMAS = {
  "apps.json": "apps.schema.json",
  "categories.json": "categories.schema.json",
  "agents.json": "agents.schema.json",
  "devtools.json": "devtools.schema.json",
  "free-models.json": "free-models.schema.json",
  "mirrors.json": "mirrors.schema.json",
};

const DATE_KEYS = new Set(["addedAt", "updatedAt", "verifiedAt"]);

export function resolveDataDir(cwd = process.cwd()) {
  const fromCwd = path.join(cwd, "data");
  if (existsSync(path.join(fromCwd, "apps.json")) && existsSync(path.join(fromCwd, "schema", "apps.schema.json"))) {
    return fromCwd;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
}

export function readCatalog(dataDir) {
  const schemaDir = path.join(dataDir, "schema");
  const datasets = {};
  for (const file of Object.keys(FILE_SCHEMAS)) {
    datasets[file] = JSON.parse(readFileSync(path.join(dataDir, file), "utf8"));
  }
  const schemas = {
    "common.schema.json": JSON.parse(readFileSync(path.join(schemaDir, "common.schema.json"), "utf8")),
  };
  for (const name of Object.values(FILE_SCHEMAS)) {
    schemas[name] = JSON.parse(readFileSync(path.join(schemaDir, name), "utf8"));
  }
  return { datasets, schemas };
}

export function validateDataDir(dataDir = resolveDataDir()) {
  const { datasets, schemas } = readCatalog(dataDir);
  return validateCatalog(datasets, schemas);
}

export function validateCatalog(datasets, schemas) {
  const errors = [];
  const ajv = new Ajv({ allErrors: true, strict: false });
  try {
    ajv.addSchema(schemas["common.schema.json"]);
  } catch (error) {
    errors.push(`common.schema.json failed to load: ${error.message}`);
  }

  for (const [file, schemaName] of Object.entries(FILE_SCHEMAS)) {
    const data = datasets[file];
    if (data === undefined) {
      errors.push(`missing dataset ${file}`);
      continue;
    }
    let validate;
    try {
      validate = ajv.compile(schemas[schemaName]);
    } catch (error) {
      errors.push(`${schemaName} failed to compile: ${error.message}`);
      continue;
    }
    if (!validate(data)) {
      for (const err of validate.errors ?? []) {
        const loc = err.instancePath || "";
        errors.push(`${file}${loc} ${err.message ?? "invalid"}`);
      }
    }
    walk(data, file, errors);
  }

  uniqueIds(datasets["apps.json"], "apps.json", errors);
  uniqueIds(datasets["categories.json"], "categories.json", errors);
  uniqueIds(datasets["agents.json"], "agents.json", errors);
  uniqueIds(datasets["devtools.json"], "devtools.json", errors);
  uniqueIds(datasets["free-models.json"]?.providers, "free-models.json#/providers", errors);
  uniqueIds(datasets["mirrors.json"]?.tools, "mirrors.json#/tools", errors);

  const categories = datasets["categories.json"];
  const apps = datasets["apps.json"];
  if (Array.isArray(apps) && Array.isArray(categories)) {
    const ids = new Set(categories.filter((c) => c && typeof c.id === "string").map((c) => c.id));
    apps.forEach((app, i) => {
      if (!app || typeof app.category !== "string") return;
      if (!ids.has(app.category)) {
        errors.push(`apps.json[${i}].category "${app.category}" is not in categories.json`);
      }
    });
  }

  return errors;
}

function uniqueIds(items, label, errors) {
  if (!Array.isArray(items)) return;
  const seen = new Map();
  items.forEach((item, i) => {
    if (!item || typeof item.id !== "string") return;
    const key = item.id.toLowerCase();
    if (seen.has(key)) {
      errors.push(`${label}[${i}].id duplicates ${seen.get(key)} (${item.id})`);
    } else {
      seen.set(key, `${label}[${i}].id`);
    }
  });
}

function walk(value, loc, errors) {
  if (typeof value === "string") {
    if (value.includes("://") && !acceptableUrl(value)) {
      errors.push(`${loc} is not a valid URL: ${value}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${loc}[${i}]`, errors));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const next = `${loc}.${key}`;
      if (DATE_KEYS.has(key) && typeof child === "string" && !isRealDate(child)) {
        errors.push(`${next} is not a real calendar date: ${child}`);
      }
      walk(child, next, errors);
    }
  }
}

function acceptableUrl(raw) {
  const parts = raw.split(",");
  if (parts.length > 1) {
    return parts.every((part) => {
      const token = part.trim();
      if (!token) return false;
      if (token.includes("://")) return isHttpUrl(token);
      return /^[A-Za-z0-9._-]+$/.test(token);
    });
  }
  return isHttpUrl(raw.trim());
}

function isHttpUrl(raw) {
  const stripped = raw.startsWith("sparse+") ? raw.slice("sparse+".length) : raw;
  if (!/^https?:\/\//.test(stripped)) return false;
  try {
    const url = new URL(stripped);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isRealDate(value) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (invokedDirectly()) {
  const errors = validateDataDir(resolveDataDir());
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    console.error(`\n${errors.length} data validation error(s)`);
    process.exit(1);
  }
  console.log("data/*.json matches schema (unique ids, known categories, valid URLs)");
}

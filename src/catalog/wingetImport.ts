/** winget import 清单。字段与 `winget import` 识别的 schema 2.0 一致。 */

const APP_ID = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,118}$/;

export interface WingetPackage {
  id: string;
  version?: string;
}

export interface WingetImportFile {
  $schema: "https://aka.ms/winget-packages.schema.2.0.json";
  Sources: {
    SourceDetails: {
      Argument: string;
      Identifier: string;
      Name: string;
      Type: "Microsoft.PreIndexed.Package";
    };
    Packages: { PackageIdentifier: string; PackageVersion?: string }[];
  }[];
}

const SOURCE = {
  Argument: "https://cdn.winget.microsoft.com/cache",
  Identifier: "Microsoft.Winget.Source_8wekyb3d8bbwe",
  Name: "winget",
  Type: "Microsoft.PreIndexed.Package" as const,
};

export function toWingetImport(packages: WingetPackage[]): WingetImportFile {
  const seen = new Set<string>();
  const list = [];
  for (const pkg of packages) {
    const id = pkg.id.trim();
    if (!APP_ID.test(id)) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const version = pkg.version?.trim();
    list.push(version ? { PackageIdentifier: id, PackageVersion: version } : { PackageIdentifier: id });
  }
  return {
    $schema: "https://aka.ms/winget-packages.schema.2.0.json",
    Sources: [{ SourceDetails: SOURCE, Packages: list }],
  };
}

export function fromWingetImport(data: unknown): WingetPackage[] {
  if (!data || typeof data !== "object") throw new Error("清单不是 JSON 对象");
  const sources = (data as { Sources?: unknown }).Sources;
  if (!Array.isArray(sources)) throw new Error("清单缺少 Sources，winget import 无法识别");
  const out: WingetPackage[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const packages = source && typeof source === "object" ? (source as { Packages?: unknown }).Packages : null;
    if (!Array.isArray(packages)) continue;
    for (const pkg of packages) {
      if (!pkg || typeof pkg !== "object") continue;
      const id = (pkg as { PackageIdentifier?: unknown }).PackageIdentifier;
      const version = (pkg as { PackageVersion?: unknown }).PackageVersion;
      if (typeof id !== "string" || !APP_ID.test(id.trim())) continue;
      const key = id.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: id.trim(),
        version: typeof version === "string" && version.trim() ? version.trim() : undefined,
      });
    }
  }
  if (out.length === 0) throw new Error("清单里没有可安装的应用");
  return out;
}

const FAVORITES_KEY = "tongtop.favorites";

export function installTaskSpecs(packages: WingetPackage[]): { id: string; wingetId: string; display: string }[] {
  return packages.map((pkg) => ({
    id: `winget:install:${pkg.id}`,
    wingetId: pkg.id,
    display: `安装 ${pkg.id}`,
  }));
}

export function loadFavoriteIds(storage: { getItem(key: string): string | null }): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(FAVORITES_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && APP_ID.test(id));
  } catch {
    return [];
  }
}

export function saveFavoriteIds(storage: { setItem(key: string, value: string): void }, ids: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const key = id.toLowerCase();
    if (!APP_ID.test(id) || seen.has(key)) continue;
    seen.add(key);
    unique.push(id);
  }
  storage.setItem(FAVORITES_KEY, JSON.stringify(unique));
  return unique;
}

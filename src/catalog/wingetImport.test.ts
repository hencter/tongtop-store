import { describe, expect, it } from "vitest";
import { createTongtianluSync } from "../features/favorites/cloudSync";
import { fromWingetImport, installTaskSpecs, loadFavoriteIds, saveFavoriteIds, toWingetImport } from "./wingetImport";

describe("winget import file", () => {
  it("writes a file winget import can recognize", () => {
    const file = toWingetImport([
      { id: "Git.Git", version: "2.46.0" },
      { id: "git.git" },
      { id: "../nope" },
      { id: "Google.Chrome" },
    ]);
    expect(file.$schema).toBe("https://aka.ms/winget-packages.schema.2.0.json");
    expect(file.Sources[0].SourceDetails.Name).toBe("winget");
    expect(file.Sources[0].SourceDetails.Type).toBe("Microsoft.PreIndexed.Package");
    expect(file.Sources[0].Packages).toEqual([
      { PackageIdentifier: "Git.Git", PackageVersion: "2.46.0" },
      { PackageIdentifier: "Google.Chrome" },
    ]);
    expect(fromWingetImport(file).map((pkg) => pkg.id)).toEqual(["Git.Git", "Google.Chrome"]);
    expect(installTaskSpecs(fromWingetImport(file)).map((task) => task.id)).toEqual([
      "winget:install:Git.Git",
      "winget:install:Google.Chrome",
    ]);
  });

  it("rejects a file that is not a winget import", () => {
    expect(() => fromWingetImport({ packages: ["Git.Git"] })).toThrow(/Sources/);
    expect(() => fromWingetImport({ Sources: [{ Packages: [{ PackageIdentifier: "../x" }] }] })).toThrow(/没有可安装/);
  });
});

describe("favorites persistence", () => {
  it("keeps favorites after a fresh read of the same storage", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
    saveFavoriteIds(storage, ["Google.Chrome", "google.chrome", "Git.Git"]);
    expect(loadFavoriteIds(storage)).toEqual(["Google.Chrome", "Git.Git"]);
    expect(loadFavoriteIds({ getItem: () => "not json" })).toEqual([]);
  });
});

describe("cloud sync reservation", () => {
  it("does not upload anything yet", async () => {
    const sync = createTongtianluSync({ apiBase: "https://api.tongtianlu.cn", token: "unused" });
    await expect(sync.push(["Git.Git"])).rejects.toThrow(/尚未开通/);
    await expect(sync.pull()).rejects.toThrow(/尚未开通/);
  });
});

/** 我的收藏与装机清单。收藏存在本机；导入后的安装走现有任务队列。 */

import { useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Download, Upload } from "lucide-react";
import { AppCard, type CardState } from "../../components/AppCard";
import { fromWingetImport, installTaskSpecs, toWingetImport, type WingetPackage } from "../../catalog/wingetImport";
import { useCatalogStore } from "../../state/catalogStore";
import { useAppStore } from "../../state/appStore";
import { useFavoriteStore } from "../../state/favoriteStore";
import { useTaskStore } from "../../state/taskStore";
import { useT } from "../../i18n";
import * as ipc from "../../ipc/client";
import { Button } from "@/components/ui/button";

function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportFile(name: string, packages: WingetPackage[]) {
  const text = `${JSON.stringify(toWingetImport(packages), null, 2)}\n`;
  if ("__TAURI_INTERNALS__" in window) {
    const path = await save({ defaultPath: name, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return;
    await ipc.writeTextFile(path, text);
    return;
  }
  downloadText(name, text);
}

export function FavoritesPage() {
  const t = useT();
  const ids = useFavoriteStore((s) => s.ids);
  const apps = useCatalogStore((s) => s.apps);
  const installed = useAppStore((s) => s.installed);
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const favorites = ids
    .map((id) => apps.find((app) => app.id.toLowerCase() === id.toLowerCase()))
    .filter((app): app is NonNullable<typeof app> => Boolean(app));
  const installedSet = new Set((installed ?? []).map((app) => app.id.toLowerCase()));
  const cardState = (id: string): CardState => (installedSet.has(id.toLowerCase()) ? "installed" : "none");

  const queue = async (packages: WingetPackage[]) => {
    setBusy(true);
    setMessage("");
    let started = 0;
    try {
      for (const task of installTaskSpecs(packages)) {
        await runTask(task.id, {
          kind: "winget",
          action: "install",
          wingetId: task.wingetId,
          silent,
          display: task.display,
        });
        started += 1;
      }
      setMessage(`${t("已加入安装队列")} ${started}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const onPick = async (file: File) => {
    try {
      const packages = fromWingetImport(JSON.parse(await file.text()));
      await queue(packages);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="page h-full overflow-y-auto">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold">{t("我的收藏")}</h2>
          <p className="m-0 mt-1 text-xs text-muted-foreground">{t("收藏保存在这台电脑上，重启后仍然在。")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void exportFile(
                "tongtop-favorites.json",
                favorites.map((app) => ({ id: app.id })),
              ).catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
            }
          >
            <Download className="size-3.5" /> {t("导出收藏")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !installed?.length}
            onClick={() =>
              void exportFile(
                "tongtop-installed.json",
                (installed ?? []).map((app) => ({ id: app.id, version: app.version })),
              ).catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
            }
          >
            <Download className="size-3.5" /> {t("导出已安装")}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void importList()}>
            <Upload className="size-3.5" /> {t("导入并安装")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onPick(file);
            }}
          />
        </div>
      </header>
      {message && <div className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-[13px]">{message}</div>}
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">{t("云同步将在通天路账号接入后可用，当前不会上传收藏。")}</p>
      {favorites.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("还没有收藏。在软件卡片上点心形图标即可加入。")}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {favorites.map((app) => (
            <AppCard key={app.id} app={app} state={cardState(app.id)} />
          ))}
        </div>
      )}
    </div>
  );

  async function importList() {
    if ("__TAURI_INTERNALS__" in window) {
      const picked = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      const path = Array.isArray(picked) ? picked[0] : picked;
      if (!path) return;
      try {
        await queue(fromWingetImport(JSON.parse(await ipc.readTextFile(path))));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    fileRef.current?.click();
  }
}

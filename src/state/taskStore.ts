/**
 * 任务状态（队列版）：winget 官方有安装锁（#6138 Not planned），同一时刻只能跑一个，
 * 但宿主把任务排成队列依次执行 —— 用户连点多个更新不用等。
 * runTask 把"入队 → 等 task-done"包成 Promise，流水线靠它顺序推进。
 */

import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../ipc/client";
import type {
  TaskDoneEvent,
  TaskLogEvent,
  TaskQueuedEvent,
  TaskSpec,
  TaskStartedEvent,
} from "../ipc/types";
import { useAppStore } from "./appStore";
import { useSettingsStore } from "./settingsStore";
import { ghProxyList } from "./catalogStore";

const MAX_LOG_LINES = 1500;
export const MAX_QUEUE = 8;

interface RunningInfo {
  id: string;
  label: string;
  command: string;
}

interface QueuedInfo {
  id: string;
  label: string;
}

interface DoneInfo {
  id: string;
  code: number;
  success: boolean;
  errorTail: string[];
}

const pending = new Map<string, (d: TaskDoneEvent) => void>();

interface TaskStore {
  running: RunningInfo | null;
  queue: QueuedInfo[];
  progress: number | null;
  done: DoneInfo | null;
  lines: string[];
  panelOpen: boolean;
  silent: boolean;
  setSilent: (v: boolean) => void;
  runTask: (id: string, spec: TaskSpec) => Promise<TaskDoneEvent>;
  cancel: (id: string) => Promise<void>;
  closePanel: () => void;
  openPanel: () => void;
  /** 某任务是否在运行或排队中 */
  taskState: (id: string) => "running" | "queued" | null;
}

export const useTaskStore = create<TaskStore>()((set, get) => ({
  running: null,
  queue: [],
  progress: null,
  done: null,
  lines: [],
  panelOpen: false,
  silent: localStorage.getItem("tongtop.silent") === "1",
  setSilent: (v) => {
    localStorage.setItem("tongtop.silent", v ? "1" : "0");
    set({ silent: v });
  },
  runTask: (id, spec) => {
    return new Promise<TaskDoneEvent>((resolve, reject) => {
      if (get().taskState(id)) {
        reject(new Error("该任务已在队列中"));
        return;
      }
      if (get().running && get().queue.length >= MAX_QUEUE) {
        reject(new Error(`队列已满（${MAX_QUEUE}），请稍后再试`));
        return;
      }
      // 集中注入默认安装目录（winget install --location，设置里可配，如 D:\Apps）
      const loc = useSettingsStore.getState().installLocation.trim();
      let finalSpec =
        loc && spec.kind === "winget" && (!spec.action || spec.action === "install")
          ? { ...spec, location: loc }
          : spec;
      // 集中注入下载加速线路（winget 安装/更新与官网直链下载都走宿主多线路下载器）
      if (spec.kind === "download" || (spec.kind === "winget" && spec.action !== "uninstall")) {
        finalSpec = { ...finalSpec, ghProxies: ghProxyList() };
      }
      pending.set(id, resolve);
      set({ done: null, panelOpen: true });
      ipc.startTask(id, finalSpec).catch((e) => {
        pending.delete(id);
        set({ done: { id, code: -1, success: false, errorTail: [String(e)] } });
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  },
  cancel: async (id) => {
    await ipc.cancelTask(id);
  },
  closePanel: () => set({ panelOpen: false }),
  openPanel: () => set({ panelOpen: true }),
  taskState: (id) => {
    const s = get();
    if (s.running?.id.toLowerCase() === id.toLowerCase()) return "running";
    if (s.queue.some((q) => q.id.toLowerCase() === id.toLowerCase())) return "queued";
    return null;
  },
}));

/** 在 App 挂载时调用一次：接线宿主事件流。 */
export function initTaskListeners(): () => void {
  const unlisteners: Array<Promise<() => void>> = [];

  unlisteners.push(
    listen<TaskQueuedEvent>("task-queued", (e) => {
      useTaskStore.setState((s) =>
        s.queue.some((q) => q.id === e.payload.id)
          ? s
          : { queue: [...s.queue, { id: e.payload.id, label: e.payload.label }] },
      );
    }),
  );

  unlisteners.push(
    listen<TaskStartedEvent>("task-started", (e) => {
      useTaskStore.setState((s) => ({
        queue: s.queue.filter((q) => q.id !== e.payload.id),
        running: { id: e.payload.id, label: e.payload.label, command: e.payload.command },
        lines: [],
        progress: null,
        done: null,
      }));
    }),
  );

  unlisteners.push(
    listen<TaskLogEvent>("task-log", (e) => {
      useTaskStore.setState((s) => ({
        lines: [...s.lines, ...e.payload.lines].slice(-MAX_LOG_LINES),
        progress: e.payload.progress ?? s.progress,
      }));
    }),
  );

  unlisteners.push(
    listen<TaskDoneEvent>("task-done", (e) => {
      const done: DoneInfo = {
        id: e.payload.id,
        code: e.payload.code,
        success: e.payload.success,
        errorTail: e.payload.errorTail,
      };
      useTaskStore.setState((s) => ({
        running: s.running?.id === e.payload.id ? null : s.running,
        queue: s.queue.filter((q) => q.id !== e.payload.id),
        progress: s.running?.id === e.payload.id ? null : s.progress,
        done,
      }));
      const resolve = pending.get(e.payload.id);
      if (resolve) {
        pending.delete(e.payload.id);
        resolve(e.payload);
      }
      // winget 类任务成功后快照立即失效重跑（缓存更新规则 2）
      if (e.payload.success && e.payload.id.startsWith("winget:")) {
        void useAppStore.getState().refreshSnapshot(true);
      }
    }),
  );

  return () => {
    for (const u of unlisteners) void u.then((f) => f());
  };
}

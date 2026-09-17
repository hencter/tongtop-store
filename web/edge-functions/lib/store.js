/**
 * 提交存储（不依赖 EdgeOne KV）：
 * - 生产：GitHub Issues（标签 submission + pending/approved/rejected），需要 GITHUB_TOKEN
 * - 本地：dev-api.mjs 注入的文件存储（globalThis.__TONGTOP_STORE__）
 * - 兜底：内存存储（仅演示，重启即丢）
 *
 * 统一接口：create(record) / list(status?) / update(id, patch)
 */

const MEM = (globalThis.__TONGTOP_MEM_STORE__ ??= new Map());

const LABEL_SUBMISSION = "submission";
const STATUS_LABELS = ["pending", "approved", "rejected"];
const LABELS = [
  ["submission", "5319e7"],
  ["pending", "fbca04"],
  ["approved", "0e8a16"],
  ["rejected", "d73a4a"],
];

function memoryStore() {
  return {
    async create(record) {
      MEM.set(record.id, JSON.stringify(record));
      return record;
    },
    async list(status) {
      const out = [];
      for (const raw of MEM.values()) {
        const record = JSON.parse(raw);
        if (!status || record.status === status) out.push(record);
      }
      out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return out;
    },
    async update(id, patch) {
      const raw = MEM.get(id);
      if (!raw) return null;
      const record = { ...JSON.parse(raw), ...patch };
      MEM.set(id, JSON.stringify(record));
      return record;
    },
  };
}

function githubStore(env) {
  const repo = env.GITHUB_REPO || "hencter/tongtop-store";
  const api = `https://api.github.com/repos/${repo}`;
  const headers = {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "tongtop-store-submissions",
  };

  async function gh(pathname, init) {
    const resp = await fetch(`${api}${pathname}`, { headers, ...init });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`GitHub API ${resp.status}: ${text.slice(0, 200)}`);
    }
    return resp.status === 204 ? null : resp.json();
  }

  async function ensureLabels() {
    let existing = [];
    try {
      existing = (await gh("/labels?per_page=100")) ?? [];
    } catch {
      // 读不到就尝试创建，失败也无妨（标签可后补）
    }
    const names = new Set(existing.map((l) => l.name));
    for (const [name, color] of LABELS) {
      if (!names.has(name)) {
        await gh("/labels", { method: "POST", body: JSON.stringify({ name, color }) }).catch(() => {});
      }
    }
  }

  const statusOf = (issue) => {
    const names = (issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
    return STATUS_LABELS.find((s) => names.includes(s)) ?? "pending";
  };

  function parse(issue) {
    const marker = /<!--\s*tongtop:([\s\S]*?)-->/.exec(issue.body ?? "");
    let data = {};
    if (marker) {
      try {
        data = JSON.parse(marker[1]);
      } catch {
        data = {};
      }
    }
    return {
      ...data,
      id: String(issue.number),
      status: statusOf(issue),
      createdAt: issue.created_at,
      reviewedAt: data.reviewedAt ?? "",
    };
  }

  const markerOf = (record) => `<!-- tongtop:${JSON.stringify(record)} -->`;

  function renderBody(record) {
    return `${markerOf(record)}

### 投稿内容

- 类型：${record.type}
- 名称：${record.name}
- 包 ID / 仓库：${record.refId || "—"}
- 链接：${record.site || "—"}
- 分类：${record.category || "—"}
- 联系方式：${record.contact || "—"}

${record.desc}

_由 TongTop Store 网站提交；审核通过后同步到站点。_`;
  }

  return {
    async create(record) {
      await ensureLabels();
      const issue = await gh("/issues", {
        method: "POST",
        body: JSON.stringify({
          title: `[投稿] ${record.name}`,
          body: renderBody(record),
          labels: [LABEL_SUBMISSION, record.status],
        }),
      });
      return { ...record, id: String(issue.number) };
    },
    async list(status) {
      const labels = status ? `${LABEL_SUBMISSION},${status}` : LABEL_SUBMISSION;
      const issues = await gh(`/issues?labels=${labels}&state=all&per_page=100`);
      return (issues ?? [])
        .filter((issue) => !issue.pull_request)
        .map(parse)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async update(id, patch) {
      await ensureLabels();
      const issue = await gh(`/issues/${id}`);
      const record = { ...parse(issue), ...patch };
      const body = (issue.body ?? "").replace(/<!--\s*tongtop:[\s\S]*?-->/, markerOf(record));
      await gh(`/issues/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ body, labels: [LABEL_SUBMISSION, record.status] }),
      });
      if (patch.note) {
        await gh(`/issues/${id}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: `审核备注：${patch.note}` }),
        });
      }
      return record;
    },
  };
}

export function getStore(env) {
  if (globalThis.__TONGTOP_STORE__) return globalThis.__TONGTOP_STORE__;
  if (env?.GITHUB_TOKEN) return githubStore(env);
  return memoryStore();
}

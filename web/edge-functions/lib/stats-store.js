/** 计数存储：本地文件注入、GitHub 上的一条匿名汇总 Issue，或进程内存。公开接口不读这里的 client id。 */

const MEM = (globalThis.__TONGTOP_STATS_MEM__ ??= { seen: {}, counts: {} });

function memoryStore() {
  return {
    async read() {
      return MEM;
    },
    async write(state) {
      MEM.seen = state.seen;
      MEM.counts = state.counts;
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
    "user-agent": "tongtop-store-stats",
  };
  let number = 0;

  async function gh(pathname, init) {
    const resp = await fetch(`${api}${pathname}`, { headers, ...init });
    if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
    return resp.status === 204 ? null : resp.json();
  }

  function parse(issue) {
    const marker = /<!--\s*tongtop-stats:([\s\S]*?)-->/.exec(issue?.body ?? "");
    if (!marker) return { seen: {}, counts: {} };
    try {
      const data = JSON.parse(marker[1]);
      return { seen: data.seen ?? {}, counts: data.counts ?? {} };
    } catch {
      return { seen: {}, counts: {} };
    }
  }

  return {
    async read() {
      if (!number) {
        const query = encodeURIComponent(`repo:${repo} "[stats] anonymous" in:title`);
        const found = await fetch(`https://api.github.com/search/issues?q=${query}&per_page=5`, { headers });
        if (found.ok) {
          const data = await found.json();
          const hit = (data.items ?? []).find((item) => item.title === "[stats] anonymous");
          if (hit) number = hit.number;
        }
      }
      if (!number) return { seen: {}, counts: {} };
      return parse(await gh(`/issues/${number}`));
    },
    async write(state) {
      const body = `<!-- tongtop-stats:${JSON.stringify({ seen: state.seen, counts: state.counts })} -->\n\n匿名安装计数。公开榜单只包含应用 id 与次数。`;
      if (!number) {
        const created = await gh("/issues", {
          method: "POST",
          body: JSON.stringify({ title: "[stats] anonymous", body }),
        });
        number = created.number;
        return;
      }
      await gh(`/issues/${number}`, { method: "PATCH", body: JSON.stringify({ body }) });
    },
  };
}

function storeFor(env) {
  if (globalThis.__TONGTOP_STATS__) return globalThis.__TONGTOP_STATS__;
  if (env?.GITHUB_TOKEN) return githubStore(env);
  return memoryStore();
}

export async function readStats(env) {
  return storeFor(env).read();
}

export async function writeStats(env, state) {
  await storeFor(env).write(state);
}

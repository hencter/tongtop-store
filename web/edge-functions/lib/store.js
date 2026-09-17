const MEM = (globalThis.__TONGTOP_MEM_STORE__ ??= new Map());

function memoryStore() {
  return {
    async get(key) {
      return MEM.get(key) ?? null;
    },
    async put(key, value) {
      MEM.set(key, value);
    },
    async delete(key) {
      MEM.delete(key);
    },
    async list(prefix) {
      return [...MEM.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key }));
    },
  };
}

/** EdgeOne KV 绑定（绑定命名空间时变量名用 SUBMISSIONS_KV） */
function kvStore(kv) {
  return {
    async get(key) {
      return (await kv.get(key)) ?? null;
    },
    async put(key, value) {
      await kv.put(key, value);
    },
    async delete(key) {
      await kv.delete(key);
    },
    async list(prefix) {
      const out = [];
      let cursor;
      for (;;) {
        const result = await kv.list({ prefix, limit: 256, cursor });
        for (const item of result.keys ?? []) out.push({ key: item.key ?? item.name ?? String(item) });
        if (result.complete || !result.cursor) break;
        cursor = result.cursor;
      }
      return out;
    },
  };
}

export function getStore(env) {
  // 本地 dev-api 注入的文件存储优先
  if (globalThis.__TONGTOP_STORE__) return globalThis.__TONGTOP_STORE__;
  const kv = env?.SUBMISSIONS_KV;
  return kv ? kvStore(kv) : memoryStore();
}

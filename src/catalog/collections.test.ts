import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID } from "./apps";
import { CURATED_COLLECTIONS, ESSENTIALS } from "./collections";

describe("curated collections", () => {
  it("every featured id exists in the catalog", () => {
    const ids = [ESSENTIALS, ...CURATED_COLLECTIONS].flatMap((c) => c.ids);
    const missing = ids.filter((id) => !CATALOG_BY_ID.has(id.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it("essentials ship WeChat Universal, not the 3.9 Win32 package", () => {
    expect(ESSENTIALS.ids).toContain("Tencent.WeChat.Universal");
    expect(ESSENTIALS.ids).not.toContain("Tencent.WeChat");
    expect(CATALOG_BY_ID.get("tencent.wechat.universal")?.id).toBe("Tencent.WeChat.Universal");
  });
});

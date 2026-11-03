import { describe, expect, it } from "vitest";
import { isSupersededPackage, SUPERSEDED_BY } from "./superseded";

describe("superseded packages", () => {
  it("hides the old WeChat 3.9 id in favor of Universal", () => {
    expect(isSupersededPackage("Tencent.WeChat")).toBe(true);
    expect(isSupersededPackage("tencent.wechat")).toBe(true);
    expect(SUPERSEDED_BY["tencent.wechat"]).toBe("Tencent.WeChat.Universal");
  });

  it("does not hide the Universal / NT packages themselves", () => {
    expect(isSupersededPackage("Tencent.WeChat.Universal")).toBe(false);
    expect(isSupersededPackage("Tencent.QQ.NT")).toBe(false);
  });
});

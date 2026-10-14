/** 技能目录：没有通天路凭据时展示内置示例；有凭据则同步远程列表并安装通过 sha256 校验的技能包。 */

import { useCallback, useEffect, useState } from "react";
import { Download, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useSettingsStore } from "../../state/settingsStore";
import { useT } from "../../i18n";
import * as ipc from "../../ipc/client";
import {
  fetchPackage,
  installPackage,
  jwtStatus,
  login,
  memoryCache,
  paidUnlockMessage,
  requestUnlock,
  syncSkills,
  type SkillSummary,
  type TongtianluConfig,
} from "./client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const cache = memoryCache();

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function readConfig(apiBase: string, jwt: string): TongtianluConfig {
  const env = import.meta.env;
  return {
    apiBase: (apiBase.trim() || (env.TONGTIANLU_API_BASE ?? "").trim()).replace(/\/$/, ""),
    jwt: jwt.trim() || (env.TONGTIANLU_JWT ?? "").trim(),
  };
}

export function SkillsPage() {
  const t = useT();
  const ttlApiBase = useSettingsStore((s) => s.ttlApiBase);
  const ttlJwt = useSettingsStore((s) => s.ttlJwt);
  const setTtlApiBase = useSettingsStore((s) => s.setTtlApiBase);
  const setTtlJwt = useSettingsStore((s) => s.setTtlJwt);
  const config = readConfig(ttlApiBase, ttlJwt);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [source, setSource] = useState<"remote" | "cache" | "mock">("mock");
  const [warning, setWarning] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [agentKey, setAgentKey] = useState("");

  const load = useCallback(async () => {
    setBusy("sync");
    setMessage("");
    try {
      const result = await syncSkills({ config, cache });
      setSkills(result.skills);
      setSource(result.source);
      setWarning(result.warning ?? "");
    } catch (error) {
      setWarning(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [config.apiBase, config.jwt]);

  useEffect(() => {
    void load();
    // 进入页面时同步一次。之后由「同步」和「重新登录」触发，避免输入 API 地址时反复请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLogin = async () => {
    setBusy("login");
    setMessage("");
    try {
      const token = await login(config, username, password);
      setTtlJwt(token);
      setPassword("");
      const status = jwtStatus(token);
      setMessage(status.expired ? (status.message ?? "") : t("已重新登录"));
      const result = await syncSkills({ config: { ...config, jwt: token }, cache });
      setSkills(result.skills);
      setSource(result.source);
      setWarning(result.warning ?? "");
    } catch (error) {
      setWarning(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const onInstall = async (skill: SkillSummary) => {
    setBusy(skill.slug);
    setMessage("");
    setWarning("");
    try {
      if (skill.pricing === "paid") {
        const result = await requestUnlock({ config, cache }, skill, agentKey);
        setMessage(result.message);
        return;
      }
      const pkg = await fetchPackage(skill.slug, { config, cache });
      let where = "";
      await installPackage(pkg, async (files) => {
        where = await ipc.installSkillFiles(
          skill.slug,
          files.map((file) => ({
            path: file.path,
            sha256: file.sha256,
            contentBase64: bytesToBase64(file.bytes),
          })),
        );
      });
      setMessage(where ? `${t("已安装到")} ${where}` : t("技能包已通过 sha256 校验"));
    } catch (error) {
      setWarning(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const expiry = jwtStatus(config.jwt);

  return (
    <div className="page h-full overflow-y-auto">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold">{t("技能")}</h2>
          <p className="m-0 mt-1 text-xs text-muted-foreground">
            {source === "mock" ? t("没有通天路凭据，当前显示内置示例。") : source === "cache" ? t("显示本地缓存。") : t("已从通天路同步。")}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void load()}>
          {busy === "sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {t("同步")}
        </Button>
      </header>

      {(warning || expiry.expired) && (
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {expiry.expired ? expiry.message : warning}
        </div>
      )}
      {message && <div className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-[13px]">{message}</div>}

      <Card className="mb-4 grid gap-2 p-4">
        <div className="text-[13px] font-medium">{t("通天路账号")}</div>
        <Input
          placeholder={t("API 地址，如 https://api.tongtianlu.cn")}
          value={ttlApiBase}
          onChange={(e) => setTtlApiBase(e.target.value.trim())}
        />
        <Input
          type="password"
          placeholder="JWT"
          autoComplete="off"
          value={ttlJwt}
          onChange={(e) => setTtlJwt(e.target.value.trim())}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder={t("用户名")} value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input
            type="password"
            placeholder={t("密码")}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <Button size="sm" disabled={busy !== null} onClick={() => void onLogin()}>
            {busy === "login" ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
            {t("重新登录")}
          </Button>
        </div>
        <p className="m-0 text-[11px] leading-relaxed text-muted-foreground">
          {t("API 地址和 JWT 只从这里或环境变量 TONGTIANLU_API_BASE、TONGTIANLU_JWT 读取，不会写进仓库。JWT 约 7 天后过期。")}
        </p>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {skills.map((skill) => (
          <Card key={skill.slug} className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">{skill.name}</div>
              <Badge variant={skill.pricing === "paid" ? "outline" : "secondary"}>
                {skill.pricing === "paid" ? t("付费") : t("免费")}
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">v{skill.version}</div>
            <p className="m-0 line-clamp-3 text-xs text-muted-foreground">{skill.summary}</p>
            {skill.pricing === "paid" && (
              <Input
                placeholder="ttag_..."
                value={agentKey}
                onChange={(e) => setAgentKey(e.target.value.trim())}
                title={paidUnlockMessage()}
              />
            )}
            <Button size="sm" className="mt-auto" disabled={busy !== null} onClick={() => void onInstall(skill)}>
              {busy === skill.slug ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {skill.pricing === "paid" ? t("解锁入口") : t("安装")}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

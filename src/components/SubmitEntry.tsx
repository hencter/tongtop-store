/**
 * 「推荐收录」入口（issue #27）：把用户反馈引导到结构化渠道，而不是散落的聊天消息。
 *
 * 三条渠道的分工：
 *  - **点赞/踩**（VoteButton）：已经在库里的软件，表达"好不好用"；
 *  - **站内提交表单**：新软件/新智能体/纠错，进网站审核队列；
 *  - **GitHub issue 模板**：精选推荐与纠错，带结构化字段，公开可追踪。
 */

import { openUrl } from "@tauri-apps/plugin-opener";
import { Lightbulb, MessageSquarePlus, Send } from "lucide-react";
import { useT } from "../i18n";
import { Button } from "@/components/ui/button";

/** 收录仓库（issue 模板所在处） */
const REPO = "hencter/tongtop-store";
const ISSUE_TEMPLATE = `https://github.com/${REPO}/issues/new/choose`;
const SITE_SUBMIT = "https://tongtop.store/submit";

/** 一行式入口：详情弹窗、智能体页底部用 */
export function SubmitEntry({ className }: { className?: string }) {
  const t = useT();
  return (
    <div className={`flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground ${className ?? ""}`}>
      <MessageSquarePlus className="size-3.5 shrink-0" />
      <span>{t("没找到想要的软件？")}</span>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 text-[11px]"
        onClick={() => void openUrl(ISSUE_TEMPLATE)}
        title={t("在 GitHub 用结构化模板推荐收录（公开可追踪）")}
      >
        <Send className="size-3" /> {t("用 issue 模板推荐收录")}
      </Button>
      <span className="text-muted-foreground/60">·</span>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 text-[11px]"
        onClick={() => void openUrl(SITE_SUBMIT)}
        title={t("官网提交表单，进审核队列")}
      >
        {t("官网提交表单")}
      </Button>
    </div>
  );
}

/** 精选页/首页的「推荐收录」按钮（大号一点，用在区块标题旁） */
export function SuggestEntryButton({ className }: { className?: string }) {
  const t = useT();
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={() => void openUrl(ISSUE_TEMPLATE)}
      title={t("用 GitHub issue 模板推荐收录：填 winget ID / 官网 / 推荐理由")}
    >
      <Lightbulb className="size-3.5" /> {t("推荐收录")}
    </Button>
  );
}

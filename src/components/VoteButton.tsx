/**
 * 点赞 / 踩按钮（issue #27：用户反馈机制）。
 *
 * 桌面端的票数来自本机（`voteStore`，localStorage）—— 官网才是云端计数的所有者，
 * 所以这里显示的计数会标注「本机」，不冒充全站数据。离线/后端不可用都不影响使用。
 *
 * 用到的位置：软件详情弹窗、智能体装机页。列表行里不放（每行一个按钮会把列表挤乱）。
 */

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useVoteStore, type Tally } from "../state/voteStore";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

/** 稳定引用：选择器里绝不能返回新对象，否则 useSyncExternalStore 会每帧判定"变了"而无限重渲染 */
const EMPTY_TALLY: Tally = { up: 0, down: 0 };

export function VoteButton({ id, className }: { id: string; className?: string }) {
  const t = useT();
  const mine = useVoteStore((s) => s.mine[id] ?? null);
  const tally = useVoteStore((s) => s.tally[id] ?? EMPTY_TALLY);
  const vote = useVoteStore((s) => s.vote);

  const btn = (value: "up" | "down", Icon: typeof ThumbsUp, label: string, count: number, activeColor: string) => (
    <button
      type="button"
      aria-pressed={mine === value}
      title={mine === value ? t("再点一次取消") : label}
      onClick={() => vote(id, value)}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] transition-colors",
        mine === value
          ? activeColor
          : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {count > 0 ? count : ""}
    </button>
  );

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {btn("up", ThumbsUp, t("好用"), tally.up, "border-ok/40 bg-ok/10 text-ok")}
      {btn("down", ThumbsDown, t("不好用"), tally.down, "border-destructive/40 bg-destructive/10 text-destructive")}
      <span className="text-[10.5px] text-muted-foreground" title={t("官网已部署时会汇总全站票数；桌面端显示本机票数")}>
        {t("本机票数")}
      </span>
    </div>
  );
}

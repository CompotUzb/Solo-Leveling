import { useState, type ReactNode } from "react";
import { postJson, type AsyncState } from "../lib/api.js";
import { ratioPercent, relativeTime } from "../lib/format.js";
import type {
  Health,
  DailyMetric,
  DailySnapshot,
  Rank,
  Quest,
} from "../lib/types.js";
import { Async, Badge, EmptyState, ProgressBar } from "../components/ui.js";

const STAT_LABELS: Record<string, string> = {
  strength: "Strength",
  intelligence: "Intelligence",
  discipline: "Discipline",
  technical: "Technical",
  health: "Health",
  communication: "Communication",
  wealth: "Wealth",
  survival: "Survival",
};

function DailyTaskRow({
  label,
  detail,
  percent,
  done,
  actions,
}: {
  label: string;
  detail: string;
  percent: number;
  done: boolean;
  actions?: ReactNode;
}) {
  const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
  return (
    <li className={`daily-metric ${done ? "is-done" : ""}`}>
      <div className="daily-metric-head">
        <span className="daily-metric-label">
          {done ? "✓ " : ""}
          {label}
        </span>
        <span className="muted">
          {detail.replace(/\d+(?:\.\d+)?/g, (value) => fmt(Number(value)))}
        </span>
      </div>
      <ProgressBar percent={percent} />
      {actions ? <div className="daily-metric-controls">{actions}</div> : null}
    </li>
  );
}

function metricIncrements(metric: DailyMetric): number[] {
  if (metric.key === "cardio_km") return [0.5, 1];
  if (metric.key === "steps") return [500, 1000];
  if (metric.key === "mental_minutes") return [5, 15];
  return [1, 5];
}

function lootTone(rarity: string): string {
  if (rarity === "legendary") return "raid";
  if (rarity === "rare") return "normal";
  return "muted";
}

export function DailyProtocol({
  daily,
  onDailyChanged,
}: {
  daily: AsyncState<DailySnapshot>;
  onDailyChanged: () => void;
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setPendingAction(key);
    setActionError(null);
    try {
      await action();
      onDailyChanged();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  };

  const actionButton = (
    key: string,
    label: string,
    action: () => Promise<unknown>,
    options: { danger?: boolean; disabled?: boolean } = {},
  ) => (
    <button
      type="button"
      className={`sysbtn sysbtn-mini ${options.danger ? "sysbtn-danger" : ""}`}
      disabled={pendingAction != null || options.disabled}
      onClick={() => void runAction(key, action)}
    >
      {pendingAction === key ? "..." : label}
    </button>
  );

  const metricButtons = (
    metric: DailyMetric,
    disabled: boolean,
    prefix = metric.unit,
  ) => (
    <>
      <span className="daily-control-label">{prefix}</span>
      {metricIncrements(metric).map((delta) =>
        actionButton(
          `${metric.key}:${delta}`,
          `+${delta}`,
          () =>
            postJson<DailySnapshot>("/api/daily/metric", {
              metricKey: metric.key,
              delta,
            }),
          { disabled: disabled || metric.done },
        ),
      )}
      {actionButton(
        `${metric.key}:done`,
        "Done",
        () =>
          postJson<DailySnapshot>("/api/daily/metric", {
            metricKey: metric.key,
            progress: metric.target,
          }),
        { disabled: disabled || metric.done },
      )}
    </>
  );

  return (
    <Async state={daily} loadingLabel="Loading today’s Daily Quest…">
      {(data) => {
        const quest = data.quest;
        const actionsDisabled = quest?.status !== "active";
        const statusTone =
          quest?.status === "completed"
            ? "easy"
            : quest?.status === "failed"
              ? "hard"
              : "normal";
        const metric = (key: string) =>
          quest?.metrics.find((item) => item.key === key);
        const bodyMetrics = ["pushups", "situps", "squats", "pullups"]
          .map((key) => metric(key))
          .filter((item): item is DailyMetric => item != null);
        const cardioKm = metric("cardio_km");
        const steps = metric("steps");
        const mentalMinutes = metric("mental_minutes");
        const mentalPages = metric("mental_pages");
        const lusted = metric("lusted");
        const alternativePercent = (...items: Array<DailyMetric | undefined>) =>
          Math.max(
            0,
            ...items
              .filter((item): item is DailyMetric => item != null)
              .map((item) => ratioPercent(item.progress, item.target)),
          );
        const remaining = quest
          ? [
              ...bodyMetrics
                .filter((item) => !item.done)
                .map(
                  (item) =>
                    `${Math.max(0, item.target - item.progress)} ${item.label.toLowerCase()}`,
                ),
              cardioKm && !cardioKm.done && !steps?.done
                ? `${Math.max(0, cardioKm.target - cardioKm.progress)} km cardio${steps ? ` OR ${Math.max(0, steps.target - steps.progress)} steps` : ""}`
                : null,
              mentalMinutes && !mentalMinutes.done && !mentalPages?.done
                ? `${Math.max(0, mentalMinutes.target - mentalMinutes.progress)} min study${mentalPages ? ` OR ${Math.max(0, mentalPages.target - mentalPages.progress)} pages` : ""}`
                : null,
              lusted && !lusted.done && lusted.progress >= 0
                ? "answer Lusted? no"
                : null,
            ].filter((item): item is string => item != null)
          : [];
        return (
          <section
            className={`card daily-protocol ${data.state.penaltyActive ? "penalty" : ""} ${quest?.complete ? "complete" : ""}`}
          >
            <header className="card-head daily-protocol-head">
              <h2>
                <span className="card-icon" aria-hidden>
                  🗒
                </span>
                {quest
                  ? `SYSTEM DAILY QUEST — ${quest.discordThreadName ?? `Day-${quest.streakDayNumber ?? 1}`}`
                  : "Today’s Daily Quest"}
              </h2>
              <div className="daily-pills">
                <span className="streak-pill">
                  🔥 {data.state.currentStreak}d streak
                </span>
                <span className="muted">best {data.state.longestStreak}d</span>
              </div>
            </header>
            <div className="card-body">
              {actionError ? (
                <div className="state state-error" role="alert">
                  <span className="state-glyph" aria-hidden>
                    !
                  </span>
                  <span>{actionError}</span>
                </div>
              ) : null}
              {data.state.penaltyActive ? (
                <div className="penalty-banner">
                  <div className="penalty-main">
                    <span className="penalty-tag">PENALTY ZONE ACTIVE</span>
                    <span className="muted">
                      {data.state.penaltyReason ?? "Recovery flush required"}
                    </span>
                  </div>
                  {actionButton(
                    "daily:flush",
                    "Log recovery flush",
                    () =>
                      postJson<DailySnapshot>("/api/daily/flush", {
                        note: "Dashboard recovery flush",
                      }),
                    { danger: true },
                  )}
                </div>
              ) : null}
              {!quest ? (
                <EmptyState message="No Daily Quest generated yet. Waiting for scheduled creation." />
              ) : (
                <>
                  <div className="daily-workflow-meta">
                    <strong>Rank: {quest.hunterRank}</strong>
                    <span>Tier: {quest.tierName}</span>
                    <span>
                      Thread:{" "}
                      {quest.discordThreadName ??
                        `Day-${quest.streakDayNumber ?? 1}`}
                    </span>
                    <Badge tone={statusTone}>
                      {data.state.penaltyActive
                        ? "penalty_active"
                        : quest.status}
                    </Badge>
                  </div>
                  <ul className="daily-metrics">
                    {bodyMetrics.map((item) => (
                      <DailyTaskRow
                        key={item.key}
                        label={item.label}
                        detail={`${item.progress} / ${item.target} ${item.unit}`}
                        percent={ratioPercent(item.progress, item.target)}
                        done={item.done}
                        actions={metricButtons(item, actionsDisabled)}
                      />
                    ))}
                    {cardioKm ? (
                      <DailyTaskRow
                        label="Cardio"
                        detail={`${cardioKm.progress} / ${cardioKm.target} km${steps ? ` OR ${steps.progress} / ${steps.target} steps` : ""}`}
                        percent={alternativePercent(cardioKm, steps)}
                        done={cardioKm.done || Boolean(steps?.done)}
                        actions={
                          <>
                            {metricButtons(
                              cardioKm,
                              actionsDisabled || cardioKm.done,
                              "km",
                            )}
                            {steps
                              ? metricButtons(
                                  steps,
                                  actionsDisabled || steps.done,
                                  "steps",
                                )
                              : null}
                          </>
                        }
                      />
                    ) : null}
                    {mentalMinutes ? (
                      <DailyTaskRow
                        label="Mental Focus"
                        detail={`${mentalMinutes.progress} / ${mentalMinutes.target} min${mentalPages ? ` OR ${mentalPages.progress} / ${mentalPages.target} pages` : ""}`}
                        percent={alternativePercent(mentalMinutes, mentalPages)}
                        done={mentalMinutes.done || Boolean(mentalPages?.done)}
                        actions={
                          <>
                            {metricButtons(
                              mentalMinutes,
                              actionsDisabled || mentalMinutes.done,
                              "min",
                            )}
                            {mentalPages
                              ? metricButtons(
                                  mentalPages,
                                  actionsDisabled || mentalPages.done,
                                  "pages",
                                )
                              : null}
                          </>
                        }
                      />
                    ) : null}
                    {lusted ? (
                      <DailyTaskRow
                        label="Lusted?"
                        detail={
                          lusted.progress < 0
                            ? "Yes - penalty"
                            : lusted.done
                              ? "No"
                              : "Answer yes or no"
                        }
                        percent={
                          lusted.progress < 0
                            ? 0
                            : ratioPercent(lusted.progress, lusted.target)
                        }
                        done={lusted.done}
                        actions={
                          <>
                            {actionButton(
                              "lusted:no",
                              "No",
                              () =>
                                postJson<DailySnapshot>("/api/daily/metric", {
                                  metricKey: "lusted",
                                  answer: "no",
                                }),
                              { disabled: actionsDisabled || lusted.done },
                            )}
                            {actionButton(
                              "lusted:yes",
                              "Yes",
                              () =>
                                postJson<DailySnapshot>("/api/daily/metric", {
                                  metricKey: "lusted",
                                  answer: "yes",
                                }),
                              {
                                danger: true,
                                disabled:
                                  actionsDisabled || lusted.progress < 0,
                              },
                            )}
                          </>
                        }
                      />
                    ) : null}
                  </ul>
                  <div className="daily-remaining">
                    <strong>Remaining:</strong>{" "}
                    {remaining.length ? (
                      <ul>
                        {remaining.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="accent">All tasks complete.</span>
                    )}
                  </div>
                  <div className="daily-reward-status">
                    <span>
                      Reward: +100 XP · automatic stat gains · Daily Common Box
                    </span>
                    <Badge tone={quest.rewardsGranted ? "easy" : "muted"}>
                      {quest.rewardsGranted ? "granted" : "pending"}
                    </Badge>
                  </div>
                  {data.state.statPoints > 0 ? (
                    <div className="alloc">
                      <div className="alloc-head">
                        <strong>{data.state.statPoints}</strong>{" "}
                        <span className="muted">unallocated stat points</span>
                      </div>
                      <div className="alloc-btns">
                        {data.statKeys.map((statKey) =>
                          actionButton(
                            `alloc:${statKey}`,
                            STAT_LABELS[statKey] ?? statKey,
                            () =>
                              postJson("/api/stats/allocate", {
                                statKey,
                              }),
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}
                  {data.lootBoxes.length > 0 ? (
                    <div className="loot-strip">
                      {data.lootBoxes.slice(0, 6).map((box) => (
                        <div
                          key={box.id}
                          className={`loot-box loot-${box.rarity} ${
                            box.status === "claimed" ? "is-claimed" : ""
                          }`}
                        >
                          <div className="loot-head">
                            <Badge tone={lootTone(box.rarity)}>
                              {box.rarity}
                            </Badge>
                            <span className="muted">
                              {relativeTime(box.createdAt)}
                            </span>
                          </div>
                          <span className="loot-reward muted">
                            {box.reward}
                          </span>
                          {box.status === "unopened" ? (
                            actionButton(
                              `loot:${box.id}`,
                              "Claim",
                              () =>
                                postJson(`/api/loot/${box.id}/claim`, {}),
                            )
                          ) : (
                            <span className="loot-claimed accent">Claimed</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        );
      }}
    </Async>
  );
}

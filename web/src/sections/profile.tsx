import { type AsyncState } from "../lib/api.js";
import { xpProgressPercent, formatNumber } from "../lib/format.js";
import type {
  Health,
  Boundaries,
  Rank,
  Summary,
} from "../lib/types.js";
import { Async, Badge, Card, ProgressBar } from "../components/ui.js";

function statusDot(ok: boolean | undefined, value: string | undefined): string {
  if (value === undefined) return "unknown";
  if (ok === false) return "down";
  return "up";
}

export function Profile({
  summary,
  health,
  boundaries,
}: {
  summary: AsyncState<Summary>;
  health: AsyncState<Health>;
  boundaries: AsyncState<Boundaries>;
}) {
  return (
    <Card title="Player Status" icon="◈" area="profile" accent>
      <Async state={summary} loadingLabel="Reading profile…">
        {(data) => (
          <div className="profile">
            <div className="profile-sigil" data-rank={data.rank.rankCode}>
              <span className="profile-level">{data.rank.level}</span>
              <span className="profile-level-label">LVL</span>
            </div>
            <div className="profile-meta">
              <p className="eyebrow">System Rank: {data.rank.rankName}</p>
              <h3>Player</h3>
              <p className="muted">Total XP: {formatNumber(data.rank.totalXp)}</p>
              <div className="chips">
                <Badge tone="streak">
                  Current Streak: {data.rank.currentStreakDays}d
                </Badge>
                <Badge tone="muted">
                  Best Streak: {data.rank.longestStreakDays}d
                </Badge>
                <Badge tone={data.today.streakEligible ? "easy" : "muted"}>
                  {data.today.streakEligible
                    ? "Status: Active"
                    : "Status: Today At Risk"}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </Async>
      <div className="system-status">
        <span
          className={`dot dot-${statusDot(health.data?.ok, health.data?.db)}`}
          aria-hidden
        />
        <span>
          API {health.data ? (health.data.ok ? "online" : "degraded") : "…"}
        </span>
        <span className="sep">·</span>
        <span>DB {health.data?.db ?? "…"}</span>
        <span className="sep">·</span>
        <span>Discord {health.data?.discord ?? "…"}</span>
        {boundaries.data ? (
          <>
            <span className="sep">·</span>
            <span>
              {boundaries.data.trackedChannelIds.length} channels tracked
            </span>
          </>
        ) : null}
      </div>
    </Card>
  );
}

export function XpBar({ summary }: { summary: AsyncState<Summary> }) {
  return (
    <Card title="Experience" icon="⚡" area="experience">
      <Async state={summary} loadingLabel="Calculating XP…">
        {(data) => {
          const percent = xpProgressPercent(
            data.rank.xpIntoLevel,
            data.rank.xpForNextLevel,
          );
          const remaining = Math.max(
            0,
            data.rank.xpForNextLevel - data.rank.xpIntoLevel,
          );
          return (
            <div className="xp">
              <div className="xp-row">
                <span>Level {data.rank.level}</span>
                <span className="muted">Level {data.rank.level + 1}</span>
              </div>
              <ProgressBar percent={percent} />
              <div className="xp-row">
                <span className="muted">
                  {formatNumber(data.rank.xpIntoLevel)} /{" "}
                  {formatNumber(data.rank.xpForNextLevel)} XP
                </span>
                <span className="accent">
                  {formatNumber(remaining)} XP to next
                </span>
              </div>
            </div>
          );
        }}
      </Async>
    </Card>
  );
}

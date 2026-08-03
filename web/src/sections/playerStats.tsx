import { type AsyncState } from "../lib/api.js";
import { ratioPercent, formatNumber } from "../lib/format.js";
import type { PlayerStatsResponse, Summary } from "../lib/types.js";
import { Async, Card, ProgressBar, Stat } from "../components/ui.js";

// The main player-progression card. Each of the eight RPG attributes has its own level
// that climbs as the stat grows; the bar shows progress toward that attribute's next level.
export function PlayerStats({
  player,
}: {
  player: AsyncState<PlayerStatsResponse>;
}) {
  return (
    <Card title="Hunter Stats" icon="⚔" area="stats" accent>
      <Async state={player} loadingLabel="Reading attributes…">
        {(data) => (
          <ul className="player-stats">
            {data.stats.map((stat) => {
              const percent = ratioPercent(
                stat.pointsIntoLevel,
                stat.pointsForNextLevel,
              );
              return (
                <li key={stat.key} className="player-stat">
                  <div className="player-stat-head">
                    <span className="player-stat-label">{stat.label}</span>
                    <span className="player-stat-level">
                      <span className="player-stat-lv accent">
                        Lv {stat.level}
                      </span>
                      <span className="muted">
                        {formatNumber(stat.value)} pts
                      </span>
                    </span>
                  </div>
                  <ProgressBar percent={percent} />
                  <span className="player-stat-next muted">
                    {stat.pointsIntoLevel}/{stat.pointsForNextLevel} to Lv{" "}
                    {stat.level + 1}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Async>
    </Card>
  );
}

// Demoted secondary metrics — activity counts that used to be the "Vital Stats" focus.
export function ActivityMetrics({ summary }: { summary: AsyncState<Summary> }) {
  return (
    <Card title="Activity Metrics" icon="📊" area="metrics">
      <Async state={summary} loadingLabel="Loading metrics…">
        {(data) => (
          <div className="stat-grid">
            <Stat label="XP today" value={formatNumber(data.today.xp)} />
            <Stat
              label="Active days / 7d"
              value={`${data.week.activeDays}/7`}
            />
            <Stat
              label="Longest streak"
              value={`${data.rank.longestStreakDays}d`}
            />
            <Stat label="XP / 7d" value={formatNumber(data.week.xp)} />
          </div>
        )}
      </Async>
    </Card>
  );
}

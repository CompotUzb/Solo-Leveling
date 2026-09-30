import { type AsyncState } from "../lib/api.js";
import { ratioPercent, formatDate } from "../lib/format.js";
import type { AchievementsResponse } from "../lib/types.js";
import { Async, Badge, Card, ProgressBar } from "../components/ui.js";

// Core progression section: a full-width grid of every achievement, unlocked first.
// Each cell shows its icon, title, description, status, and either its unlock date
// (unlocked) or progress toward the target (locked / in progress).
export function Achievements({
  achievements,
}: {
  achievements: AsyncState<AchievementsResponse>;
}) {
  return (
    <Card title="Achievements" icon="🏆" area="achievements">
      <Async
        state={achievements}
        isEmpty={(data) => data.achievements.length === 0}
        emptyMessage="No achievements yet. They unlock as you stay active."
        loadingLabel="Loading achievements…"
      >
        {(data) => (
          <ul className="achievement-grid">
            {data.achievements.map((a) => {
              const inProgress = !a.unlocked && a.progress > 0;
              const status = a.unlocked
                ? "unlocked"
                : inProgress
                  ? "in progress"
                  : "locked";
              const statusTone = a.unlocked
                ? "easy"
                : inProgress
                  ? "normal"
                  : "muted";
              const stateClass = a.unlocked
                ? "unlocked"
                : inProgress
                  ? "in-progress"
                  : "locked";
              return (
                <li key={a.id} className={`achievement ${stateClass}`}>
                  <span className="achievement-glyph" aria-hidden>
                    {a.unlocked ? "★" : "☆"}
                  </span>
                  <div className="achievement-main">
                    <div className="achievement-head">
                      <span className="achievement-name">{a.name}</span>
                      <Badge tone={statusTone}>{status}</Badge>
                    </div>
                    {a.description ? (
                      <span className="achievement-desc muted">
                        {a.description}
                      </span>
                    ) : null}
                    {a.unlocked ? (
                      <span className="achievement-meta muted">
                        {a.unlockedAt
                          ? `Unlocked ${formatDate(a.unlockedAt)}`
                          : "Unlocked"}
                      </span>
                    ) : (
                      <div className="achievement-progress">
                        <ProgressBar
                          percent={ratioPercent(a.progress, a.target)}
                        />
                        <span className="achievement-meta muted">
                          {a.progress}/{a.target}
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Async>
    </Card>
  );
}

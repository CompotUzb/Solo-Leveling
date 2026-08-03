import { type AsyncState } from "../lib/api.js";
import { ratioPercent } from "../lib/format.js";
import type { SalahSnapshot } from "../lib/types.js";
import { Async, Badge, Card, EmptyState, ProgressBar } from "../components/ui.js";

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

export function SalahTracker({ salah }: { salah: AsyncState<SalahSnapshot> }) {
  return (
    <Card title="Salah" icon="🕌" area="salah" accent>
      <Async state={salah} loadingLabel="Loading Salah tracker…">
        {(data) => {
          if (!data.enabled) {
            return <EmptyState message="Salah Tracker is disabled." />;
          }
          const day = data.day;
          if (!day) {
            return <EmptyState message="Today’s Salah schedule has not been generated yet." />;
          }
          const percent = ratioPercent(day.completedCount, day.totalCount);
          return (
            <div className="salah-card">
              <div className="salah-headline">
                <div>
                  <p className="eyebrow">Today's Salah</p>
                  <strong>{data.city}, {data.country}</strong>
                </div>
                <Badge tone={day.complete ? "easy" : "normal"}>
                  {day.completedCount} / {day.totalCount}
                </Badge>
              </div>
              <div className="salah-focus-grid">
                <div className="salah-focus-panel">
                  <span className="muted">Current Prayer</span>
                  <strong>{day.currentPrayer?.prayerName ?? "Waiting"}</strong>
                  <span className={day.currentPrayer?.completed ? "ok" : "accent"}>
                    {day.currentPrayer
                      ? day.currentPrayer.completed
                        ? "Complete"
                        : "Pending"
                      : "Not started"}
                  </span>
                </div>
                <div className="salah-focus-panel">
                  <span className="muted">Next Prayer</span>
                  <strong>{day.nextPrayer?.prayerName ?? "Done"}</strong>
                  <span className="accent">
                    {day.nextPrayer ? formatCountdown(day.nextPrayer.secondsUntil) : "All clear"}
                  </span>
                </div>
              </div>
              <ul className="salah-list">
                {day.prayers.map((prayer) => (
                  <li key={prayer.prayerName} className={prayer.completed ? "is-done" : ""}>
                    <span className="salah-marker" aria-hidden>
                      {prayer.completed ? "✔" : prayer.prayerName === day.nextPrayer?.prayerName ? "●" : "○"}
                    </span>
                    <span>{prayer.prayerName}</span>
                    <span className="muted">{prayer.scheduledTime}</span>
                  </li>
                ))}
              </ul>
              <div className="salah-progress">
                <div className="xp-row">
                  <span>Progress</span>
                  <span className="accent">{percent}%</span>
                </div>
                <ProgressBar percent={percent} />
              </div>
              {day.nextPrayer ? (
                <div className="salah-next">
                  <span className="muted">Countdown to next prayer</span>
                  <strong>{day.nextPrayer.prayerName}</strong>
                  <span className="accent">{formatCountdown(day.nextPrayer.secondsUntil)}</span>
                </div>
              ) : null}
              <div className="salah-next muted-panel">
                <span className="muted">Remaining Today</span>
                <strong>{day.remainingCount}</strong>
                <span className="muted">prayers</span>
              </div>
              {day.nextReminder ? (
                <div className="salah-next salah-reminder-next">
                  <span className="muted">Next Reminder</span>
                  <strong>{day.nextReminder.prayerName}</strong>
                  <span className="accent">{formatCountdown(day.nextReminder.secondsUntil)}</span>
                </div>
              ) : null}
              <div className="chips">
                <Badge tone="streak">Salah Streak: {data.state.currentStreak}d</Badge>
                <Badge tone="muted">Best: {data.state.longestStreak}d</Badge>
              </div>
            </div>
          );
        }}
      </Async>
    </Card>
  );
}

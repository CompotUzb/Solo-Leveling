import { type AsyncState } from "../lib/api.js";
import {
  ratioPercent,
  formatNumber,
  weekdayLabel,
} from "../lib/format.js";
import type { WeeklyReport } from "../lib/types.js";
import { Async, Card, Stat } from "../components/ui.js";

export function WeeklyReportSection({
  report,
}: {
  report: AsyncState<WeeklyReport>;
}) {
  return (
    <Card title="Weekly Report" icon="📜" area="weekly">
      <Async state={report} loadingLabel="Compiling weekly report…">
        {(data) => {
          const maxXp = Math.max(1, ...data.days.map((d) => d.xp));
          return (
            <div className="weekly">
              <div className="weekly-totals">
                <Stat
                  label="Messages"
                  value={formatNumber(data.totals.messages)}
                />
                <Stat label="XP earned" value={formatNumber(data.totals.xp)} />
                <Stat
                  label="Quests done"
                  value={formatNumber(data.totals.questsCompleted)}
                />
                <Stat
                  label="Active days"
                  value={`${data.totals.activeDays}/7`}
                />
              </div>
              <div className="weekly-chart" aria-hidden>
                {data.days.map((day) => (
                  <div key={day.date} className="weekly-bar">
                    <div className="weekly-bar-track">
                      <span
                        style={{ height: `${ratioPercent(day.xp, maxXp)}%` }}
                      />
                    </div>
                    <span className="weekly-bar-value">{day.xp}</span>
                    <span className="weekly-bar-label muted">
                      {weekdayLabel(day.date)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted weekly-range">
                {data.rangeStart} → {data.rangeEnd}
              </p>
            </div>
          );
        }}
      </Async>
    </Card>
  );
}

import type { Db } from "./db.js";
import { localDateFor } from "./dailyWorkflow.js";
import type { NotificationInput } from "./notifications.js";
import { weeklyReport, type WeeklyReport } from "./reports.js";
import { getRankSnapshot } from "./xp.js";

// Single source of truth for the on-demand daily/weekly summary notifications.
// Both the HTTP endpoints and the Discord `!summary` commands publish through
// these builders, so the two delivery routes can never drift apart.

/** Count quests completed on one local calendar date (timezone-aware, not a UTC window). */
export function countQuestsCompletedOn(
  db: Db,
  userId: string,
  localDate: string,
  timezone: string,
): number {
  const rows = db
    .prepare(
      `select completed_at from quests where user_id=? and status='completed' and completed_at is not null`,
    )
    .all(userId) as { completed_at: string }[];
  return rows.filter(
    (row) => localDateFor(new Date(row.completed_at), timezone) === localDate,
  ).length;
}

export function buildDailySummary(
  db: Db,
  userId: string,
  timezone: string,
  now: Date = new Date(),
): { date: string; input: NotificationInput } {
  const today = localDateFor(now, timezone);
  const stats = db
    .prepare(
      "select messages_count,xp_earned,streak_eligible from daily_stats where user_id=? and local_date=?",
    )
    .get(userId, today) as
    | { messages_count: number; xp_earned: number; streak_eligible: number }
    | undefined;
  const completed = countQuestsCompletedOn(db, userId, today, timezone);
  const body =
    completed === 0
      ? `No completed quests today.\n\nStreak: ${stats?.streak_eligible ? "active" : "reset or unchanged"}.\nFocus for tomorrow: complete one small quest before noon.`
      : `✅ Completed: ${completed}\nXP today: ${stats?.xp_earned ?? 0}\nMessages: ${stats?.messages_count ?? 0}`;
  return {
    date: today,
    input: {
      userId,
      type: "daily_summary",
      title: `Daily Summary — ${today}`,
      body,
      metadata: { date: today },
    },
  };
}

export function buildWeeklySummary(
  db: Db,
  userId: string,
  timezone: string,
  now: Date = new Date(),
): { report: WeeklyReport; input: NotificationInput } {
  const report = weeklyReport(db, userId, timezone, now);
  const body =
    report.totals.questsCompleted === 0
      ? `No quests completed this week.\n\nRecommended focus: Start with one 10-minute quest in coding or study.`
      : `Level: ${getRankSnapshot(db, userId).level} | XP this week: ${report.totals.xp} | Active days: ${report.totals.activeDays}/7\n\n✅ Completed: ${report.totals.questsCompleted}\nRecommended focus: Keep the streak alive: complete one quest before noon tomorrow.`;
  return {
    report,
    input: {
      userId,
      type: "weekly_summary",
      title: `Weekly Report — ${report.rangeStart} to ${report.rangeEnd}`,
      body,
      metadata: { rangeStart: report.rangeStart, rangeEnd: report.rangeEnd },
    },
  };
}

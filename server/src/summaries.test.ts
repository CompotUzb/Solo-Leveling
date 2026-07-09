import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, openDatabase, type Db } from "./db.js";
import { addQuest, completeQuest } from "./quests.js";
import {
  buildDailySummary,
  buildWeeklySummary,
  countQuestsCompletedOn,
} from "./summaries.js";

const USER = "local-user";
let db: Db;

beforeEach(() => {
  db = openDatabase(":memory:");
  applyMigrations(db);
});

afterEach(() => db.close());

function completeQuestAt(completedAt: string): void {
  const quest = addQuest(
    db,
    { userId: USER, title: `Quest ${completedAt}`, questType: "easy" },
    { now: () => completedAt },
  );
  completeQuest(db, { questId: quest.id, userId: USER }, {
    now: () => completedAt,
  });
}

describe("summary builders", () => {
  it("counts completions by local calendar date, not the UTC window", () => {
    // 23:00 UTC on July 2 is already July 3 in Asia/Tashkent (UTC+5).
    completeQuestAt("2026-07-02T23:00:00.000Z");

    expect(
      countQuestsCompletedOn(db, USER, "2026-07-03", "Asia/Tashkent"),
    ).toBe(1);
    expect(
      countQuestsCompletedOn(db, USER, "2026-07-02", "Asia/Tashkent"),
    ).toBe(0);
    expect(countQuestsCompletedOn(db, USER, "2026-07-02", "UTC")).toBe(1);
  });

  it("builds a daily summary whose count respects the configured timezone", () => {
    completeQuestAt("2026-07-02T23:00:00.000Z");

    const summary = buildDailySummary(
      db,
      USER,
      "Asia/Tashkent",
      new Date("2026-07-03T01:00:00.000Z"),
    );
    expect(summary.date).toBe("2026-07-03");
    expect(summary.input.type).toBe("daily_summary");
    expect(summary.input.title).toBe("Daily Summary — 2026-07-03");
    expect(summary.input.body).toContain("✅ Completed: 1");
    expect(summary.input.metadata).toEqual({ date: "2026-07-03" });
  });

  it("builds the empty-day daily summary with streak guidance", () => {
    const summary = buildDailySummary(db, USER, "UTC");
    expect(summary.input.body).toContain("No completed quests today.");
    expect(summary.input.body).toContain("Focus for tomorrow");
  });

  it("builds a weekly summary with totals and range title", () => {
    const now = new Date("2026-07-03T12:00:00.000Z");
    completeQuestAt("2026-07-01T10:00:00.000Z");

    const summary = buildWeeklySummary(db, USER, "UTC", now);
    expect(summary.input.type).toBe("weekly_summary");
    expect(summary.input.title).toBe(
      `Weekly Report — ${summary.report.rangeStart} to ${summary.report.rangeEnd}`,
    );
    expect(summary.report.totals.questsCompleted).toBe(1);
    expect(summary.input.body).toContain("✅ Completed: 1");
  });

  it("builds the empty-week weekly summary with a starter recommendation", () => {
    const summary = buildWeeklySummary(db, USER, "UTC");
    expect(summary.input.body).toContain("No quests completed this week.");
  });
});

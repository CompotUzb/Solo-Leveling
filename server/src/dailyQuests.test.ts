import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, openDatabase, type Db } from "./db.js";
import { awardXp, getRankSnapshot } from "./xp.js";
import { getPlayerStats } from "./stats.js";
import {
  clearDailyPenalty,
  DAILY_LUSTED_PENALTY_XP,
  DAILY_METRICS,
  getDailyQuest,
  getDailySnapshot,
  getDailyState,
  logDailyLustAnswer,
  logDailyMetric,
  runDailyEvaluation,
  ensureDailyDay,
} from "./dailyQuests.js";

const USER = "local-user";
let db: Db;
let counter: number;

function clock(now: string) {
  return { now: () => now, genId: () => `id-${counter++}` };
}

beforeEach(() => {
  db = openDatabase(":memory:");
  applyMigrations(db);
  counter = 0;
});

function finishAllMetrics(
  date: string,
  hooks: { notify?: (i: unknown) => void } = {},
) {
  let last;
  let completed;
  for (const metric of DAILY_METRICS.filter((item) => item.key !== "lusted")) {
    last = logDailyMetric(
      db,
      USER,
      date,
      metric.key,
      { progress: 1e9 },
      { clock: clock("2026-06-23T10:00:00.000Z"), ...hooks },
    );
    if (last.completion) completed = last;
  }
  last = logDailyLustAnswer(db, USER, date, false, {
    clock: clock("2026-06-23T10:00:00.000Z"),
    ...hooks,
  });
  if (last.completion) completed = last;
  return completed ?? last!;
}

describe("daily quest engine", () => {
  it("defaults to E-Rank tier with the E targets", () => {
    ensureDailyDay(
      db,
      USER,
      "2026-06-23",
      "e",
      clock("2026-06-23T08:00:00.000Z"),
    );
    const quest = getDailyQuest(db, USER, "2026-06-23")!;
    expect(quest.tier).toBe("e");
    expect(quest.metrics.find((m) => m.key === "pushups")?.target).toBe(30);
    expect(quest.metrics.find((m) => m.key === "cardio_km")?.target).toBe(2);
    expect(quest.metrics.find((m) => m.key === "pullups")?.target).toBe(10);
    expect(quest.metrics.find((m) => m.key === "lusted")?.target).toBe(1);
    expect(quest.complete).toBe(false);
  });

  it("snapshots S-Rank targets without lower-tier alternatives", () => {
    ensureDailyDay(
      db,
      USER,
      "2026-06-23",
      "e",
      clock("2026-06-23T08:00:00.000Z"),
    );
    ensureDailyDay(
      db,
      USER,
      "2026-06-23",
      "s",
      clock("2026-06-23T08:02:00.000Z"),
    );
    const quest = getDailyQuest(db, USER, "2026-06-23")!;
    expect(quest.tier).toBe("s");
    expect(quest.metrics.find((m) => m.key === "pushups")?.target).toBe(100);
    expect(quest.metrics.find((m) => m.key === "cardio_km")?.target).toBe(10);
    expect(quest.metrics.map((m) => m.key)).not.toContain("steps");
    expect(quest.metrics.map((m) => m.key)).not.toContain("mental_pages");
  });

  it("completing the full checklist awards XP, automatic stats, and a loot box once", () => {
    ensureDailyDay(
      db,
      USER,
      "2026-06-23",
      "e",
      clock("2026-06-23T08:00:00.000Z"),
    );
    const result = finishAllMetrics("2026-06-23");
    expect(result.completion).not.toBeNull();
    expect(result.completion!.xpAwarded).toBe(100);
    expect(result.completion!.newStreak).toBe(0);
    expect(result.completion!.statGains).toEqual([
      { statKey: "strength", delta: 2 },
      { statKey: "health", delta: 2 },
      { statKey: "discipline", delta: 3 },
      { statKey: "intelligence", delta: 1 },
      { statKey: "survival", delta: 1 },
    ]);
    expect(result.completion!.lootBoxes).toHaveLength(1);
    expect(result.completion!.lootBoxes[0].rarity).toBe("common");

    expect(getRankSnapshot(db, USER).totalXp).toBe(100);
    const state = getDailyState(db, USER);
    expect(state.currentStreak).toBe(0);
    expect(state.statPoints).toBe(0);
    const stats = getPlayerStats(db, USER).stats;
    expect(stats.find((stat) => stat.key === "strength")?.value).toBe(2);
    expect(stats.find((stat) => stat.key === "discipline")?.value).toBe(3);
    expect(stats.find((stat) => stat.key === "intelligence")?.value).toBe(2);
    expect(
      db
        .prepare(
          `select count(*) as n from stat_awards where source='daily_quest'`,
        )
        .get(),
    ).toEqual({ n: 6 });
    expect(getDailyQuest(db, USER, "2026-06-23")!.status).toBe("completed");
  });

  it("requires a no answer on the lust check before completion", () => {
    ensureDailyDay(
      db,
      USER,
      "2026-06-23",
      "e",
      clock("2026-06-23T08:00:00.000Z"),
    );
    for (const metric of DAILY_METRICS.filter((item) => item.key !== "lusted")) {
      const result = logDailyMetric(
        db,
        USER,
        "2026-06-23",
        metric.key,
        { progress: 1e9 },
        { clock: clock("2026-06-23T10:00:00.000Z") },
      );
      expect(result.completion).toBeNull();
    }
    expect(getDailyQuest(db, USER, "2026-06-23")!.complete).toBe(false);

    const result = logDailyLustAnswer(db, USER, "2026-06-23", false, {
      clock: clock("2026-06-23T10:05:00.000Z"),
    });
    expect(result.completion).not.toBeNull();
    expect(
      getDailyQuest(db, USER, "2026-06-23")!.metrics.find(
        (metric) => metric.key === "lusted",
      )?.done,
    ).toBe(true);
  });

  it("answering yes fails the day, resets the daily streak, and applies the penalty", () => {
    ensureDailyDay(
      db,
      USER,
      "2026-06-23",
      "e",
      clock("2026-06-23T08:00:00.000Z"),
    );
    awardXp(
      db,
      {
        userId: USER,
        amount: 100,
        reason: "test_seed",
        source: "test",
      },
      clock("2026-06-23T08:30:00.000Z"),
    );
    logDailyLustAnswer(db, USER, "2026-06-23", false, {
      clock: clock("2026-06-23T08:40:00.000Z"),
    });

    const result = logDailyLustAnswer(db, USER, "2026-06-23", true, {
      clock: clock("2026-06-23T09:00:00.000Z"),
    });

    expect(result.penalty?.xpAwarded).toBe(-DAILY_LUSTED_PENALTY_XP);
    expect(getRankSnapshot(db, USER).totalXp).toBe(50);
    expect(getDailyQuest(db, USER, "2026-06-23")!.status).toBe("failed");
    expect(getDailyState(db, USER).currentStreak).toBe(0);
    expect(getDailyState(db, USER).penaltyActive).toBe(true);
    expect(
      getPlayerStats(db, USER).stats.find((stat) => stat.key === "intelligence")
        ?.value,
    ).toBe(0);
  });

  it("advances streaks during evaluation and grants a rare box on day 7", () => {
    for (let d = 17; d <= 23; d++) {
      const date = `2026-06-${d}`;
      ensureDailyDay(db, USER, date, "e", clock(`2026-06-${d}T08:00:00.000Z`));
      finishAllMetrics(date);
      const nextDate = `2026-06-${d + 1}`;
      runDailyEvaluation(db, USER, nextDate, {
        clock: clock(`${nextDate}T00:00:00.000Z`),
      });
    }
    expect(getDailyState(db, USER).currentStreak).toBe(7);
    const rare = db
      .prepare(`select count(*) as n from loot_boxes where rarity='rare'`)
      .get() as { n: number };
    expect(rare.n).toBe(1);
  });

  it("fails a missed past day: breaks streak and raises a penalty", () => {
    // Day 1 completed.
    ensureDailyDay(
      db,
      USER,
      "2026-06-22",
      "e",
      clock("2026-06-22T08:00:00.000Z"),
    );
    finishAllMetrics("2026-06-22");
    expect(getDailyState(db, USER).currentStreak).toBe(0);
    runDailyEvaluation(db, USER, "2026-06-23", {
      clock: clock("2026-06-23T00:00:00.000Z"),
    });
    expect(getDailyState(db, USER).currentStreak).toBe(1);

    // Day 2 created but left incomplete.
    ensureDailyDay(
      db,
      USER,
      "2026-06-23",
      "e",
      clock("2026-06-23T08:00:00.000Z"),
    );

    const notifications: { type: string; title: string }[] = [];
    const evaln = runDailyEvaluation(db, USER, "2026-06-24", {
      clock: clock("2026-06-24T00:00:00.000Z"),
      notify: (i) => notifications.push(i as { type: string; title: string }),
    });
    expect(evaln.penaltyTriggered).toBe(true);
    expect(evaln.failedDates).toContain("2026-06-23");

    const state = getDailyState(db, USER);
    expect(state.currentStreak).toBe(0);
    expect(state.penaltyActive).toBe(true);
    expect(notifications.some((n) => n.type === "penalty")).toBe(true);
    // Evaluation does not create the next day; the Discord scheduler owns creation.
    expect(getDailyQuest(db, USER, "2026-06-24")).toBeNull();
  });

  it("clears the penalty when a flush is logged", () => {
    ensureDailyDay(
      db,
      USER,
      "2026-06-23",
      "e",
      clock("2026-06-23T08:00:00.000Z"),
    );
    runDailyEvaluation(db, USER, "2026-06-24", {
      clock: clock("2026-06-24T00:00:00.000Z"),
    });
    expect(getDailyState(db, USER).penaltyActive).toBe(true);

    const state = clearDailyPenalty(db, USER, "5 km recovery walk", {
      clock: clock("2026-06-24T07:00:00.000Z"),
    });
    expect(state.penaltyActive).toBe(false);
  });

  it("getDailySnapshot does not create a quest before the scheduler runs", () => {
    const snap = getDailySnapshot(
      db,
      USER,
      "2026-06-23",
      clock("2026-06-23T08:00:00.000Z"),
    );
    expect(snap.quest).toBeNull();
    expect(snap.state.statPoints).toBe(0);
    expect(snap.lootBoxes).toEqual([]);
  });
});

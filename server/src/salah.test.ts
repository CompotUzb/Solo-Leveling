import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMigrations, openDatabase, type Db } from "./db.js";
import {
  completeSalah,
  ensureSalahReminderSchedule,
  ensureSalahDay,
  fetchPrayerTimes,
  formatSalahMessage,
  formatSalahReminderTitle,
  getSalahSnapshot,
  parseSalahCompletion,
  processDueSalahReminders,
  runSalahMidnight,
} from "./salah.js";

let db: Db | undefined;
afterEach(() => db?.close());
const times = { Fajr: "04:06", Dhuhr: "12:31", Asr: "16:55", Maghrib: "19:42", Isha: "21:02" } as const;

function setup() {
  db = openDatabase(":memory:");
  applyMigrations(db);
  db.prepare("insert into users (user_id,display_name,is_player,created_at,updated_at) values ('local-user','Player',1,'now','now')").run();
  return db;
}

describe("Salah tracker", () => {
  it("fetches and validates the five AlAdhan prayer times through an injectable fetch", async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo) => ({ ok: true, json: async () => ({ code: 200, data: { timings: { ...times, Sunrise: "05:40 (+05)" } } }) }));
    const fetcher = fetchMock as unknown as typeof fetch;
    await expect(fetchPrayerTimes({ city: "Tashkent", country: "Uzbekistan", calculationMethod: 2 }, fetcher)).resolves.toEqual(times);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("timingsByCity?city=Tashkent&country=Uzbekistan&method=2");
  });

  it.each(["Fajr done", "Done fajr", "Prayed fajr", "Completed fajr", "Finished asr", "Maghrib complete", "Isha done"])("parses completion: %s", (message) => {
    expect(parseSalahCompletion(message)).not.toBeNull();
  });

  it("formats reminder system-output titles", () => {
    expect(formatSalahReminderTitle("pre5", "Fajr")).toBe("🕌 Fajr begins in 5 minutes");
    expect(formatSalahReminderTitle("start", "Fajr")).toBe("🕌 Time for Fajr");
    expect(formatSalahReminderTitle("followup", "Fajr")).toBe("⏰ Reminder: Fajr is still pending.");
  });

  it("creates persistent relative reminders and cancels them on completion", () => {
    const database = setup();
    ensureSalahDay(database, "local-user", "2026-07-11", times);
    ensureSalahReminderSchedule(database, {
      userId: "local-user",
      date: "2026-07-11",
      timezone: "Asia/Tashkent",
      now: "2026-07-10T20:00:00Z",
    });
    const reminderCount = database.prepare("select count(*) as count from salah_reminders where user_id='local-user' and date='2026-07-11'").get();
    expect(reminderCount).toEqual({ count: 51 });
    const notify = vi.fn();
    const due = processDueSalahReminders(database, {
      userId: "local-user",
      now: new Date("2026-07-10T23:07:00Z"),
      notify,
    });
    expect(due.sent).toBe(2);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "🕌 Fajr begins in 5 minutes" }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "🕌 Time for Fajr" }));
    completeSalah(database, {
      userId: "local-user",
      date: "2026-07-11",
      prayerName: "Fajr",
      discordMessageId: "fajr-done",
      now: "2026-07-11T00:05:00Z",
    });
    const pendingFajr = database.prepare("select count(*) as count from salah_reminders where user_id='local-user' and date='2026-07-11' and prayer_name='Fajr' and status='pending'").get();
    expect(pendingFajr).toEqual({ count: 0 });
  });

  it("creates one cached day and formats its schedule", () => {
    const database = setup();
    expect(ensureSalahDay(database, "local-user", "2026-07-11", times, { now: () => "2026-07-11T00:01:00Z" })).toBe(true);
    expect(ensureSalahDay(database, "local-user", "2026-07-11", times)).toBe(false);
    const snapshot = getSalahSnapshot(database, "local-user", "2026-07-11", new Date("2026-07-11T10:00:00Z"), "UTC");
    expect(snapshot.prayers).toHaveLength(5);
    expect(snapshot.completedCount).toBe(0);
    expect(formatSalahMessage(snapshot)).toContain("☐ Fajr — 04:06");
  });

  it("awards each prayer and all-five bonus exactly once", () => {
    const database = setup();
    ensureSalahDay(database, "local-user", "2026-07-11", times);
    for (const prayer of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const) {
      const result = completeSalah(database, { userId: "local-user", date: "2026-07-11", prayerName: prayer, discordMessageId: `m-${prayer}`, now: "2026-07-11T12:00:00Z" });
      expect(result.completed).toBe(true);
    }
    const duplicate = completeSalah(database, { userId: "local-user", date: "2026-07-11", prayerName: "Fajr", discordMessageId: "duplicate" });
    expect(duplicate).toMatchObject({ completed: false, duplicate: true, xpAwarded: 0, disciplineAwarded: 0 });
    expect(getSalahSnapshot(database, "local-user", "2026-07-11")).toMatchObject({ completedCount: 5, totalCount: 5, complete: true });
    expect(database.prepare("select total_xp from rank_snapshots where user_id='local-user'").get()).toEqual({ total_xp: 50 });
    expect(database.prepare("select value from player_stats where user_id='local-user' and stat_key='discipline'").get()).toEqual({ value: 7 });
  });

  it("maintains an independent streak and midnight workflow idempotently", async () => {
    const database = setup();
    ensureSalahDay(database, "local-user", "2026-07-10", times);
    for (const prayer of Object.keys(times)) completeSalah(database, { userId: "local-user", date: "2026-07-10", prayerName: prayer as keyof typeof times, discordMessageId: `old-${prayer}` });
    const publish = vi.fn(async () => ({ threadId: "thread-11", parentMessageId: "message-11", threadName: "Day-2" }));
    const fetchTimes = vi.fn(async () => times);
    await runSalahMidnight({ db: database, userId: "local-user", date: "2026-07-11", fetchTimes, publish });
    await runSalahMidnight({ db: database, userId: "local-user", date: "2026-07-11", fetchTimes, publish });
    expect(fetchTimes).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
    expect(getSalahSnapshot(database, "local-user", "2026-07-11").streak).toMatchObject({ current: 1, longest: 1 });
    expect(database.prepare("select archived from salah_days where local_date='2026-07-10'").get()).toEqual({ archived: 1 });
  });
});

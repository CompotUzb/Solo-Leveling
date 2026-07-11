import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { awardXp } from "./xp.js";
import { applyStatGains } from "./stats.js";

export const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
export type PrayerName = (typeof PRAYER_NAMES)[number];
export type PrayerTimes = Record<PrayerName, string>;
export type SalahReminderKind = "pre5" | "start" | "late15" | "late30" | "followup";

export interface PrayerApiConfig {
  city: string;
  country: string;
  calculationMethod: number;
}

export interface SalahReminderView {
  prayerName: PrayerName;
  kind: SalahReminderKind;
  scheduledAt: string;
  secondsUntil: number;
}

export interface SalahSnapshot {
  date: string;
  prayers: Array<{
    name: PrayerName;
    scheduledTime: string;
    completed: boolean;
    completedAt: string | null;
  }>;
  completedCount: number;
  totalCount: number;
  percent: number;
  complete: boolean;
  currentPrayer: {
    name: PrayerName;
    scheduledTime: string;
    completed: boolean;
    status: "pending" | "complete";
  } | null;
  nextPrayer: { name: PrayerName; scheduledTime: string; minutesRemaining: number } | null;
  remainingCount: number;
  nextReminder: SalahReminderView | null;
  streak: { current: number; longest: number };
  threadId: string | null;
}

export interface SalahPublisher {
  publish(input: { channelId: string; threadName: string; content: string }): Promise<{
    parentMessageId: string;
    threadId: string;
    threadName: string;
  }>;
}

type NotifyInput = {
  userId: string;
  type: "system";
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function localClockMinutes(now: Date, timezone: string): number {
  const currentParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  return (
    Number(currentParts.find((part) => part.type === "hour")?.value ?? 0) * 60 +
    Number(currentParts.find((part) => part.type === "minute")?.value ?? 0)
  );
}

function zonedDateTimeToUtc(localDate: string, time: string, timezone: string): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  return new Date(guess.getTime() - (asIfUtc - desired));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function reminderId(input: { userId: string; date: string; prayerName: PrayerName; kind: SalahReminderKind; scheduledAt: string }) {
  return `${input.userId}:${input.date}:${input.prayerName}:${input.kind}:${input.scheduledAt}`;
}

export async function fetchPrayerTimes(
  config: PrayerApiConfig,
  fetcher: typeof fetch = fetch,
): Promise<PrayerTimes> {
  const query = new URLSearchParams({
    city: config.city,
    country: config.country,
    method: String(config.calculationMethod),
  });
  const response = await fetcher(`https://api.aladhan.com/v1/timingsByCity?${query}`);
  if (!response.ok) throw new Error(`AlAdhan request failed (${response.status})`);
  const payload = (await response.json()) as {
    code?: number;
    data?: { timings?: Record<string, string> };
  };
  if (payload.code !== 200 || !payload.data?.timings)
    throw new Error("AlAdhan returned an invalid response");
  return Object.fromEntries(
    PRAYER_NAMES.map((name) => {
      const value = payload.data!.timings![name]?.match(/\d{2}:\d{2}/)?.[0] ?? "";
      if (!timePattern.test(value)) throw new Error(`AlAdhan omitted ${name}`);
      return [name, value];
    }),
  ) as PrayerTimes;
}

export function parseSalahCompletion(content: string): PrayerName | null {
  const normalized = content.trim().toLowerCase().replace(/\s+/g, " ");
  for (const prayer of PRAYER_NAMES) {
    const name = prayer.toLowerCase();
    if (
      new RegExp(
        `^(?:${name}\\s+(?:done|complete|completed|finished|prayed)|(?:done|prayed|completed|finished)\\s+${name})$`,
        "i",
      ).test(normalized)
    )
      return prayer;
  }
  return null;
}

export function ensureSalahDay(
  db: Db,
  userId: string,
  date: string,
  times: PrayerTimes,
  clock: { now?: () => string; genId?: () => string } = {},
): boolean {
  const now = clock.now?.() ?? new Date().toISOString();
  const genId = clock.genId ?? randomUUID;
  return db.transaction(() => {
    const inserted = db
      .prepare(
        `insert or ignore into salah_days (user_id,local_date,created_at,updated_at) values (?,?,?,?)`,
      )
      .run(userId, date, now, now);
    if (!inserted.changes) return false;
    const statement = db.prepare(
      `insert into daily_salah (id,user_id,date,prayer_name,scheduled_time,created_at,updated_at) values (?,?,?,?,?,?,?)`,
    );
    for (const prayer of PRAYER_NAMES) statement.run(genId(), userId, date, prayer, times[prayer], now, now);
    return true;
  })();
}

function evaluatePriorDays(db: Db, userId: string, beforeDate: string, now: string) {
  const days = db
    .prepare(
      `select d.local_date, count(s.id) total, sum(s.completed) completed
       from salah_days d
       join daily_salah s on s.user_id=d.user_id and s.date=d.local_date
       where d.user_id=? and d.local_date<? and d.evaluated=0
       group by d.local_date order by d.local_date`,
    )
    .all(userId, beforeDate) as { local_date: string; total: number; completed: number }[];
  for (const day of days) {
    const state = db
      .prepare(`select current_streak,longest_streak from salah_state where user_id=?`)
      .get(userId) as { current_streak: number; longest_streak: number } | undefined;
    const current = day.total === 5 && day.completed === 5 ? (state?.current_streak ?? 0) + 1 : 0;
    const longest = Math.max(state?.longest_streak ?? 0, current);
    db.prepare(
      `insert into salah_state (user_id,current_streak,longest_streak,last_evaluated_date,updated_at)
       values (?,?,?,?,?)
       on conflict(user_id) do update set current_streak=excluded.current_streak,longest_streak=excluded.longest_streak,last_evaluated_date=excluded.last_evaluated_date,updated_at=excluded.updated_at`,
    ).run(userId, current, longest, day.local_date, now);
    db.prepare(`update salah_days set evaluated=1,archived=1,updated_at=? where user_id=? and local_date=?`).run(
      now,
      userId,
      day.local_date,
    );
  }
}

function insertReminder(
  db: Db,
  input: { userId: string; date: string; prayerName: PrayerName; kind: SalahReminderKind; scheduledAt: string; now: string },
) {
  db.prepare(
    `insert or ignore into salah_reminders (id,user_id,date,prayer_name,reminder_kind,scheduled_at,status,created_at,updated_at)
     values (?,?,?,?,?,?,'pending',?,?)`,
  ).run(
    reminderId(input),
    input.userId,
    input.date,
    input.prayerName,
    input.kind,
    input.scheduledAt,
    input.now,
    input.now,
  );
}

export function ensureSalahReminderSchedule(
  db: Db,
  input: { userId: string; date: string; timezone: string; now?: string },
): void {
  const now = input.now ?? new Date().toISOString();
  const rows = db
    .prepare(
      `select prayer_name,scheduled_time from daily_salah
       where user_id=? and date=?
       order by case prayer_name when 'Fajr' then 1 when 'Dhuhr' then 2 when 'Asr' then 3 when 'Maghrib' then 4 else 5 end`,
    )
    .all(input.userId, input.date) as { prayer_name: PrayerName; scheduled_time: string }[];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const start = zonedDateTimeToUtc(input.date, row.scheduled_time, input.timezone);
    const next = rows[index + 1]
      ? zonedDateTimeToUtc(input.date, rows[index + 1].scheduled_time, input.timezone)
      : zonedDateTimeToUtc(input.date, "23:59", input.timezone);
    const offsets: Array<{ minutes: number; kind: SalahReminderKind }> = [
      { minutes: -5, kind: "pre5" },
      { minutes: 0, kind: "start" },
      { minutes: 15, kind: "late15" },
      { minutes: 30, kind: "late30" },
    ];
    for (let minutes = 60; addMinutes(start, minutes).getTime() < next.getTime(); minutes += 30) {
      offsets.push({ minutes, kind: "followup" });
    }
    for (const reminder of offsets) {
      const scheduled = addMinutes(start, reminder.minutes);
      if (scheduled.getTime() < next.getTime()) {
        insertReminder(db, {
          userId: input.userId,
          date: input.date,
          prayerName: row.prayer_name,
          kind: reminder.kind,
          scheduledAt: scheduled.toISOString(),
          now,
        });
      }
    }
  }
}

function cancelPendingReminders(
  db: Db,
  input: { userId: string; date: string; prayerName: PrayerName; now: string },
) {
  db.prepare(
    `update salah_reminders set status='cancelled',cancelled_at=?,updated_at=?
     where user_id=? and date=? and prayer_name=? and status='pending'`,
  ).run(input.now, input.now, input.userId, input.date, input.prayerName);
}

function nextPendingReminder(
  db: Db,
  userId: string,
  date: string,
  now: Date,
): SalahReminderView | null {
  const row = db
    .prepare(
      `select r.prayer_name,r.reminder_kind,r.scheduled_at
       from salah_reminders r
       join daily_salah s on s.user_id=r.user_id and s.date=r.date and s.prayer_name=r.prayer_name
       where r.user_id=? and r.date=? and r.status='pending' and s.completed=0 and r.scheduled_at>?
       order by r.scheduled_at limit 1`,
    )
    .get(userId, date, now.toISOString()) as
    | { prayer_name: PrayerName; reminder_kind: SalahReminderKind; scheduled_at: string }
    | undefined;
  if (!row) return null;
  return {
    prayerName: row.prayer_name,
    kind: row.reminder_kind,
    scheduledAt: row.scheduled_at,
    secondsUntil: Math.max(0, Math.floor((Date.parse(row.scheduled_at) - now.getTime()) / 1000)),
  };
}

export function getNextSalahReminderDueAt(db: Db, userId: string, now = new Date()): string | null {
  const row = db
    .prepare(
      `select r.scheduled_at
       from salah_reminders r
       join daily_salah s on s.user_id=r.user_id and s.date=r.date and s.prayer_name=r.prayer_name
       where r.user_id=? and r.status='pending' and s.completed=0 and r.scheduled_at>?
       order by r.scheduled_at limit 1`,
    )
    .get(userId, now.toISOString()) as { scheduled_at: string } | undefined;
  return row?.scheduled_at ?? null;
}

export function getSalahSnapshot(
  db: Db,
  userId: string,
  date: string,
  now = new Date(),
  timezone = "UTC",
): SalahSnapshot {
  const rows = db
    .prepare(
      `select prayer_name,scheduled_time,completed,completed_at,thread_id from daily_salah
       where user_id=? and date=?
       order by case prayer_name when 'Fajr' then 1 when 'Dhuhr' then 2 when 'Asr' then 3 when 'Maghrib' then 4 else 5 end`,
    )
    .all(userId, date) as Array<{
    prayer_name: PrayerName;
    scheduled_time: string;
    completed: number;
    completed_at: string | null;
    thread_id: string | null;
  }>;
  const minutes = localClockMinutes(now, timezone);
  const upcoming = rows.find((row) => parseTimeToMinutes(row.scheduled_time) > minutes);
  const current = [...rows].reverse().find((row) => parseTimeToMinutes(row.scheduled_time) <= minutes) ?? null;
  const state = db
    .prepare(`select current_streak,longest_streak from salah_state where user_id=?`)
    .get(userId) as { current_streak: number; longest_streak: number } | undefined;
  const completedCount = rows.filter((row) => row.completed).length;
  return {
    date,
    prayers: rows.map((row) => ({
      name: row.prayer_name,
      scheduledTime: row.scheduled_time,
      completed: Boolean(row.completed),
      completedAt: row.completed_at,
    })),
    completedCount,
    totalCount: rows.length,
    percent: rows.length ? Math.round((completedCount / rows.length) * 100) : 0,
    complete: rows.length === 5 && completedCount === 5,
    currentPrayer: current
      ? {
          name: current.prayer_name,
          scheduledTime: current.scheduled_time,
          completed: Boolean(current.completed),
          status: current.completed ? "complete" : "pending",
        }
      : null,
    nextPrayer: upcoming
      ? {
          name: upcoming.prayer_name,
          scheduledTime: upcoming.scheduled_time,
          minutesRemaining: parseTimeToMinutes(upcoming.scheduled_time) - minutes,
        }
      : null,
    remainingCount: rows.length - completedCount,
    nextReminder: nextPendingReminder(db, userId, date, now),
    streak: { current: state?.current_streak ?? 0, longest: state?.longest_streak ?? 0 },
    threadId: rows[0]?.thread_id ?? null,
  };
}

export function completeSalah(
  db: Db,
  input: { userId: string; date: string; prayerName: PrayerName; discordMessageId: string; now?: string },
) {
  const now = input.now ?? new Date().toISOString();
  return db.transaction(() => {
    const changed = db
      .prepare(
        `update daily_salah set completed=1,completed_at=?,discord_message_id=?,updated_at=?
         where user_id=? and date=? and prayer_name=? and completed=0`,
      )
      .run(now, input.discordMessageId, now, input.userId, input.date, input.prayerName);
    if (!changed.changes) {
      const snapshot = getSalahSnapshot(db, input.userId, input.date);
      return {
        completed: false,
        duplicate: true,
        allCompleted: snapshot.complete,
        completedCount: snapshot.completedCount,
        totalCount: snapshot.totalCount,
        xpAwarded: 0,
        disciplineAwarded: 0,
      };
    }
    cancelPendingReminders(db, { userId: input.userId, date: input.date, prayerName: input.prayerName, now });
    awardXp(
      db,
      { userId: input.userId, amount: 5, reason: `${input.prayerName} completed`, source: "salah", sourceId: `${input.date}:${input.prayerName}` },
      { now: () => now },
    );
    applyStatGains(
      db,
      { userId: input.userId, gains: [{ statKey: "discipline", delta: 1 }], reason: "salah_completed", source: "salah", sourceId: `${input.date}:${input.prayerName}` },
      { now: () => now },
    );
    const snapshot = getSalahSnapshot(db, input.userId, input.date);
    let bonusXp = 0;
    let bonusDiscipline = 0;
    if (snapshot.complete) {
      const bonus = db
        .prepare(`update salah_days set all_rewards_granted=1,updated_at=? where user_id=? and local_date=? and all_rewards_granted=0`)
        .run(now, input.userId, input.date);
      if (bonus.changes) {
        awardXp(
          db,
          { userId: input.userId, amount: 25, reason: "Daily Salah Completed", source: "salah", sourceId: `${input.date}:bonus` },
          { now: () => now },
        );
        applyStatGains(
          db,
          { userId: input.userId, gains: [{ statKey: "discipline", delta: 2 }], reason: "daily_salah_completed", source: "salah", sourceId: `${input.date}:bonus` },
          { now: () => now },
        );
        bonusXp = 25;
        bonusDiscipline = 2;
      }
    }
    return {
      completed: true,
      duplicate: false,
      allCompleted: snapshot.complete,
      completedCount: snapshot.completedCount,
      totalCount: snapshot.totalCount,
      xpAwarded: 5 + bonusXp,
      disciplineAwarded: 1 + bonusDiscipline,
    };
  })();
}

export function recordSalahThreadMessage(
  db: Db,
  input: { userId: string; threadId: string; date: string; content: string; discordMessageId: string; now?: string },
) {
  const day = db
    .prepare(`select 1 from salah_days where user_id=? and local_date=? and thread_id=? and archived=0`)
    .get(input.userId, input.date, input.threadId);
  const prayerName = parseSalahCompletion(input.content);
  if (!day || !prayerName) return { accepted: false, prayerName, result: null };
  return {
    accepted: true,
    prayerName,
    result: completeSalah(db, {
      userId: input.userId,
      date: input.date,
      prayerName,
      discordMessageId: input.discordMessageId,
      now: input.now,
    }),
  };
}

export function formatSalahMessage(snapshot: SalahSnapshot): string {
  return [
    "**🕌 Daily Salah**",
    "",
    "Today's Prayer Schedule",
    ...snapshot.prayers.map((prayer) => `${prayer.completed ? "☑" : "☐"} ${prayer.name} — ${prayer.scheduledTime}`),
    "",
    "Reply in this thread after completing each prayer.",
  ].join("\n");
}

export async function createSalahForDate(input: {
  db: Db;
  userId: string;
  localDate: string;
  channelId: string;
  publisher: SalahPublisher;
  apiConfig?: PrayerApiConfig;
  config?: { salahCity: string; salahCountry: string; salahCalculationMethod: number; timezone?: string };
  fetcher?: typeof fetch;
  ensurePublished?: boolean;
}) {
  const apiConfig = input.apiConfig ?? {
    city: input.config!.salahCity,
    country: input.config!.salahCountry,
    calculationMethod: input.config!.salahCalculationMethod,
  };
  const result = await runSalahMidnight({
    db: input.db,
    userId: input.userId,
    date: input.localDate,
    channelId: input.channelId,
    fetchTimes: () => fetchPrayerTimes(apiConfig, input.fetcher),
    publish: input.publisher.publish.bind(input.publisher),
    timezone: input.config?.timezone,
  });
  const snapshot = result.snapshot;
  return {
    ...result,
    day: {
      date: snapshot.date,
      threadId: snapshot.threadId,
      threadName: snapshot.threadId ? `Day-${snapshot.streak.current + 1}` : null,
    },
  };
}

export function runSalahEvaluation(
  db: Db,
  userId: string,
  today: string,
  hooks?: { notify?: (input: NotifyInput) => unknown },
) {
  const before = db
    .prepare(`select current_streak from salah_state where user_id=?`)
    .get(userId) as { current_streak: number } | undefined;
  evaluatePriorDays(db, userId, today, new Date().toISOString());
  const after = db
    .prepare(`select current_streak,longest_streak from salah_state where user_id=?`)
    .get(userId) as { current_streak: number; longest_streak: number } | undefined;
  if (after?.current_streak && after.current_streak !== before?.current_streak && after.current_streak % 7 === 0) {
    hooks?.notify?.({ userId, type: "system", title: `🔥 ${after.current_streak}-Day Salah Streak` });
  }
  return after ?? { current_streak: 0, longest_streak: 0 };
}

export function formatSalahCompletionReply(
  prayer: PrayerName,
  allCompleted = false,
  progress?: { completedCount: number; totalCount: number },
): string {
  const lines = [`✅ ${prayer} completed.`];
  if (progress) lines.push(`🔥 Today's Salah Progress: ${progress.completedCount}/${progress.totalCount}`);
  if (allCompleted) lines.push("🎉 All five prayers completed.");
  return lines.join("\n");
}

export function formatSalahReminderTitle(kind: SalahReminderKind, prayerName: PrayerName): string {
  if (kind === "pre5") return `🕌 ${prayerName} begins in 5 minutes`;
  if (kind === "start") return `🕌 Time for ${prayerName}`;
  return `⏰ Reminder: ${prayerName} is still pending.`;
}

export function processDueSalahReminders(
  db: Db,
  input: {
    userId: string;
    now?: Date;
    notify?: (input: NotifyInput) => unknown;
    onSent?: (reminder: { prayerName: PrayerName; kind: SalahReminderKind; scheduledAt: string }) => unknown;
  },
) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const due = db
    .prepare(
      `select r.id,r.date,r.prayer_name,r.reminder_kind,r.scheduled_at,s.completed
       from salah_reminders r
       join daily_salah s on s.user_id=r.user_id and s.date=r.date and s.prayer_name=r.prayer_name
       where r.user_id=? and r.status='pending' and r.scheduled_at<=?
       order by r.scheduled_at limit 50`,
    )
    .all(input.userId, nowIso) as Array<{
    id: string;
    date: string;
    prayer_name: PrayerName;
    reminder_kind: SalahReminderKind;
    scheduled_at: string;
    completed: number;
  }>;
  let sent = 0;
  let cancelled = 0;
  for (const reminder of due) {
    if (reminder.completed) {
      db.prepare(`update salah_reminders set status='cancelled',cancelled_at=?,updated_at=? where id=? and status='pending'`).run(
        nowIso,
        nowIso,
        reminder.id,
      );
      cancelled += 1;
      continue;
    }
    const changed = db
      .prepare(`update salah_reminders set status='sent',sent_at=?,updated_at=? where id=? and status='pending'`)
      .run(nowIso, nowIso, reminder.id);
    if (!changed.changes) continue;
    sent += 1;
    input.notify?.({
      userId: input.userId,
      type: "system",
      title: formatSalahReminderTitle(reminder.reminder_kind, reminder.prayer_name),
      metadata: {
        source: "salah_reminder",
        date: reminder.date,
        prayerName: reminder.prayer_name,
        reminderKind: reminder.reminder_kind,
        scheduledAt: reminder.scheduled_at,
      },
    });
    input.onSent?.({
      prayerName: reminder.prayer_name,
      kind: reminder.reminder_kind,
      scheduledAt: reminder.scheduled_at,
    });
  }
  return { sent, cancelled, processed: due.length };
}

export async function runSalahMidnight(input: {
  db: Db;
  userId: string;
  date: string;
  channelId?: string;
  fetchTimes: () => Promise<PrayerTimes>;
  publish?: SalahPublisher["publish"];
  now?: string;
  timezone?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  evaluatePriorDays(input.db, input.userId, input.date, now);
  const exists = input.db
    .prepare(`select thread_id from salah_days where user_id=? and local_date=?`)
    .get(input.userId, input.date) as { thread_id: string | null } | undefined;
  if (exists?.thread_id) {
    ensureSalahReminderSchedule(input.db, {
      userId: input.userId,
      date: input.date,
      timezone: input.timezone ?? "UTC",
      now,
    });
    return { created: false, snapshot: getSalahSnapshot(input.db, input.userId, input.date, new Date(now), input.timezone) };
  }
  if (!exists) ensureSalahDay(input.db, input.userId, input.date, await input.fetchTimes(), { now: () => now });
  ensureSalahReminderSchedule(input.db, {
    userId: input.userId,
    date: input.date,
    timezone: input.timezone ?? "UTC",
    now,
  });
  const snapshot = getSalahSnapshot(input.db, input.userId, input.date, new Date(now), input.timezone);
  if (input.publish) {
    const published = await input.publish({
      channelId: input.channelId ?? "",
      threadName: `Day-${snapshot.streak.current + 1}`,
      content: formatSalahMessage(snapshot),
    });
    input.db
      .prepare(`update salah_days set thread_id=?,discord_message_id=?,updated_at=? where user_id=? and local_date=?`)
      .run(published.threadId, published.parentMessageId, now, input.userId, input.date);
    input.db
      .prepare(`update daily_salah set thread_id=?,updated_at=? where user_id=? and date=?`)
      .run(published.threadId, now, input.userId, input.date);
  }
  return { created: true, snapshot: getSalahSnapshot(input.db, input.userId, input.date, new Date(now), input.timezone) };
}

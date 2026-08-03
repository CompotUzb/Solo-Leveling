import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

function findRepoRoot(start = process.cwd()): string {
  let current = path.resolve(start);

  while (true) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml")))
      return current;

    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

function loadDotEnv(): string {
  const repoRoot = findRepoRoot();
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.local"),
  ];

  const envFile = candidates.find((candidate) => fs.existsSync(candidate));
  if (envFile) dotenv.config({ path: envFile });

  return envFile ? path.dirname(envFile) : repoRoot;
}

const envBaseDir = loadDotEnv();

const envBoolean = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off", ""].includes(normalized)) return false;

  return value;
}, z.boolean());

// Optional env strings load from env only; an empty value disables the feature. A value
// left as the .env.example placeholder is treated as unset so a freshly copied env file
// does not accidentally track a fake channel or install a guessable auth token.
const optionalEnvString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("replace_with_")) return undefined;
  return trimmed;
}, z.string().min(1).optional());

const optionalChannelId = optionalEnvString;

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DATABASE_PATH: z.string().default("./data/solo-leveling.sqlite"),
  TRACKED_GUILD_ID: z.string().min(1),
  TRACKED_CHANNEL_IDS: z.string().min(1),
  COMMANDS_CHANNEL_ID: optionalChannelId,
  DAILY_QUESTS_CHANNEL_ID: optionalChannelId,
  SALAH_CHANNEL_ID: optionalChannelId,
  MIND_TRAINING_CHANNEL_ID: optionalChannelId,
  BODY_TRAINING_CHANNEL_ID: optionalChannelId,
  WORK_SKILL_CHANNEL_ID: optionalChannelId,
  SYSTEM_OUTPUT_CHANNEL_ID: optionalChannelId,
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(3333),
  // Optional shared secret. Unset (the local-first default) leaves the API open, which is
  // fine on 127.0.0.1. Any host reachable from outside the machine should set it.
  API_AUTH_TOKEN: optionalEnvString,
  // Comma-separated origin allowlist for browser clients. Empty means "reflect the request
  // origin", which is the permissive local-dev default.
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  STORE_MESSAGE_CONTENT: envBoolean.default(false),
  CONTENT_MAX_CHARS: z.coerce.number().int().min(0).default(0),
  TIMEZONE: z
    .string()
    .default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  DAILY_QUEST_CREATE_TIME: localTime.default("06:00"),
  DAILY_EVALUATION_TIME: localTime.default("00:00"),
  DAILY_QUEST_TIER_OVERRIDE: z.coerce.number().int().min(1).max(3).optional(),
  ENABLE_SALAH_TRACKER: envBoolean.default(true),
  CITY: z.string().default("Tashkent"),
  COUNTRY: z.string().default("Uzbekistan"),
  CALCULATION_METHOD: z.coerce.number().int().positive().default(2),
  AI_MAIN_QUEST_ENABLED: envBoolean.default(false),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SKIP_DISCORD_LOGIN: envBoolean.default(false),
});

/** Channel categories that map Discord activity to player stats. */
export type ChannelCategory =
  "daily-quests" | "mind-training" | "body-training" | "work-skill";

export type AppConfig = ReturnType<typeof loadConfig>;

function resolveDatabasePath(databasePath: string): string {
  if (databasePath === ":memory:" || path.isAbsolute(databasePath))
    return databasePath;
  return path.resolve(envBaseDir, databasePath);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse({
    ...env,
    API_PORT: env.API_PORT ?? env.PORT,
  });

  // Map the named input channels to their stat category. The command channel and the
  // system-output channel are intentionally excluded — they are not tracked for stats.
  const channelCategories: Record<string, ChannelCategory> = {};
  const addCategory = (id: string | undefined, category: ChannelCategory) => {
    if (id) channelCategories[id] = category;
  };
  addCategory(parsed.DAILY_QUESTS_CHANNEL_ID, "daily-quests");
  addCategory(parsed.MIND_TRAINING_CHANNEL_ID, "mind-training");
  addCategory(parsed.BODY_TRAINING_CHANNEL_ID, "body-training");
  addCategory(parsed.WORK_SKILL_CHANNEL_ID, "work-skill");

  // The tracked whitelist is the legacy list plus every configured stat channel,
  // de-duplicated while preserving order.
  const trackedChannelIds = [
    ...parsed.TRACKED_CHANNEL_IDS.split(",").map((id) => id.trim()),
    ...Object.keys(channelCategories),
    parsed.SALAH_CHANNEL_ID,
  ].filter(Boolean);
  const uniqueTrackedChannelIds = [...new Set(trackedChannelIds)];

  if (!uniqueTrackedChannelIds.length) {
    throw new Error("TRACKED_CHANNEL_IDS must include at least one channel ID");
  }

  return {
    discordToken: parsed.DISCORD_TOKEN,
    discordClientId: parsed.DISCORD_CLIENT_ID,
    databasePath: resolveDatabasePath(parsed.DATABASE_PATH),
    trackedGuildId: parsed.TRACKED_GUILD_ID,
    trackedChannelIds: uniqueTrackedChannelIds,
    channelCategories,
    commandsChannelId: parsed.COMMANDS_CHANNEL_ID ?? null,
    dailyQuestsChannelId: parsed.DAILY_QUESTS_CHANNEL_ID ?? null,
    salahChannelId: parsed.SALAH_CHANNEL_ID ?? null,
    systemOutputChannelId: parsed.SYSTEM_OUTPUT_CHANNEL_ID ?? null,
    apiHost: parsed.API_HOST,
    apiPort: parsed.API_PORT,
    apiAuthToken: parsed.API_AUTH_TOKEN ?? null,
    corsAllowedOrigins: parsed.CORS_ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    // Tests build a config from an explicit env object that rarely carries NODE_ENV, so the
    // ambient value (vitest sets NODE_ENV=test) is also consulted. This only picks a default
    // log level; an explicit LOG_LEVEL always wins.
    logLevel:
      parsed.LOG_LEVEL ??
      (parsed.NODE_ENV === "test" || process.env.NODE_ENV === "test"
        ? "silent"
        : "info"),
    storeMessageContent: parsed.STORE_MESSAGE_CONTENT,
    contentMaxChars: parsed.STORE_MESSAGE_CONTENT
      ? Math.max(parsed.CONTENT_MAX_CHARS, 1)
      : 0,
    timezone: parsed.TIMEZONE,
    dailyQuestCreateTime: parsed.DAILY_QUEST_CREATE_TIME,
    dailyEvaluationTime: parsed.DAILY_EVALUATION_TIME,
    dailyQuestTierOverride:
      parsed.NODE_ENV === "production"
        ? null
        : (parsed.DAILY_QUEST_TIER_OVERRIDE ?? null),
    enableSalahTracker: parsed.ENABLE_SALAH_TRACKER,
    salahCity: parsed.CITY.trim() || "Tashkent",
    salahCountry: parsed.COUNTRY.trim() || "Uzbekistan",
    salahCalculationMethod: parsed.CALCULATION_METHOD,
    aiMainQuestEnabled: parsed.AI_MAIN_QUEST_ENABLED,
    openAiApiKey: parsed.OPENAI_API_KEY.trim(),
    openAiModel: parsed.OPENAI_MODEL,
    skipDiscordLogin: parsed.SKIP_DISCORD_LOGIN,
  };
}

export function publicConfig(config: AppConfig) {
  return {
    guildId: config.trackedGuildId,
    trackedChannelIds: config.trackedChannelIds,
    channelCategories: config.channelCategories,
    systemOutputConfigured: config.systemOutputChannelId != null,
    dailyQuestsConfigured: config.dailyQuestsChannelId != null,
    salahConfigured: config.salahChannelId != null,
    salahEnabled: config.enableSalahTracker,
    storeMessageContent: config.storeMessageContent,
    apiPort: config.apiPort,
    // `databasePath` is deliberately omitted: it is an absolute server filesystem path and
    // this endpoint is reachable without auth. `pnpm app doctor` reports it locally instead.
    authRequired: config.apiAuthToken != null,
    timezone: config.timezone,
    dailyQuestCreateTime: config.dailyQuestCreateTime,
    dailyEvaluationTime: config.dailyEvaluationTime,
  };
}

import { loadConfig } from "./config.js";
import {
  migrate,
  loadTrackedBoundary,
  openDatabase,
  storeRawMessage,
  SEED_USER_ID,
} from "./db.js";
import { createApi, type DiscordStatus } from "./api.js";
import {
  createDiscordClient,
  createChannelMessageSender,
  createDailyQuestPublisher,
  createSalahPublisher,
  resolveDailyQuestChannel,
  resolveSalahChannel,
  replyInChunks,
} from "./bot.js";
import { createNotifier } from "./notifications.js";
import { getRankSnapshot } from "./xp.js";
import { awardMessageStats } from "./stats.js";
import { getDailyQuest, runDailyEvaluation } from "./dailyQuests.js";
import {
  createDailyQuestForDate,
  formatDailyCompletionReply,
  formatDailyLustPenaltyReply,
  formatDailyQuestMessage,
  getActiveDailyQuestByThread,
  hasReachedLocalTime,
  localDateFor,
  millisecondsUntilLocalTime,
  recordDailyThreadMessage,
  type DailyQuestPublisher,
} from "./dailyWorkflow.js";
import {
  createSalahForDate,
  formatSalahCompletionReply,
  recordSalahThreadMessage,
  runSalahEvaluation,
  type SalahPublisher,
} from "./salah.js";
import { buildDailySummary, buildWeeklySummary } from "./summaries.js";
import { suggestMainQuestDraft } from "./mainQuestAi.js";
import { createMainQuestCommandHandler } from "./mainQuestCommands.js";

async function main() {
  const config = loadConfig();
  migrate(config);
  const db = openDatabase(config.databasePath);
  const boundary = loadTrackedBoundary(config);
  let discordStatus: DiscordStatus = config.skipDiscordLogin
    ? "skipped"
    : "disconnected";

  // Notifications are always stored locally. Discord delivery is enabled only when a
  // system-output channel is configured and Discord login is active; otherwise the app
  // stays healthy in dashboard-only notification mode.
  if (config.systemOutputChannelId == null) {
    console.log(
      "Discord notifications skipped: SYSTEM_OUTPUT_CHANNEL_ID not configured.",
    );
  }
  const deliveryEnabled =
    !config.skipDiscordLogin && config.systemOutputChannelId != null;
  let broadcast: (event: string, data: unknown) => void = () => {};
  let systemSend: ((message: string) => Promise<string | null>) | null = null;
  const notifier = createNotifier({
    db,
    send: deliveryEnabled
      ? (message) => (systemSend ? systemSend(message) : Promise.resolve(null))
      : null,
    onStored: (record) =>
      broadcast("notification", {
        id: record.id,
        type: record.type,
        title: record.title,
        createdAt: record.createdAt,
      }),
    onError: (error) =>
      console.error(
        "notification delivery failed:",
        error instanceof Error ? error.message : error,
      ),
  });

  const api = createApi({
    config,
    db,
    notifier,
    discordStatus: () => discordStatus,
  });
  broadcast = api.broadcast;
  const mainQuestCommands = createMainQuestCommandHandler({
    db,
    notifier,
    ai: {
      suggest: (goal) =>
        suggestMainQuestDraft({
          goal,
          config: {
            enabled: config.aiMainQuestEnabled,
            apiKey: config.openAiApiKey,
            model: config.openAiModel,
          },
        }),
    },
    onChanged: (event, data) => api.broadcast(event, data),
  });

  const publishSummary = (kind: "today" | "week") => {
    const { input } =
      kind === "today"
        ? buildDailySummary(db, SEED_USER_ID, config.timezone)
        : buildWeeklySummary(db, SEED_USER_ID, config.timezone);
    notifier.notify({
      ...input,
      metadata: { ...input.metadata, source: "discord_command" },
    });
  };

  // Finalize overdue days on startup, then at the configured local evaluation time.
  const runDailyEval = () => {
    try {
      const today = localDateFor(new Date(), config.timezone);
      const result = runDailyEvaluation(db, SEED_USER_ID, today, {
        notify: (input) => notifier.notify(input),
      });
      api.broadcast("daily.updated", {
        userId: SEED_USER_ID,
        reason: "scheduled",
      });
      if (result.penaltyTriggered)
        api.broadcast("notification", {
          type: "penalty",
          userId: SEED_USER_ID,
          title: "PENALTY ZONE ACTIVE",
        });
    } catch (error) {
      console.error(
        "daily evaluation failed:",
        error instanceof Error ? error.message : error,
      );
    }
  };
  runDailyEval();
  const runSalahEval = () => {
    if (!config.enableSalahTracker) return;
    try {
      const today = localDateFor(new Date(), config.timezone);
      runSalahEvaluation(db, SEED_USER_ID, today, {
        notify: (input) => notifier.notify(input),
      });
      api.broadcast("salah.updated", { userId: SEED_USER_ID, reason: "scheduled" });
    } catch (error) {
      console.error(
        "salah evaluation failed:",
        error instanceof Error ? error.message : error,
      );
    }
  };
  runSalahEval();
  const scheduleEvaluation = () => {
    setTimeout(
      () => {
        runDailyEval();
        runSalahEval();
        scheduleEvaluation();
      },
      millisecondsUntilLocalTime(
        new Date(),
        config.timezone,
        config.dailyEvaluationTime,
      ),
    ).unref();
  };
  scheduleEvaluation();

  if (!config.skipDiscordLogin) {
    let dailyPublisher: DailyQuestPublisher | null = null;
    let salahPublisher: SalahPublisher | null = null;
    let dailyQuestsChannelId =
      config.dailyQuestsChannelId &&
      config.dailyQuestsChannelId !== config.commandsChannelId
        ? config.dailyQuestsChannelId
        : null;
    let salahChannelId =
      config.salahChannelId && config.salahChannelId !== config.commandsChannelId
        ? config.salahChannelId
        : null;
    let resolveDailyQuestsChannel: (() => Promise<string>) | null = null;
    let resolveSalahChannelId: (() => Promise<string>) | null = null;
    const runDailyCreate = async (force = false) => {
      if (!dailyPublisher) return null;
      if (!dailyQuestsChannelId) {
        if (!resolveDailyQuestsChannel) return null;
        dailyQuestsChannelId = await resolveDailyQuestsChannel();
        console.log(
          `Daily Quest channel resolved as ${dailyQuestsChannelId}.`,
        );
      }
      const now = new Date();
      if (
        !force &&
        !hasReachedLocalTime(now, config.timezone, config.dailyQuestCreateTime)
      )
        return null;
      const result = await createDailyQuestForDate({
        db,
        userId: SEED_USER_ID,
        localDate: localDateFor(now, config.timezone),
        hunterRank: getRankSnapshot(db, SEED_USER_ID).rankName,
        tierOverride: config.dailyQuestTierOverride,
        channelId: dailyQuestsChannelId,
        publisher: dailyPublisher,
        ensurePublished: force,
      });
      if (result.created) {
        notifier.notify({
          userId: SEED_USER_ID,
          type: "system",
          title: "Daily Quest generated",
          body: `${result.quest.discordThreadName ?? "Daily thread"} is ready.`,
          metadata: {
            date: result.quest.date,
            threadId: result.quest.discordThreadId,
          },
        });
        api.broadcast("daily.updated", {
          userId: SEED_USER_ID,
          reason: "generated",
        });
      }
      return result;
    };
    const runSalahCreate = async (force = false) => {
      if (!config.enableSalahTracker || !salahPublisher) return null;
      if (!salahChannelId) {
        if (!resolveSalahChannelId) return null;
        salahChannelId = await resolveSalahChannelId();
        console.log(`Salah channel resolved as ${salahChannelId}.`);
      }
      const now = new Date();
      if (!force && !hasReachedLocalTime(now, config.timezone, config.dailyEvaluationTime))
        return null;
      const result = await createSalahForDate({
        db,
        userId: SEED_USER_ID,
        localDate: localDateFor(now, config.timezone),
        channelId: salahChannelId,
        publisher: salahPublisher,
        config,
        ensurePublished: force,
      });
      if (result.created) {
        notifier.notify({
          userId: SEED_USER_ID,
          type: "system",
          title: "Daily Salah generated",
          body: `${result.day.threadName ?? "Salah thread"} is ready.`,
          metadata: { date: result.day.date, threadId: result.day.threadId, source: "salah" },
        });
        api.broadcast("salah.updated", { userId: SEED_USER_ID, reason: "generated" });
      }
      return result;
    };
    const scheduleCreation = () => {
      setTimeout(
        () => {
          void runDailyCreate(true).catch((error) =>
            console.error(
              "daily quest creation failed:",
              error instanceof Error ? error.message : error,
            ),
          );
          scheduleCreation();
        },
        millisecondsUntilLocalTime(
          new Date(),
          config.timezone,
          config.dailyQuestCreateTime,
        ),
      ).unref();
    };
    const scheduleSalahCreation = () => {
      setTimeout(
        () => {
          void runSalahCreate(true).catch((error) =>
            console.error(
              "salah creation failed:",
              error instanceof Error ? error.message : error,
            ),
          );
          scheduleSalahCreation();
        },
        millisecondsUntilLocalTime(
          new Date(),
          config.timezone,
          config.dailyEvaluationTime,
        ),
      ).unref();
    };

    const client = createDiscordClient(config, boundary, {
      storeRawMessage: (input) => storeRawMessage(db, input),
      onRawMessageStored(input, stored) {
        api.broadcast("discord.message", {
          messageId: input.messageId,
          channelId: input.channelId,
          authorId: input.authorId,
          timestamp: input.messageTimestamp,
          stored: Boolean(stored),
        });
        if (stored) {
          // A thread message resolves its stat category from the parent channel.
          const category =
            config.channelCategories[input.channelId] ??
            (input.parentChannelId
              ? config.channelCategories[input.parentChannelId]
              : undefined);
          if (category) {
            const contentLength = Number(
              (input.metadata as { contentLength?: number } | null)
                ?.contentLength ?? input.content.length,
            );
            const result = awardMessageStats(db, {
              userId: SEED_USER_ID,
              category,
              contentLength,
              content: config.storeMessageContent ? input.content : "",
              localDate: localDateFor(
                new Date(input.messageTimestamp),
                config.timezone,
              ),
              sourceId: input.messageId,
            });
            if (result?.changed.length)
              api.broadcast("stats.player.updated", { userId: SEED_USER_ID });
          }
        }
        api.broadcast("stats.updated", {
          reason: "discord.message",
          channelId: input.channelId,
        });
      },
      onSummaryCommand(kind) {
        publishSummary(kind);
        api.broadcast("notification", {
          type: kind === "today" ? "daily_summary" : "weekly_summary",
          userId: SEED_USER_ID,
        });
      },
      async onDailyCommand(kind, message) {
        try {
          if (kind === "create") {
            const result = await runDailyCreate(true);
            const quest =
              result?.quest ??
              getDailyQuest(
                db,
                SEED_USER_ID,
                localDateFor(new Date(), config.timezone),
              );
            await replyInChunks(
              message,
              quest?.discordThreadId
                ? `Daily Quest is ready in <#${quest.discordThreadId}> (${quest.discordThreadName ?? `Day-${quest.streakDayNumber ?? 1}`}).`
                : "Daily Quest checked, but today's thread is not ready yet.",
            );
            return;
          }
          if (kind === "evaluate") runDailyEval();
          const today = localDateFor(new Date(), config.timezone);
          const quest =
            getActiveDailyQuestByThread(db, message.channelId) ??
            getDailyQuest(db, SEED_USER_ID, today);
          if (!quest) {
            await replyInChunks(
              message,
              "No Daily Quest generated yet. Waiting for scheduled creation.",
            );
            return;
          }
          if (kind === "thread") {
            await replyInChunks(
              message,
              quest.discordThreadId
                ? `<#${quest.discordThreadId}> (${quest.discordThreadName})`
                : "Today has no Discord thread.",
            );
            return;
          }
          const progress = quest.metrics
            .map((metric) => {
              if (metric.key === "lusted") {
                const answer =
                  metric.progress < 0
                    ? "Yes"
                    : metric.done
                      ? "No"
                      : "unanswered";
                return `${metric.label}: ${answer}`;
              }
              return `${metric.label}: ${metric.progress}/${metric.target} ${metric.unit}`;
            })
            .join("\n");
          await replyInChunks(
            message,
            `${quest.discordThreadName ?? `Day-${quest.streakDayNumber ?? 1}`} · Rank ${quest.hunterRank} · ${quest.tierName} · ${quest.status}\n${progress}`,
          );
        } catch (error) {
          await replyInChunks(
            message,
            `Daily command failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      async onMainCommand(command, message) {
        try {
          const reply = await mainQuestCommands.handle(command, SEED_USER_ID);
          await replyInChunks(message, reply);
        } catch (error) {
          await replyInChunks(
            message,
            `Main Quest command failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      async onDailyQuestMessage(message) {
        const result = recordDailyThreadMessage({
          db,
          userId: SEED_USER_ID,
          threadId: message.channelId,
          messageId: message.id,
          content: message.content ?? "",
          storeRawMatch: config.storeMessageContent,
          hooks: { notify: (input) => notifier.notify(input) },
        });
        if (result.accepted && result.parsed.length > 0) {
          // Acknowledge the log where the Hunter posted it: a ✅ on the parsed
          // message, and a reward reply the moment the checklist is finished.
          if (result.progressChanged) {
            await message
              .react("✅")
              .catch((error) =>
                console.error(
                  "daily progress reaction failed:",
                  error instanceof Error ? error.message : error,
                ),
              );
          }
          if (result.completion) {
            await replyInChunks(
              message,
              formatDailyCompletionReply(result.completion),
            )
              .catch((error) =>
                console.error(
                  "daily completion reply failed:",
                  error instanceof Error ? error.message : error,
                ),
              );
          }
          if (result.penalty) {
            await replyInChunks(
              message,
              formatDailyLustPenaltyReply(result.penalty),
            ).catch((error) =>
              console.error(
                "daily lust penalty reply failed:",
                error instanceof Error ? error.message : error,
              ),
            );
          }
          if (
            result.progressChanged &&
            result.quest &&
            dailyQuestsChannelId &&
            dailyPublisher?.editDailyQuestMessage
          ) {
            const messageId =
              result.quest.discordDailyQuestMessageId ??
              result.quest.discordParentMessageId;
            if (messageId) {
              await dailyPublisher
                .editDailyQuestMessage({
                  channelId: dailyQuestsChannelId,
                  messageId,
                  content: formatDailyQuestMessage(
                    result.quest.streakDayNumber ?? 1,
                    result.quest.hunterRank,
                    result.quest.tier,
                    result.quest,
                  ),
                })
                .catch((error) =>
                  console.error(
                    "daily quest message edit failed:",
                    error instanceof Error ? error.message : error,
                  ),
                );
            }
          }
          api.broadcast("daily.updated", {
            userId: SEED_USER_ID,
            reason: "thread_message",
          });
          if (result.completion) {
            api.broadcast("xp", {
              userId: SEED_USER_ID,
              xpAwarded: result.completion.xpAwarded,
            });
            api.broadcast("stats.player.updated", { userId: SEED_USER_ID });
            api.broadcast("notification", {
              type: "system",
              userId: SEED_USER_ID,
              title: "Daily Quest complete",
            });
          }
          if (result.penalty) {
            api.broadcast("xp", {
              userId: SEED_USER_ID,
              xpAwarded: result.penalty.xpAwarded,
            });
            api.broadcast("stats.player.updated", { userId: SEED_USER_ID });
            api.broadcast("notification", {
              type: "penalty",
              userId: SEED_USER_ID,
              title: "Daily lust check failed",
            });
          }
        }
      },
      async onSalahMessage(message) {
        const recorded = recordSalahThreadMessage(db, {
          userId: SEED_USER_ID,
          threadId: message.channelId,
          date: localDateFor(new Date(), config.timezone),
          content: message.content ?? "",
          discordMessageId: message.id,
        });
        if (!recorded.accepted || !recorded.prayerName || !recorded.result?.completed)
          return;
        await message.react("🕌").catch((error) =>
          console.error(
            "salah progress reaction failed:",
            error instanceof Error ? error.message : error,
          ),
        );
        await replyInChunks(
          message,
          formatSalahCompletionReply(
            recorded.prayerName,
            recorded.result.allCompleted,
          ),
        ).catch((error) =>
          console.error(
            "salah completion reply failed:",
            error instanceof Error ? error.message : error,
          ),
        );
        notifier.notify({
          userId: SEED_USER_ID,
          type: "system",
          title: recorded.result.allCompleted
            ? "🕌 All prayers completed"
            : `🕌 ${recorded.prayerName} completed`,
          metadata: {
            source: "salah",
            prayerName: recorded.prayerName,
            date: localDateFor(new Date(), config.timezone),
          },
        });
        api.broadcast("salah.updated", {
          userId: SEED_USER_ID,
          reason: "thread_message",
        });
        api.broadcast("xp", {
          userId: SEED_USER_ID,
          xpAwarded: recorded.result.xpAwarded,
        });
        api.broadcast("stats.player.updated", { userId: SEED_USER_ID });
        api.broadcast("notification", {
          type: "system",
          userId: SEED_USER_ID,
          title: recorded.result.allCompleted
            ? "Daily Salah Completed"
            : `${recorded.prayerName} completed`,
        });
      },
    });
    client.on("clientReady", () => {
      discordStatus = "connected";
      dailyPublisher = createDailyQuestPublisher(client);
      salahPublisher = createSalahPublisher(client);
      resolveDailyQuestsChannel = () =>
        resolveDailyQuestChannel(client, config.trackedGuildId);
      resolveSalahChannelId = () => resolveSalahChannel(client, config.trackedGuildId);
      if (deliveryEnabled && config.systemOutputChannelId) {
        systemSend = createChannelMessageSender(
          client,
          config.systemOutputChannelId,
        );
      }
      api.broadcast("discord.connected", { connected: true });
      void runDailyCreate().catch((error) =>
        console.error(
          "daily quest creation failed:",
          error instanceof Error ? error.message : error,
        ),
      );
      void runSalahCreate().catch((error) =>
        console.error(
          "salah creation failed:",
          error instanceof Error ? error.message : error,
        ),
      );
      scheduleCreation();
      scheduleSalahCreation();
    });
    client.on("shardDisconnect", () => {
      discordStatus = "disconnected";
      api.broadcast("discord.disconnected", { connected: false });
    });
    await client.login(config.discordToken);
  }

  await api.app.listen({ host: config.apiHost, port: config.apiPort });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

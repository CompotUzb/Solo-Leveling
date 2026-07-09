import { describe, expect, it, vi } from "vitest";
import type { Message } from "discord.js";
import {
  parseDailyCommand,
  parseMainCommand,
  parseSummaryCommand,
  replyInChunks,
  sendDiscordMessage,
  splitDiscordMessage,
  toMessageLike,
  createDiscordClient,
  createDailyQuestPublisher,
  resolveDailyQuestChannel,
} from "./bot.js";
import { loadConfig } from "./config.js";
import { isMessageInTrackedBoundary, type BoundaryConfig } from "./boundary.js";

const boundary: BoundaryConfig = {
  trackedGuildId: "guild-1",
  trackedChannelIds: ["channel-1", "forum-parent"],
};

// Build a structurally-minimal stand-in for a discord.js Message. We only touch the fields
// toMessageLike reads, so the unsafe cast keeps the test focused on the normalization contract.
function fakeMessage(overrides: {
  id?: string;
  content?: string;
  guildId?: string | null;
  channelId: string;
  channel: object;
  webhookId?: string | null;
  system?: boolean | null;
  author?: {
    id?: string | null;
    bot?: boolean | null;
    system?: boolean | null;
  } | null;
}): Message {
  return {
    id: overrides.id ?? "msg-1",
    content: overrides.content ?? "",
    createdAt: new Date("2026-06-23T10:00:00.000Z"),
    guildId: overrides.guildId ?? null,
    webhookId: overrides.webhookId ?? null,
    system: overrides.system ?? false,
    author: overrides.author ?? { id: "user-1", bot: false, system: false },
    attachments: { size: 0 },
    ...overrides,
  } as unknown as Message;
}

describe("bot message normalization", () => {
  it("tracks a human message in a configured guild channel", () => {
    const message = fakeMessage({
      guildId: "guild-1",
      channelId: "channel-1",
      channel: { id: "channel-1" },
    });
    expect(isMessageInTrackedBoundary(toMessageLike(message), boundary)).toBe(
      true,
    );
  });

  it("resolves the parent of a thread for the whitelist check", () => {
    const message = fakeMessage({
      guildId: "guild-1",
      channelId: "thread-9",
      channel: { id: "thread-9", parentId: "forum-parent" },
    });
    expect(isMessageInTrackedBoundary(toMessageLike(message), boundary)).toBe(
      true,
    );
  });

  it("ignores direct messages (no guild, DM channel has no parentId)", () => {
    const dm = fakeMessage({
      guildId: null,
      channelId: "dm-channel",
      channel: { id: "dm-channel" },
    });
    const like = toMessageLike(dm);
    expect(like.guildId).toBeNull();
    expect(like.parentChannelId).toBeNull();
    expect(isMessageInTrackedBoundary(like, boundary)).toBe(false);
  });

  it("ignores configured-guild messages in an unconfigured channel", () => {
    const message = fakeMessage({
      guildId: "guild-1",
      channelId: "random",
      channel: { id: "random" },
    });
    expect(isMessageInTrackedBoundary(toMessageLike(message), boundary)).toBe(
      false,
    );
  });
});

describe("summary command routing", () => {
  it("parses supported summary command aliases", () => {
    expect(parseSummaryCommand("/summary today")).toBe("today");
    expect(parseSummaryCommand("!summary week")).toBe("week");
    expect(parseSummaryCommand("/report weekly")).toBe("week");
    expect(parseSummaryCommand("/summary tomorrow")).toBeNull();
  });

  it("dispatches summary commands only from the configured commands channel", () => {
    const config = loadConfig({
      DISCORD_TOKEN: "fake",
      DISCORD_CLIENT_ID: "client",
      TRACKED_GUILD_ID: "guild-1",
      TRACKED_CHANNEL_IDS: "channel-1",
      COMMANDS_CHANNEL_ID: "commands",
      DATABASE_PATH: ":memory:",
      SKIP_DISCORD_LOGIN: "true",
    });
    const onSummaryCommand = vi.fn();
    const client = createDiscordClient(config, boundary, {
      storeRawMessage: vi.fn(),
      onSummaryCommand,
    });

    const emitMessage = (
      client as unknown as {
        emit: (event: string, message: unknown) => boolean;
      }
    ).emit.bind(client);
    emitMessage(
      "messageCreate",
      fakeMessage({
        guildId: "guild-1",
        channelId: "commands",
        channel: { id: "commands" },
        content: "/summary today",
      }),
    );
    emitMessage(
      "messageCreate",
      fakeMessage({
        guildId: "guild-1",
        channelId: "random",
        channel: { id: "random" },
        content: "/summary week",
      }),
    );

    expect(onSummaryCommand).toHaveBeenCalledOnce();
    expect(onSummaryCommand).toHaveBeenCalledWith("today", expect.anything());
    client.destroy();
  });
});

describe("daily command parsing", () => {
  it("parses the local Daily Quest development commands", () => {
    expect(parseDailyCommand("/daily")).toBe("show");
    expect(parseDailyCommand("/daily create")).toBe("create");
    expect(parseDailyCommand("/daily evaluate")).toBe("evaluate");
    expect(parseDailyCommand("/daily thread")).toBe("thread");
    expect(parseDailyCommand("/daily unknown")).toBeNull();
  });
});

describe("main command parsing", () => {
  it("parses Main Quest MVP commands", () => {
    expect(parseMainCommand("/main suggest prepare for probability exam")).toEqual({
      kind: "suggest",
      goal: "prepare for probability exam",
    });
    expect(parseMainCommand("/main accept")).toEqual({ kind: "accept" });
    expect(parseMainCommand("/main reject")).toEqual({ kind: "reject" });
    expect(parseMainCommand("/main list")).toEqual({ kind: "list" });
    expect(parseMainCommand("/main progress quest-1 3")).toEqual({
      kind: "progress",
      questId: "quest-1",
      amount: 3,
    });
    expect(parseMainCommand("/main complete quest-1")).toEqual({
      kind: "complete",
      questId: "quest-1",
    });
    expect(parseMainCommand("/main archive quest-1")).toEqual({
      kind: "archive",
      questId: "quest-1",
    });
  });

  it("accepts the ! prefix like the other commands", () => {
    expect(parseMainCommand("!main list")).toEqual({ kind: "list" });
    expect(parseMainCommand("!main suggest ship the MVP")).toEqual({
      kind: "suggest",
      goal: "ship the MVP",
    });
  });

  it("answers bare, help, and malformed /main input with help instead of silence", () => {
    expect(parseMainCommand("/main")).toEqual({ kind: "help", input: "" });
    expect(parseMainCommand("/main help")).toEqual({ kind: "help", input: "" });
    expect(parseMainCommand("/main unknown")).toEqual({
      kind: "help",
      input: "unknown",
    });
    expect(parseMainCommand("/main progress quest-1 lots")).toEqual({
      kind: "help",
      input: "progress quest-1 lots",
    });
    expect(parseMainCommand("/main suggest")).toEqual({
      kind: "help",
      input: "suggest",
    });
    expect(parseMainCommand("not a command")).toBeNull();
  });

  it("dispatches main commands only from the configured commands channel", () => {
    const config = loadConfig({
      DISCORD_TOKEN: "fake",
      DISCORD_CLIENT_ID: "client",
      TRACKED_GUILD_ID: "guild-1",
      TRACKED_CHANNEL_IDS: "channel-1",
      COMMANDS_CHANNEL_ID: "commands",
      DATABASE_PATH: ":memory:",
      SKIP_DISCORD_LOGIN: "true",
    });
    const onMainCommand = vi.fn();
    const client = createDiscordClient(config, boundary, {
      storeRawMessage: vi.fn(),
      onMainCommand,
    });

    const emitMessage = (
      client as unknown as {
        emit: (event: string, message: unknown) => boolean;
      }
    ).emit.bind(client);
    emitMessage(
      "messageCreate",
      fakeMessage({
        guildId: "guild-1",
        channelId: "commands",
        channel: { id: "commands" },
        content: "/main suggest finish deployment",
      }),
    );
    emitMessage(
      "messageCreate",
      fakeMessage({
        guildId: "guild-1",
        channelId: "thread-1",
        channel: { id: "thread-1", parentId: "channel-1" },
        content: "/main suggest ignored in thread",
      }),
    );

    expect(onMainCommand).toHaveBeenCalledOnce();
    expect(onMainCommand).toHaveBeenCalledWith(
      { kind: "suggest", goal: "finish deployment" },
      expect.anything(),
    );
    client.destroy();
  });
});

describe("Discord message chunking", () => {
  it("returns short messages unchanged", () => {
    expect(splitDiscordMessage("hello")).toEqual(["hello"]);
  });

  it("splits long messages at newlines under Discord's 2000-char limit", () => {
    const line = "x".repeat(90);
    const content = Array.from({ length: 40 }, () => line).join("\n");
    const chunks = splitDiscordMessage(content);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
      expect(chunk.startsWith("\n")).toBe(false);
    }
    expect(chunks.join("\n")).toBe(content);
  });

  it("hard-splits a single line longer than the limit", () => {
    const chunks = splitDiscordMessage("y".repeat(4500));
    expect(chunks.map((chunk) => chunk.length)).toEqual([2000, 2000, 500]);
  });

  it("replies once per chunk in order", async () => {
    const reply = vi.fn(async (_chunk: string) => ({}));
    const line = "z".repeat(90);
    const content = Array.from({ length: 30 }, () => line).join("\n");
    await replyInChunks({ reply } as never, content);
    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply.mock.calls.map(([chunk]) => chunk).join("\n")).toBe(content);
  });

  it("sends every chunk in order through the common send helper", async () => {
    const send = vi.fn(async (chunk: string) => ({ id: String(chunk.length) }));
    const content = ["a".repeat(1800), "b".repeat(1800), "c".repeat(1800)].join(
      "\n",
    );

    const sent = await sendDiscordMessage({ send }, content);

    expect(content.length).toBeGreaterThan(5000);
    expect(send).toHaveBeenCalledTimes(3);
    for (const [chunk] of send.mock.calls) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
    expect(send.mock.calls.map(([chunk]) => chunk).join("\n")).toBe(content);
    expect(sent).toHaveLength(3);
  });
});

describe("daily quest publisher", () => {
  it("reuses an existing #daily-quests channel by name without creating channels", async () => {
    const existing = {
      id: "daily-channel",
      name: "daily-quests",
      isTextBased: () => true,
      isThread: () => false,
    };
    const create = vi.fn();
    const client = {
      guilds: {
        fetch: vi.fn(async () => ({
          channels: {
            fetch: vi.fn(async () => new Map([[existing.id, existing]])),
            create,
          },
        })),
      },
    };

    const channelId = await resolveDailyQuestChannel(client as never, "guild-1");

    expect(channelId).toBe("daily-channel");
    expect(client.guilds.fetch).toHaveBeenCalledWith("guild-1");
    expect(create).not.toHaveBeenCalled();
  });

  it("fails instead of creating a missing #daily-quests channel", async () => {
    const create = vi.fn(async () => ({ id: "created-daily-channel" }));
    const client = {
      guilds: {
        fetch: vi.fn(async () => ({
          channels: {
            fetch: vi.fn(async () =>
              new Map([
                [
                  "commands",
                  {
                    id: "commands",
                    name: "commands",
                    isTextBased: () => true,
                    isThread: () => false,
                  },
                ],
              ]),
            ),
            create,
          },
        })),
      },
    };

    await expect(
      resolveDailyQuestChannel(client as never, "guild-1"),
    ).rejects.toThrow("Discord channel #daily-quests not found");
    expect(create).not.toHaveBeenCalled();
  });

  it("posts the checklist, creates a message thread, and sends only the short intro to the thread", async () => {
    const threadSend = vi.fn(async () => ({ id: "thread-message-1" }));
    const startThread = vi.fn(async () => ({
      id: "thread-1",
      name: "Day-1",
      send: threadSend,
    }));
    const channelSend = vi.fn(async () => ({
      id: "parent-message-1",
      startThread,
    }));
    const client = {
      channels: {
        fetch: vi.fn(async () => ({
          send: channelSend,
        })),
      },
    };

    const result = await createDailyQuestPublisher(client as never).publish({
      channelId: "daily-channel",
      content: "SYSTEM DAILY QUEST — Day-1\nRequired:\n[ ] Push-ups: 0 / 30",
      threadName: "Day-1",
      threadContent:
        "SYSTEM THREAD ACTIVE — Day-1\n\nSend your activity logs here.",
    });

    expect(result).toEqual({
      parentMessageId: "parent-message-1",
      dailyQuestMessageId: "parent-message-1",
      threadId: "thread-1",
      threadName: "Day-1",
      threadIntroMessageId: "thread-message-1",
    });
    expect(channelSend).toHaveBeenCalledWith(
      "SYSTEM DAILY QUEST — Day-1\nRequired:\n[ ] Push-ups: 0 / 30",
    );
    expect(startThread).toHaveBeenCalledWith({
      name: "Day-1",
      autoArchiveDuration: 1440,
    });
    expect(threadSend).toHaveBeenCalledWith(
      "SYSTEM THREAD ACTIVE — Day-1\n\nSend your activity logs here.",
    );
    expect(threadSend).not.toHaveBeenCalledWith(
      expect.stringContaining("Required:"),
    );
    expect(threadSend).not.toHaveBeenCalledWith(expect.stringContaining("[ ]"));
  });

  it("does not repost when the Day message already exists and has a thread", async () => {
    const channelSend = vi.fn();
    const client = {
      channels: {
        fetch: vi.fn(async () => ({
          messages: {
            fetch: vi.fn(async () =>
              new Map([
                [
                  "parent-message-1",
                  {
                    id: "parent-message-1",
                    content: "**📋 SYSTEM DAILY QUEST — Day-1**\nRequired",
                    thread: {
                      id: "thread-1",
                      name: "Day-1",
                      send: vi.fn(),
                    },
                  },
                ],
              ]),
            ),
          },
          send: channelSend,
        })),
      },
    };

    const result = await createDailyQuestPublisher(client as never).publish({
      channelId: "daily-channel",
      content: "**📋 SYSTEM DAILY QUEST — Day-1**\nRequired",
      threadName: "Day-1",
      threadContent:
        "SYSTEM THREAD ACTIVE — Day-1\n\nSend your activity logs here.",
    });

    expect(result).toEqual({
      parentMessageId: "parent-message-1",
      dailyQuestMessageId: "parent-message-1",
      threadId: "thread-1",
      threadName: "Day-1",
      threadIntroMessageId: null,
    });
    expect(channelSend).not.toHaveBeenCalled();
  });

  it("creates a Day thread on an existing Day message without reposting the quest", async () => {
    const threadSend = vi.fn(async () => ({ id: "thread-message-1" }));
    const startThread = vi.fn(async () => ({
      id: "thread-1",
      name: "Day-1",
      send: threadSend,
    }));
    const channelSend = vi.fn();
    const client = {
      channels: {
        fetch: vi.fn(async () => ({
          messages: {
            fetch: vi.fn(async () =>
              new Map([
                [
                  "parent-message-1",
                  {
                    id: "parent-message-1",
                    content: "**📋 SYSTEM DAILY QUEST — Day-1**\nRequired",
                    startThread,
                  },
                ],
              ]),
            ),
          },
          send: channelSend,
        })),
      },
    };

    const result = await createDailyQuestPublisher(client as never).publish({
      channelId: "daily-channel",
      content: "**📋 SYSTEM DAILY QUEST — Day-1**\nRequired",
      threadName: "Day-1",
      threadContent:
        "SYSTEM THREAD ACTIVE — Day-1\n\nSend your activity logs here.",
    });

    expect(result).toEqual({
      parentMessageId: "parent-message-1",
      dailyQuestMessageId: "parent-message-1",
      threadId: "thread-1",
      threadName: "Day-1",
      threadIntroMessageId: "thread-message-1",
    });
    expect(channelSend).not.toHaveBeenCalled();
    expect(startThread).toHaveBeenCalledWith({
      name: "Day-1",
      autoArchiveDuration: 1440,
    });
    expect(threadSend).toHaveBeenCalledWith(
      "SYSTEM THREAD ACTIVE — Day-1\n\nSend your activity logs here.",
    );
  });

  it("edits the original daily quest message", async () => {
    const edit = vi.fn(async () => undefined);
    const fetchMessage = vi.fn(async () => ({ edit }));
    const client = {
      channels: {
        fetch: vi.fn(async () => ({
          messages: { fetch: fetchMessage },
        })),
      },
    };

    const edited = await createDailyQuestPublisher(
      client as never,
    ).editDailyQuestMessage?.({
      channelId: "daily-channel",
      messageId: "parent-message-1",
      content: "updated daily quest",
    });

    expect(edited).toBe(true);
    expect(client.channels.fetch).toHaveBeenCalledWith("daily-channel");
    expect(fetchMessage).toHaveBeenCalledWith("parent-message-1");
    expect(edit).toHaveBeenCalledWith("updated daily quest");
  });
});

import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
} from "discord.js";
import type { AppConfig } from "./config.js";
import {
  isMessageInTrackedBoundary,
  type BoundaryConfig,
  type MessageLike,
} from "./boundary.js";
import { persistRawMessage, type RawDiscordMessageInput } from "./db.js";
import type { DailyQuestPublisher } from "./dailyWorkflow.js";
import type { MainCommand } from "./mainQuestCommands.js";

export type SummaryCommandKind = "today" | "week";
export type DailyCommandKind = "show" | "create" | "evaluate" | "thread";

export function parseSummaryCommand(
  content: string | null | undefined,
): SummaryCommandKind | null {
  const normalized = (content ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "/summary today" || normalized === "!summary today")
    return "today";
  if (
    normalized === "/summary week" ||
    normalized === "!summary week" ||
    normalized === "/report weekly" ||
    normalized === "!report weekly"
  )
    return "week";
  return null;
}

export function parseDailyCommand(
  content: string | null | undefined,
): DailyCommandKind | null {
  const normalized = (content ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "/daily" || normalized === "!daily") return "show";
  if (normalized === "/daily create" || normalized === "!daily create")
    return "create";
  if (normalized === "/daily evaluate" || normalized === "!daily evaluate")
    return "evaluate";
  if (normalized === "/daily thread" || normalized === "!daily thread")
    return "thread";
  return null;
}

export function parseMainCommand(
  content: string | null | undefined,
): MainCommand | null {
  const trimmed = (content ?? "").trim();
  const prefix = trimmed.match(/^[/!]main(?:\s+|$)/i);
  if (!prefix) return null;
  const rest = trimmed.slice(prefix[0].length).trim();
  const normalized = rest.toLowerCase().replace(/\s+/g, " ");

  const suggest = rest.match(/^suggest\s+(\S[\s\S]*)$/i);
  if (suggest) return { kind: "suggest", goal: suggest[1].trim() };
  if (normalized === "accept") return { kind: "accept" };
  if (normalized === "reject") return { kind: "reject" };
  if (normalized === "list") return { kind: "list" };

  const progress = rest.match(/^progress\s+(\S+)\s+(\d+)$/i);
  if (progress) {
    return {
      kind: "progress",
      questId: progress[1],
      amount: Number(progress[2]),
    };
  }
  const complete = rest.match(/^complete\s+(\S+)$/i);
  if (complete) return { kind: "complete", questId: complete[1] };
  const archive = rest.match(/^archive\s+(\S+)$/i);
  if (archive) return { kind: "archive", questId: archive[1] };
  // Anything else addressed to /main gets usage help instead of silence.
  return { kind: "help", input: normalized === "help" ? "" : normalized };
}

export const DISCORD_MESSAGE_LIMIT = 2000;

/**
 * Split a message into Discord-sized chunks, preferring newline boundaries so a long
 * `/main list` reply arrives as readable pieces instead of failing the 2000-char limit.
 */
export function splitDiscordMessage(
  content: string,
  limit = DISCORD_MESSAGE_LIMIT,
): string[] {
  if (content.length <= limit) return [content];
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut <= 0) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, "");
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export async function sendDiscordMessage<T>(
  target: { send: (content: string) => Promise<T> },
  content: string,
): Promise<T[]> {
  const sent: T[] = [];
  for (const chunk of splitDiscordMessage(content)) {
    sent.push(await target.send(chunk));
  }
  return sent;
}

export async function replyInChunks(
  message: Pick<Message, "reply">,
  content: string,
): Promise<void> {
  await sendDiscordMessage({ send: (chunk) => message.reply(chunk) }, content);
}

export const DEFAULT_DAILY_QUEST_CHANNEL_NAME = "daily-quests";

function collectionValues<T>(collection: unknown): T[] {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection as T[];
  const maybeIterable = collection as { values?: () => Iterable<T> };
  if (typeof maybeIterable.values === "function") return [...maybeIterable.values()];
  const maybeCache = collection as { cache?: { values?: () => Iterable<T> } };
  if (typeof maybeCache.cache?.values === "function")
    return [...maybeCache.cache.values()];
  return [];
}

function isUsableDailyQuestChannel(
  channel: unknown,
  name: string,
): channel is { id: string; name: string } {
  const candidate = channel as {
    id?: unknown;
    name?: unknown;
    isTextBased?: () => boolean;
    isThread?: () => boolean;
  };
  if (typeof candidate.id !== "string" || candidate.name !== name) return false;
  if (typeof candidate.isThread === "function" && candidate.isThread())
    return false;
  return typeof candidate.isTextBased === "function" && candidate.isTextBased();
}

/**
 * Resolve an existing Daily Quest channel by name. It intentionally does NOT create
 * channels; `/daily create` should create a quest message/thread inside the existing
 * daily-quests channel, not change the server's channel list.
 */
export async function resolveDailyQuestChannel(
  client: Client,
  guildId: string,
  name = DEFAULT_DAILY_QUEST_CHANNEL_NAME,
): Promise<string> {
  const guild = (await client.guilds.fetch(guildId)) as {
    channels: {
      fetch?: () => Promise<unknown>;
      cache?: unknown;
    };
  } | null;
  if (!guild) throw new Error(`Discord guild ${guildId} not found`);

  const fetchedChannels = await guild.channels.fetch?.();
  const channels = collectionValues<unknown>(
    fetchedChannels ?? guild.channels.cache,
  );
  const existing = channels.find((channel) =>
    isUsableDailyQuestChannel(channel, name),
  );
  if (existing) return existing.id;

  throw new Error(`Discord channel #${name} not found`);
}

// Normalize a discord.js Message into the minimal shape the boundary filter understands.
// DMs have a null guildId and a channel without `parentId`, so they fall through to the boundary's guild check.
export function toMessageLike(message: Message): MessageLike {
  const channel = message.channel as { parentId?: string | null };
  const parentChannelId =
    "parentId" in message.channel ? (channel.parentId ?? null) : null;
  return {
    guildId: message.guildId,
    channelId: message.channelId,
    parentChannelId,
    webhookId: message.webhookId,
    system: message.system,
    author: {
      id: message.author?.id,
      bot: message.author?.bot,
      system: message.author?.system,
    },
  };
}

export function toRawMessageInput(
  message: Message,
  contentPolicy: Pick<AppConfig, "storeMessageContent" | "contentMaxChars"> = {
    storeMessageContent: false,
    contentMaxChars: 0,
  },
): RawDiscordMessageInput {
  const like = toMessageLike(message);
  if (!like.guildId)
    throw new Error("cannot persist Discord DM without guild id");
  if (!like.author?.id)
    throw new Error("cannot persist Discord message without author id");
  const attachments = message.attachments as { size?: number } | undefined;
  const fullContent = message.content ?? "";
  const storedContent = contentPolicy.storeMessageContent
    ? fullContent.slice(0, contentPolicy.contentMaxChars)
    : "";
  // A thread message lives in a thread channel whose id is message.channelId and whose
  // parentId is the configured parent channel. We capture the thread id and (non-sensitive)
  // title so the dashboard can group activity by thread.
  const channel = message.channel as {
    isThread?: () => boolean;
    name?: string | null;
  };
  const isThread =
    typeof channel.isThread === "function"
      ? channel.isThread()
      : Boolean(like.parentChannelId);
  return {
    messageId: message.id,
    guildId: like.guildId,
    channelId: message.channelId,
    parentChannelId: like.parentChannelId ?? null,
    threadId: isThread ? message.channelId : null,
    threadTitle: isThread ? (channel.name ?? null) : null,
    authorId: like.author.id,
    content: storedContent,
    messageTimestamp: message.createdAt.toISOString(),
    metadata: {
      attachmentCount: attachments?.size ?? 0,
      contentLength: fullContent.length,
    },
  };
}

/**
 * Build a sender that posts a plain message to a single Discord channel (the configured
 * system-output channel). Returns the sent message id, or null if the channel cannot be
 * resolved or is not text-based. Used to deliver system notifications.
 */
export function createChannelMessageSender(client: Client, channelId: string) {
  return async (message: string): Promise<string | null> => {
    const channel = (await client.channels.fetch(channelId)) as {
      send?: (content: string) => Promise<{ id: string }>;
    } | null;
    if (!channel || typeof channel.send !== "function") return null;
    const [sent] = await sendDiscordMessage(
      { send: channel.send.bind(channel) },
      message,
    );
    return sent?.id ?? null;
  };
}

interface DailyQuestThreadLike {
  id: string;
  name: string;
  send?: (content: string) => Promise<{ id?: string }>;
}

interface DailyQuestMessageLike {
  id: string;
  content?: string | null;
  thread?: DailyQuestThreadLike | null;
  startThread?: (options: {
    name: string;
    autoArchiveDuration: 1440;
  }) => Promise<DailyQuestThreadLike>;
}

interface DailyQuestChannelLike {
  messages?: {
    fetch?: (options?: { limit?: number }) => Promise<unknown>;
  };
  send?: (content: string) => Promise<DailyQuestMessageLike>;
}

async function findDailyQuestMessage(
  channel: DailyQuestChannelLike,
  input: Parameters<DailyQuestPublisher["publish"]>[0],
): Promise<DailyQuestMessageLike | null> {
  const fetched = await channel.messages?.fetch?.({ limit: 50 });
  const messages = collectionValues<DailyQuestMessageLike>(fetched);
  const expectedHeader = `SYSTEM DAILY QUEST — ${input.threadName}`;
  return (
    messages.find((message) =>
      Boolean(message.content?.includes(expectedHeader)),
    ) ?? null
  );
}

export function createDailyQuestPublisher(client: Client): DailyQuestPublisher {
  return {
    async publish(input) {
      const channel = (await client.channels.fetch(
        input.channelId,
      )) as DailyQuestChannelLike | null;
      if (!channel || typeof channel.send !== "function")
        throw new Error("daily quest channel is not text-based");
      const existingMessage = await findDailyQuestMessage(channel, input);
      const message =
        existingMessage ??
        (
          await sendDiscordMessage(
            { send: channel.send.bind(channel) },
            input.content,
          )
        )[0];
      if (existingMessage?.thread) {
        return {
          parentMessageId: message.id,
          dailyQuestMessageId: message.id,
          threadId: existingMessage.thread.id,
          threadName: existingMessage.thread.name,
          threadIntroMessageId: null,
        };
      }
      if (typeof message.startThread !== "function")
        throw new Error("daily quest message cannot create a thread");
      const thread = await message.startThread({
        name: input.threadName,
        autoArchiveDuration: 1440,
      });
      if (typeof thread.send !== "function")
        throw new Error("daily quest thread is not messageable");
      const [introMessage] = await sendDiscordMessage(
        { send: thread.send.bind(thread) },
        input.threadContent,
      );
      return {
        parentMessageId: message.id,
        dailyQuestMessageId: message.id,
        threadId: thread.id,
        threadName: thread.name,
        threadIntroMessageId: introMessage.id ?? null,
      };
    },
    async editDailyQuestMessage(input) {
      const channel = (await client.channels.fetch(input.channelId)) as {
        messages?: {
          fetch?: (messageId: string) => Promise<{
            edit?: (content: string) => Promise<unknown>;
          } | null>;
        };
      } | null;
      const message = await channel?.messages?.fetch?.(input.messageId);
      if (!message || typeof message.edit !== "function") return false;
      await message.edit(input.content);
      return true;
    },
  };
}

export interface DiscordClientOptions {
  storeRawMessage?: (input: RawDiscordMessageInput) => unknown;
  onRawMessageStored?: (input: RawDiscordMessageInput, stored: unknown) => void;
  onSummaryCommand?: (kind: SummaryCommandKind, message: Message) => unknown;
  onDailyCommand?: (kind: DailyCommandKind, message: Message) => unknown;
  onMainCommand?: (command: MainCommand, message: Message) => unknown;
  onDailyQuestMessage?: (message: Message) => unknown;
}

export function createDiscordClient(
  config: AppConfig,
  boundary: BoundaryConfig,
  options: DiscordClientOptions = {},
) {
  const store =
    options.storeRawMessage ??
    ((input: RawDiscordMessageInput) =>
      persistRawMessage(config.databasePath, input));
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });
  client.once(Events.ClientReady, (ready) => {
    console.log(
      `Discord connected as ${ready.user.tag}; tracking guild ${boundary.trackedGuildId}; ${boundary.trackedChannelIds.length} channel(s)`,
    );
  });
  client.on(Events.MessageCreate, (message) => {
    const like = toMessageLike(message);
    const inCommandsChannel = config.commandsChannelId === message.channelId;
    const summaryCommand = inCommandsChannel
      ? parseSummaryCommand(message.content)
      : null;
    if (summaryCommand) {
      options.onSummaryCommand?.(summaryCommand, message);
      return;
    }
    const dailyCommand = inCommandsChannel
      ? parseDailyCommand(message.content)
      : null;
    if (dailyCommand) {
      options.onDailyCommand?.(dailyCommand, message);
      return;
    }
    const mainCommand = inCommandsChannel
      ? parseMainCommand(message.content)
      : null;
    if (mainCommand) {
      options.onMainCommand?.(mainCommand, message);
      return;
    }
    if (
      !message.author?.bot &&
      !message.author?.system &&
      !message.webhookId &&
      !message.system
    ) {
      if (like.parentChannelId) options.onDailyQuestMessage?.(message);
    }
    if (!isMessageInTrackedBoundary(like, boundary)) return;
    const input = toRawMessageInput(message, config);
    const stored = store(input);
    options.onRawMessageStored?.(input, stored);
    console.log(
      `tracked message ${message.id} in channel ${message.channelId}`,
    );
  });
  return client;
}

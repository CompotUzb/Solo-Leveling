export interface DashboardEventHandlers {
  onLiveChange: (live: boolean) => void;
  onRefresh: () => void;
}

const REFRESH_EVENTS = [
  "xp",
  "quest.created",
  "quest.completed",
  "quest.updated",
  "stats.updated",
  "stats.player.updated",
  "daily.updated",
  "notification",
  "discord.message",
] as const;

/** One Discord message fans out into several SSE events; collapse each burst into one refetch. */
export const REFRESH_COALESCE_MS = 250;

export function subscribeToDashboardEvents(
  { onLiveChange, onRefresh }: DashboardEventHandlers,
  coalesceMs: number = REFRESH_COALESCE_MS,
): () => void {
  const stream = new EventSource("/api/events/stream");

  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRefresh = () => {
    if (timer != null) return;
    timer = setTimeout(() => {
      timer = null;
      onRefresh();
    }, coalesceMs);
  };

  stream.addEventListener("connected", () => {
    onLiveChange(true);
    // Events may have been missed while disconnected, so refetch on (re)connect.
    scheduleRefresh();
  });
  for (const event of REFRESH_EVENTS)
    stream.addEventListener(event, scheduleRefresh);
  stream.onerror = () => onLiveChange(false);

  return () => {
    if (timer != null) clearTimeout(timer);
    stream.close();
  };
}

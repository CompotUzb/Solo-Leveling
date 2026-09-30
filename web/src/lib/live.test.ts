import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToDashboardEvents } from "./live.js";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, (() => void)[]>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(event: string, listener: () => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  emit(event: string) {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }

  close() {
    this.closed = true;
  }
}

describe("dashboard live SSE subscription", () => {
  const original = globalThis.EventSource;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.EventSource = original;
    FakeEventSource.instances = [];
  });

  it("subscribes to backend SSE events, toggles live state, refreshes dynamic data, and closes cleanly", () => {
    const onLive = vi.fn();
    const onRefresh = vi.fn();
    const close = subscribeToDashboardEvents({
      onLiveChange: onLive,
      onRefresh,
    });
    const stream = FakeEventSource.instances[0];

    expect(stream.url).toBe("/api/events/stream");
    stream.emit("connected");
    vi.runAllTimers();
    stream.emit("xp");
    vi.runAllTimers();
    stream.emit("daily.updated");
    vi.runAllTimers();
    stream.onerror?.();
    close();

    expect(onLive).toHaveBeenNthCalledWith(1, true);
    expect(onRefresh).toHaveBeenCalledTimes(3);
    expect(onLive).toHaveBeenLastCalledWith(false);
    expect(stream.closed).toBe(true);
  });

  it("coalesces a burst of events into a single refresh", () => {
    const onRefresh = vi.fn();
    const close = subscribeToDashboardEvents({
      onLiveChange: vi.fn(),
      onRefresh,
    });
    const stream = FakeEventSource.instances[0];

    stream.emit("discord.message");
    stream.emit("stats.updated");
    stream.emit("stats.player.updated");
    stream.emit("xp");
    expect(onRefresh).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    close();
  });

  it("refreshes after (re)connecting so missed events are not lost", () => {
    const onRefresh = vi.fn();
    const close = subscribeToDashboardEvents({
      onLiveChange: vi.fn(),
      onRefresh,
    });
    const stream = FakeEventSource.instances[0];

    stream.emit("connected");
    vi.runAllTimers();
    expect(onRefresh).toHaveBeenCalledTimes(1);

    stream.onerror?.();
    stream.emit("connected");
    vi.runAllTimers();
    expect(onRefresh).toHaveBeenCalledTimes(2);
    close();
  });

  it("cancels a pending refresh when closed", () => {
    const onRefresh = vi.fn();
    const close = subscribeToDashboardEvents({
      onLiveChange: vi.fn(),
      onRefresh,
    });
    FakeEventSource.instances[0].emit("xp");
    close();
    vi.runAllTimers();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

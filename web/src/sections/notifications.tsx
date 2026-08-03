import { type AsyncState } from "../lib/api.js";
import { dashboardNotifications, relativeTime } from "../lib/format.js";
import type { NotificationType, NotificationsResponse } from "../lib/types.js";
import { Async, Badge, Card } from "../components/ui.js";

const NOTIFICATION_META: Record<
  NotificationType,
  { glyph: string; tone: string }
> = {
  level_up: { glyph: "⬆", tone: "easy" },
  achievement: { glyph: "🏆", tone: "streak" },
  penalty: { glyph: "⚠", tone: "hard" },
  daily_summary: { glyph: "📅", tone: "muted" },
  weekly_summary: { glyph: "📜", tone: "muted" },
  system: { glyph: "🔔", tone: "normal" },
};

export function Notifications({
  notifications,
}: {
  notifications: AsyncState<NotificationsResponse>;
}) {
  return (
    <Card title="System Notifications" icon="🔔" area="notify">
      <Async
        state={notifications}
        isEmpty={(data) => data.notifications.length === 0}
        emptyMessage="No notifications yet. Level ups and system events will appear here."
        loadingLabel="Loading notifications…"
      >
        {(data) => {
          const visible = dashboardNotifications(data.notifications);
          const total = data.total ?? data.notifications.length;
          return (
            <div className="notification-panel">
              <ul className="notification-list">
                {visible.map((n) => {
                  const meta =
                    NOTIFICATION_META[n.type] ?? NOTIFICATION_META.system;
                  return (
                    <li key={n.id} className="notification">
                      <span className="notification-glyph" aria-hidden>
                        {meta.glyph}
                      </span>
                      <span className="notification-main">
                        <span className="notification-title">{n.title}</span>
                        {n.body ? (
                          <span className="muted">{n.body}</span>
                        ) : null}
                      </span>
                      <span className="notification-side">
                        <Badge
                          tone={n.discordStatus === "sent" ? "easy" : "muted"}
                        >
                          {n.discordStatus === "sent"
                            ? "sent"
                            : n.discordStatus === "skipped"
                              ? "local"
                              : n.discordStatus}
                        </Badge>
                        <span className="muted">
                          {relativeTime(n.createdAt)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {total > visible.length ? (
                <p className="notification-footer muted">
                  Showing latest {visible.length} of {total} notifications
                </p>
              ) : null}
            </div>
          );
        }}
      </Async>
    </Card>
  );
}

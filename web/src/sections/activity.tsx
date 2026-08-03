import { type AsyncState } from "../lib/api.js";
import { relativeTime } from "../lib/format.js";
import type { TimelineResponse } from "../lib/types.js";
import { Async, Card } from "../components/ui.js";

export function RecentActivity({
  timeline,
}: {
  timeline: AsyncState<TimelineResponse>;
}) {
  return (
    <Card title="Recent Activity" icon="🛰" area="recent">
      <Async
        state={timeline}
        isEmpty={(data) => data.items.length === 0}
        emptyMessage="No tracked activity yet. Messages in tracked channels will appear here."
        loadingLabel="Loading timeline…"
      >
        {(data) => (
          <ul className="activity-list">
            {data.items.slice(0, 12).map((item) => (
              <li key={item.id} className="activity">
                <span className="activity-glyph" aria-hidden>
                  ›
                </span>
                <span className="activity-main">
                  <code>#{item.channelId}</code>
                  <span className="muted">
                    {item.contentLength} chars
                    {item.attachmentCount > 0
                      ? ` · ${item.attachmentCount} att`
                      : ""}
                  </span>
                </span>
                <span className="activity-xp accent">+{item.xpAwarded} XP</span>
                <span className="activity-time muted">
                  {relativeTime(item.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </Card>
  );
}

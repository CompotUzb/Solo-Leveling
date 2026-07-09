import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import metricBestStreak from "./assets/metric-best-streak.svg";
import metricCurrentStreak from "./assets/metric-current-streak.svg";
import metricDailyQuest from "./assets/metric-daily-quest.svg";
import metricLastSync from "./assets/metric-last-sync.svg";
import "./styles.css";

const fallbackStatus = {
  penaltyActive: false,
  penaltyReason: "",
  questStatus: "unknown",
  questCompletedCount: 0,
  questTotalCount: 0,
  currentStreak: 0,
  longestStreak: 0,
  dailyQuestProgressPercent: 0,
  dailyQuestMetricSub: "0 of 0 tasks done",
  lastSyncAgeValue: "--",
  lastSyncAgeSub: "no sync yet",
  lastError: "",
};

function readStatus() {
  const bridge = window.SoloStatus;
  if (!bridge?.getStatusJson) return fallbackStatus;
  try {
    return { ...fallbackStatus, ...JSON.parse(bridge.getStatusJson()) };
  } catch {
    return {
      ...fallbackStatus,
      lastError: "React bridge returned invalid status JSON.",
    };
  }
}

function callNative(method) {
  const bridge = window.SoloStatus;
  if (bridge?.[method]) bridge[method]();
}

function IconSync() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M20 7.8a8.2 8.2 0 0 0-14.1-3" />
      <path d="M20 3.8v4h-4" />
      <path d="M4 16.2a8.2 8.2 0 0 0 14.1 3" />
      <path d="M4 20.2v-4h4" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12.2 2.3 2.3 4.9-5.1" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.9v3" />
      <path d="M12 18.1v3" />
      <path d="M2.9 12h3" />
      <path d="M18.1 12h3" />
      <path d="m5.6 5.6 2.1 2.1" />
      <path d="m16.3 16.3 2.1 2.1" />
      <path d="m18.4 5.6-2.1 2.1" />
      <path d="m7.7 16.3-2.1 2.1" />
    </svg>
  );
}

function IconFlame() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12.3 2.8c4.5 4.3 6.2 7.6 4.9 11.9-1 3.5-4.3 5.5-7.5 4.7-3.1-.8-5.1-3.6-4.6-6.7.3-2.3 1.7-4.1 4-5.7-.1 2.2.8 3.5 2.3 4.3 1.6-2.7 1.9-5.3.9-8.5Z" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 4.2 21 19H3L12 4.2Z" />
      <path d="M12 9.2v4.8" />
      <path d="M12 17.1h.01" />
    </svg>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      <i />
    </div>
  );
}

function Chip({ children, tone = "cyan" }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

function WeekDots({ count }) {
  const filled = Math.max(0, Math.min(Number(count) || 0, 7));
  return (
    <div className="week-dots" aria-hidden>
      {Array.from({ length: 7 }, (_, index) => (
        <span key={index} className={index < filled ? "is-on" : ""} />
      ))}
    </div>
  );
}

function MetricCard({ iconSrc, label, value, sub, tone = "cyan", progress }) {
  const safeProgress = Math.max(0, Math.min(Number(progress) || 0, 100));
  return (
    <article className="metric-card">
      <div className="metric-label">
        <span className={`metric-icon metric-icon-${tone}`}>
          <img src={iconSrc} alt="" />
        </span>
        <span className="metric-title">{label}</span>
      </div>
      <strong className={`metric-value tone-${tone}`}>{value}</strong>
      <span className="metric-sub">{sub}</span>
      {progress == null ? null : (
        <div className={`progress tone-${tone}`}>
          <span style={{ width: `${safeProgress}%` }} />
        </div>
      )}
    </article>
  );
}

function Alert({ title, body, tone = "green", icon = null }) {
  return (
    <section className={`alert alert-${tone} ${icon ? "alert-with-icon" : ""}`}>
      {icon ? <span className="alert-icon">{icon}</span> : null}
      <span className="alert-copy">
        <strong>{title}</strong>
        <span>{body}</span>
      </span>
    </section>
  );
}

function ActionButton({ variant, icon, label, busy, onClick }) {
  return (
    <button
      className={`action-btn action-${variant}`}
      type="button"
      disabled={busy}
      onClick={onClick}
    >
      <span className="action-icon">{icon}</span>
      <span>{busy ? "WORKING" : label}</span>
    </button>
  );
}

function StatusApp() {
  const [status, setStatus] = useState(readStatus);
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    window.soloStatusUpdated = () => {
      setStatus(readStatus());
      setBusyAction("");
    };

    const timer = window.setInterval(() => {
      setStatus(readStatus());
    }, 3000);

    return () => {
      window.clearInterval(timer);
      delete window.soloStatusUpdated;
    };
  }, []);

  const progress = useMemo(
    () => Math.max(0, Math.min(status.dailyQuestProgressPercent, 100)),
    [status.dailyQuestProgressPercent],
  );

  const isLocked = Boolean(status.penaltyActive);
  const stateTone = isLocked ? "red" : "green";

  function runAction(method) {
    setBusyAction(method);
    callNative(method);
    window.setTimeout(() => setBusyAction(""), 9000);
  }

  return (
    <main className="status-screen">
      <section className={`hero-card hero-${stateTone} animate-in`}>
        <div className="hero-line" />
        <div className="hero-body">
          <div className="hero-head">
            <span className="label">System Status</span>
            <Chip tone={stateTone}>{isLocked ? "LOCKED" : "CLEAR"}</Chip>
          </div>

          <h1>
            PENALTY{" "}
            <span className={`tone-${isLocked ? "red" : "cyan"}`}>
              {isLocked ? "ACTIVE" : "CLEAR"}
            </span>
          </h1>
          <p className="hero-copy">
            {isLocked
              ? "Discipline condition failed. Access restricted until quest cleared."
              : "All discipline conditions met. Access unrestricted."}
          </p>

          <div className="divider" />

          <div className="streak-row">
            <span className="streak-icon">
              <IconFlame />
            </span>
            <strong>{Math.max(status.currentStreak, 0)}-Day Streak</strong>
            <WeekDots count={status.currentStreak} />
          </div>
        </div>

        {status.penaltyReason ? (
          <Alert
            title="Penalty reason"
            body={status.penaltyReason}
            tone="yellow"
          />
        ) : null}
      </section>

      <SectionLabel>Metrics</SectionLabel>
      <section className="metric-grid animate-in delay-1">
        <MetricCard
          iconSrc={metricDailyQuest}
          label="Daily Quest"
          value={`${progress}%`}
          sub={status.dailyQuestMetricSub}
          tone="cyan"
          progress={progress}
        />
        <MetricCard
          iconSrc={metricCurrentStreak}
          label="Streak"
          value={String(status.currentStreak)}
          sub="days"
          tone="yellow"
        />
        <MetricCard
          iconSrc={metricBestStreak}
          label="Best Streak"
          value={String(status.longestStreak)}
          sub="days personal best"
          tone="violet"
        />
        <MetricCard
          iconSrc={metricLastSync}
          label="Last Sync"
          value={status.lastSyncAgeValue}
          sub={status.lastSyncAgeSub}
          tone="green"
        />
      </section>

      <SectionLabel>Alerts</SectionLabel>
      <div className="animate-in delay-2">
        {status.lastError ? (
          <Alert
            title="Connection warning"
            body={status.lastError}
            tone="red"
            icon={<IconWarning />}
          />
        ) : (
          <Alert
            title="All systems nominal"
            body="No active connection or penalty warnings."
            tone="green"
          />
        )}
      </div>

      <SectionLabel>Actions</SectionLabel>
      <section className="actions animate-in delay-3">
        <ActionButton
          variant="primary"
          icon={<IconSync />}
          label="SYNC NOW"
          busy={busyAction === "syncNow"}
          onClick={() => runAction("syncNow")}
        />
        <ActionButton
          variant="violet"
          icon={<IconCheck />}
          label="PENALTY QUEST DONE"
          busy={busyAction === "flushPenalty"}
          onClick={() => runAction("flushPenalty")}
        />
        <ActionButton
          variant="outline"
          icon={<IconGear />}
          label="ACCESSIBILITY SETTINGS"
          busy={busyAction === "openAccessibilitySettings"}
          onClick={() => runAction("openAccessibilitySettings")}
        />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<StatusApp />);

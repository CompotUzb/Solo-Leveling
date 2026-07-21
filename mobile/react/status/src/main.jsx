import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const FALLBACK_APPS = [
  ["Instagram", "com.instagram.android", "IG", "#E1306C"],
  ["TikTok", "com.zhiliaoapp.musically", "TK", "#25F4EE"],
  ["YouTube", "com.google.android.youtube", "YT", "#FF0000"],
  ["X / Twitter", "com.twitter.android", "X", "#E6EEFC"],
  ["Facebook", "com.facebook.katana", "FB", "#1877F2"],
  ["Reddit", "com.reddit.frontpage", "RD", "#FF5700"],
  ["Snapchat", "com.snapchat.android", "SC", "#FFFC00"],
  ["Telegram", "org.telegram.messenger", "TG", "#2CA5E0"],
];

const FALLBACK = {
  penaltyActive: false,
  accessibilityEnabled: false,
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
  serverUrl: "http://10.0.2.2:3333",
  userId: "local-user",
  systemTopInsetDp: 28,
  systemBottomInsetDp: 0,
  apps: FALLBACK_APPS.map(([name, packageName]) => ({ name, packageName, blocked: true })),
};

function readNative() {
  try {
    return { ...FALLBACK, ...JSON.parse(window.SoloStatus?.getStatusJson?.() || "{}") };
  } catch {
    return { ...FALLBACK, lastError: "Native status bridge returned invalid data." };
  }
}

function nativeCall(method, ...args) {
  window.SoloStatus?.[method]?.(...args);
}

const paths = {
  activity: <><path d="M4 13h3l2-6 4 12 2-6h5" /></>,
  shield: <path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a8 8 0 0 0-1.7-1L14.3 3h-4.6L9.3 6a8 8 0 0 0-1.7 1L5.1 6 3 9.4 5.1 11a7 7 0 0 0 0 2L3 14.6 5.1 18l2.5-1a8 8 0 0 0 1.7 1l.4 3h4.6l.4-3a8 8 0 0 0 1.7-1l2.5 1 2.1-3.4-2.1-1.6a7 7 0 0 0 .1-1Z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 3.8 2c-1 .7-1.5 1.1-1.5 2.3M12 17h.01" /></>,
  sync: <><path d="M20 7.5A8 8 0 0 0 6 5l-2 2" /><path d="M4 3v4h4M4 16.5A8 8 0 0 0 18 19l2-2" /><path d="M20 21v-4h-4" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  flame: <path d="M13 3c3 3 5 6 4 10a5.5 5.5 0 0 1-11 0c0-2 1-4 3.5-6-.2 2 1 3.5 2.5 4 1.4-2.5 1.6-5 .9-8Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  warning: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  save: <><path d="M5 3h12l2 2v16H5V3Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v7H4V6h7" /></>,
};

function Icon({ name, size = 18 }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>{paths[name]}</svg>;
}

function Label({ children, className = "" }) {
  return <span className={`label ${className}`}>{children}</span>;
}

function SectionTitle({ children }) {
  return <div className="section-title"><Label>{children}</Label><i /></div>;
}

function Card({ children, className = "" }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function Header({ title, subtitle, syncing }) {
  return <header className="screen-header">
    <div><h1>{title}</h1><p>{subtitle}</p></div>
    {syncing == null ? null : <div className={`live ${syncing ? "is-syncing" : ""}`}><i /><Label>{syncing ? "SYNCING" : "LIVE"}</Label></div>}
  </header>;
}

function Metric({ icon, label, value, sub, tone, progress }) {
  return <Card className="metric">
    <div className="metric-head"><span className={`tone-${tone}`}><Icon name={icon} size={14} /></span><Label>{label}</Label></div>
    <strong className={`metric-value tone-${tone}`}>{value}</strong>
    <span className="metric-sub">{sub}</span>
    {progress == null ? null : <div className="progress"><i className={`bg-${tone}`} style={{ width: `${progress}%` }} /></div>}
  </Card>;
}

function StatusScreen({ data, syncing, runAction }) {
  const active = Boolean(data.penaltyActive);
  const blockerReady = Boolean(data.accessibilityEnabled);
  const progress = Math.max(0, Math.min(Number(data.dailyQuestProgressPercent) || 0, 100));
  return <>
    <Header title="Solo Tracker" subtitle="Discipline Engine" syncing={syncing} />
    <div className="page-pad">
      <Card className={`hero ${active ? "hero-danger" : "hero-success"}`}>
        <div className="hero-glow" />
        <div className="hero-top"><Label>System Status</Label><span className="pill">{active ? "ACTIVE" : "CLEAR"}</span></div>
        <h2>Penalty <em>{active ? "Active" : "Clear"}</em></h2>
        <p>{active ? "Discipline condition failed. Access restricted until quest cleared." : "All discipline conditions met. Access unrestricted."}</p>
        <div className="streak"><span><Icon name="flame" size={16} /><b>{Math.max(data.currentStreak, 0)}-Day Streak</b></span><div>{Array.from({ length: 7 }, (_, i) => <i key={i} className={i < Math.min(data.currentStreak, 6) ? "on" : ""} />)}</div></div>
      </Card>
      {data.penaltyReason ? <Card className="compact-alert warning"><b>Penalty reason</b><p>{data.penaltyReason}</p></Card> : null}
    </div>

    <SectionTitle>Metrics</SectionTitle>
    <div className="metric-grid page-pad">
      <Metric icon="target" label="Daily Quest" value={`${progress}%`} sub={data.dailyQuestMetricSub} tone="cyan" progress={progress} />
      <Metric icon="flame" label="Current Streak" value={data.currentStreak} sub="days" tone="yellow" />
      <Metric icon="activity" label="Best Streak" value={data.longestStreak} sub="days personal best" tone="violet" />
      <Metric icon="clock" label="Last Sync" value={data.lastSyncAgeValue} sub={data.lastSyncAgeSub} tone="green" />
    </div>

    <SectionTitle>Alerts</SectionTitle>
    <div className="page-pad">
      <Card className={`alert-card ${data.lastError || !blockerReady ? "warning" : "success"}`}>
        <span className="alert-icon"><Icon name={data.lastError || !blockerReady ? "warning" : "check"} size={17} /></span>
        <div><b>{data.lastError ? "Connection Warning" : !blockerReady ? "App Blocker Offline" : "All Systems Nominal"}</b><p>{data.lastError || (!blockerReady ? "Enable the Solo Leveling accessibility service. Selected apps are not being blocked." : "Server sync and app blocking are operational.")}</p></div>
      </Card>
    </div>

    <SectionTitle>Actions</SectionTitle>
    <div className="actions page-pad">
      <button className="button primary" disabled={syncing} onClick={() => runAction("syncNow")}><Icon name="sync" size={15} />{syncing ? "Syncing..." : "Sync Now"}</button>
      <button className="button violet" onClick={() => runAction("flushPenalty")}><Icon name="check" size={15} />Penalty Quest Done</button>
      <button className="button outline" onClick={() => nativeCall("openAccessibilitySettings")}><Icon name="settings" size={15} />Accessibility Settings</button>
    </div>
  </>;
}

function AppsScreen({ data }) {
  const apps = data.apps?.length ? data.apps : FALLBACK.apps;
  const count = apps.filter(app => app.blocked).length;
  const enforcing = Boolean(data.penaltyActive && data.accessibilityEnabled && count);
  return <>
    <Header title="Blocked Apps" subtitle="Selected apps are restricted when penalty is active." />
    <div className="app-summary page-pad"><span><i className={enforcing ? "danger-dot" : ""} /><Label>{count} of {apps.length} apps selected</Label></span><span className={`pill ${enforcing ? "danger" : ""}`}>{enforcing ? "ENFORCING" : data.accessibilityEnabled ? "STANDBY" : "OFFLINE"}</span></div>
    <div className="app-list page-pad">
      {apps.map((app, index) => {
        const meta = FALLBACK_APPS.find(x => x[1] === app.packageName) || [app.name, app.packageName, app.name.slice(0, 2), "#38E1FF"];
        return <Card className={`app-row ${app.blocked ? "selected" : ""}`} key={app.packageName}>
          <span className="app-badge" style={{ color: meta[3], borderColor: `${meta[3]}66`, background: `${meta[3]}18` }}>{meta[2]}</span>
          <div className="app-copy"><b>{app.name}</b><span>{app.packageName}</span><small>{app.blocked ? "Blocked during penalties" : "Not restricted"}</small></div>
          <button className={`toggle ${app.blocked ? "on" : ""}`} aria-label={`Toggle ${app.name}`} onClick={() => nativeCall("setBlockedPackage", app.packageName, !app.blocked)}><i /></button>
        </Card>;
      })}
    </div>
  </>;
}

function SettingsScreen({ data }) {
  const [serverUrl, setServerUrl] = useState(data.serverUrl);
  const [userId, setUserId] = useState(data.userId);
  useEffect(() => { setServerUrl(data.serverUrl); setUserId(data.userId); }, [data.serverUrl, data.userId]);
  return <>
    <Header title="Settings" subtitle="Configure the connection to your Solo Tracker server." />
    <SectionTitle>Server Connection</SectionTitle>
    <div className="page-pad settings-stack">
      <Card className="form-card">
        <label><Label>Server URL</Label><input value={serverUrl} onChange={e => setServerUrl(e.target.value)} placeholder="http://10.0.2.2:3333" autoCapitalize="none" /></label>
        <p>The HTTP base URL used for daily-state synchronization.</p>
        <label><Label>User ID</Label><input value={userId} onChange={e => setUserId(e.target.value)} placeholder="local-user" autoCapitalize="none" /></label>
        <p>Identity sent with requests to the configured backend.</p>
        <button className="button primary" onClick={() => nativeCall("saveSettings", serverUrl, userId)}><Icon name="save" size={15} />Save Settings</button>
      </Card>
      <Card className="info-card"><span><Icon name="info" size={17} /></span><div><b>Connection Guide</b><p><strong>Android Emulator</strong><code>http://10.0.2.2:3333</code><strong>Physical device</strong><span>Use the PC LAN address or a public HTTPS deployment.</span></p></div></Card>
    </div>
  </>;
}

function HelpScreen() {
  const steps = [
    ["01", "Server owns the state", "Daily quests and penalty state remain authoritative on the backend."],
    ["02", "Phone synchronizes", "The app reads the current state through GET /api/daily."],
    ["03", "Accessibility watches apps", "The service detects configured distracting apps in the foreground."],
    ["04", "Penalty enforces focus", "Blocked apps are interrupted until the server clears the penalty."],
  ];
  return <>
    <Header title="Help" subtitle="How the discipline system works." />
    <SectionTitle>System Flow</SectionTitle>
    <div className="help-list page-pad">{steps.map(([n, title, body]) => <Card className="help-row" key={n}><span>{n}</span><div><b>{title}</b><p>{body}</p></div></Card>)}</div>
    <SectionTitle>Setup Checklist</SectionTitle>
    <div className="page-pad"><Card className="checklist"><p><Icon name="check" size={15} />Set the correct server URL</p><p><Icon name="check" size={15} />Enable Solo Tracker Accessibility Service</p><p><Icon name="check" size={15} />Choose apps to block during penalties</p><button className="button outline" onClick={() => nativeCall("openAccessibilitySettings")}><Icon name="external" size={14} />Open Accessibility Settings</button></Card></div>
  </>;
}

const navItems = [["status", "activity", "Status"], ["apps", "shield", "Apps"], ["settings", "settings", "Settings"], ["help", "help", "Help"]];

function BottomNav({ screen, onChange }) {
  return <nav className="bottom-nav">{navItems.map(([id, icon, label]) => <button key={id} className={screen === id ? "active" : ""} onClick={() => onChange(id)}><Icon name={icon} size={18} /><span>{label}</span></button>)}</nav>;
}

function App() {
  const [screen, setScreen] = useState("status");
  const [data, setData] = useState(readNative);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    window.soloStatusUpdated = () => { setData(readNative()); setSyncing(false); };
    const timer = window.setInterval(() => setData(readNative()), 5000);
    return () => { window.clearInterval(timer); delete window.soloStatusUpdated; };
  }, []);

  function runAction(method) {
    setSyncing(true);
    nativeCall(method);
    window.setTimeout(() => setSyncing(false), 10000);
  }

  const content = useMemo(() => {
    if (screen === "apps") return <AppsScreen data={data} />;
    if (screen === "settings") return <SettingsScreen data={data} />;
    if (screen === "help") return <HelpScreen />;
    return <StatusScreen data={data} syncing={syncing} runAction={runAction} />;
  }, [screen, data, syncing]);

  return <main
    className="app-shell"
    style={{
      "--system-top": `${Math.max(24, Number(data.systemTopInsetDp) || 0)}px`,
      "--system-bottom": `${Math.max(0, Number(data.systemBottomInsetDp) || 0)}px`,
    }}
  ><div className="screen-scroll" key={screen}>{content}</div><BottomNav screen={screen} onChange={setScreen} /></main>;
}

createRoot(document.getElementById("root")).render(<App />);

package ai.humblebee.sololeveling;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.Set;

public class MainActivity extends Activity {
    private LinearLayout content;
    private LinearLayout tabs;
    private WebView statusWebView;
    private String currentTab = "status";

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        buildShell();
        render("status");
        syncDaily(false);
    }

    private void buildShell() {
        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(Ui.NAV);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BG);
        Ui.applySystemBarPadding(root, 16, 8, 16, 10);

        LinearLayout header = Ui.column(this);
        boolean compact = Ui.isCompactWidth(this);
        header.setPadding(0, 0, 0, Ui.dp(this, 4));

        LinearLayout headerTop = Ui.row(this);
        LinearLayout titleBlock = Ui.column(this);
        TextView title = Ui.heading(this, "Solo Leveling", compact ? 22 : 24, Ui.TEXT);
        title.setSingleLine(true);
        TextView subtitle = Ui.label(this, "Discipline Engine");
        subtitle.setTextColor(Ui.ACCENT);
        titleBlock.addView(title);
        titleBlock.addView(subtitle);
        headerTop.addView(titleBlock, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        headerTop.addView(Ui.chip(this, "LIVE", Ui.GOOD));
        header.addView(headerTop);
        root.addView(header);

        ScrollView scroll = new ScrollView(this);
        scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setPadding(0, Ui.dp(this, 12), 0, Ui.dp(this, 14));
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setGravity(Gravity.CENTER);
        tabs.setPadding(Ui.dp(this, 4), Ui.dp(this, 4), Ui.dp(this, 4), Ui.dp(this, 4));
        tabs.setBackground(Ui.roundedStroke(this, Ui.NAV, 8, Ui.BORDER, 1));
        renderTabs();
        root.addView(tabs);
        setContentView(root);
    }

    private void renderTabs() {
        if (tabs == null) return;
        tabs.removeAllViews();
        addTab("status", "ST", "Status");
        addTab("apps", "AP", "Apps");
        addTab("settings", "SET", "Settings");
        addTab("help", "?", "Help");
    }

    private void addTab(String id, String abbr, String label) {
        LinearLayout tab = Ui.navTab(this, abbr, label, id.equals(currentTab));
        tab.setOnClickListener(view -> render(id));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, Ui.dp(this, 62), 1f);
        lp.setMargins(Ui.dp(this, 2), 0, Ui.dp(this, 2), 0);
        tabs.addView(tab, lp);
    }

    private void render(String tab) {
        currentTab = tab;
        if (statusWebView != null) {
            statusWebView.destroy();
            statusWebView = null;
        }
        content.removeAllViews();
        renderTabs();
        if ("apps".equals(tab)) renderApps();
        else if ("settings".equals(tab)) renderSettings();
        else if ("help".equals(tab)) renderHelp();
        else renderStatusReact();
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void renderStatusReact() {
        statusWebView = new WebView(this);
        statusWebView.setBackgroundColor(Ui.BG);
        statusWebView.setVerticalScrollBarEnabled(false);
        statusWebView.setHorizontalScrollBarEnabled(false);
        statusWebView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = statusWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        statusWebView.addJavascriptInterface(new StatusBridge(), "SoloStatus");

        int minHeight = Math.max(Ui.dp(this, 900), getResources().getDisplayMetrics().heightPixels - Ui.dp(this, 160));
        content.addView(statusWebView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                minHeight
        ));
        statusWebView.loadUrl("file:///android_asset/status-react/index.html");
    }

    private final class StatusBridge {
        @JavascriptInterface
        public String getStatusJson() {
            JSONObject json = new JSONObject();
            try {
                json.put("penaltyActive", SoloPrefs.penaltyActive(MainActivity.this));
                json.put("penaltyReason", SoloPrefs.penaltyReason(MainActivity.this));
                json.put("questStatus", SoloPrefs.questStatus(MainActivity.this));
                json.put("questCompletedCount", SoloPrefs.questCompletedCount(MainActivity.this));
                json.put("questTotalCount", SoloPrefs.questTotalCount(MainActivity.this));
                json.put("currentStreak", SoloPrefs.currentStreak(MainActivity.this));
                json.put("longestStreak", SoloPrefs.longestStreak(MainActivity.this));
                json.put("dailyQuestProgressPercent", dailyQuestProgressPercent());
                json.put("dailyQuestMetricSub", dailyQuestMetricSub());
                json.put("lastSyncAgeValue", lastSyncAgeValue());
                json.put("lastSyncAgeSub", lastSyncAgeSub());
                json.put("lastError", SoloPrefs.lastError(MainActivity.this));
            } catch (Exception ignored) {
            }
            return json.toString();
        }

        @JavascriptInterface
        public void syncNow() {
            runOnUiThread(() -> syncDaily(true));
        }

        @JavascriptInterface
        public void flushPenalty() {
            runOnUiThread(() -> MainActivity.this.flushPenalty());
        }

        @JavascriptInterface
        public void openAccessibilitySettings() {
            runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        }
    }

    private void renderStatus() {
        boolean active = SoloPrefs.penaltyActive(this);
        int statusColor = active ? Ui.DANGER : Ui.GOOD;

        LinearLayout status = Ui.heroCard(this, statusColor);
        LinearLayout statusBody = Ui.column(this);
        statusBody.setPadding(Ui.dp(this, 22), Ui.dp(this, 18), Ui.dp(this, 22), Ui.dp(this, 20));

        LinearLayout statusHeader = Ui.row(this);
        statusHeader.setGravity(Gravity.CENTER_VERTICAL);
        statusHeader.addView(Ui.label(this, "System Status"), new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
        ));
        statusHeader.addView(Ui.chip(this, active ? "LOCKED" : "CLEAR", active ? Ui.DANGER : Ui.GOOD));
        statusBody.addView(statusHeader);

        TextView title = Ui.heroTitle(this, active);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleLp.setMargins(0, Ui.dp(this, 20), 0, 0);
        statusBody.addView(title, titleLp);

        TextView subtitle = Ui.text(
                this,
                active ? "Discipline condition failed. Access restricted until quest cleared." : "All discipline conditions met. Access unrestricted.",
                13,
                Ui.MUTED,
                Typeface.NORMAL
        );
        subtitle.setSingleLine(false);
        statusBody.addView(subtitle);

        statusBody.addView(Ui.divider(this));
        LinearLayout streak = Ui.row(this);
        streak.setGravity(Gravity.CENTER_VERTICAL);
        View streakIcon = Ui.metricIcon(this, Ui.METRIC_FLAME, Ui.WARNING);
        streak.addView(streakIcon, new LinearLayout.LayoutParams(Ui.dp(this, 18), Ui.dp(this, 18)));
        TextView streakText = Ui.heading(this, Math.max(SoloPrefs.currentStreak(this), 0) + "-Day Streak", 16, Ui.TEXT);
        LinearLayout.LayoutParams streakTextLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        streakTextLp.setMargins(Ui.dp(this, 10), 0, Ui.dp(this, 14), 0);
        streak.addView(streakText, streakTextLp);
        streak.addView(Ui.weekDots(this, Math.min(SoloPrefs.currentStreak(this), 6), 7, Ui.ACCENT));
        statusBody.addView(streak);
        status.addView(statusBody);

        String reason = SoloPrefs.penaltyReason(this);
        if (reason != null && !reason.isEmpty()) status.addView(Ui.alert(this, "Penalty reason", reason, Ui.WARNING));
        content.addView(status);

        content.addView(Ui.sectionLabel(this, "Metrics"));
        LinearLayout rowOne = Ui.row(this);
        addMetric(rowOne, Ui.dailyQuestMetricCard(
                this,
                Ui.METRIC_TARGET,
                "Daily Quest",
                dailyQuestProgressPercent() + "%",
                dailyQuestMetricSub(),
                Ui.ACCENT,
                dailyQuestProgressPercent()
        ), true, Ui.dp(this, 4), Ui.dp(this, 8));
        addMetric(rowOne, Ui.metricCard(this, Ui.METRIC_FLAME, "Current Streak", String.valueOf(SoloPrefs.currentStreak(this)), "days", Ui.WARNING), false, Ui.dp(this, 4), Ui.dp(this, 8));
        content.addView(rowOne);

        LinearLayout rowTwo = Ui.row(this);
        addMetric(rowTwo, Ui.metricCard(this, Ui.METRIC_PULSE, "Best Streak", String.valueOf(SoloPrefs.longestStreak(this)), "days personal best", Ui.VIOLET), true, Ui.dp(this, 4), Ui.dp(this, 8));
        addMetric(rowTwo, Ui.metricCard(this, Ui.METRIC_CLOCK, "Last Sync", lastSyncAgeValue(), lastSyncAgeSub(), Ui.GOOD), false, Ui.dp(this, 4), Ui.dp(this, 8));
        content.addView(rowTwo);

        content.addView(Ui.sectionLabel(this, "Alerts"));
        String error = SoloPrefs.lastError(this);
        if (error != null && !error.isEmpty()) {
            content.addView(Ui.alert(this, "Connection warning", error, Ui.DANGER));
        } else {
            content.addView(Ui.alert(this, "All systems nominal", "No active connection or penalty warnings.", Ui.GOOD));
        }

        content.addView(Ui.sectionLabel(this, "Actions"));
        LinearLayout actions = Ui.column(this);
        actions.setPadding(0, 0, 0, Ui.dp(this, 12));

        LinearLayout refresh = Ui.primaryActionButton(this, "Sync Now", Ui.ACTION_SYNC);
        refresh.setOnClickListener(view -> syncDaily(true));
        actions.addView(refresh);

        LinearLayout done = Ui.violetActionButton(this, "Penalty Quest Done", Ui.ACTION_CHECK);
        done.setOnClickListener(view -> flushPenalty());
        actions.addView(done);

        LinearLayout accessibility = Ui.outlineActionButton(this, "Accessibility Settings", Ui.ACTION_GEAR);
        accessibility.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        actions.addView(accessibility);
        content.addView(actions);
    }

    private void renderApps() {
        Set<String> blocked = SoloPrefs.blockedPackages(this);
        LinearLayout header = Ui.card(this);
        header.addView(Ui.heading(this, "Blocked Apps", 22, Ui.TEXT));
        header.addView(Ui.text(this, "Selected apps are restricted when penalty is active.", 13, Ui.MUTED, Typeface.NORMAL));
        LinearLayout count = Ui.row(this);
        count.setPadding(0, Ui.dp(this, 10), 0, 0);
        count.addView(Ui.chip(this, blocked.size() + " of " + SoloPrefs.DEFAULT_BLOCKED_APPS.length + " blocked", blocked.isEmpty() ? Ui.MUTED : Ui.DANGER));
        header.addView(count);
        content.addView(header);

        content.addView(Ui.sectionLabel(this, "Blocking list"));
        for (String[] app : SoloPrefs.DEFAULT_BLOCKED_APPS) {
            addAppRow(content, app[0], app[1], blocked.contains(app[1]));
        }
    }

    private void renderSettings() {
        content.addView(Ui.sectionLabel(this, "Server"));
        LinearLayout card = Ui.card(this);
        card.addView(Ui.heading(this, "Connection", 22, Ui.TEXT));
        card.addView(Ui.text(this, "Connect this phone to the Solo Leveling API.", 14, Ui.MUTED, Typeface.NORMAL));

        EditText server = new EditText(this);
        server.setText(SoloPrefs.serverUrl(this));
        server.setHint("http://10.0.2.2:3333");
        server.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        card.addView(Ui.label(this, "Server URL"));
        Ui.styleInput(server);
        card.addView(server);

        EditText user = new EditText(this);
        user.setText(SoloPrefs.userId(this));
        user.setHint("local-user");
        user.setInputType(InputType.TYPE_CLASS_TEXT);
        card.addView(Ui.label(this, "User ID"));
        Ui.styleInput(user);
        card.addView(user);

        Button save = Ui.primaryButton(this, "Save Settings");
        save.setOnClickListener(view -> {
            SoloPrefs.setServerUrl(this, server.getText().toString());
            SoloPrefs.setUserId(this, user.getText().toString());
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
            syncDaily(true);
        });
        card.addView(save);

        card.addView(Ui.alert(
                this,
                "Connection hint",
                "Emulator: http://10.0.2.2:3333\nPhone on Wi-Fi: use your PC LAN IP and run the server with API_HOST=0.0.0.0.",
                Ui.ACCENT
        ));
        content.addView(card);
    }

    private void renderHelp() {
        content.addView(Ui.sectionLabel(this, "Guide"));
        LinearLayout card = Ui.card(this);
        card.addView(Ui.heading(this, "How It Works", 22, Ui.TEXT));
        addStep(card, "1", "Server owns SQLite and daily penalty state.");
        addStep(card, "2", "The phone syncs /api/daily.");
        addStep(card, "3", "Accessibility watches foreground apps.");
        addStep(card, "4", "If penaltyActive=true, checked apps are pushed back to the blocker screen.");
        addStep(card, "5", "Penalty quest done calls /api/daily/flush and unlocks apps.");
        content.addView(card);

        content.addView(Ui.sectionLabel(this, "Troubleshooting"));
        LinearLayout tips = Ui.card(this);
        tips.addView(Ui.heading(this, "Connection Checklist", 18, Ui.ACCENT));
        addStep(tips, "A", "Use http://10.0.2.2:3333 for the Android Emulator.");
        addStep(tips, "B", "Use your PC LAN IP or public deployment URL on a real phone.");
        addStep(tips, "C", "Enable Solo Leveling App Blocker in Android Accessibility settings.");
        content.addView(tips);
    }

    private void addAppRow(LinearLayout parent, String appName, String packageName, boolean checked) {
        LinearLayout row = Ui.row(this);
        int border = checked ? Ui.tint(Ui.DANGER, 96) : Ui.BORDER;
        int background = checked ? Ui.tint(Ui.DANGER, 14) : Ui.SURFACE;
        row.setBackground(Ui.roundedStroke(this, background, 8, border, 1));
        row.setPadding(Ui.dp(this, 12), Ui.dp(this, 11), Ui.dp(this, 10), Ui.dp(this, 11));
        LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        rowLp.setMargins(0, 0, 0, Ui.dp(this, 8));
        row.setLayoutParams(rowLp);

        TextView badge = Ui.appBadge(this, appAbbr(appName), appColor(appName));
        LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(Ui.dp(this, 38), Ui.dp(this, 38));
        badgeLp.setMargins(0, 0, Ui.dp(this, 12), 0);
        row.addView(badge, badgeLp);

        LinearLayout copy = Ui.column(this);
        copy.addView(Ui.heading(this, appName, 15, Ui.TEXT));
        copy.addView(Ui.text(this, packageName, 12, Ui.MUTED, Typeface.NORMAL));
        copy.addView(Ui.text(this, checked ? "Will be blocked during penalties" : "Not restricted", 11, checked ? Ui.DANGER : Ui.MUTED, Typeface.NORMAL));
        row.addView(copy, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        CheckBox box = new CheckBox(this);
        Ui.styleCheckBox(box);
        box.setChecked(checked);
        box.setClickable(false);
        box.setFocusable(false);
        row.addView(box);

        row.setOnClickListener(view -> {
            boolean next = !box.isChecked();
            box.setChecked(next);
            SoloPrefs.setBlockedPackage(this, packageName, next);
        });
        parent.addView(row);
    }

    private void addStep(LinearLayout parent, String number, String text) {
        LinearLayout row = Ui.row(this);
        row.setPadding(0, Ui.dp(this, 10), 0, 0);

        TextView badge = Ui.appBadge(this, number, Ui.ACCENT);
        LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(
                Ui.dp(this, 36),
                Ui.dp(this, 30)
        );
        badgeLp.setMargins(0, 0, Ui.dp(this, 10), 0);
        row.addView(badge, badgeLp);

        row.addView(Ui.text(this, text, 14, Ui.TEXT, Typeface.NORMAL), new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
        ));
        parent.addView(row);
    }

    private void addMetric(LinearLayout row, LinearLayout card, boolean left) {
        addMetric(row, card, left, 0, Ui.dp(this, 8));
    }

    private void addMetric(LinearLayout row, LinearLayout card, boolean left, int top, int bottom) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, Ui.metricCardHeight(this), 1f);
        lp.setMargins(left ? 0 : Ui.dp(this, 7), top, left ? Ui.dp(this, 7) : 0, bottom);
        row.addView(card, lp);
    }

    private void syncDaily(boolean showToast) {
        new Thread(() -> {
            PenaltyState state = SoloApiClient.fetchDaily(this);
            SoloPrefs.savePenaltyState(this, state);
            runOnUiThread(() -> {
                if (showToast) Toast.makeText(this, state.requestOk ? "Synced" : state.error, Toast.LENGTH_SHORT).show();
                render(currentTab);
            });
        }).start();
    }

    private void flushPenalty() {
        new Thread(() -> {
            PenaltyState state = SoloApiClient.flushPenalty(this, "Mobile penalty quest completed");
            SoloPrefs.savePenaltyState(this, state);
            runOnUiThread(() -> {
                Toast.makeText(this, state.requestOk ? "Penalty sync updated" : state.error, Toast.LENGTH_SHORT).show();
                render("status");
            });
        }).start();
    }

    private String lastSyncAgeValue() {
        long last = SoloPrefs.lastSync(this);
        if (last <= 0) return "--";
        long ageMillis = Math.max(0L, System.currentTimeMillis() - last);
        long minutes = Math.max(1L, ageMillis / 60000L);
        if (minutes < 60L) return minutes + "m";
        long hours = minutes / 60L;
        if (hours < 24L) return hours + "h";
        return (hours / 24L) + "d";
    }

    private String lastSyncAgeSub() {
        return SoloPrefs.lastSync(this) <= 0 ? "no sync yet" : "ago · success";
    }

    private int dailyQuestProgressPercent() {
        int total = SoloPrefs.questTotalCount(this);
        if (total <= 0) return 0;
        int completed = Math.max(0, Math.min(SoloPrefs.questCompletedCount(this), total));
        return Math.round((completed * 100f) / total);
    }

    private String dailyQuestMetricSub() {
        int total = SoloPrefs.questTotalCount(this);
        if (total <= 0) return "0 of 0 tasks done";
        int completed = Math.max(0, Math.min(SoloPrefs.questCompletedCount(this), total));
        return completed + " of " + total + " tasks done";
    }

    private String readableStatus(String value) {
        if (value == null || value.trim().isEmpty()) return "Unknown";
        String cleaned = value.trim().replace('_', ' ');
        return cleaned.substring(0, 1).toUpperCase() + cleaned.substring(1);
    }

    private String appAbbr(String appName) {
        if ("Instagram".equals(appName)) return "IG";
        if ("TikTok".equals(appName)) return "TK";
        if ("YouTube".equals(appName)) return "YT";
        if ("X / Twitter".equals(appName)) return "X";
        if ("Facebook".equals(appName)) return "FB";
        if ("Reddit".equals(appName)) return "RD";
        if ("Snapchat".equals(appName)) return "SC";
        if ("Telegram".equals(appName)) return "TG";
        return appName.length() <= 2 ? appName.toUpperCase() : appName.substring(0, 2).toUpperCase();
    }

    private int appColor(String appName) {
        if ("Instagram".equals(appName)) return Color.rgb(225, 48, 108);
        if ("TikTok".equals(appName)) return Color.rgb(37, 244, 238);
        if ("YouTube".equals(appName)) return Color.rgb(255, 0, 0);
        if ("X / Twitter".equals(appName)) return Ui.TEXT;
        if ("Facebook".equals(appName)) return Color.rgb(24, 119, 242);
        if ("Reddit".equals(appName)) return Color.rgb(255, 87, 0);
        if ("Snapchat".equals(appName)) return Color.rgb(251, 191, 36);
        if ("Telegram".equals(appName)) return Color.rgb(44, 165, 224);
        return Ui.ACCENT;
    }
}

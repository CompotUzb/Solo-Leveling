package ai.humblebee.sololeveling;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Build;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowMetrics;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Set;

/**
 * Thin native host for the Figma-derived React interface.
 *
 * Business state remains native and persistent. The WebView only renders it and
 * forwards explicit user actions through {@link MobileBridge}.
 */
public final class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(Ui.NAV);
        getWindow().getDecorView().setSystemUiVisibility(0);
        buildWebApp();
        syncDaily(false);
    }

    @Override
    protected void onResume() {
        super.onResume();
        notifyWebApp();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("SoloStatus");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void buildWebApp() {
        webView = new WebView(this);
        webView.setBackgroundColor(Ui.BG);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setTextZoom(100);

        webView.addJavascriptInterface(new MobileBridge(), "SoloStatus");
        webView.loadUrl("file:///android_asset/status-react/index.html");
        setContentView(webView);
    }

    private final class MobileBridge {
        @JavascriptInterface
        public String getStatusJson() {
            JSONObject json = new JSONObject();
            try {
                json.put("penaltyActive", SoloPrefs.penaltyActive(MainActivity.this));
                json.put("accessibilityEnabled", SoloPrefs.accessibilityServiceEnabled(MainActivity.this));
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
                json.put("serverUrl", SoloPrefs.serverUrl(MainActivity.this));
                json.put("userId", SoloPrefs.userId(MainActivity.this));
                json.put("systemTopInsetDp", systemBarInsetDp(true));
                json.put("systemBottomInsetDp", systemBarInsetDp(false));

                Set<String> blocked = SoloPrefs.blockedPackages(MainActivity.this);
                JSONArray apps = new JSONArray();
                for (String[] app : SoloPrefs.DEFAULT_BLOCKED_APPS) {
                    JSONObject item = new JSONObject();
                    item.put("name", app[0]);
                    item.put("packageName", app[1]);
                    item.put("blocked", blocked.contains(app[1]));
                    apps.put(item);
                }
                json.put("apps", apps);
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
            runOnUiThread(MainActivity.this::flushPenalty);
        }

        @JavascriptInterface
        public void openAccessibilitySettings() {
            runOnUiThread(MainActivity.this::openAccessibilitySettings);
        }

        @JavascriptInterface
        public void setBlockedPackage(String packageName, boolean blocked) {
            if (!SoloPrefs.knownPackages().contains(packageName)) return;
            SoloPrefs.setBlockedPackage(MainActivity.this, packageName, blocked);
            runOnUiThread(MainActivity.this::notifyWebApp);
        }

        @JavascriptInterface
        public void saveSettings(String serverUrl, String userId) {
            SoloPrefs.setServerUrl(MainActivity.this, serverUrl);
            SoloPrefs.setUserId(MainActivity.this, userId);
            runOnUiThread(() -> {
                Toast.makeText(MainActivity.this, "Settings saved", Toast.LENGTH_SHORT).show();
                notifyWebApp();
                syncDaily(false);
            });
        }
    }

    private void openAccessibilitySettings() {
        Intent settings = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(settings);
    }

    private void syncDaily(boolean showToast) {
        new Thread(() -> {
            PenaltyState state = SoloApiClient.fetchDaily(this);
            SoloPrefs.savePenaltyState(this, state);
            runOnUiThread(() -> {
                if (showToast) {
                    Toast.makeText(this, state.requestOk ? "Synced" : state.error, Toast.LENGTH_SHORT).show();
                }
                notifyWebApp();
            });
        }).start();
    }

    private void flushPenalty() {
        new Thread(() -> {
            PenaltyState state = SoloApiClient.flushPenalty(this, "Mobile penalty quest completed");
            SoloPrefs.savePenaltyState(this, state);
            runOnUiThread(() -> {
                Toast.makeText(this, state.requestOk ? "Penalty sync updated" : state.error, Toast.LENGTH_SHORT).show();
                notifyWebApp();
            });
        }).start();
    }

    private void notifyWebApp() {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
                "window.soloStatusUpdated && window.soloStatusUpdated()", null));
    }

    private int dailyQuestProgressPercent() {
        int total = SoloPrefs.questTotalCount(this);
        if (total <= 0) return 0;
        int completed = Math.max(0, Math.min(SoloPrefs.questCompletedCount(this), total));
        return Math.round((completed * 100f) / total);
    }

    private String dailyQuestMetricSub() {
        int total = SoloPrefs.questTotalCount(this);
        int completed = Math.max(0, Math.min(SoloPrefs.questCompletedCount(this), total));
        return completed + " of " + Math.max(total, 0) + " tasks done";
    }

    private String lastSyncAgeValue() {
        long last = SoloPrefs.lastSync(this);
        if (last <= 0) return "--";
        long minutes = Math.max(1L, (System.currentTimeMillis() - last) / 60000L);
        if (minutes < 60L) return minutes + "m";
        long hours = minutes / 60L;
        return hours < 24L ? hours + "h" : (hours / 24L) + "d";
    }

    private String lastSyncAgeSub() {
        if (SoloPrefs.lastSync(this) <= 0) return "no sync yet";
        String error = SoloPrefs.lastError(this);
        return error == null || error.isEmpty() ? "ago · success" : "ago · cached";
    }

    private int systemBarInsetDp(boolean top) {
        int pixels = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowMetrics metrics = getWindowManager().getCurrentWindowMetrics();
            android.graphics.Insets insets = metrics.getWindowInsets()
                    .getInsetsIgnoringVisibility(top
                            ? WindowInsets.Type.statusBars() | WindowInsets.Type.displayCutout()
                            : WindowInsets.Type.navigationBars());
            pixels = top ? insets.top : insets.bottom;
        } else {
            String name = top ? "status_bar_height" : "navigation_bar_height";
            int id = getResources().getIdentifier(name, "dimen", "android");
            if (id > 0) pixels = getResources().getDimensionPixelSize(id);
        }
        float density = getResources().getDisplayMetrics().density;
        return Math.max(0, Math.round(pixels / Math.max(density, 1f)));
    }
}

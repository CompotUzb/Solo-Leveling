package ai.humblebee.sololeveling;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;

public class SocialBlockerAccessibilityService extends AccessibilityService {
    private static final long SYNC_INTERVAL_MS = 30_000L;
    private volatile boolean refreshing;
    private long lastRefreshMs;
    private String lastBlockedPackage = "";
    private long lastBlockedAtMs;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        String packageName = event.getPackageName().toString();
        if (getPackageName().equals(packageName)) return;

        maybeRefreshPenaltyState();

        if (!SoloPrefs.penaltyActive(this)) return;
        if (!SoloPrefs.isBlockedPackage(this, packageName)) return;

        long now = System.currentTimeMillis();
        if (packageName.equals(lastBlockedPackage) && now - lastBlockedAtMs < 1500L) return;
        lastBlockedPackage = packageName;
        lastBlockedAtMs = now;

        performGlobalAction(GLOBAL_ACTION_HOME);
        Intent intent = new Intent(this, BlockActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("blocked_package", packageName);
        startActivity(intent);
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        maybeRefreshPenaltyState();
    }

    private void maybeRefreshPenaltyState() {
        long now = System.currentTimeMillis();
        if (refreshing || now - lastRefreshMs < SYNC_INTERVAL_MS) return;
        refreshing = true;
        lastRefreshMs = now;
        new Thread(() -> {
            PenaltyState state = SoloApiClient.fetchDaily(this);
            SoloPrefs.savePenaltyState(this, state);
            refreshing = false;
        }).start();
    }
}

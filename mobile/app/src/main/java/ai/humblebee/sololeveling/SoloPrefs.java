package ai.humblebee.sololeveling;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.accessibility.AccessibilityManager;

import java.util.LinkedHashSet;
import java.util.Set;

final class SoloPrefs {
    static final String PREFS = "solo_tracker_mobile";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String KEY_USER_ID = "user_id";
    private static final String KEY_BLOCKED_PACKAGES = "blocked_packages";
    private static final String KEY_PENALTY_ACTIVE = "penalty_active";
    private static final String KEY_PENALTY_REASON = "penalty_reason";
    private static final String KEY_QUEST_STATUS = "quest_status";
    private static final String KEY_QUEST_COMPLETED_COUNT = "quest_completed_count";
    private static final String KEY_QUEST_TOTAL_COUNT = "quest_total_count";
    private static final String KEY_CURRENT_STREAK = "current_streak";
    private static final String KEY_LONGEST_STREAK = "longest_streak";
    private static final String KEY_LAST_SYNC = "last_sync";
    private static final String KEY_LAST_ERROR = "last_error";

    static final String DEFAULT_SERVER_URL = "http://10.0.2.2:3333";
    static final String DEFAULT_USER_ID = "local-user";

    static final String[][] DEFAULT_BLOCKED_APPS = new String[][]{
            {"Instagram", "com.instagram.android"},
            {"TikTok", "com.zhiliaoapp.musically"},
            {"YouTube", "com.google.android.youtube"},
            {"X / Twitter", "com.twitter.android"},
            {"Facebook", "com.facebook.katana"},
            {"Reddit", "com.reddit.frontpage"},
            {"Snapchat", "com.snapchat.android"},
            {"Telegram", "org.telegram.messenger"}
    };

    private SoloPrefs() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String serverUrl(Context context) {
        return prefs(context).getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);
    }

    static void setServerUrl(Context context, String value) {
        String cleaned = value == null ? "" : value.trim();
        while (cleaned.endsWith("/")) cleaned = cleaned.substring(0, cleaned.length() - 1);
        if (cleaned.isEmpty()) cleaned = DEFAULT_SERVER_URL;
        prefs(context).edit().putString(KEY_SERVER_URL, cleaned).apply();
    }

    static String userId(Context context) {
        return prefs(context).getString(KEY_USER_ID, DEFAULT_USER_ID);
    }

    static void setUserId(Context context, String value) {
        String cleaned = value == null ? "" : value.trim();
        prefs(context).edit().putString(KEY_USER_ID, cleaned.isEmpty() ? DEFAULT_USER_ID : cleaned).apply();
    }

    static Set<String> blockedPackages(Context context) {
        Set<String> defaults = new LinkedHashSet<>();
        for (String[] item : DEFAULT_BLOCKED_APPS) defaults.add(item[1]);
        return new LinkedHashSet<>(prefs(context).getStringSet(KEY_BLOCKED_PACKAGES, defaults));
    }

    static boolean isBlockedPackage(Context context, String packageName) {
        return blockedPackages(context).contains(packageName);
    }

    static void setBlockedPackage(Context context, String packageName, boolean blocked) {
        Set<String> packages = blockedPackages(context);
        if (blocked) packages.add(packageName);
        else packages.remove(packageName);
        prefs(context).edit().putStringSet(KEY_BLOCKED_PACKAGES, packages).apply();
    }

    static boolean penaltyActive(Context context) {
        return prefs(context).getBoolean(KEY_PENALTY_ACTIVE, false);
    }

    static boolean accessibilityServiceEnabled(Context context) {
        AccessibilityManager manager =
                (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (manager == null || !manager.isEnabled()) return false;

        String expectedPackage = context.getPackageName();
        String expectedClass = SocialBlockerAccessibilityService.class.getName();
        for (AccessibilityServiceInfo info : manager.getEnabledAccessibilityServiceList(
                AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            if (info.getResolveInfo() == null || info.getResolveInfo().serviceInfo == null) continue;
            if (expectedPackage.equals(info.getResolveInfo().serviceInfo.packageName)
                    && expectedClass.equals(info.getResolveInfo().serviceInfo.name)) {
                return true;
            }
        }
        return false;
    }

    static String penaltyReason(Context context) {
        return prefs(context).getString(KEY_PENALTY_REASON, "");
    }

    static String questStatus(Context context) {
        return prefs(context).getString(KEY_QUEST_STATUS, "unknown");
    }

    static int questCompletedCount(Context context) {
        return prefs(context).getInt(KEY_QUEST_COMPLETED_COUNT, 0);
    }

    static int questTotalCount(Context context) {
        return prefs(context).getInt(KEY_QUEST_TOTAL_COUNT, 0);
    }

    static int currentStreak(Context context) {
        return prefs(context).getInt(KEY_CURRENT_STREAK, 0);
    }

    static int longestStreak(Context context) {
        return prefs(context).getInt(KEY_LONGEST_STREAK, 0);
    }

    static long lastSync(Context context) {
        return prefs(context).getLong(KEY_LAST_SYNC, 0L);
    }

    static String lastError(Context context) {
        return prefs(context).getString(KEY_LAST_ERROR, "");
    }

    static void savePenaltyState(Context context, PenaltyState state) {
        SharedPreferences.Editor edit = prefs(context).edit()
                .putLong(KEY_LAST_SYNC, state.fetchedAtMillis)
                .putString(KEY_LAST_ERROR, state.error);
        if (state.requestOk) {
            edit.putBoolean(KEY_PENALTY_ACTIVE, state.penaltyActive)
                    .putString(KEY_PENALTY_REASON, state.penaltyReason)
                    .putString(KEY_QUEST_STATUS, state.questStatus)
                    .putInt(KEY_QUEST_COMPLETED_COUNT, state.questCompletedCount)
                    .putInt(KEY_QUEST_TOTAL_COUNT, state.questTotalCount)
                    .putInt(KEY_CURRENT_STREAK, state.currentStreak)
                    .putInt(KEY_LONGEST_STREAK, state.longestStreak);
        }
        edit.apply();
    }

    static String appNameForPackage(String packageName) {
        for (String[] item : DEFAULT_BLOCKED_APPS) {
            if (item[1].equals(packageName)) return item[0];
        }
        return packageName;
    }

    static Set<String> knownPackages() {
        Set<String> packages = new LinkedHashSet<>();
        for (String[] item : DEFAULT_BLOCKED_APPS) packages.add(item[1]);
        return packages;
    }
}

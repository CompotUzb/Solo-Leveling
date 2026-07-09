package ai.humblebee.sololeveling;

import org.json.JSONObject;

final class PenaltyState {
    final boolean requestOk;
    final boolean penaltyActive;
    final String penaltyReason;
    final String questStatus;
    final int questCompletedCount;
    final int questTotalCount;
    final int currentStreak;
    final int longestStreak;
    final String error;
    final long fetchedAtMillis;

    private PenaltyState(
            boolean requestOk,
            boolean penaltyActive,
            String penaltyReason,
            String questStatus,
            int questCompletedCount,
            int questTotalCount,
            int currentStreak,
            int longestStreak,
            String error,
            long fetchedAtMillis
    ) {
        this.requestOk = requestOk;
        this.penaltyActive = penaltyActive;
        this.penaltyReason = penaltyReason;
        this.questStatus = questStatus;
        this.questCompletedCount = questCompletedCount;
        this.questTotalCount = questTotalCount;
        this.currentStreak = currentStreak;
        this.longestStreak = longestStreak;
        this.error = error;
        this.fetchedAtMillis = fetchedAtMillis;
    }

    static PenaltyState fromDailyJson(JSONObject root) {
        JSONObject state = root.optJSONObject("state");
        JSONObject quest = root.optJSONObject("quest");
        return new PenaltyState(
                true,
                state != null && state.optBoolean("penaltyActive", false),
                state == null ? "" : state.optString("penaltyReason", ""),
                quest == null ? "not_generated" : quest.optString("status", "unknown"),
                quest == null ? 0 : quest.optInt("completedCount", 0),
                quest == null ? 0 : quest.optInt("totalCount", 0),
                state == null ? 0 : state.optInt("currentStreak", 0),
                state == null ? 0 : state.optInt("longestStreak", 0),
                "",
                System.currentTimeMillis()
        );
    }

    static PenaltyState error(String message) {
        return new PenaltyState(false, false, "", "unknown", 0, 0, 0, 0, message, System.currentTimeMillis());
    }
}

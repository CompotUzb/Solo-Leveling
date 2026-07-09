package ai.humblebee.sololeveling;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.OutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

final class SoloApiClient {
    private static final int TIMEOUT_MS = 6000;

    private SoloApiClient() {}

    static PenaltyState fetchDaily(Context context) {
        try {
            String url = SoloPrefs.serverUrl(context)
                    + "/api/daily?userId="
                    + URLEncoder.encode(SoloPrefs.userId(context), "UTF-8");
            JSONObject root = requestJson("GET", url, null);
            return PenaltyState.fromDailyJson(root);
        } catch (Exception error) {
            return PenaltyState.error(error.getMessage() == null ? "Sync failed" : error.getMessage());
        }
    }

    static PenaltyState flushPenalty(Context context, String note) {
        try {
            String url = SoloPrefs.serverUrl(context) + "/api/daily/flush";
            JSONObject body = new JSONObject()
                    .put("userId", SoloPrefs.userId(context))
                    .put("note", note == null ? "Mobile penalty quest completed" : note);
            JSONObject root = requestJson("POST", url, body.toString());
            return PenaltyState.fromDailyJson(root);
        } catch (Exception error) {
            return PenaltyState.error(error.getMessage() == null ? "Flush failed" : error.getMessage());
        }
    }

    private static JSONObject requestJson(String method, String url, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(TIMEOUT_MS);
        connection.setReadTimeout(TIMEOUT_MS);
        connection.setRequestMethod(method);
        connection.setRequestProperty("Accept", "application/json");
        if (body != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
        }

        int code = connection.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
                code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream(),
                StandardCharsets.UTF_8
        ));
        StringBuilder result = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) result.append(line);
        if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code + ": " + result);
        return new JSONObject(result.toString());
    }
}

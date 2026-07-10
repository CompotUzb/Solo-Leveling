package ai.humblebee.sololeveling;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class BlockActivity extends Activity {
    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        String packageName = getIntent().getStringExtra("blocked_package");
        if (!SoloPrefs.penaltyActive(this)) {
            finish();
            return;
        }
        build(packageName == null ? "blocked app" : packageName);
    }

    private void build(String packageName) {
        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(Ui.NAV);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setBackgroundColor(Ui.BG);

        LinearLayout card = Ui.column(this);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        Ui.applySystemBarPadding(card, 24, 42, 24, 28);

        TextView badge = Ui.appBadge(this, "LOCK", Ui.DANGER);
        badge.setTextSize(10);
        badge.setBackground(Ui.roundedStroke(this, Ui.tint(Ui.DANGER, 24), 18, Ui.tint(Ui.DANGER, 110), 1));
        LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(Ui.dp(this, 72), Ui.dp(this, 72));
        badgeLp.setMargins(0, 0, 0, Ui.dp(this, 18));
        card.addView(badge, badgeLp);

        TextView label = Ui.label(this, "App Blocked");
        label.setTextColor(Ui.DANGER);
        label.setGravity(Gravity.CENTER);
        label.setLetterSpacing(0.2f);
        card.addView(label);

        TextView title = Ui.heading(this, "Penalty Active", 34, Ui.TEXT);
        title.setGravity(Gravity.CENTER);
        title.setAllCaps(true);
        card.addView(title);

        TextView body = Ui.text(
                this,
                SoloPrefs.appNameForPackage(packageName) + " is locked until your penalty quest is cleared and confirmed by the server.",
                14,
                Ui.MUTED,
                Typeface.NORMAL
        );
        body.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams bodyLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        bodyLp.setMargins(0, Ui.dp(this, 12), 0, Ui.dp(this, 18));
        card.addView(body, bodyLp);

        String reason = SoloPrefs.penaltyReason(this);
        if (reason != null && !reason.isEmpty()) {
            card.addView(Ui.alert(this, "Penalty reason", reason, Ui.DANGER));
        } else {
            card.addView(Ui.alert(this, "Penalty reason", "Daily discipline state is currently restricted.", Ui.DANGER));
        }

        Button refresh = Ui.dangerButton(this, "Refresh from Server");
        refresh.setOnClickListener(view -> refresh());
        card.addView(refresh);

        Button openTracker = Ui.button(this, "Open Solo Tracker");
        openTracker.setOnClickListener(view -> {
            startActivity(new Intent(this, MainActivity.class));
            finish();
        });
        card.addView(openTracker);

        TextView footer = Ui.label(this, "Penalty enforced · No bypass available");
        footer.setTextColor(Ui.DANGER);
        footer.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams footerLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        footerLp.setMargins(0, Ui.dp(this, 14), 0, 0);
        card.addView(footer, footerLp);

        scroll.addView(card, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.MATCH_PARENT
        ));
        setContentView(scroll);
    }

    private void refresh() {
        new Thread(() -> {
            PenaltyState state = SoloApiClient.fetchDaily(this);
            SoloPrefs.savePenaltyState(this, state);
            runOnUiThread(() -> {
                Toast.makeText(this, state.requestOk ? "Synced" : state.error, Toast.LENGTH_SHORT).show();
                if (!SoloPrefs.penaltyActive(this)) finish();
            });
        }).start();
    }
}

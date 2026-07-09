package ai.humblebee.sololeveling;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.style.ForegroundColorSpan;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

final class Ui {
    static final int BG = Color.rgb(5, 7, 15);
    static final int NAV = Color.rgb(10, 15, 30);
    static final int SURFACE = Color.rgb(13, 20, 38);
    static final int PANEL = Color.rgb(17, 26, 48);
    static final int PANEL_ALT = Color.rgb(10, 15, 30);
    static final int BORDER = Color.rgb(29, 43, 70);
    static final int TEXT = Color.rgb(230, 238, 252);
    static final int MUTED = Color.rgb(141, 155, 181);
    static final int METRIC_SUB = Color.rgb(185, 207, 244);
    static final int ACCENT = Color.rgb(56, 225, 255);
    static final int VIOLET = Color.rgb(167, 139, 250);
    static final int GOOD = Color.rgb(52, 211, 153);
    static final int WARNING = Color.rgb(251, 191, 36);
    static final int DANGER = Color.rgb(248, 113, 113);
    static final int ON_ACCENT = BG;
    static final int METRIC_TARGET = 1;
    static final int METRIC_FLAME = 2;
    static final int METRIC_PULSE = 3;
    static final int METRIC_CLOCK = 4;
    static final int ACTION_SYNC = 11;
    static final int ACTION_CHECK = 12;
    static final int ACTION_GEAR = 13;

    private Ui() {}

    static TextView text(Context context, String value, int sp, int color, int style) {
        TextView view = new TextView(context);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.create("sans-serif", style));
        view.setLineSpacing(0f, 1.12f);
        view.setIncludeFontPadding(true);
        view.setPadding(0, dp(context, 2), 0, dp(context, 2));
        return view;
    }

    static TextView heading(Context context, String value, int sp, int color) {
        TextView view = text(context, value, sp, color, Typeface.BOLD);
        view.setTypeface(Typeface.create("sans-serif-condensed", Typeface.BOLD));
        view.setAllCaps(false);
        view.setLetterSpacing(0.04f);
        return view;
    }

    static TextView heroTitle(Context context, boolean active) {
        String title = active ? "PENALTY ACTIVE" : "PENALTY CLEAR";
        TextView view = heading(context, title, isCompactWidth(context) ? 28 : 32, TEXT);
        view.setAllCaps(true);
        view.setLetterSpacing(0.06f);
        view.setSingleLine(true);
        view.setIncludeFontPadding(false);
        SpannableString styled = new SpannableString(title);
        String accentWord = active ? "ACTIVE" : "CLEAR";
        int start = title.indexOf(accentWord);
        if (start >= 0) {
            styled.setSpan(
                    new ForegroundColorSpan(active ? DANGER : ACCENT),
                    start,
                    start + accentWord.length(),
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
            );
        }
        view.setText(styled);
        return view;
    }

    static TextView label(Context context, String value) {
        TextView view = text(context, value.toUpperCase(), 10, MUTED, Typeface.BOLD);
        view.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        view.setLetterSpacing(0.12f);
        return view;
    }

    static LinearLayout sectionLabel(Context context, String value) {
        LinearLayout row = row(context);
        row.setPadding(0, dp(context, 8), 0, dp(context, 8));
        TextView label = label(context, value);
        row.addView(label);

        View line = new View(context);
        line.setBackgroundColor(BORDER);
        LinearLayout.LayoutParams lineLp = new LinearLayout.LayoutParams(
                0,
                Math.max(1, dp(context, 1)),
                1f
        );
        lineLp.setMargins(dp(context, 10), 0, 0, 0);
        row.addView(line, lineLp);
        return row;
    }

    static TextView chip(Context context, String value, int color) {
        TextView view = label(context, value);
        view.setTextColor(color);
        view.setGravity(Gravity.CENTER);
        view.setPadding(dp(context, 8), dp(context, 4), dp(context, 8), dp(context, 4));
        view.setBackground(roundedStroke(context, tint(color, 26), 4, tint(color, 84), 1));
        return view;
    }

    static Button button(Context context, String label) {
        return button(context, label, PANEL, TEXT, BORDER);
    }

    static Button primaryButton(Context context, String label) {
        return button(context, label, ACCENT, ON_ACCENT, ACCENT);
    }

    static Button violetButton(Context context, String label) {
        return button(context, label, tint(VIOLET, 22), VIOLET, tint(VIOLET, 96));
    }

    static Button dangerButton(Context context, String label) {
        return button(context, label, DANGER, BG, DANGER);
    }

    static Button button(Context context, String label, int background, int textColor, int strokeColor) {
        Button button = new Button(context);
        button.setText(label.toUpperCase());
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTypeface(Typeface.create("sans-serif-condensed", Typeface.BOLD));
        button.setLetterSpacing(0.06f);
        button.setTextColor(textColor);
        button.setGravity(Gravity.CENTER);
        button.setMinHeight(dp(context, 48));
        button.setPadding(dp(context, 12), 0, dp(context, 12), 0);
        button.setBackground(roundedStroke(context, background, 8, strokeColor, 1));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lp.setMargins(0, dp(context, 10), 0, 0);
        button.setLayoutParams(lp);
        return button;
    }

    static LinearLayout primaryActionButton(Context context, String label, int icon) {
        return actionButton(context, label, icon, ACCENT, ON_ACCENT, ACCENT);
    }

    static LinearLayout violetActionButton(Context context, String label, int icon) {
        return actionButton(context, label, icon, tint(VIOLET, 18), VIOLET, tint(VIOLET, 104));
    }

    static LinearLayout outlineActionButton(Context context, String label, int icon) {
        return actionButton(context, label, icon, BG, METRIC_SUB, BORDER);
    }

    static LinearLayout actionButton(Context context, String label, int icon, int background, int textColor, int strokeColor) {
        LinearLayout button = row(context);
        button.setGravity(Gravity.CENTER);
        button.setClickable(true);
        button.setFocusable(true);
        button.setMinimumHeight(dp(context, 63));
        button.setPadding(dp(context, 18), 0, dp(context, 18), 0);
        button.setBackground(roundedStroke(context, background, 9, strokeColor, 1));
        button.setElevation(dp(context, 1));

        View iconView = actionIcon(context, icon, textColor);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(context, 18), dp(context, 18));
        iconLp.setMargins(0, 0, dp(context, 10), 0);
        button.addView(iconView, iconLp);

        TextView text = text(context, label.toUpperCase(), 19, textColor, Typeface.BOLD);
        text.setTypeface(Typeface.create("sans-serif-condensed", Typeface.BOLD));
        text.setLetterSpacing(0.08f);
        text.setGravity(Gravity.CENTER);
        text.setIncludeFontPadding(false);
        button.addView(text);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lp.setMargins(0, dp(context, 12), 0, 0);
        button.setLayoutParams(lp);
        applyPressAnimation(button);
        return button;
    }

    static LinearLayout navTab(Context context, String abbr, String label, boolean active) {
        LinearLayout tab = column(context);
        tab.setGravity(Gravity.CENTER);
        tab.setClickable(true);
        tab.setPadding(0, 0, 0, 0);

        View top = new View(context);
        top.setBackground(active ? rounded(context, ACCENT, 1) : rounded(context, Color.TRANSPARENT, 1));
        LinearLayout.LayoutParams topLp = new LinearLayout.LayoutParams(dp(context, 34), dp(context, 2));
        tab.addView(top, topLp);

        TextView icon = label(context, abbr);
        icon.setTextColor(active ? ACCENT : MUTED);
        icon.setTextSize(10);
        icon.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        iconLp.setMargins(0, dp(context, 8), 0, 0);
        tab.addView(icon, iconLp);

        TextView title = label(context, label);
        title.setTextColor(active ? ACCENT : MUTED);
        title.setTextSize(9);
        title.setGravity(Gravity.CENTER);
        title.setLetterSpacing(0.06f);
        tab.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        return tab;
    }

    static LinearLayout card(Context context) {
        return card(context, SURFACE, BORDER);
    }

    static LinearLayout card(Context context, int background, int border) {
        LinearLayout card = column(context);
        card.setBackground(roundedStroke(context, background, 8, border, 1));
        int pad = dp(context, 15);
        card.setPadding(pad, pad, pad, pad);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lp.setMargins(0, 0, 0, dp(context, 12));
        card.setLayoutParams(lp);
        return card;
    }

    static LinearLayout heroCard(Context context, int statusColor) {
        LinearLayout card = column(context);
        GradientDrawable background = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{PANEL, SURFACE}
        );
        background.setCornerRadius(dp(context, 15));
        background.setStroke(dp(context, 1), BORDER);
        card.setBackground(background);
        card.setPadding(0, 0, 0, 0);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lp.setMargins(0, 0, 0, dp(context, 12));
        card.setLayoutParams(lp);
        View stripe = new View(context);
        stripe.setBackgroundColor(statusColor);
        LinearLayout.LayoutParams stripeLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                Math.max(2, dp(context, 2))
        );
        stripeLp.setMargins(dp(context, 12), 0, dp(context, 12), 0);
        card.addView(stripe, stripeLp);
        return card;
    }

    static LinearLayout weekDots(Context context, int filled, int total, int color) {
        LinearLayout row = row(context);
        row.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        int safeTotal = Math.max(total, 1);
        int safeFilled = Math.max(0, Math.min(filled, safeTotal));
        for (int i = 0; i < safeTotal; i++) {
            View dot = new View(context);
            dot.setBackground(rounded(context, i < safeFilled ? color : BORDER, 4));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(context, 8), dp(context, 8));
            lp.setMargins(dp(context, 3), 0, 0, 0);
            row.addView(dot, lp);
        }
        return row;
    }

    static LinearLayout metricCard(Context context, String label, String value, String sub, int color) {
        return metricCard(context, 0, label, value, sub, color, -1);
    }

    static LinearLayout metricCard(Context context, String label, String value, String sub, int color, int progressPercent) {
        return metricCard(context, 0, label, value, sub, color, progressPercent);
    }

    static LinearLayout metricCard(Context context, int icon, String label, String value, String sub, int color) {
        return metricCard(context, icon, label, value, sub, color, -1);
    }

    static LinearLayout metricCard(Context context, int icon, String label, String value, String sub, int color, int progressPercent) {
        LinearLayout card = card(context);
        card.setMinimumHeight(metricCardHeight(context));
        card.setPadding(dp(context, 16), dp(context, 13), dp(context, 16), dp(context, 13));
        card.addView(metricLabel(context, icon, label, color));

        TextView valueView = text(context, value, metricValueSize(context, value), color, Typeface.BOLD);
        valueView.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        valueView.setIncludeFontPadding(true);
        valueView.setSingleLine(true);
        valueView.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams valueLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        valueLp.setMargins(0, dp(context, 6), 0, 0);
        card.addView(valueView, valueLp);

        TextView subView = text(context, sub, 13, METRIC_SUB, Typeface.NORMAL);
        subView.setSingleLine(true);
        subView.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        subLp.setMargins(0, 0, 0, 0);
        card.addView(subView, subLp);

        if (progressPercent >= 0) {
            card.addView(new View(context), new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    0,
                    1f
            ));
            card.addView(progressBar(context, progressPercent, color));
        }
        return card;
    }

    static LinearLayout dailyQuestMetricCard(Context context, int icon, String label, String value, String sub, int color, int progressPercent) {
        LinearLayout card = column(context);
        card.setMinimumHeight(metricCardHeight(context));
        card.setPadding(0, 0, 0, 0);
        card.setBackground(roundedStroke(context, SURFACE, 8, BORDER, 1));

        LinearLayout inner = column(context);
        inner.setPadding(dp(context, 16), dp(context, 13), dp(context, 16), dp(context, 13));
        inner.addView(metricLabel(context, icon, label, color));

        TextView valueView = text(context, value, metricValueSize(context, value), color, Typeface.BOLD);
        valueView.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        valueView.setIncludeFontPadding(true);
        valueView.setSingleLine(true);
        valueView.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams valueLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        valueLp.setMargins(0, dp(context, 6), 0, 0);
        inner.addView(valueView, valueLp);

        TextView subView = text(context, sub, 13, METRIC_SUB, Typeface.NORMAL);
        subView.setSingleLine(true);
        subView.setEllipsize(TextUtils.TruncateAt.END);
        inner.addView(subView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        inner.addView(new View(context), new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));
        inner.addView(progressBar(context, progressPercent, color));

        card.addView(inner, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
        ));
        return card;
    }

    static int metricCardHeight(Context context) {
        return dp(context, 135);
    }

    static LinearLayout progressBar(Context context, int progressPercent, int color) {
        LinearLayout track = row(context);
        track.setGravity(Gravity.CENTER_VERTICAL);
        track.setBackground(rounded(context, tint(color, 30), 3));
        int safe = Math.max(0, Math.min(progressPercent, 100));

        View fill = new View(context);
        fill.setBackground(rounded(context, color, 3));
        track.addView(fill, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, safe));

        View empty = new View(context);
        track.addView(empty, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 100 - safe));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(context, 4)
        );
        lp.setMargins(0, dp(context, 4), 0, 0);
        track.setLayoutParams(lp);
        return track;
    }

    static LinearLayout metricLabel(Context context, int icon, String value, int color) {
        LinearLayout row = row(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        if (icon != 0) {
            View iconView = metricIcon(context, icon, color);
            LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(context, 14), dp(context, 14));
            iconLp.setMargins(0, 0, dp(context, 7), 0);
            row.addView(iconView, iconLp);
        }
        TextView label = label(context, value);
        label.setTextColor(TEXT);
        label.setTextSize(10);
        label.setLetterSpacing(0.14f);
        row.addView(label);
        return row;
    }

    static View metricIcon(Context context, int icon, int color) {
        return new View(context) {
            private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

            @Override
            protected void onDraw(Canvas canvas) {
                super.onDraw(canvas);
                float w = getWidth();
                float h = getHeight();
                float cx = w / 2f;
                float cy = h / 2f;
                paint.setColor(color);
                paint.setStrokeWidth(Math.max(1.2f, dp(context, 1)));
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeCap(Paint.Cap.ROUND);
                paint.setStrokeJoin(Paint.Join.ROUND);

                if (icon == METRIC_TARGET) {
                    canvas.drawCircle(cx, cy, Math.min(w, h) * 0.42f, paint);
                    canvas.drawCircle(cx, cy, Math.min(w, h) * 0.22f, paint);
                    paint.setStyle(Paint.Style.FILL);
                    canvas.drawCircle(cx, cy, Math.max(1f, Math.min(w, h) * 0.06f), paint);
                    return;
                }

                if (icon == METRIC_FLAME) {
                    Path flame = new Path();
                    flame.moveTo(cx, h * 0.12f);
                    flame.cubicTo(w * 0.64f, h * 0.32f, w * 0.82f, h * 0.46f, w * 0.74f, h * 0.70f);
                    flame.cubicTo(w * 0.66f, h * 0.94f, w * 0.30f, h * 0.95f, w * 0.24f, h * 0.70f);
                    flame.cubicTo(w * 0.18f, h * 0.50f, w * 0.38f, h * 0.36f, w * 0.42f, h * 0.22f);
                    canvas.drawPath(flame, paint);
                    return;
                }

                if (icon == METRIC_PULSE) {
                    Path pulse = new Path();
                    pulse.moveTo(w * 0.06f, h * 0.58f);
                    pulse.lineTo(w * 0.28f, h * 0.58f);
                    pulse.lineTo(w * 0.38f, h * 0.22f);
                    pulse.lineTo(w * 0.52f, h * 0.82f);
                    pulse.lineTo(w * 0.63f, h * 0.48f);
                    pulse.lineTo(w * 0.94f, h * 0.48f);
                    canvas.drawPath(pulse, paint);
                    return;
                }

                if (icon == METRIC_CLOCK) {
                    canvas.drawCircle(cx, cy, Math.min(w, h) * 0.42f, paint);
                    canvas.drawLine(cx, cy, cx, h * 0.30f, paint);
                    canvas.drawLine(cx, cy, w * 0.68f, cy, paint);
                }
            }
        };
    }

    static View actionIcon(Context context, int icon, int color) {
        return new View(context) {
            private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

            @Override
            protected void onDraw(Canvas canvas) {
                super.onDraw(canvas);
                float w = getWidth();
                float h = getHeight();
                float cx = w / 2f;
                float cy = h / 2f;
                float r = Math.min(w, h) * 0.36f;

                paint.setColor(color);
                paint.setStrokeWidth(Math.max(1.6f, dp(context, 1)));
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeCap(Paint.Cap.ROUND);
                paint.setStrokeJoin(Paint.Join.ROUND);

                if (icon == ACTION_SYNC) {
                    float left = cx - r;
                    float top = cy - r;
                    float right = cx + r;
                    float bottom = cy + r;
                    canvas.drawArc(left, top, right, bottom, 42, 255, false, paint);
                    canvas.drawArc(left, top, right, bottom, 222, 255, false, paint);

                    Path topHead = new Path();
                    topHead.moveTo(w * 0.74f, h * 0.18f);
                    topHead.lineTo(w * 0.76f, h * 0.39f);
                    topHead.lineTo(w * 0.56f, h * 0.33f);
                    canvas.drawPath(topHead, paint);

                    Path bottomHead = new Path();
                    bottomHead.moveTo(w * 0.26f, h * 0.82f);
                    bottomHead.lineTo(w * 0.24f, h * 0.61f);
                    bottomHead.lineTo(w * 0.44f, h * 0.67f);
                    canvas.drawPath(bottomHead, paint);
                    return;
                }

                if (icon == ACTION_CHECK) {
                    canvas.drawCircle(cx, cy, r, paint);
                    Path check = new Path();
                    check.moveTo(w * 0.33f, h * 0.52f);
                    check.lineTo(w * 0.46f, h * 0.65f);
                    check.lineTo(w * 0.70f, h * 0.38f);
                    canvas.drawPath(check, paint);
                    return;
                }

                if (icon == ACTION_GEAR) {
                    canvas.drawCircle(cx, cy, r * 0.54f, paint);
                    canvas.drawCircle(cx, cy, r * 0.18f, paint);
                    for (int i = 0; i < 8; i++) {
                        double a = (Math.PI * 2.0 * i) / 8.0;
                        float x1 = cx + (float) Math.cos(a) * r * 0.72f;
                        float y1 = cy + (float) Math.sin(a) * r * 0.72f;
                        float x2 = cx + (float) Math.cos(a) * r * 1.03f;
                        float y2 = cy + (float) Math.sin(a) * r * 1.03f;
                        canvas.drawLine(x1, y1, x2, y2, paint);
                    }
                }
            }
        };
    }

    static void applyPressAnimation(View view) {
        view.setOnTouchListener((target, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                target.animate()
                        .scaleX(0.985f)
                        .scaleY(0.985f)
                        .alpha(0.88f)
                        .translationY(dp(target.getContext(), 1))
                        .setDuration(90)
                        .start();
            } else if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                target.animate()
                        .scaleX(1f)
                        .scaleY(1f)
                        .alpha(1f)
                        .translationY(0f)
                        .setDuration(140)
                        .start();
            }
            return false;
        });
    }

    private static int metricValueSize(Context context, String value) {
        int length = value == null ? 0 : value.length();
        if (isCompactWidth(context)) {
            if (length > 8) return 22;
            return 27;
        }
        if (length > 8) return 23;
        return 28;
    }

    static TextView appBadge(Context context, String abbr, int color) {
        TextView badge = label(context, abbr);
        badge.setTextColor(color);
        badge.setGravity(Gravity.CENTER);
        badge.setTextSize(11);
        badge.setBackground(roundedStroke(context, tint(color, 26), 8, tint(color, 96), 1));
        badge.setPadding(0, 0, 0, 0);
        return badge;
    }

    static LinearLayout row(Context context) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        return row;
    }

    static LinearLayout column(Context context) {
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        return column;
    }

    static View divider(Context context) {
        View divider = new View(context);
        divider.setBackgroundColor(BORDER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                Math.max(1, dp(context, 1))
        );
        lp.setMargins(0, dp(context, 12), 0, dp(context, 12));
        divider.setLayoutParams(lp);
        return divider;
    }

    static LinearLayout detailRow(Context context, String label, String value, int valueColor) {
        LinearLayout row = row(context);
        row.setPadding(0, dp(context, 5), 0, dp(context, 5));

        TextView left = text(context, label, 13, MUTED, Typeface.NORMAL);
        TextView right = text(context, value, 13, valueColor, Typeface.BOLD);
        right.setGravity(Gravity.END);

        row.addView(left, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(right, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    static LinearLayout alert(Context context, String title, String body, int color) {
        LinearLayout alert = column(context);
        alert.setBackground(roundedStroke(context, tint(color, 20), 8, tint(color, 108), 1));
        int pad = dp(context, 13);
        alert.setPadding(pad, pad, pad, pad);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lp.setMargins(0, dp(context, 10), 0, 0);
        alert.setLayoutParams(lp);
        alert.addView(heading(context, title, 14, color));
        alert.addView(text(context, body, 12, TEXT, Typeface.NORMAL));
        return alert;
    }

    static void styleInput(EditText input) {
        Context context = input.getContext();
        input.setTextColor(TEXT);
        input.setHintTextColor(tint(MUTED, 140));
        input.setTextSize(15);
        input.setSingleLine(true);
        input.setPadding(dp(context, 12), 0, dp(context, 12), 0);
        input.setMinHeight(dp(context, 48));
        input.setBackground(roundedStroke(context, PANEL_ALT, 8, BORDER, 1));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lp.setMargins(0, dp(context, 6), 0, dp(context, 12));
        input.setLayoutParams(lp);
    }

    static void styleCheckBox(CheckBox box) {
        int[][] states = new int[][]{
                new int[]{android.R.attr.state_checked},
                new int[]{-android.R.attr.state_checked}
        };
        int[] colors = new int[]{ACCENT, MUTED};
        box.setButtonTintList(new ColorStateList(states, colors));
        box.setTextColor(TEXT);
    }

    static void applySystemBarPadding(View view, int leftDp, int topDp, int rightDp, int bottomDp) {
        Context context = view.getContext();
        int baseLeft = dp(context, leftDp);
        int baseTop = dp(context, topDp);
        int baseRight = dp(context, rightDp);
        int baseBottom = dp(context, bottomDp);
        view.setPadding(baseLeft, baseTop, baseRight, baseBottom);
        view.setOnApplyWindowInsetsListener((target, insets) -> {
            target.setPadding(
                    baseLeft + insets.getSystemWindowInsetLeft(),
                    baseTop + insets.getSystemWindowInsetTop(),
                    baseRight + insets.getSystemWindowInsetRight(),
                    baseBottom + insets.getSystemWindowInsetBottom()
            );
            return insets;
        });
        view.requestApplyInsets();
    }

    static boolean isCompactWidth(Context context) {
        return context.getResources().getConfiguration().screenWidthDp < 360;
    }

    static GradientDrawable rounded(Context context, int color, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(context, radiusDp));
        return drawable;
    }

    static GradientDrawable roundedStroke(Context context, int color, int radiusDp, int strokeColor, int strokeDp) {
        GradientDrawable drawable = rounded(context, color, radiusDp);
        drawable.setStroke(dp(context, strokeDp), strokeColor);
        return drawable;
    }

    static int tint(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
    }

    static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}

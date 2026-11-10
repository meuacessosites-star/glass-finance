package com.glassfinance.monitor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Native settings for the optional notification monitor. The financial app
 * itself is opened directly by MainActivity in the user's trusted browser.
 * Local suggestions never change account balances or reach the network.
 */
public final class MonitorActivity extends Activity {
    private static final int NAVY = Color.rgb(23, 37, 69);
    private static final int MUTED = Color.rgb(96, 113, 143);
    private static final int BLUE = Color.rgb(76, 92, 211);
    private static final int BACKGROUND = Color.rgb(245, 247, 253);
    private TextView status;
    private TextView list;

    private int dp(int units) {
        return Math.round(units * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable background(int color, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(radius));
        return shape;
    }

    private TextView label(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        if (bold) view.setTypeface(null, Typeface.BOLD);
        return view;
    }

    private LinearLayout column(int padding) {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(padding), dp(padding), dp(padding), dp(padding));
        return layout;
    }

    private void gap(LinearLayout parent, int height) {
        View spacer = new View(this);
        parent.addView(spacer, new LinearLayout.LayoutParams(1, dp(height)));
    }

    private TextView action(String text, boolean primary, Runnable click) {
        TextView button = label(text, 14, primary ? Color.WHITE : BLUE, true);
        button.setGravity(Gravity.CENTER);
        button.setBackground(background(primary ? BLUE : Color.rgb(233, 237, 255), 15));
        button.setPadding(dp(14), dp(15), dp(14), dp(15));
        button.setOnClickListener(v -> click.run());
        button.setClickable(true);
        button.setFocusable(true);
        return button;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BACKGROUND);
        LinearLayout root = column(20);
        scroll.addView(root);

        TextView back = label("‹  Glass Finance", 15, BLUE, true);
        back.setPadding(0, dp(6), 0, dp(9));
        back.setOnClickListener(v -> finish());
        root.addView(back);

        TextView title = label("Monitor financeiro", 26, NAVY, true);
        root.addView(title);
        gap(root, 8);
        root.addView(label(
            "Acompanhe os avisos bancários identificados neste aparelho. O site e seus dados permanecem independentes.",
            14, MUTED, false));

        gap(root, 20);
        LinearLayout panel = column(18);
        panel.setBackground(background(Color.WHITE, 22));
        root.addView(panel);

        status = label("", 14, NAVY, true);
        panel.addView(status);
        gap(panel, 12);
        panel.addView(action("Configurar permissão no Android", true, () -> {
            try {
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            } catch (Exception error) {
                status.setText("Este aparelho não conseguiu abrir a página de autorização.");
            }
        }));
        gap(panel, 10);
        panel.addView(label(
            "A permissão é opcional e pode ser revogada nas configurações do celular. Apenas avisos bancários reconhecidos são mantidos neste protótipo.",
            12, MUTED, false));

        gap(root, 18);
        LinearLayout history = column(18);
        history.setBackground(background(Color.WHITE, 22));
        root.addView(history);
        history.addView(label("Avisos identificados", 18, NAVY, true));
        gap(history, 5);
        history.addView(label(
            "Somente registros locais de teste. Ainda não são sincronizados com o Glass Finance.",
            12, MUTED, false));
        gap(history, 15);
        list = label("", 14, NAVY, false);
        history.addView(list);
        gap(history, 14);
        history.addView(action("Atualizar avisos", false, this::refresh));

        gap(root, 14);
        root.addView(action("Apagar histórico deste celular", false, () -> {
            new AlertDialog.Builder(this)
                .setTitle("Apagar avisos?")
                .setMessage("Apaga apenas as sugestões deste aparelho. Não altera nenhuma transação do site.")
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Apagar", (dialog, which) -> {
                    LocalAlertStore.clear(this);
                    refresh();
                })
                .show();
        }));
        gap(root, 20);
        root.addView(label(
            "Experimento independente · Nenhuma notificação é enviada à internet.",
            12, MUTED, false));

        setContentView(scroll);
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (status != null && list != null) refresh();
    }

    private void refresh() {
        ComponentName component = new ComponentName(this, FinancialNotificationListener.class);
        String enabled = Settings.Secure.getString(
            getContentResolver(), "enabled_notification_listeners");
        boolean authorized = enabled != null && enabledComponent(enabled, component);
        status.setText(authorized
            ? "● Monitoramento autorizado"
            : "○ Monitoramento desativado");

        JSONArray items = LocalAlertStore.get(this);
        StringBuilder out = new StringBuilder();
        out.append(items.length())
            .append(items.length() == 1 ? " aviso reconhecido" : " avisos reconhecidos")
            .append("\n\n");
        DateFormat date = DateFormat.getDateTimeInstance(
            DateFormat.SHORT, DateFormat.SHORT, new Locale("pt", "BR"));

        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            out.append("• ").append(item.optString("bank")).append(" · ");
            out.append(item.optString("kind")).append("\n");
            if (item.has("amountCents")) {
                long cents = item.optLong("amountCents");
                out.append(String.format(new Locale("pt", "BR"),
                    "R$ %,.2f", cents / 100.0)).append("\n");
            } else {
                out.append("Valor para conferir\n");
            }
            out.append(date.format(new Date(item.optLong("date"))))
                .append("\n\n");
        }
        if (items.length() == 0) out.append(
            "Nenhum aviso financeiro encontrado até agora. Notificações de outros aplicativos são ignoradas.");
        list.setText(out.toString());
    }

    private static boolean enabledComponent(String value, ComponentName target) {
        for (String part : value.split(":")) {
            ComponentName parsed = ComponentName.unflattenFromString(part);
            if (target.equals(parsed)) return true;
        }
        return false;
    }
}

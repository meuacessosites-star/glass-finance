package com.glassfinance.monitor;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Internal-only trial. No internet, no connection to the Glass Finance account.
 */
public final class MainActivity extends Activity {
    private TextView status;
    private TextView list;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (18 * getResources().getDisplayMetrics().density);
        column.setPadding(padding, padding, padding, padding);

        TextView heading = new TextView(this);
        heading.setText("Glass Finance — Monitor experimental");
        heading.setTextSize(22);
        column.addView(heading);

        TextView description = new TextView(this);
        description.setText("Teste local, sem conexão com o site. O Android permite autorizar a leitura de notificações. Apenas avisos reconhecidos de aplicativos bancários entram no histórico; não são enviados para a internet.");
        description.setPadding(0, padding / 2, 0, padding / 2);
        column.addView(description);

        status = new TextView(this);
        column.addView(status);

        Button permission = new Button(this);
        permission.setText("Configurar acesso às notificações");
        permission.setOnClickListener(v -> {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            try { startActivity(intent); }
            catch (Exception ignored) { status.setText("Não foi possível abrir as configurações neste Android."); }
        });
        column.addView(permission);

        Button refresh = new Button(this);
        refresh.setText("Atualizar histórico");
        refresh.setOnClickListener(v -> refresh());
        column.addView(refresh);

        Button clear = new Button(this);
        clear.setText("Apagar avisos salvos neste celular");
        clear.setOnClickListener(v -> {
            new android.app.AlertDialog.Builder(this)
                .setTitle("Apagar avisos locais?")
                .setMessage("Isso apaga somente o histórico experimental deste celular. Nenhum dado do Glass Finance será alterado.")
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Apagar", (dialog, which) -> {
                    LocalAlertStore.clear(this);
                    refresh();
                }).show();
        });
        column.addView(clear);

        list = new TextView(this);
        list.setTextSize(15);
        list.setPadding(0, padding / 2, 0, 0);
        column.addView(list);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(column);
        setContentView(scroll);
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        ComponentName component = new ComponentName(this, FinancialNotificationListener.class);
        String enabled = Settings.Secure.getString(
            getContentResolver(), "enabled_notification_listeners");
        boolean authorized = enabled != null && isEnabledComponent(enabled, component);
        status.setText(authorized
            ? "Acesso autorizado no Android. Monitor local ativado."
            : "Monitor desligado: autorize o acesso nas configurações, se desejar.");

        JSONArray items = LocalAlertStore.get(this);
        StringBuilder out = new StringBuilder();
        out.append("\nAvisos financeiros reconhecidos: ").append(items.length()).append("\n\n");
        DateFormat date = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, new Locale("pt", "BR"));
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            out.append(item.optString("bank")).append(" · ");
            out.append(item.optString("kind")).append("\n");
            if (item.has("amountCents")) {
                double amount = item.optLong("amountCents") / 100.0;
                out.append(String.format(new Locale("pt", "BR"), "R$ %.2f", amount)).append("\n");
            } else {
                out.append("Valor não identificado: conferir manualmente\n");
            }
            out.append(date.format(new Date(item.optLong("date")))).append("\n\n");
        }
        if (items.length() == 0) out.append("Nenhum aviso reconhecido. Notificações promocionais e aplicativos não bancários são ignorados.");
        list.setText(out.toString());
    }

    private static boolean isEnabledComponent(String value, ComponentName target) {
        for (String part : value.split(":")) {
            ComponentName component = ComponentName.unflattenFromString(part);
            if (target.equals(component)) return true;
        }
        return false;
    }
}

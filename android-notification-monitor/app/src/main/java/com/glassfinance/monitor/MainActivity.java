package com.glassfinance.monitor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;
import androidx.browser.customtabs.CustomTabsIntent;

/**
 * First-open explanation for the optional Android-only notification listener.
 *
 * The Android OS owns the permission screen. This activity cannot grant
 * restricted settings or read notifications. The user can always decline.
 * The Glass Finance financial dashboard is loaded in a trusted browser so
 * Google sign-in is not embedded inside a disallowed WebView.
 */
public final class MainActivity extends Activity {
    private static final Uri SITE = Uri.parse("https://glass-finance-teal.vercel.app/");
    private static final String PREF_NAME = "monitor_preferences";
    private static final String INTRO_DONE = "native_monitor_intro_v1";
    private boolean openingPermissionSettings = false;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        SharedPreferences preferences = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
        if (preferences.getBoolean(INTRO_DONE, false)) {
            openSite();
        } else {
            showFirstRunChoice(preferences);
        }
    }

    private void showFirstRunChoice(SharedPreferences preferences) {
        new AlertDialog.Builder(this)
            .setTitle("Glass Finance — monitor financeiro")
            .setMessage("Deseja configurar o monitoramento de avisos financeiros deste celular?\n\n"
                + "O Android solicitará uma autorização especial que pode dar ao aplicativo "
                + "acesso a notificações de outros apps, inclusive informações pessoais.\n\n"
                + "Este protótipo só examina avisos de bancos conhecidos, mantém sugestões "
                + "localmente e não envia dados para o site. "
                + "Você poderá continuar usando o Glass Finance sem ativar o monitor.")
            .setCancelable(false)
            .setPositiveButton("Configurar monitor", (dialog, which) -> {
                preferences.edit().putBoolean(INTRO_DONE, true).apply();
                openPermissionSettings();
            })
            .setNegativeButton("Agora não", (dialog, which) -> {
                preferences.edit().putBoolean(INTRO_DONE, true).apply();
                openSite();
            })
            .setNeutralButton("Ver detalhes", (dialog, which) -> {
                preferences.edit().putBoolean(INTRO_DONE, true).apply();
                startActivity(new Intent(this, MonitorActivity.class));
                finish();
            })
            .show();
    }

    private void openPermissionSettings() {
        openingPermissionSettings = true;
        try {
            startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
        } catch (Exception unavailable) {
            openingPermissionSettings = false;
            new AlertDialog.Builder(this)
                .setTitle("Configuração indisponível")
                .setMessage("O Android não abriu a página de acesso a notificações. "
                    + "O monitor permanecerá desativado. Você ainda pode usar o Glass Finance.")
                .setPositiveButton("Abrir Glass Finance", (dialog, which) -> openSite())
                .show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!openingPermissionSettings) return;
        openingPermissionSettings = false;
        if (isMonitorAuthorized()) {
            Toast.makeText(this, "Monitor autorizado no Android", Toast.LENGTH_LONG).show();
            openSite();
        } else {
            new AlertDialog.Builder(this)
                .setTitle("Monitor não autorizado")
                .setMessage("A autorização não foi ativada. Se o Android impedir o acesso, "
                    + "não é possível liberar a restrição pelo aplicativo. "
                    + "O Glass Finance continuará funcionando normalmente.")
                .setPositiveButton("Abrir Glass Finance", (dialog, which) -> openSite())
                .setNegativeButton("Ver monitor", (dialog, which) -> {
                    startActivity(new Intent(this, MonitorActivity.class));
                    finish();
                })
                .show();
        }
    }

    private boolean isMonitorAuthorized() {
        String enabled = Settings.Secure.getString(
            getContentResolver(), "enabled_notification_listeners");
        if (enabled == null) return false;
        ComponentName expected = new ComponentName(this, FinancialNotificationListener.class);
        for (String item : enabled.split(":")) {
            if (expected.equals(ComponentName.unflattenFromString(item))) return true;
        }
        return false;
    }

    private void openSite() {
        try {
            new CustomTabsIntent.Builder()
                .setShowTitle(false)
                .build()
                .launchUrl(this, SITE);
        } catch (Exception firstError) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, SITE));
            } catch (Exception secondError) {
                Toast.makeText(this,
                    "Não foi possível abrir o Glass Finance. Verifique seu navegador.",
                    Toast.LENGTH_LONG).show();
            }
        }
        finish();
    }
}

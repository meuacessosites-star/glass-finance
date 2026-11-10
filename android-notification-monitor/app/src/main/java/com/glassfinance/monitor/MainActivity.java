package com.glassfinance.monitor;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;
import androidx.browser.customtabs.CustomTabsIntent;

/**
 * The financial dashboard is the actual Glass Finance website.
 * On launch, open it directly through the trusted system browser, not a
 * custom WebView (which can break Google's OAuth login).
 *
 * The optional native notification monitor lives in MonitorActivity and
 * has its own launcher shortcut. Neither activity writes to Convex.
 */
public final class MainActivity extends Activity {
    private static final Uri SITE =
        Uri.parse("https://glass-finance-teal.vercel.app/");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            new CustomTabsIntent.Builder()
                .setShowTitle(false)
                .build()
                .launchUrl(this, SITE);
        } catch (Exception firstError) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, SITE));
            } catch (Exception secondError) {
                Toast.makeText(this, "Não foi possível abrir o Glass Finance. Verifique o navegador.", Toast.LENGTH_LONG).show();
            }
        }
        finish();
    }
}

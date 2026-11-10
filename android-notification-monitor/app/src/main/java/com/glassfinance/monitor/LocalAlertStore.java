package com.glassfinance.monitor;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** Local-only queue. Does not store names, original notification content, or tokens. */
public final class LocalAlertStore {
    private static final String PREFS = "prototype_financial_alerts";
    private static final String ITEMS = "items_v1";
    private static final int MAX_ITEMS = 100;

    private LocalAlertStore() {}

    public static synchronized boolean add(Context context, String sourceEventKey,
                                           BankAlertParser.Alert alert, long timestamp) {
        if (sourceEventKey == null || sourceEventKey.isEmpty() || alert == null) return false;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray current = read(prefs);
        String id = digest(sourceEventKey);
        for (int i = 0; i < current.length(); i++) {
            JSONObject item = current.optJSONObject(i);
            if (item != null && id.equals(item.optString("id"))) return false;
        }

        try {
            JSONObject incoming = new JSONObject();
            incoming.put("id", id);
            incoming.put("bank", alert.bank);
            incoming.put("kind", alert.kind);
            incoming.put("date", timestamp);
            if (alert.amountCents != null) incoming.put("amountCents", alert.amountCents);
            JSONArray updated = new JSONArray();
            updated.put(incoming);
            for (int i = 0; i < current.length() && updated.length() < MAX_ITEMS; i++) {
                updated.put(current.get(i));
            }
            return prefs.edit().putString(ITEMS, updated.toString()).commit();
        } catch (JSONException e) {
            return false;
        }
    }

    public static synchronized JSONArray get(Context context) {
        return read(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE));
    }

    public static synchronized void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(ITEMS).apply();
    }

    private static JSONArray read(SharedPreferences prefs) {
        try {
            return new JSONArray(prefs.getString(ITEMS, "[]"));
        } catch (JSONException e) {
            // Do not silently overwrite a damaged local queue.
            return new JSONArray();
        }
    }

    private static String digest(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte b : hash) result.append(String.format("%02x", b & 0xff));
            return result.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}

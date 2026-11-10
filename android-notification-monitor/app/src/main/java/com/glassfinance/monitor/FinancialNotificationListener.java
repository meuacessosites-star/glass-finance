package com.glassfinance.monitor;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Only bank packages are inspected. Other apps' notification contents are not read
 * or retained. No network permission, no cloud sync, no automatic transactions.
 */
public final class FinancialNotificationListener extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification notification) {
        if (notification == null ||
            !BankAlertParser.isSupportedBank(notification.getPackageName())) return;
        Notification item = notification.getNotification();
        if (item == null || item.extras == null) return;
        Bundle extras = item.extras;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence normalText = extras.getCharSequence(Notification.EXTRA_TEXT);
        String body = bigText != null ? bigText.toString()
                : normalText == null ? "" : normalText.toString();
        BankAlertParser.Alert parsed = BankAlertParser.parse(
            notification.getPackageName(),
            title == null ? "" : title.toString(), body);
        if (parsed == null) return;
        LocalAlertStore.add(getApplicationContext(),
            notification.getPackageName() + "|" + notification.getKey() + "|" + notification.getPostTime(),
            parsed, notification.getPostTime());
    }
}

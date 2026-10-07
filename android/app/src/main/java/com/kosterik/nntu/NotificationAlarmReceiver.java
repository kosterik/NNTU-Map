package com.kosterik.nntu;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Background Alarm & Notification Receiver for Bells and Schedule
 * Created by kosterik
 */
public class NotificationAlarmReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID = "nntu_schedule_channel";

    @Override
    public void onReceive(Context context, Intent intent) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Расписание пар НГТУ",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Уведомления о начале пар и звонках");
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("НГТУ: Расписание на сегодня")
                .setContentText("Первая пара в 07:30 в аудитории 1205 (к.1)")
                .setAutoCancel(true);

        if (manager != null) {
            manager.notify(101, builder.build());
        }
    }
}

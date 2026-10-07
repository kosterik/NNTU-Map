package com.kosterik.nntu;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Android Home Screen Widget: Пары Сегодня + Завтра
 * Created by kosterik
 */
public class WidgetDualProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        android.content.SharedPreferences prefs = context.getSharedPreferences("WidgetData", Context.MODE_PRIVATE);
        String groupName = prefs.getString("groupName", "Не выбрана");
        String todayData = prefs.getString("todayData", "Загрузка...");
        String tomorrowData = prefs.getString("tomorrowData", "Загрузка...");

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_dual_layout);

            views.setTextViewText(R.id.widget_dual_title, "НГТУ: " + groupName);
            views.setTextViewText(R.id.widget_today_text, todayData);
            views.setTextViewText(R.id.widget_tomorrow_text, tomorrowData);

            Intent intent = new Intent(context, MainActivity.class);
            PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_dual_root, pendingIntent);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}

package com.kosterik.nntu;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Android Home Screen Widget: Пары на завтра
 * Created by kosterik
 */
public class WidgetTomorrowProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        android.content.SharedPreferences prefs = context.getSharedPreferences("WidgetData", Context.MODE_PRIVATE);
        String groupName = prefs.getString("groupName", "Не выбрана");
        String tomorrowData = prefs.getString("tomorrowData", "Загрузка...");

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_tomorrow_layout);

        views.setTextViewText(R.id.widget_title, "Пары на завтра");
        views.setTextViewText(R.id.widget_group_badge, groupName);
        views.setTextViewText(R.id.widget_content_text, tomorrowData);

        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}

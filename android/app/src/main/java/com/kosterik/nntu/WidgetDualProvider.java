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
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_dual_layout);

            views.setTextViewText(R.id.widget_dual_title, "НГТУ: Сегодня и Завтра");
            views.setTextViewText(R.id.widget_today_text, "1. Архитектура ВС (1205)\n2. ОС (6243)\n3. Базы данных (1304)");
            views.setTextViewText(R.id.widget_tomorrow_text, "2. Матлогика (1105)\n3. Физкультура (СК)\n4. Веб-разработка (6312)");

            Intent intent = new Intent(context, MainActivity.class);
            PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_dual_root, pendingIntent);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}

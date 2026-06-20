package com.edora.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.edora.app.MainActivity
import com.edora.app.R
import com.edora.app.plugins.KEY_STREAK

private const val PREFS_NAME = "EdoraWidgetPrefs"

class EdoraWidgetCompactProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        refreshWidgets(context, manager, ids)
    }

    companion object {
        fun refreshWidgets(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val prefs  = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val streak = prefs.getInt(KEY_STREAK, 0)

            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pending = PendingIntent.getActivity(
                context, 2, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            for (id in ids) {
                val views = RemoteViews(context.packageName, R.layout.widget_edora_compact)

                views.setTextViewText(R.id.widget_compact_streak, streak.toString())
                views.setOnClickPendingIntent(R.id.widget_compact_root, pending)
                views.setOnClickPendingIntent(R.id.widget_compact_open, pending)

                manager.updateAppWidget(id, views)
            }
        }
    }
}

package com.edora.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.edora.app.MainActivity
import com.edora.app.R
import com.edora.app.plugins.KEY_ANSWERED
import com.edora.app.plugins.KEY_QUESTION
import com.edora.app.plugins.KEY_STREAK

private const val PREFS_NAME = "EdoraWidgetPrefs"

/**
 * Home-screen widget: streak count + today's question, visible without
 * opening the app. Data is written by EdoraWidgetPlugin (called from JS
 * whenever streak or daily question state changes) and by Android's own
 * periodic update tick (see edora_widget_info.xml, every 30 min minimum).
 */
class EdoraWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        refreshWidgets(context, manager, ids)
    }

    companion object {
        fun refreshWidgets(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val streak    = prefs.getInt(KEY_STREAK, 0)
            val question  = prefs.getString(KEY_QUESTION, null)
            val answered  = prefs.getBoolean(KEY_ANSWERED, false)

            for (id in ids) {
                val views = RemoteViews(context.packageName, R.layout.widget_edora)

                views.setTextViewText(R.id.widget_streak_count, streak.toString())
                views.setTextViewText(
                    R.id.widget_streak_label,
                    if (streak == 1) "day streak" else "day streak"
                )

                if (question.isNullOrBlank()) {
                    views.setTextViewText(R.id.widget_question, "Open Edora to get today's question")
                    views.setViewVisibility(R.id.widget_answered_badge, android.view.View.GONE)
                } else {
                    views.setTextViewText(R.id.widget_question, question)
                    views.setViewVisibility(
                        R.id.widget_answered_badge,
                        if (answered) android.view.View.VISIBLE else android.view.View.GONE
                    )
                }

                // Tapping anywhere on the widget opens the app
                val launchIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val pendingIntent = PendingIntent.getActivity(
                    context, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

                manager.updateAppWidget(id, views)
            }
        }
    }
}

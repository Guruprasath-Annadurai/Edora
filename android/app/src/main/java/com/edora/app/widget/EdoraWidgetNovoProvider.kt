package com.edora.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.edora.app.MainActivity
import com.edora.app.R
import com.edora.app.plugins.KEY_EXAM_DAYS
import com.edora.app.plugins.KEY_EXAM_NAME
import com.edora.app.plugins.KEY_NOVO_TIP
import com.edora.app.plugins.KEY_STREAK
import com.edora.app.plugins.KEY_XP_GOAL
import com.edora.app.plugins.KEY_XP_TODAY

private const val PREFS_NAME = "EdoraWidgetPrefs"

class EdoraWidgetNovoProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        refreshWidgets(context, manager, ids)
    }

    companion object {
        fun refreshWidgets(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val prefs    = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val streak   = prefs.getInt(KEY_STREAK, 0)
            val xpToday  = prefs.getInt(KEY_XP_TODAY, 0)
            val xpGoal   = prefs.getInt(KEY_XP_GOAL, 100).coerceAtLeast(1)
            val examName = prefs.getString(KEY_EXAM_NAME, "") ?: ""
            val examDays = prefs.getInt(KEY_EXAM_DAYS, -1)
            val novoTip  = prefs.getString(KEY_NOVO_TIP, "") ?: ""

            val xpPct = ((xpToday.toFloat() / xpGoal) * 100).toInt().coerceIn(0, 100)

            // Deep-link into chat tab
            val chatIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                data = Uri.parse("com.edora.app://novo/chat")
            }
            val chatPending = PendingIntent.getActivity(
                context, 1, chatIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val rootIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val rootPending = PendingIntent.getActivity(
                context, 0, rootIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            for (id in ids) {
                val views = RemoteViews(context.packageName, R.layout.widget_edora_novo)

                // Streak count
                views.setTextViewText(R.id.widget_streak_count, streak.toString())

                // Novo tip / placeholder
                val tipText = novoTip.ifBlank { "Open Edora to start today's session" }
                views.setTextViewText(R.id.widget_tip, tipText)

                // XP row — only show if user has any XP today
                if (xpToday > 0) {
                    views.setViewVisibility(R.id.widget_xp_row, android.view.View.VISIBLE)
                    views.setProgressBar(R.id.widget_xp_bar, 100, xpPct, false)
                    views.setTextViewText(R.id.widget_xp_pct, "$xpPct%")
                } else {
                    views.setViewVisibility(R.id.widget_xp_row, android.view.View.GONE)
                }

                // Exam badge — show if name set and days >= 0
                if (examName.isNotBlank() && examDays >= 0) {
                    val badgeText = when {
                        examDays == 0 -> "$examName • TODAY"
                        examDays == 1 -> "$examName • 1 day"
                        else          -> "$examName • ${examDays}d"
                    }
                    views.setTextViewText(R.id.widget_exam_badge, badgeText)
                    views.setViewVisibility(R.id.widget_exam_badge, android.view.View.VISIBLE)
                } else {
                    views.setViewVisibility(R.id.widget_exam_badge, android.view.View.GONE)
                }

                // Click targets
                views.setOnClickPendingIntent(R.id.widget_ask_btn, chatPending)
                views.setOnClickPendingIntent(R.id.widget_novo_root, rootPending)

                manager.updateAppWidget(id, views)
            }
        }
    }
}

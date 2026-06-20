package com.edora.app.plugins

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.edora.app.widget.EdoraWidgetCompactProvider
import com.edora.app.widget.EdoraWidgetNovoProvider
import com.edora.app.widget.EdoraWidgetProvider
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

private const val PREFS_NAME = "EdoraWidgetPrefs"

const val KEY_STREAK        = "edora_widget_streak"
const val KEY_QUESTION      = "edora_widget_question"
const val KEY_ANSWERED      = "edora_widget_answered"
const val KEY_XP_TODAY      = "edora_widget_xp_today"
const val KEY_XP_GOAL       = "edora_widget_xp_goal"
const val KEY_EXAM_NAME     = "edora_widget_exam_name"
const val KEY_EXAM_DAYS     = "edora_widget_exam_days"
const val KEY_NOVO_TIP      = "edora_widget_novo_tip"
const val KEY_NEXT_CARD_MIN = "edora_widget_next_card_min"

@CapacitorPlugin(name = "EdoraWidget")
class EdoraWidgetPlugin : Plugin() {

    @PluginMethod
    fun updateWidget(call: PluginCall) {
        val streak       = call.getInt("streakCount", 0) ?: 0
        val question     = call.getString("todayQuestion", "") ?: ""
        val answered     = call.getBoolean("todayAnswered", false) ?: false
        val xpToday      = call.getInt("xpToday", 0) ?: 0
        val xpGoal       = call.getInt("xpGoal", 100) ?: 100
        val examName     = call.getString("examName", "") ?: ""
        val examDays     = call.getInt("examDays", -1) ?: -1
        val novoTip      = call.getString("novoTip", "") ?: ""
        val nextCardMin  = call.getInt("nextCardMin", -1) ?: -1

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putInt(KEY_STREAK, streak)
            .putString(KEY_QUESTION, question)
            .putBoolean(KEY_ANSWERED, answered)
            .putInt(KEY_XP_TODAY, xpToday)
            .putInt(KEY_XP_GOAL, xpGoal)
            .putString(KEY_EXAM_NAME, examName)
            .putInt(KEY_EXAM_DAYS, examDays)
            .putString(KEY_NOVO_TIP, novoTip)
            .putInt(KEY_NEXT_CARD_MIN, nextCardMin)
            .apply()

        val manager = AppWidgetManager.getInstance(context)

        val originalIds = manager.getAppWidgetIds(
            ComponentName(context, EdoraWidgetProvider::class.java)
        )
        if (originalIds.isNotEmpty()) {
            EdoraWidgetProvider.refreshWidgets(context, manager, originalIds)
        }

        val novoIds = manager.getAppWidgetIds(
            ComponentName(context, EdoraWidgetNovoProvider::class.java)
        )
        if (novoIds.isNotEmpty()) {
            EdoraWidgetNovoProvider.refreshWidgets(context, manager, novoIds)
        }

        val compactIds = manager.getAppWidgetIds(
            ComponentName(context, EdoraWidgetCompactProvider::class.java)
        )
        if (compactIds.isNotEmpty()) {
            EdoraWidgetCompactProvider.refreshWidgets(context, manager, compactIds)
        }

        call.resolve()
    }
}

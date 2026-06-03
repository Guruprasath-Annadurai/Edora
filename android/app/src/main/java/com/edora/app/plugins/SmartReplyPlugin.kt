package com.edora.app.plugins

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.nl.smartreply.SmartReply
import com.google.mlkit.nl.smartreply.SmartReplySuggestionResult
import com.google.mlkit.nl.smartreply.TextMessage

@CapacitorPlugin(name = "SmartReply")
class SmartReplyPlugin : Plugin() {

    private val smartReplyGenerator = SmartReply.getClient()

    /**
     * Called from JS with:
     * { messages: [{ text: string, isLocal: boolean, userId: string, timestamp: number }] }
     */
    @PluginMethod
    fun suggest(call: PluginCall) {
        val messagesArray = call.getArray("messages") ?: run {
            call.reject("messages array is required")
            return
        }

        val conversation = mutableListOf<TextMessage>()

        try {
            for (i in 0 until messagesArray.length()) {
                val msg = messagesArray.getJSONObject(i)
                val text      = msg.getString("text")
                val isLocal   = msg.getBoolean("isLocal")
                val userId    = msg.optString("userId", "remote_user")
                val timestamp = msg.optLong("timestamp", System.currentTimeMillis())

                val textMessage = if (isLocal) {
                    TextMessage.createForLocalUser(text, timestamp)
                } else {
                    TextMessage.createForRemoteUser(text, timestamp, userId)
                }
                conversation.add(textMessage)
            }
        } catch (e: Exception) {
            call.reject("Failed to parse messages: ${e.message}")
            return
        }

        smartReplyGenerator.suggestReplies(conversation)
            .addOnSuccessListener { result ->
                val suggestions = JSArray()

                when (result.status) {
                    SmartReplySuggestionResult.STATUS_SUCCESS -> {
                        result.suggestions.forEach { suggestion ->
                            suggestions.put(suggestion.text)
                        }
                        val ret = JSObject()
                        ret.put("suggestions", suggestions)
                        ret.put("status", "success")
                        call.resolve(ret)
                    }
                    SmartReplySuggestionResult.STATUS_NOT_SUPPORTED_LANGUAGE -> {
                        val ret = JSObject()
                        ret.put("suggestions", JSArray())
                        ret.put("status", "unsupported_language")
                        call.resolve(ret)
                    }
                    else -> {
                        val ret = JSObject()
                        ret.put("suggestions", JSArray())
                        ret.put("status", "no_reply")
                        call.resolve(ret)
                    }
                }
            }
            .addOnFailureListener { e ->
                call.reject("Smart reply failed: ${e.message}")
            }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        smartReplyGenerator.close()
    }
}

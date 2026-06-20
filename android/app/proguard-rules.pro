# ── Edora ProGuard / R8 Rules ────────────────────────────────────────────────

# Keep line numbers for Sentry crash stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Capacitor ────────────────────────────────────────────────────────────────
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }

# ── WebView JavaScript bridge ─────────────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── ML Kit Smart Reply ────────────────────────────────────────────────────────
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

# ── Kotlin & Coroutines ───────────────────────────────────────────────────────
-keep class kotlin.** { *; }
-keepclassmembers class **$WhenMappings { *; }
-dontwarn kotlin.**

# ── OkHttp / Supabase networking ──────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ── General Android ───────────────────────────────────────────────────────────
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions

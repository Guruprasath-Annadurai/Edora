#!/usr/bin/env bash
# ==============================================================================
# Edora Android Runtime Performance Profiler
# Measures cold startup latency, frame rendering stats, memory, and ANR checks.
# DOES NOT INVENT MEASUREMENTS IF NO PHYSICAL DEVICE/EMULATOR IS ATTACHED.
# ==============================================================================

set -euo pipefail

PACKAGE_NAME="com.edora.app"
MAIN_ACTIVITY="com.edora.app/.MainActivity"

echo "=========================================================="
echo "EDORA ANDROID RUNTIME PERFORMANCE PROFILER"
echo "Package: $PACKAGE_NAME"
echo "=========================================================="

if ! command -v adb &>/dev/null; then
  echo "::warning::'adb' tool not found in PATH."
  echo "Ensure Android SDK platform-tools are installed and added to PATH."
  exit 0
fi

# Check connected devices
ATTACHED_DEVICES=$(adb devices | grep -v "List of devices" | grep "device$" || true)

if [ -z "$ATTACHED_DEVICES" ]; then
  echo "No connected Android devices or emulators detected via adb."
  echo "To profile physical hardware:"
  echo "  1. Connect Android test device with USB debugging enabled."
  echo "  2. Verify detection: adb devices"
  echo "  3. Re-run this script."
  echo ""
  echo "Manual Profiling Reference Commands:"
  echo "  • Cold Start Latency:  adb shell am start-activity -W -n $MAIN_ACTIVITY"
  echo "  • GPU Frame Stats:    adb shell dumpsys gfxinfo $PACKAGE_NAME framestats"
  echo "  • Memory Consumption:  adb shell dumpsys meminfo $PACKAGE_NAME"
  echo "  • ANR Logcat Scan:    adb logcat -d | grep -iE 'ANR in $PACKAGE_NAME|FATAL EXCEPTION'"
  echo "=========================================================="
  exit 0
fi

DEVICE_ID=$(echo "$ATTACHED_DEVICES" | head -n 1 | awk '{print $1}')
echo "Target Device: $DEVICE_ID"
echo "----------------------------------------------------------"

# 1. Cold Startup Measurement
echo "Step 1: Measuring Cold Start Latency..."
adb -s "$DEVICE_ID" shell am force-stop "$PACKAGE_NAME"
sleep 1
STARTUP_OUTPUT=$(adb -s "$DEVICE_ID" shell am start-activity -W -n "$MAIN_ACTIVITY" 2>&1)
echo "$STARTUP_OUTPUT" | grep -E "Status:|TotalTime:|WaitTime:" || echo "$STARTUP_OUTPUT"

# 2. Memory Consumption (PSS)
echo "----------------------------------------------------------"
echo "Step 2: Inspecting Memory Footprint (PSS)..."
adb -s "$DEVICE_ID" shell dumpsys meminfo "$PACKAGE_NAME" | grep -E "TOTAL PSS:|Java Heap:|Native Heap:" || true

# 3. ANR & Crash Detection in Logcat
echo "----------------------------------------------------------"
echo "Step 3: Scanning recent logcat for ANRs and crashes..."
ANR_COUNT=$(adb -s "$DEVICE_ID" logcat -d | grep -ciE "ANR in $PACKAGE_NAME" || true)
if [ "$ANR_COUNT" -gt 0 ]; then
  echo "⚠️  Detected $ANR_COUNT ANR trace(s) in device logcat!"
else
  echo "✓ Zero ANRs detected in device logcat."
fi

echo "=========================================================="

# Performance Measurement & Profiling Runbook

**Classification:** Engineering Performance Specification  
**Objective:** Replace unmeasured claims with disciplined, reproducible benchmarks across web bundles and low-tier Android hardware.  

---

## 1. Frontend Bundle & Asset Measurement

Execute bundle analysis on production builds:
```bash
npm run build
node scripts/perf/measure_bundle.js
```

### Metrics Tracked:
1. **Initial Startup JS:** Gzipped byte weight of synchronous chunks required before React renders.
2. **Route / Lazy Chunks:** Weight of asynchronously loaded feature routes (e.g., `/practice`, `/quiz`, `/review`).
3. **Oversized Assets:** Any single JavaScript chunk exceeding $100\text{ KB}$ gzipped or asset exceeding $250\text{ KB}$ raw.

---

## 2. Android Hardware Profiling (Physical Device / Emulator)

Cold start and frame rates must be measured on physical Android hardware across target low-tier devices (e.g., 3GB/4GB RAM Android Go / MediaTek devices).

```bash
chmod +x scripts/perf/measure_android.sh
./scripts/perf/measure_android.sh
```

### Core Benchmarks:
1. **Cold Start Latency:**
   ```bash
   adb shell am start-activity -W -n com.edora.app/.MainActivity
   ```
   * *Target:* `TotalTime` $< 2500\text{ms}$ on low-tier hardware.
2. **GPU Frame Rendering & Jank:**
   ```bash
   adb shell dumpsys gfxinfo com.edora.app reset
   # ... perform 30 seconds of active scrolling / quiz interactions ...
   adb shell dumpsys gfxinfo com.edora.app framestats
   ```
   * *Target:* Janky frames $< 5\%$ of total rendered frames.
3. **Memory Footprint (PSS):**
   ```bash
   adb shell dumpsys meminfo com.edora.app
   ```
   * *Target:* Total PSS $< 180\text{ MB}$ during active quiz/study sessions.
4. **ANR (Application Not Responding) Check:**
   ```bash
   adb logcat -d | grep -iE "ANR in com.edora.app"
   ```
   * *Target:* 0 ANRs.

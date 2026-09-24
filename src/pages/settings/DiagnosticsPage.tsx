// ═══════════════════════════════════════════════════════════════════════════
// DiagnosticsPage — build/version identifier screen
// Route: /diagnostics
// Enterprise remediation mandate §P0: support and QA need a way to see
// exactly which build a user is running without asking them to read logs.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Cpu, Copy, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';

type DeviceInfo = { platform: string; osVersion: string; model: string } | null;
// AppInfo.build is Android's versionCode / iOS's CFBundleVersion (see
// @capacitor/app's own type definition) — the one mandate-required field
// that has no equivalent in import.meta.env, since it's a native-only value
// baked into the platform build, not the web bundle.
type NativeAppInfo = { build: string } | null;

// Written by vite.config.ts's writeBuildInfo() plugin AFTER Rollup emits the
// bundle (see that file's own comment for why: bundleHash can't be known
// until every asset exists, so it can't be baked into the JS bundle it
// describes — this is fetched at runtime instead). localMigrationHead and
// edgeFunctionManifest are deliberately named/labeled below as local
// build-time state, not verified-deployed state — see RISK-029.
interface BuildInfo {
  bundleHash: string;
  localMigrationHead: string | null;
  edgeFunctionManifest: { functionCount: number | null; sourceHash: string | null };
  releaseChannel: string;
  dirtyWorktree: boolean | null;
  ciRunId: string | null;
}

export default function DiagnosticsPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [device, setDevice] = useState<DeviceInfo>(null);
  const [nativeApp, setNativeApp] = useState<NativeAppInfo>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    import('@capacitor/device').then(({ Device }) => {
      Device.getInfo()
        .then(info => setDevice({ platform: info.platform, osVersion: info.osVersion, model: info.model }))
        .catch(() => {});
    }).catch(() => {});
    import('@capacitor/app').then(({ App }) => {
      App.getInfo()
        .then(info => setNativeApp({ build: info.build }))
        .catch(() => {});
    }).catch(() => {});
  }, []);

  useEffect(() => {
    // Absolute path, not relative: this page is reached via a client-side
    // route (/diagnostics), so a relative fetch would resolve against that
    // route's path rather than the actual asset root and 404. Works both on
    // web (base '/') and inside Capacitor's WebView, which serves the bundle
    // from a virtual origin (capacitor.config.ts's androidScheme/hostname)
    // where an absolute path still correctly hits the bundle root.
    fetch('/build-info.json')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setBuildInfo(data); })
      .catch(() => {}); // dev server / local builds may not have this file yet — fine, just omit the fields
  }, []);

  const buildSha = import.meta.env.VITE_BUILD_SHA ?? 'unknown';
  const shortSha = buildSha.length > 12 ? buildSha.slice(0, 12) : buildSha;
  const buildTime = import.meta.env.VITE_BUILD_TIME
    ? new Date(import.meta.env.VITE_BUILD_TIME).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'unknown';

  const fields: { label: string; value: string }[] = [
    { label: 'App version', value: import.meta.env.VITE_APP_VERSION ?? 'unknown' },
    { label: 'Build commit', value: shortSha },
    { label: 'Build time', value: buildTime },
    { label: 'Environment', value: import.meta.env.MODE },
    { label: 'Platform', value: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web' },
    ...(buildInfo ? [
      { label: 'Release channel', value: buildInfo.releaseChannel },
      { label: 'Bundle hash', value: buildInfo.bundleHash },
      // Labeled explicitly as "local, build-time" per RISK-029's already-filed
      // finding that local migration filenames don't reliably match what's
      // actually applied to the live database — this field must never read as
      // "verified deployed migration version," because it isn't one.
      { label: 'Migration head (local, build-time)', value: buildInfo.localMigrationHead ?? 'unknown' },
      // Same honesty constraint as above: this is the local Edge Function
      // *source* tree's fingerprint, not a live deployment-revision check —
      // proving the latter would require shipping backend-management
      // credentials in this client bundle, which this project never does.
      { label: 'Edge Functions (source)', value: buildInfo.edgeFunctionManifest.functionCount != null
        ? `${buildInfo.edgeFunctionManifest.functionCount} fns, ${buildInfo.edgeFunctionManifest.sourceHash}`
        : 'unknown' },
      ...(buildInfo.dirtyWorktree ? [{ label: 'Built from', value: 'uncommitted changes' }] : []),
    ] : []),
    ...(nativeApp ? [
      // Label says "Android" specifically (not generic "Native build number")
      // because this field is only ever rendered when nativeApp is populated,
      // which only happens on Capacitor.isNativePlatform() — and today that's
      // Android-only in practice (no iOS release pipeline exists yet, per
      // RISK-016). Revisit this label if/when an iOS build ships.
      { label: 'Android version code', value: nativeApp.build },
    ] : []),
    ...(device ? [
      { label: 'OS version', value: device.osVersion },
      { label: 'Device model', value: device.model },
    ] : []),
    { label: 'User ID', value: user?.id ?? 'not signed in' },
  ];

  const supportBlob = fields.map(f => `${f.label}: ${f.value}`).join('\n');

  async function copyForSupport() {
    try {
      await navigator.clipboard.writeText(supportBlob);
    } catch {
      // clipboard API unavailable — nothing further to do, button just won't confirm
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (Capacitor.isNativePlatform()) await Toast.show({ text: 'Copied diagnostic info', duration: 'short' });
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'transparent' }}>
      <div className="shrink-0 px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-060)', backdropFilter: 'blur(64px)' }}>
        <Link aria-label="Go back" to="/account" className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-080)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Diagnostics</h2>
          <p className="text-xs text-white/40">Build info for troubleshooting</p>
        </div>
        <Cpu size={18} style={{ color: isLight ? '#4338CA' : '#5B6AF5' }} />
      </div>

      <div className="flex-1 overflow-y-auto pb-nav px-4 pt-4 flex flex-col gap-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4"
          style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
          <div className="flex flex-col gap-2.5">
            {fields.map(f => (
              <div key={f.label} className="flex items-center justify-between gap-3">
                <span className="text-xs text-white/40 shrink-0">{f.label}</span>
                <span className="text-xs text-white/70 font-semibold text-right font-mono break-all">{f.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="text-xs text-muted-foreground px-1 leading-relaxed">
          Share this info with support when reporting a bug — it tells us exactly which build and
          environment you're running so we can reproduce the issue.
        </p>

        <motion.button whileTap={{ scale: 0.97 }}
          onClick={copyForSupport}
          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)', color: isLight ? '#4338CA' : '#A0AEFF' }}>
          {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy for support'}
        </motion.button>
      </div>
    </div>
  );
}

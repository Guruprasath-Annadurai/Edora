import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, ChevronLeft, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';

interface ReminderConfig {
  enabled: boolean;
  hour: number;
  minute: number;
}

const PREF_KEY = 'edora_study_reminders';

const REMINDERS = [
  { id: 1, title: 'Flashcard Review',  body: 'You have due flashcards waiting — keep your streak alive.',  route: '/flashcard' },
  { id: 2, title: 'Daily Challenge',   body: 'Complete today\'s challenges and earn XP.',                   route: '/home'      },
  { id: 3, title: 'Sprint Session',    body: 'Time for a 25-minute focus sprint. You\'ve got this.',        route: '/sprint'    },
];

async function loadConfig(): Promise<ReminderConfig> {
  const { value } = await Preferences.get({ key: PREF_KEY });
  if (value) return JSON.parse(value);
  return { enabled: false, hour: 20, minute: 0 };
}

async function saveConfig(cfg: ReminderConfig) {
  await Preferences.set({ key: PREF_KEY, value: JSON.stringify(cfg) });
}

async function scheduleReminders(cfg: ReminderConfig) {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.cancel({ notifications: REMINDERS.map(r => ({ id: r.id })) });
  if (!cfg.enabled) return;

  const { display } = await LocalNotifications.requestPermissions();
  if (display !== 'granted') return;

  const now    = new Date();
  const base   = new Date(now);
  base.setHours(cfg.hour, cfg.minute, 0, 0);
  if (base <= now) base.setDate(base.getDate() + 1);

  try {
    await LocalNotifications.schedule({
      notifications: REMINDERS.map((r, i) => ({
        id:         r.id,
        title:      r.title,
        body:       r.body,
        schedule:   { at: new Date(base.getTime() + i * 30 * 60 * 1000), repeats: true, every: 'day' as const },
        extra:      { route: r.route },
        smallIcon:  'ic_stat_icon_config_sample',
      })),
    });
  } catch (err) {
    // Android 12+ blocks exact alarms unless user grants SCHEDULE_EXACT_ALARM in Settings
    const msg = (err as Error)?.message ?? '';
    if (msg.toLowerCase().includes('exact') || msg.includes('SCHEDULE_EXACT_ALARM')) {
      await Toast.show({
        text: 'Enable exact alarms: Settings → Apps → Edora → Alarms & Reminders',
        duration: 'long',
        position: 'bottom',
      });
    }
  }
}

export default function StudyRemindersPage() {
  const [config, setConfig] = useState<ReminderConfig>({ enabled: false, hour: 20, minute: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadConfig().then(setConfig); }, []);

  async function save() {
    setSaving(true);
    await saveConfig(config);
    await scheduleReminders(config);
    await Toast.show({ text: config.enabled ? 'Reminders scheduled!' : 'Reminders disabled', duration: 'short', position: 'bottom' });
    setSaving(false);
  }

  const toggleEnabled = () => setConfig(c => ({ ...c, enabled: !c.enabled }));

  const timeLabel = `${String(config.hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')}`;

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <Link aria-label="Go back" to="/profile"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          <Bell size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Study Reminders</h2>
          <p className="text-xs text-muted-foreground">Daily push notifications</p>
        </div>
      </div>

      <div className="flex-1 native-scroll pb-nav px-4 py-5 flex flex-col gap-5">

        {/* Toggle */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-4 flex items-center gap-4"
          style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
          <div className="flex-1">
            <p className="font-semibold text-white">Enable Reminders</p>
            <p className="text-xs text-muted-foreground mt-0.5">Get daily nudges to study</p>
          </div>
          <button onClick={toggleEnabled}
            className="w-12 h-6 rounded-full transition-all relative"
            style={{ background: config.enabled ? '#5B6AF5' : 'var(--ink-120)' }}>
            <motion.div animate={{ x: config.enabled ? 24 : 2 }}
              className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm" />
          </button>
        </motion.div>

        {/* Time picker */}
        {config.enabled && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-4 flex flex-col gap-4"
            style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
            <p className="font-semibold text-white">Reminder Time</p>
            <div className="flex items-center justify-center gap-4">
              {/* Hour picker */}
              <div className="flex flex-col items-center gap-2">
                <button onClick={() => setConfig(c => ({ ...c, hour: (c.hour + 1) % 24 }))}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold text-white/70"
                  style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>▲</button>
                <div className="w-16 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(91,106,245,0.15)' }}>
                  <span className="text-2xl font-bold text-white">{String(config.hour).padStart(2, '0')}</span>
                </div>
                <button onClick={() => setConfig(c => ({ ...c, hour: (c.hour - 1 + 24) % 24 }))}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold text-white/70"
                  style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>▼</button>
              </div>
              <span className="text-3xl font-bold text-white/50">:</span>
              {/* Minute picker */}
              <div className="flex flex-col items-center gap-2">
                <button onClick={() => setConfig(c => ({ ...c, minute: (c.minute + 15) % 60 }))}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold text-white/70"
                  style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>▲</button>
                <div className="w-16 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(91,106,245,0.15)' }}>
                  <span className="text-2xl font-bold text-white">{String(config.minute).padStart(2, '0')}</span>
                </div>
                <button onClick={() => setConfig(c => ({ ...c, minute: (c.minute - 15 + 60) % 60 }))}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold text-white/70"
                  style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>▼</button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">Reminders will fire daily at {timeLabel}</p>
          </motion.div>
        )}

        {/* What you'll get */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-3xl overflow-hidden"
          style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
          <div className="px-4 pt-4 pb-2" style={{ borderBottom: '1px solid var(--ink-060)' }}>
            <p className="font-semibold text-white text-sm">What you'll receive</p>
          </div>
          {REMINDERS.map(({ id, title, body }, i) => (
            <div key={id} className="px-4 py-3 flex items-start gap-3"
              style={{ borderBottom: i < REMINDERS.length - 1 ? '1px solid var(--ink-050)' : 'none' }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'rgba(91,106,245,0.2)' }}>
                <Check size={11} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <Button size="lg" onClick={save} disabled={saving} className="w-full">
          {saving ? 'Saving…' : 'Save Reminders'}
        </Button>

        {!Capacitor.isNativePlatform() && (
          <p className="text-xs text-muted-foreground text-center px-4">
            Push notifications work on the native iOS/Android app.
          </p>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// novo-push — FCM v1 push notification dispatcher
//
// Call modes:
//   A. Scheduled cron  — POST with CRON_SECRET header (no user JWT needed).
//      Processes ALL users in the cooldown window.
//
//   B. Authenticated user  — POST with user JWT (Authorization: Bearer ...).
//      { action: 'send_now' } → sends pending notification for THIS user only.
//      Cannot target other users without admin role.
//
//   C. Admin manual trigger — POST with user JWT + admin role.
//      { action: 'send_now', user_id: '<uuid>' } → targets a specific user.
//
// Sends push for (checked in priority order, first match wins):
//   1. Unread proactive messages (push_sent_at IS NULL)
//   2. Exam countdown: 7, 3, 1 days before exam
//   3. Streak at-risk: streak > 0, no activity today, after 6 PM IST
//   4. Weak-topic evening nudge: personalized from topic_stats
//      (struggle_count - win_count), fires ~7:30 PM IST onward —
//      "5 min before bed on <weak topic>?" instead of a generic blast
//
// Rate-limit: at most 1 push per user per 4 hours (profiles.last_push_at).
//
// Requires Supabase secrets:
//   FIREBASE_SERVICE_ACCOUNT_JSON  — full service account JSON from Firebase console
//   FIREBASE_PROJECT_ID            — your Firebase project ID
//   CRON_SECRET                    — shared secret header value for cron invocations
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
const PUSH_COOLDOWN_HOURS = 4;

// ── FCM helpers ───────────────────────────────────────────────────────────────

async function createJWT(privateKeyPem: string, payload: Record<string, unknown>): Promise<string> {
  const pemContent = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const keyBytes = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const b64url = (s: string | ArrayBuffer) => {
    const str = typeof s === 'string'
      ? btoa(s)
      : btoa(String.fromCharCode(...new Uint8Array(s as ArrayBuffer)));
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body   = b64url(JSON.stringify(payload));
  const input  = `${header}.${body}`;
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(input));
  return `${input}.${b64url(sigBuf)}`;
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa  = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const jwt = await createJWT(sa.private_key, {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error(`FCM auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function sendFCM(
  deviceToken: string,
  title:       string,
  body:        string,
  data:        Record<string, string>,
  accessToken: string,
  projectId:   string,
): Promise<boolean> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token:        deviceToken,
          notification: { title, body },
          data,
          android: { priority: 'high', notification: { sound: 'default', channel_id: 'novo_alerts' } },
          apns:    { payload: { aps: { sound: 'default', badge: 1 } } },
        },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[FCM] send error:', JSON.stringify(err));
  }
  return res.ok;
}

// ── Multilingual push copy ────────────────────────────────────────────────────

type Lang = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'mr' | 'bn';

const COPY: Record<string, Record<Lang, { title: string; body: (vars: Record<string, string>) => string }>> = {
  streak_risk: {
    en: { title: '{streak}-day streak at risk 🔥', body: v => `Hey ${v.name}, you haven't studied today. A quick 10-min sprint keeps your streak alive!` },
    hi: { title: '{streak} दिनों की स्ट्रीक खतरे में 🔥', body: v => `${v.name}, आज पढ़ाई नहीं की? 10 मिनट का स्प्रिंट आपकी स्ट्रीक बचा सकता है!` },
    ta: { title: '{streak} நாள் streak ஆபத்தில் 🔥', body: v => `${v.name}, இன்று படிக்கவில்லையா? 10 நிமிட sprint உங்கள் streak காக்கும்!` },
    te: { title: '{streak} రోజుల streak ప్రమాదంలో 🔥', body: v => `${v.name}, ఈ రోజు చదవలేదా? 10 నిమిషాల sprint మీ streak రక్షిస్తుంది!` },
    kn: { title: '{streak} ದಿನಗಳ streak ಅಪಾಯದಲ್ಲಿ 🔥', body: v => `${v.name}, ಇಂದು ಓದಿಲ್ಲವೇ? 10 ನಿಮಿಷ sprint ನಿಮ್ಮ streak ಉಳಿಸುತ್ತದೆ!` },
    mr: { title: '{streak} दिवसांची streak धोक्यात 🔥', body: v => `${v.name}, आज अभ्यास केला नाही? 10 मिनिटांचा sprint streak वाचवेल!` },
    bn: { title: '{streak} দিনের streak বিপদে 🔥', body: v => `${v.name}, আজ পড়াশোনা হয়নি? ১০ মিনিটের sprint তোমার streak বাঁচাবে!` },
  },
  quiz_recap: {
    en: { title: '{subject} · {topic} needs work 📊', body: v => `${v.name}, your mastery of ${v.topic} is ${v.pct}%. ${v.count} topic${v.count === '1' ? '' : 's'} flagged for review — tackle one tonight?` },
    hi: { title: '{subject} · {topic} पर ध्यान दें 📊', body: v => `${v.name}, ${v.topic} में आपकी महारत ${v.pct}% है। ${v.count} टॉपिक रिव्यू के लिए तैयार हैं!` },
    ta: { title: '{subject} · {topic} கவனம் தேவை 📊', body: v => `${v.name}, ${v.topic} mastery ${v.pct}%. ${v.count} topic review-க்கு தயாரா?` },
    te: { title: '{subject} · {topic} శ్రద్ధ అవసరం 📊', body: v => `${v.name}, ${v.topic} mastery ${v.pct}%. ${v.count} topics review కోసం సిద్ధంగా ఉన్నాయి!` },
    kn: { title: '{subject} · {topic} ಗಮನ ಅಗತ್ಯ 📊', body: v => `${v.name}, ${v.topic} mastery ${v.pct}%. ${v.count} topics review ಗೆ ಸಿದ್ಧ!` },
    mr: { title: '{subject} · {topic} लक्ष द्या 📊', body: v => `${v.name}, ${v.topic} mastery ${v.pct}% आहे. ${v.count} topics review साठी तयार!` },
    bn: { title: '{subject} · {topic} মনোযোগ চাই 📊', body: v => `${v.name}, ${v.topic} mastery ${v.pct}%। ${v.count} topics review-এর জন্য তৈরি!` },
  },
  weak_topic: {
    en: { title: 'Revise {topic} tonight 📚', body: v => `5 min on ${v.topic} (${v.subject}) before bed could change your score, ${v.name}. Quick review?` },
    hi: { title: 'आज रात {topic} रिवाइज करें 📚', body: v => `${v.name}, सोने से पहले ${v.topic} (${v.subject}) पर 5 मिनट? आपका स्कोर बदल सकता है!` },
    ta: { title: 'இன்றிரவு {topic} திருத்தவும் 📚', body: v => `${v.name}, தூங்கும் முன் ${v.topic} (${v.subject}) 5 நிமிடம்? மதிப்பெண் மாறலாம்!` },
    te: { title: 'ఈ రాత్రి {topic} రివైజ్ చేయండి 📚', body: v => `${v.name}, నిద్రపోయే ముందు ${v.topic} (${v.subject}) 5 నిమిషాలు? మీ స్కోర్ మారవచ్చు!` },
    kn: { title: 'ಇಂದು ರಾತ್ರಿ {topic} ಪರಿಶೀಲಿಸಿ 📚', body: v => `${v.name}, ಮಲಗುವ ಮೊದಲು ${v.topic} (${v.subject}) 5 ನಿಮಿಷ? ನಿಮ್ಮ ಸ್ಕೋರ್ ಬದಲಾಗಬಹುದು!` },
    mr: { title: 'आज रात्री {topic} रिव्हाईज करा 📚', body: v => `${v.name}, झोपण्यापूर्वी ${v.topic} (${v.subject}) 5 मिनिटे? तुमचा स्कोर बदलू शकतो!` },
    bn: { title: 'আজ রাতে {topic} রিভাইজ করো 📚', body: v => `${v.name}, ঘুমানোর আগে ${v.topic} (${v.subject}) ৫ মিনিট? তোমার স্কোর বদলাতে পারে!` },
  },
  morning_daily: {
    en: { title: 'Good morning! Daily challenge ready ☀️', body: v => `Start your day strong, ${v.name}. Your personalised daily question is waiting!` },
    hi: { title: 'सुप्रभात! दैनिक चैलेंज तैयार है ☀️', body: v => `${v.name}, अपने दिन की शुरुआत मजबूत करें। आपका आज का सवाल इंतजार कर रहा है!` },
    ta: { title: 'காலை வணக்கம்! Daily challenge தயார் ☀️', body: v => `${v.name}, உங்கள் நாளை வலிமையாக தொடங்குங்கள். இன்றைய கேள்வி காத்திருக்கிறது!` },
    te: { title: 'శుభోదయం! Daily challenge సిద్ధంగా ఉంది ☀️', body: v => `${v.name}, మీ రోజును బలంగా ప్రారంభించండి. ఈ రోజు మీ ప్రశ్న వేచి ఉంది!` },
    kn: { title: 'ಶುಭೋದಯ! Daily challenge ಸಿದ್ಧ ☀️', body: v => `${v.name}, ನಿಮ್ಮ ದಿನವನ್ನು ಶಕ್ತಿಯುತವಾಗಿ ಪ್ರಾರಂಭಿಸಿ. ಇಂದಿನ ಪ್ರಶ್ನೆ ಕಾಯುತ್ತಿದೆ!` },
    mr: { title: 'सुप्रभात! Daily challenge तयार आहे ☀️', body: v => `${v.name}, दिवसाची सुरुवात मजबूत करा. आजचा प्रश्न वाट पाहत आहे!` },
    bn: { title: 'সুপ্রভাত! Daily challenge প্রস্তুত ☀️', body: v => `${v.name}, আজকের দিন শক্তিশালীভাবে শুরু করো। তোমার আজকের প্রশ্ন অপেক্ষা করছে!` },
  },
  rank_drop: {
    en: { title: 'You dropped to rank #{rank} 📉', body: v => `${v.name}, someone overtook you on the leaderboard. 15 mins of study could take you back to the top!` },
    hi: { title: 'आप #{rank} स्थान पर आ गए 📉', body: v => `${v.name}, किसी ने आपको लीडरबोर्ड पर पीछे छोड़ दिया। 15 मिनट की पढ़ाई आपको वापस ऊपर ला सकती है!` },
    ta: { title: '#{rank} இடத்திற்கு இறங்கினீர்கள் 📉', body: v => `${v.name}, யாரோ உங்களை leaderboard-ல் முந்திவிட்டார். 15 நிமிட படிப்பு மீண்டும் மேலே கொண்டு செல்லும்!` },
    te: { title: '#{rank} స్థానానికి దిగారు 📉', body: v => `${v.name}, ఎవరో మిమ్మల్ని leaderboard లో దాటారు. 15 నిమిషాల చదువు మిమ్మల్ని తిరిగి పైకి తీసుకువెళ్ళగలదు!` },
    kn: { title: '#{rank} ಸ್ಥಾನಕ್ಕೆ ಇಳಿದಿದ್ದೀರಿ 📉', body: v => `${v.name}, ಯಾರೋ ನಿಮ್ಮನ್ನು leaderboard ನಲ್ಲಿ ಹಿಂದಿಕ್ಕಿದ್ದಾರೆ. 15 ನಿಮಿಷ ಓದು ನಿಮ್ಮನ್ನು ಮೇಲಕ್ಕೆ ಕರೆದೊಯ್ಯಬಹುದು!` },
    mr: { title: '#{rank} क्रमांकावर आलात 📉', body: v => `${v.name}, कोणीतरी तुम्हाला leaderboard वर मागे टाकले. 15 मिनिटांचा अभ्यास तुम्हाला पुन्हा वर आणू शकतो!` },
    bn: { title: '#{rank} নম্বরে নেমে গেছ 📉', body: v => `${v.name}, কেউ leaderboard-এ তোমাকে পিছিয়ে দিয়েছে। ১৫ মিনিটের পড়া তোমাকে আবার উপরে নিয়ে যেতে পারে!` },
  },
  referral_milestone: {
    en: { title: 'Your friend is crushing it! 🎉', body: v => `${v.friend} just hit a study milestone. You earned ${v.xp} bonus XP for referring them!` },
    hi: { title: 'आपके मित्र ने मील का पत्थर छुआ! 🎉', body: v => `${v.friend} ने पढ़ाई में मील का पत्थर छुआ। आपको ${v.xp} बोनस XP मिला!` },
    ta: { title: 'உங்கள் நண்பர் சாதித்தார்! 🎉', body: v => `${v.friend} படிப்பில் milestone அடைந்தார். நீங்கள் ${v.xp} bonus XP பெற்றீர்கள்!` },
    te: { title: 'మీ స్నేహితుడు సాధించారు! 🎉', body: v => `${v.friend} చదువులో milestone చేరుకున్నారు. మీకు ${v.xp} bonus XP వచ్చింది!` },
    kn: { title: 'ನಿಮ್ಮ ಸ್ನೇಹಿತ ಸಾಧಿಸಿದ್ದಾರೆ! 🎉', body: v => `${v.friend} ಓದಿನಲ್ಲಿ milestone ತಲುಪಿದ್ದಾರೆ. ನಿಮಗೆ ${v.xp} bonus XP ಸಿಕ್ಕಿದೆ!` },
    mr: { title: 'तुमच्या मित्राने मैलाचा दगड गाठला! 🎉', body: v => `${v.friend} ने अभ्यासात milestone गाठला. तुम्हाला ${v.xp} bonus XP मिळाला!` },
    bn: { title: 'তোমার বন্ধু সাফল্য অর্জন করেছে! 🎉', body: v => `${v.friend} পড়াশোনায় milestone পৌঁছেছে। তুমি ${v.xp} bonus XP পেয়েছ!` },
  },
};

function localise(
  key: string,
  lang: string,
  vars: Record<string, string>,
): { title: string; body: string } {
  const l = (COPY[key]?.[lang as Lang] ?? COPY[key]?.['en'])!;
  const title = l.title.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return { title, body: l.body(vars) };
}

// Checks push_log — returns true if this push type was already sent in the last `cooldownHours`
async function alreadySent(
  serviceDb: ReturnType<typeof createClient>,
  userId: string,
  pushType: string,
  cooldownHours = 20,
): Promise<boolean> {
  const since = new Date(Date.now() - cooldownHours * 3600_000).toISOString();
  const { count } = await serviceDb
    .from('push_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('push_type', pushType)
    .gte('sent_at', since);
  return (count ?? 0) > 0;
}

async function logPush(
  serviceDb: ReturnType<typeof createClient>,
  userId: string,
  pushType: string,
  payload: Record<string, string>,
): Promise<void> {
  serviceDb
    .from('push_log')
    .insert({ user_id: userId, push_type: pushType, payload })
    .then(() => {})
    .catch(err => console.error('[novo-push] push_log insert failed:', err?.message));
}

// ── Dispatch logic (shared between cron and authenticated user) ───────────────
async function dispatchNotifications(
  serviceDb:   ReturnType<typeof createClient>,
  accessToken: string,
  projectId:   string,
  targetUserId?: string,
): Promise<{ sent: number; errors: number; total_checked: number }> {
  const now         = new Date();
  const cooloffISO  = new Date(now.getTime() - PUSH_COOLDOWN_HOURS * 3600_000).toISOString();
  const todayISO    = now.toISOString().slice(0, 10);
  const utcHour     = now.getUTCHours();

  let profileQuery = serviceDb
    .from('profiles')
    .select('id, full_name, push_token, exam_name, exam_date, streak_count, last_push_at, is_pro, preferred_language')
    .not('push_token', 'is', null)
    .or(`last_push_at.is.null,last_push_at.lt.${cooloffISO}`)
    .limit(500);

  if (targetUserId) profileQuery = profileQuery.eq('id', targetUserId);

  const { data: users, error: usersErr } = await profileQuery;
  if (usersErr || !users) {
    console.error('[novo-push] profile query error:', usersErr?.message);
    return { sent: 0, errors: 0, total_checked: 0 };
  }

  let sent   = 0;
  let errors = 0;

  for (const user of users) {
    if (!user.push_token) continue;

    const lang      = (user.preferred_language ?? 'en') as Lang;
    const firstName = (user.full_name ?? 'there').split(' ')[0];

    type Notification = { type: string; title: string; body: string; data: Record<string, string> };
    const notifications: Notification[] = [];

    // 1. Unread proactive messages ────────────────────────────────────────────
    const { data: pending } = await serviceDb
      .from('novo_proactive_messages')
      .select('id, message, cta_route')
      .eq('user_id', user.id)
      .is('read_at', null)
      .is('push_sent_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (pending && pending.length > 0) {
      const msg = pending[0] as { id: string; message: string; cta_route: string | null };
      notifications.push({
        type:  'proactive',
        title: 'Novo has a message for you',
        body:  msg.message.slice(0, 120) + (msg.message.length > 120 ? '…' : ''),
        data:  { route: msg.cta_route ?? '/novo-messages', message_id: msg.id },
      });
      serviceDb
        .from('novo_proactive_messages')
        .update({ push_sent_at: now.toISOString() })
        .eq('id', msg.id)
        .then(() => {})
        .catch(err => console.error('[novo-push] mark push_sent_at failed:', err?.message));
    }

    // 2. Exam countdown ────────────────────────────────────────────────────────
    if (user.exam_date && !notifications.length) {
      const daysLeft = Math.max(0, Math.floor(
        (new Date(user.exam_date).getTime() - now.getTime()) / 86400000,
      ));
      if ([1, 3, 7].includes(daysLeft)) {
        const key = `exam_countdown_${daysLeft}d`;
        if (!(await alreadySent(serviceDb, user.id, key, 20))) {
          notifications.push({
            type:  key,
            title: `${user.exam_name ?? 'Your exam'} in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
            body:  `Hey ${firstName}, ${daysLeft === 1 ? "it's tomorrow" : `${daysLeft} days to go`}. Let's make today count!`,
            data:  { route: '/sprint' },
          });
        }
      }
    }

    // 3. Streak at risk (≥ 6 PM IST = 12:30 UTC) ──────────────────────────────
    if (!notifications.length && user.streak_count > 0 && utcHour >= 12) {
      const { count: todayCount } = await serviceDb
        .from('sprint_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true)
        .gte('created_at', `${todayISO}T00:00:00.000Z`);

      if ((todayCount ?? 0) === 0) {
        const key = `streak_risk_${todayISO}`;
        if (!(await alreadySent(serviceDb, user.id, key, 20))) {
          const c = localise('streak_risk', lang, { name: firstName, streak: String(user.streak_count) });
          notifications.push({ type: key, title: c.title, body: c.body, data: { route: '/sprint' } });
        }
      }
    }

    // 4. Quiz recap — personalized mastery nudge (≥ 13:30 UTC ≈ 7 PM IST) ────
    if (!notifications.length && utcHour >= 13) {
      const key = `quiz_recap_${todayISO}`;
      if (!(await alreadySent(serviceDb, user.id, key, 20))) {
        const since24h = new Date(now.getTime() - 24 * 3600_000).toISOString();
        const { data: recentMastery } = await serviceDb
          .from('subtopic_mastery')
          .select('subject, subtopic, mastery_score')
          .eq('user_id', user.id)
          .lt('mastery_score', 0.65)
          .gte('updated_at', since24h)
          .order('mastery_score', { ascending: true })
          .limit(10);

        if (recentMastery && recentMastery.length > 0) {
          type MasteryRow = { subject: string; subtopic: string; mastery_score: number };
          const weakest = recentMastery[0] as MasteryRow;
          const pct = Math.round(weakest.mastery_score * 100);
          const c = localise('quiz_recap', lang, {
            name: firstName,
            subject: weakest.subject,
            topic: weakest.subtopic,
            pct: String(pct),
            count: String(recentMastery.length),
          });
          notifications.push({ type: key, title: c.title, body: c.body, data: { route: '/weakness-radar' } });
        }
      }
    }

    // 5. Weak-topic evening nudge (≥ 2 PM UTC ≈ 7:30 PM IST) ─────────────────
    if (!notifications.length && utcHour >= 14) {
      const key = `weak_topic_${todayISO}`;
      if (!(await alreadySent(serviceDb, user.id, key, 20))) {
        const { data: weakTopics } = await serviceDb
          .from('topic_stats')
          .select('subject, topic, struggle_count, win_count')
          .eq('user_id', user.id)
          .gte('struggle_count', 2)
          .order('struggle_count', { ascending: false })
          .limit(5);

        const weakest = (weakTopics ?? [])
          .map((t: { subject: string; topic: string; struggle_count: number; win_count: number }) =>
            ({ ...t, weakness: t.struggle_count - t.win_count }))
          .sort((a, b) => b.weakness - a.weakness)[0];

        if (weakest && weakest.weakness > 0) {
          const c = localise('weak_topic', lang, { name: firstName, topic: weakest.topic, subject: weakest.subject });
          notifications.push({ type: key, title: c.title, body: c.body, data: { route: '/weakness-radar' } });
        }
      }
    }

    // 6. Rank drop (runs if nothing else queued; uses rank_snapshots) ──────────
    if (!notifications.length) {
      const key = `rank_drop_${todayISO}`;
      if (!(await alreadySent(serviceDb, user.id, key, 22))) {
        const { data: snaps } = await serviceDb
          .from('rank_snapshots')
          .select('rank_pos, snapped_at')
          .eq('user_id', user.id)
          .order('snapped_at', { ascending: false })
          .limit(2);

        if (snaps && snaps.length === 2) {
          const [latest, prev] = snaps as { rank_pos: number; snapped_at: string }[];
          const dropped = latest.rank_pos - prev.rank_pos;
          if (dropped >= 3) {
            const c = localise('rank_drop', lang, { name: firstName, rank: String(latest.rank_pos) });
            notifications.push({ type: key, title: c.title, body: c.body, data: { route: '/leaderboard' } });
          }
        }
      }
    }

    // 7. Morning daily challenge push (1:30–2:30 UTC = 7–8 AM IST) ────────────
    if (!notifications.length && utcHour >= 1 && utcHour < 3) {
      const key = `morning_daily_${todayISO}`;
      if (!(await alreadySent(serviceDb, user.id, key, 20))) {
        const c = localise('morning_daily', lang, { name: firstName });
        notifications.push({ type: key, title: c.title, body: c.body, data: { route: '/quiz' } });
      }
    }

    // 8. Referral milestone (friend just hit study_milestone) ──────────────────
    if (!notifications.length) {
      const { data: milestones } = await serviceDb
        .from('referrals')
        .select('id, referee_id, status, xp_awarded, updated_at')
        .eq('referrer_id', user.id)
        .eq('status', 'study_milestone')
        .gte('updated_at', new Date(now.getTime() - 24 * 3600_000).toISOString())
        .limit(1);

      if (milestones && milestones.length > 0) {
        const m = milestones[0] as { id: string; referee_id: string; status: string; xp_awarded: number };
        const key = `referral_milestone_${m.id}`;
        if (!(await alreadySent(serviceDb, user.id, key, 48))) {
          const { data: friendProfile } = await serviceDb
            .from('profiles').select('full_name').eq('id', m.referee_id).maybeSingle();
          const friendName = (friendProfile as { full_name?: string } | null)?.full_name ?? 'Your friend';
          const c = localise('referral_milestone', lang, {
            name: firstName, friend: friendName.split(' ')[0], xp: String(m.xp_awarded),
          });
          notifications.push({ type: key, title: c.title, body: c.body, data: { route: '/referral' } });
        }
      }
    }

    if (notifications.length === 0) continue;

    const n  = notifications[0];
    const ok = await sendFCM(user.push_token, n.title, n.body, n.data, accessToken, projectId);

    if (ok) {
      sent++;
      await logPush(serviceDb, user.id, n.type, n.data);
      serviceDb
        .from('profiles')
        .update({ last_push_at: now.toISOString() })
        .eq('id', user.id)
        .then(() => {})
        .catch(err => console.error('[novo-push] last_push_at update failed:', err?.message));
    } else {
      errors++;
    }
  }

  return { sent, errors, total_checked: users.length };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(withSentry('novo-push', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? '';

  const saJson    = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');

  if (!saJson || !projectId) {
    return json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID not configured' }, 500);
  }

  // ── Mode A: Cron call authenticated by shared secret header ─────────────────
  const incomingCronSecret = req.headers.get('x-cron-secret') ?? '';
  const isCron = cronSecret && incomingCronSecret === cronSecret;

  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (isCron) {
    // Cron processes ALL users — no per-user restriction
    let accessToken: string;
    try { accessToken = await getAccessToken(saJson); }
    catch (e) { return json({ error: `FCM auth failed: ${(e as Error).message}` }, 500); }

    const result = await dispatchNotifications(serviceDb, accessToken, projectId);
    return json(result);
  }

  // ── Mode B/C: Authenticated user trigger ────────────────────────────────────
  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) {
    return json({ error: 'Unauthorized. Provide a valid Supabase JWT or the cron secret header.' }, 401);
  }

  const rl = await checkRateLimit(serviceDb, user.id, 'novo-push', 40, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const requestedUserId = typeof body.user_id === 'string' ? body.user_id : undefined;

  // ── Authorization check: only admins can target other users ──────────────────
  if (requestedUserId && requestedUserId !== user.id) {
    // Verify caller has admin role
    const { data: roles } = await serviceDb
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roles) {
      return json({ error: 'Forbidden. You can only trigger notifications for your own account.' }, 403);
    }
  }

  // Scope to caller's own user_id unless admin specified a different user_id
  const targetUserId = requestedUserId ?? user.id;

  let accessToken: string;
  try { accessToken = await getAccessToken(saJson); }
  catch (e) { return json({ error: `FCM auth failed: ${(e as Error).message}` }, 500); }

  const result = await dispatchNotifications(serviceDb, accessToken, projectId, targetUserId);
  return json(result);
}));

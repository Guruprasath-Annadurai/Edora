# Edora — AI-Powered Study App

> A full-stack mobile learning platform for Indian competitive exam students (JEE / NEET / CBSE), built with React + TypeScript + Capacitor and deployed on Android & iOS.

---

## Live Demo

🌐 **Web:** [edora-app.vercel.app](https://edora-app.vercel.app)  
📱 **Android:** Available on Google Play Store (in review)

---

## What It Does

Edora is a personalized AI tutor that adapts to how each student learns. Key features:

| Feature | Description |
|---|---|
| **Novo AI Chat** | Dual-personality AI tutor (Novo Dominie / Preceptor) powered by Groq LLaMA via Supabase Edge Functions |
| **Study Sprint** | Solo & group Pomodoro sessions with XP rewards (10 / 15 / 25 / 45 min) |
| **1v1 Battle** | Real-time quiz battles with ELO ranking across Physics, Chemistry, Maths, Biology |
| **AI Flashcards** | SM-2 spaced-repetition with AI card generation from any topic |
| **Mock Full Test** | Full JEE Main / JEE Advanced / NEET timed simulation (180–210 min) |
| **AI Quiz** | Instant MCQ generation on any topic (5–20 questions) |
| **Analytics Dashboard** | Study DNA, mood heatmap, weak-topic radar, Novo memory panel |
| **Revision Planner** | Week-by-week AI revision schedule tailored to exam date |
| **Achievements** | 14 badges with XP rewards (First Steps, Sprint Starter, On Fire, etc.) |
| **Leaderboard** | Global / State / City / School rankings |
| **Study Reminders** | Daily push notifications (Flashcard Review, Daily Challenge, Sprint) |
| **Offline Mode** | WiFi prefetch + sync queue for study sessions without internet |
| **Parent Portal** | Progress visibility for parents with report export |
| **Teacher Dashboard** | Classroom management, live broadcast, assignment export |

---

## Tech Stack

### Frontend
- **React 18** + **TypeScript** — component architecture
- **Vite** — bundler with HMR
- **Tailwind CSS** — utility-first styling
- **Framer Motion** — animations
- **React Router v6** — SPA routing
- **Capacitor** — native iOS/Android bridge

### Backend
- **Supabase** — PostgreSQL database, Auth, Realtime, Storage
- **Supabase Edge Functions** (Deno/TypeScript) — 40+ serverless functions
- **Groq API** (LLaMA 3.3 70B) — AI chat, quiz generation, curriculum builder
- **ElevenLabs** — TTS voice for Novo AI
- **Firebase** — FCM push notifications

### Mobile
- **Capacitor** with custom plugins (Widget, Smart Reply, ML Kit)
- **Android** — signed AAB, Play Store ready
- **iOS** — Xcode project, App Store ready
- Android Home Screen **Widget** (XP, streak, Novo quick-chat)

### Observability
- **Sentry** — error tracking with session replay
- **PostHog** — product analytics
- **RevenueCat** — subscription management (in setup)

### Dev Tools
- **Cursor** — primary IDE for development
- **Claude** — debugging, edge function logic, and production hardening
- **Vitest** — unit tests

---

## Architecture

```
edora/
├── src/
│   ├── pages/          # 50+ route-level pages
│   ├── components/     # Reusable UI, Novo avatar, ProGate, etc.
│   ├── hooks/          # useAuth, useOfflineSync, usePushNotifications, etc.
│   ├── lib/            # spacedRepetition, trial, storage, analytics, etc.
│   └── contexts/       # ThemeContext
├── supabase/
│   ├── functions/      # 40+ Edge Functions (gemini-chat, elevenlabs-tts, etc.)
│   └── migrations/     # 35+ SQL migrations
├── android/            # Capacitor Android project
└── ios/                # Capacitor iOS project
```

---

## Key Engineering Decisions

**Offline-first storage** — `storage.ts` wraps `localStorage` with a dual-write to Capacitor Preferences so data survives app-data-clear on Android.

**Auth resilience** — `useAuth` implements exponential back-off retry (400ms → 800ms → 1600ms) for transient Supabase DB errors, with a global `unhandledrejection` → Sentry safety net.

**Security** — `allowBackup="false"` in AndroidManifest, `noopener,noreferrer` on all external links, server-side-only API keys via Edge Functions, `SCHEDULE_EXACT_ALARM` graceful degradation on Android 12+.

**SM-2 Spaced Repetition** — full SuperMemo-2 algorithm implemented in `src/lib/spacedRepetition.ts` with due-date scheduling and ease-factor tracking.

**Trial system** — 30-day free Pro trial calculated from `user.created_at` in `src/lib/trial.ts`, zero database changes needed.

---

## Running Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for web
npm run build

# Android (requires Android Studio + Java 21)
npx cap sync android
cd android && JAVA_HOME=/path/to/temurin-21 ./gradlew bundleRelease
```

**Environment variables** — copy `.env.example` to `.env` and fill in:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_SENTRY_DSN`
- `VITE_POSTHOG_KEY`

---

## Database

35+ Supabase migrations covering:
- Profiles, XP, streaks, achievements
- Flashcards (SM-2 scheduling)
- Sprint sessions, battle ELO, leaderboard
- Novo memory (pgvector embeddings)
- Study groups, circles, peer explanation
- NCERT content, PYQ bank, curriculum
- Push tokens, parent links, classroom sync
- Row-level security on all tables

---

## Roadmap

- [ ] iOS App Store submission
- [ ] RevenueCat billing (pending merchant verification)
- [ ] NCERT content ingestion pipeline
- [ ] Novo Live (real-time AI tutoring sessions)
- [ ] Tournament mode (bracket-style battles)

---

## About

Built by **Guruprasath Annadurai** as a full-stack solo project targeting the Indian ed-tech market. Designed for JEE/NEET aspirants who need an intelligent, gamified study companion.

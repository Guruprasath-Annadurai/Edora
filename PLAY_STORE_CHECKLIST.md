# Google Play Store Submission Checklist — Edora

**Package:** `com.edora.app`  
**versionCode:** 18 | **versionName:** 2.5.0  
**Last updated:** June 2025

---

## 1. Target SDK ✅

| Setting | Value | Required |
|---|---|---|
| `minSdkVersion` | 24 (Android 7.0) | — |
| `compileSdkVersion` | 36 | — |
| `targetSdkVersion` | **36** | 34+ (✅ passes) |

File: `android/variables.gradle`

---

## 2. Privacy Policy ✅

**URL to enter in Play Console:**
```
https://edora.app/privacy-policy.html
```

The policy covers:
- Data collected (email, name, usage, camera, push token, crash data)
- Third-party services (Supabase, Firebase, Gemini, ElevenLabs, Sentry, PostHog)
- AI-generated content disclosure (Section 2a)
- COPPA / age 13+ requirement (Section 7)
- In-app account deletion path (Section 5)
- Data retention & user rights

Where to enter in Play Console: **App content → Privacy policy**

---

## 3. Data Safety Section (Play Console)

Navigate to: **Play Console → App content → Data safety**

### Data collected

| Data type | Collected? | Purpose | Is it shared? | Optional? |
|---|---|---|---|---|
| Name | Yes | App functionality | No | No |
| Email address | Yes | Account management | No | No |
| User-generated content (notes, chat) | Yes | App functionality | No | No |
| App interactions (feature usage) | Yes | Analytics (PostHog, anonymous) | No (anonymised) | No |
| Crash logs | Yes | App stability (Sentry, anonymised) | No | No |
| Device identifiers (push token) | Yes | Push notifications (Firebase FCM) | No | No |
| Photos/images (scanner feature only) | Yes | App functionality | No | Yes (only when using Scanner) |

### Key answers for the Data Safety form

**Does your app collect or share any of the required user data types?** → **Yes**

**Is all of the user data collected by your app encrypted in transit?** → **Yes** (TLS everywhere)

**Do you provide a way for users to request that their data is deleted?** → **Yes**
- In-app: Profile → Account Settings → Delete Account
- Email: support@edora.app

**Is the data collected required for the app's core functionality?** → **Yes**

**Do you share data with third parties?** → **Yes** (for app operation only — Supabase, Firebase, Gemini, ElevenLabs, Sentry, PostHog — select "Service providers" in the form)

---

## 4. COPPA / Age Gate ✅

Implemented in `OnboardingPage.tsx` (Step 1 of the onboarding flow):

- ✅ Checkbox: "I confirm that I am 13 years of age or older" — **must be checked** before proceeding
- ✅ Checkbox: "I have read and agree to the Privacy Policy" — **must be checked** before proceeding
- ✅ Privacy Policy link opens in-app via `@capacitor/browser`

In Play Console → **App content → Target audience and content**:
- **Target age group:** Select **"Ages 13 and up"** (not "Under 13" or "All ages")
- This avoids the full COPPA managed policy requirements

---

## 5. AI-Generated Content Declaration ✅

In-app disclosure added to **Account Settings** ("About Edora" section):
> "Edora uses AI-generated content throughout the app — including tutoring explanations, quiz questions, flashcards, study summaries, and voice responses. AI content is for educational practice only and may not always be 100% accurate."

In Privacy Policy (Section 2a): Full list of AI features and providers.

In Play Console → **App content → AI-generated content:**
- **Does your app contain AI-generated content?** → **Yes**
- Check: "The AI-generated content is clearly labelled"
- Check: "Users can report inaccurate AI-generated content" → (add support@edora.app as reporting contact)

---

## 6. IARC Content Rating

Navigate to: **Play Console → App content → App content rating → Start questionnaire**

Select **category: Education**

### Questionnaire answers

| Question | Answer |
|---|---|
| Violence | No |
| Sexual content | No |
| Profanity or crude humour | No |
| Controlled substances | No |
| Hate speech | No |
| Gambling | No |
| User-generated content shared publicly | No |
| Advertisements | No |
| Location sharing | No |
| Purchases | No (no in-app purchases currently) |
| Personal information collection | Yes (email, name — required for account) |
| Social features (chat between users) | No |

**Expected rating:** Everyone / PEGI 3 or PEGI 7  
(The 13+ age gate is a COPPA/legal requirement, not a content rating issue — the *content itself* is appropriate for all ages.)

---

## 7. Store Listing Checklist

- [ ] Short description (≤80 chars): `"AI-powered study app with tutoring, flashcards & gamified learning"`
- [ ] Full description: Mention Novo AI, study subjects covered, gamification features
- [ ] Screenshots: Minimum 2 phone screenshots per supported screen size
- [ ] Feature graphic: 1024×500px
- [ ] App icon: 512×512px (already in `android/app/src/main/res/`)
- [ ] Category: **Education**
- [ ] Contact email: support@edora.app

---

## 8. Pre-launch Checklist

- [x] `targetSdkVersion` = 36 ✅
- [x] Privacy policy hosted at `https://edora.app/privacy-policy.html` ✅
- [x] Age gate (13+ confirmation) in onboarding ✅
- [x] Privacy Policy acceptance in onboarding ✅
- [x] AI content disclosure in-app (Account Settings) ✅
- [x] AI content disclosure in Privacy Policy (Section 2a) ✅
- [x] In-app account deletion (Profile → Account Settings → Delete Account) ✅
- [ ] Data Safety form filled in Play Console
- [ ] IARC questionnaire completed in Play Console
- [ ] Target audience set to "Ages 13 and up" in Play Console
- [ ] AI-generated content declared in Play Console
- [ ] Store listing assets uploaded
- [ ] Release signed with production keystore (never commit `keystore.properties`)

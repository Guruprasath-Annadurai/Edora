# Vendor Dependency Boundaries & Integration Contracts

**Classification:** Architecture Specification  
**Principle:** Clean interface boundaries without premature over-abstraction. No new vendors added. Zero migration cost.  

---

## 1. AI Provider Adapter Boundary

The application must interact with AI intelligence through an Edge Gateway interface rather than hardcoding vendor-specific client libraries across UI components.

```
[UI Component / Learner View]
              │
              │ POST /functions/v1/ai-gateway { prompt, context, stream }
              ▼
    [AI Gateway Interface]
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
  [Groq]  [Claude]  [Gemini]
```

### Interface Contract:
```typescript
export interface AICompletionRequest {
  prompt: string;
  context?: {
    subject?: string;
    grade?: string;
    topic?: string;
  };
  stream?: boolean;
}

export interface AICompletionResponse {
  content: string;
  provider: 'groq' | 'claude' | 'gemini' | 'offline_fallback';
  model: string;
  tokensUsed?: number;
  cached?: boolean;
}
```

---

## 2. Payment & Entitlement Adapter Boundary

Client UI must never directly query raw app store receipts or execute proprietary payment vendor APIs directly in feature screens. All state queries must resolve against a uniform entitlement contract.

### Interface Contract:
```typescript
export interface UserEntitlement {
  isPro: boolean;
  activePlan: 'free' | 'monthly' | 'annual' | 'institution';
  expiresAt: string | null;
  gracePeriodActive: boolean;
}

export interface PaymentGatewayAdapter {
  checkEntitlement(userId: string): Promise<UserEntitlement>;
  purchasePackage(packageId: string): Promise<{ success: boolean; error?: string }>;
  restorePurchases(): Promise<{ success: boolean; restored: boolean }>;
}
```

---

## 3. Telemetry & Analytics Boundary

All user action events and exception reporting pass through a decoupled telemetry interface. Disabling or substituting PostHog/Sentry requires zero edits to UI components.

### Interface Contract:
```typescript
export interface TelemetryAdapter {
  captureEvent(eventName: string, properties?: Record<string, unknown>): void;
  identifyUser(userId: string, traits?: Record<string, unknown>): void;
  reportException(error: Error, context?: Record<string, unknown>): void;
}
```

---

## 4. Persistent Storage Boundary

Moves high-volume structured learning artifacts away from synchronous `localStorage` to an asynchronous key-value / document store.

### Interface Contract:
```typescript
export interface OfflineStorageAdapter {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(prefix?: string): Promise<void>;
}
```
* **Web Target:** IndexedDB (`idb-keyval`).
* **Android Target:** IndexedDB / SQLite persistent sandbox.

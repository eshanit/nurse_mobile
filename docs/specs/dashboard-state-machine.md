Great — this is the *exact* next step.
We’ll now convert your dashboard into a **deterministic state machine + data contract** so the UI is *always correct*, even offline and under sync failures.

Below is the spec you can give directly to KiloCode.

Save as:

> `docs/specs/dashboard-state-machine.md`

---

# 🧭 Clinical Dashboard – State Machine & Data Contract

**Applies to:** Frontliner Mobile App (Nuxt 4 + PouchDB)
**Status:** Authoritative
**Depends on:** `offline-auth.md`, `pouchdb-sync-service.md`

---

## 1. Dashboard State Machine

### 1.1 Global States

| State       | Description                          |
| ----------- | ------------------------------------ |
| `LOCKED`    | App is locked (PIN not entered)      |
| `UNLOCKING` | Deriving key + verifying test record |
| `READY`     | DB unlocked, dashboard loading       |
| `OFFLINE`   | No network but usable                |
| `SYNCING`   | Sync in progress                     |
| `ERROR`     | Sync or DB error                     |

---

### 1.2 Transitions

```text
LOCKED → (PIN OK) → UNLOCKING
UNLOCKING → (KEY VALID) → READY
READY → (network lost) → OFFLINE
OFFLINE → (network back) → SYNCING
SYNCING → (done) → READY
ANY → (critical error) → ERROR
```

---

## 2. UI State Binding

| State   | Header Badge | Main Action    | Banner            |
| ------- | ------------ | -------------- | ----------------- |
| LOCKED  | 🔒 Locked    | —              | Enter PIN         |
| READY   | ● Online     | New Assessment | —                 |
| OFFLINE | ○ Offline    | New Assessment | “Working offline” |
| SYNCING | ⟳ Syncing    | Disabled       | Progress bar      |
| ERROR   | 🔴 Error     | Retry Sync     | “Check network”   |

---

## 3. Data Contract (from PouchDB)

### 3.1 Queries

```ts
draft = find({ type: 'encounter', status: 'draft' })
awaitingSync = find({ status: { $in: ['finalized', 'ai_processed'] }, synced: false })
urgent = find({ priority: 'red' })
recent = find({ type: 'encounter' }, { sort: ['updated_at'], limit: 5 })
```

---

## 4. Derived Dashboard Model

```ts
DashboardState = {
  hasDraft: boolean,
  draftMeta?: { workflow, updated_at },
  awaitingSyncCount: number,
  urgentCount: number,
  stats: {
    red: number,
    yellow: number,
    green: number
  },
  recent: ActivityItem[],
  sync: {
    status: 'online' | 'offline' | 'syncing' | 'error',
    lastSuccess?: ISODate
  }
}
```

---

## 5. Event Handlers

| Event             | Action            |
| ----------------- | ----------------- |
| `onUnlock()`      | loadDashboard()   |
| `onSyncStart()`   | set state SYNCING |
| `onSyncSuccess()` | refresh stats     |
| `onNetworkLost()` | OFFLINE           |
| `onCritical()`    | ERROR             |

---

## 6. UI Components Mapping

| Component    | Data                |
| ------------ | ------------------- |
| Header       | sync.status, clinic |
| Action Cards | hasDraft            |
| Stats Bar    | stats               |
| Feed         | recent              |
| Alerts Tab   | urgent              |

---

## 7. Offline Guarantees

* Dashboard must render even if **0 network**.
* Sync status is informational, never blocking.
* All counts derived from local DB only.

---

This ensures your UI is **truthful, fast, and safe** under all conditions.

If you’d like, next I can generate:

👉 **`clinical-form-engine.md`** – dynamic IMCI workflow system.

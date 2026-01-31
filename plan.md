
Below is a **KiloCode-optimized `PLAN.md`**.
It is:

* Task-oriented
* Step-by-step
* Explicit about constraints
* Safe for an autonomous coding agent

---

# **PLAN.md**

## HealthBridge Companion – Frontliner App

### Phase 1: Pediatric Respiratory Distress

---

## ROLE

You are an implementation agent for a clinical, offline-first mobile application.

You must:

* Assume **no internet** during runtime
* Preserve **all data**
* Never auto-delete records
* Never auto-resolve conflicts
* Treat AI output as **advisory only**

You must pause for human review after each milestone.

---

## GOAL

Build a Nuxt + Capacitor mobile app that:

1. Works fully offline
2. Stores data locally in PouchDB
3. Syncs bi-directionally with CouchDB
4. Guides nurses through WHO IMCI respiratory assessment
5. Submits finalized dossiers to Laravel AI API
6. Displays triage priority + action steps

---

## TECH CONSTRAINTS

* Framework: **Nuxt 4 (SPA)**
* Mobile: **Capacitor**
* Local DB: **PouchDB (IndexedDB)**
* Sync: **CouchDB HTTP**
* Validation: **Zod**
* Encryption: WebCrypto AES-256
* No external SaaS dependencies
* Must run on Android (2GB RAM)

---

## MILESTONE 1 – PROJECT BOOTSTRAP

### Deliverables

* Nuxt 4 app
* Capacitor Android setup
* `src/services/pouchdb.ts`
* Encrypted local DB init
* Basic sync stub (no UI yet)

### Tasks

1. Scaffold Nuxt app (SPA mode)
2. Install Capacitor + Android platform
3. Install:

   * pouchdb-browser
   * pouchdb-adapter-http
   * pouchdb-authentication
   * pouchdb-find
4. Create `pouchdb.ts` with:

   * DB init
   * Encryption helper
   * Basic CRUD
5. Create `sync.ts`:

   * live + retry
   * backoff
6. Log sync events

**STOP and wait for review.**


The key now is **to insert the security layer without breaking what you’ve built**.

Below is a **recovery + re-sequenced plan** that assumes:

We now **retrofit security correctly** before any clinical data goes further.

---

# 🔁 Revised Plan – Security Retrofit & Forward Path

This replaces Milestones 1–2 in your original plan.

---

## 🚑 Milestone 1R: Security Retrofit (Week 1)

**Goal:** Make all existing local data unreadable unless unlocked.

### Tasks

* [ ] Add PIN setup & login UI
* [ ] Implement PBKDF2 key derivation
* [ ] Store salt + device secret in Secure Storage
* [ ] Add known encrypted test record
* [ ] Block DB access until unlocked
* [ ] Integrate PouchDB encryption plugin
* [ ] Add device binding
* [ ] Add brute-force lockout + wipe
* [ ] Add audit logs

**Exit Criteria**

* Opening app without PIN → no DB access
* Wrong PIN → cannot read any record
* Tablet theft → data is ciphertext

---

## 🔄 Milestone 2R: Encrypted Sync Stabilization (Week 2)

**Goal:** Ensure encrypted docs sync safely.

### Tasks

* [ ] Reinitialize PouchDB with encryption adapter
* [ ] Verify encrypted replication
* [ ] Add conflict flagging UI
* [ ] Add sync audit panel

**Exit Criteria**

* Encrypted docs sync & decrypt
* Conflicts flagged, not merged
* Logs visible



## MILESTONE 2 – IMCI FORM ENGINE

### Deliverables

* Dynamic respiratory form
* Conditional logic
* Validation via Zod
* Local save as `draft`

### Tasks

1. Build form schema
2. Age-based RR thresholds
3. Danger sign triggers
4. Media capture (photo + audio)
5. Save to PouchDB

**STOP and wait for review.**

---

## MILESTONE 3 – SYNC + CONFLICT UI

### Deliverables

* Background sync
* Sync status indicator
* Conflict flagging
* Supervisor merge screen

### Tasks

1. Implement `db.sync()`
2. Track `_conflict`
3. Build conflict list view
4. Block submission on unresolved conflict

**STOP and wait for review.**

---

## MILESTONE 4 – AI TRIAGE INTEGRATION

### Deliverables

* POST dossier to Laravel
* Poll for AI result
* Display priority + action

### Tasks

1. API client
2. Retry + queue
3. Update PouchDB
4. UI banner (RED/YELLOW/GREEN)

**STOP and wait for review.**

---

## MILESTONE 5 – HARDENING & RELEASE

### Deliverables

* 7-day offline test
* Performance profiling
* APK build
* Deployment docs

**STOP and wait for review.**

---

## NON-NEGOTIABLE RULES

* Never auto-delete
* Never auto-merge conflicts
* Never block data entry
* Never hide AI uncertainty
* Always log actions

---

## SUCCESS CRITERIA

* Zero data loss
* <5 min form time
* > 95% RED sensitivity
* <20% battery drain

---

## START HERE

Begin with **Milestone 1**.

---



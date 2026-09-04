# Bilibili Three Games MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use the Code execution workflow to implement this plan task-by-task.

**Goal:** Build a polished, locally previewable web MVP containing three replayable Bilibili-oriented mini-games and a switchable rewarded-adapter that defaults to preview mode.

**Architecture:** A Vite + React + TypeScript single-page application provides a shared arcade lobby, settings, persistence, and ad service. Each game is an isolated React feature with a small state machine and deterministic pure helpers that can be unit tested. The Bilibili SDK is accessed only behind a defensive adapter; preview mode simulates completion and remains the default.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, CSS animations, localStorage.

---

### Task 1: Scaffold and shared shell

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles.css`

**Steps:**
1. Add Vite/React/TypeScript configuration and scripts.
2. Build the arcade lobby, game routing, responsive navigation, settings drawer, and error boundary.
3. Run `npm install` and `npm run build`; expect a successful production build.

### Task 2: Persistence and rewarded-ad adapter

**Files:**
- Create: `src/services/storage.ts`, `src/services/adService.ts`
- Create: `src/components/RewardedAdModal.tsx`, `src/components/GameChrome.tsx`
- Test: `src/services/adService.test.ts`

**Steps:**
1. Write tests for preview rewards, disabled rewards, and SDK failure fallback.
2. Implement versioned local persistence and preview/SDK/off ad modes.
3. Add a reusable reward confirmation/loading/result modal and daily ad cap.
4. Run `npm test`; expect all tests to pass.

### Task 3: Three-minute cultivation game

**Files:**
- Create: `src/games/cultivation/CultivationGame.tsx`, `src/games/cultivation/model.ts`
- Test: `src/games/cultivation/model.test.ts`

**Steps:**
1. Test event resolution, realm progression, death, and inherited talent selection.
2. Implement choice-driven life events, stats, realms, endings, reincarnation, and two contextual ad rewards.
3. Verify a complete life-and-reincarnation flow in the browser.

### Task 4: Office slacking game

**Files:**
- Create: `src/games/office/OfficeGame.tsx`, `src/games/office/model.ts`
- Test: `src/games/office/model.test.ts`

**Steps:**
1. Test suspicion, score gain, boss state, and upgrades.
2. Implement a 60-second risk/reward loop, keyboard controls, upgrades, caught/rescue state, and score settlement.
3. Verify play, rescue, and restart flows in the browser.

### Task 5: Creature arena game

**Files:**
- Create: `src/games/arena/ArenaGame.tsx`, `src/games/arena/model.ts`
- Test: `src/games/arena/model.test.ts`

**Steps:**
1. Test creature generation, mutations, and battle resolution.
2. Implement hatch, three-choice mutation, animated auto-battle, rewards, collection, and contextual reroll reward.
3. Verify hatch-to-battle-to-upgrade loop in the browser.

### Task 6: Production-readiness pass

**Files:**
- Create: `README.md`
- Modify: all UI files as required.

**Steps:**
1. Add reduced-motion support, touch targets, safe-area layout, loading/error states, and local data reset.
2. Run `npm test`, `npm run build`, and inspect the app at mobile and desktop sizes.
3. Document startup, SDK switch, integration boundary, known MVP limitations, and pre-release checklist.

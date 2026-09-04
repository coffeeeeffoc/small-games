import { useCallback, useEffect, useRef, useState } from 'react';

import type { GameHost } from '@coffeeeeffoc/game-contract';

import { initialOfficeSave, loadOfficeSave, writeOfficeSave } from '../adapter/save.js';
import type { OfficeContent } from '../content/schema.js';
import {
  advanceOfficeTick,
  buyPrivacyScreen,
  createOfficeState,
  finishOfficeDay,
  restartOfficeRun,
  rescueOfficeRun,
  type OfficeSave,
  type OfficeState,
} from '../domain/index.js';

/** Orchestrates persistence, time, input, and rewards outside the office view. */
export function useOfficeGame(
  host: GameHost,
  content: OfficeContent,
  active: boolean,
  random: () => number,
) {
  const [state, setState] = useState<OfficeState>(() => createOfficeState(content));
  const [save, setSave] = useState<OfficeSave>(initialOfficeSave);
  const [rescuePending, setRescuePending] = useState(false);
  const saveRef = useRef(save);
  const versionRef = useRef<string | null>(null);
  const settledDay = useRef(-1);
  const runEpoch = useRef(0);
  const [previousActive, setPreviousActive] = useState(active);

  if (previousActive !== active) {
    setPreviousActive(active);
    if (!active && state.slacking) setState({ ...state, slacking: false });
  }

  useEffect(() => {
    let cancelled = false;
    void loadOfficeSave(host).then((loaded) => {
      if (cancelled) return;
      saveRef.current = loaded.save;
      versionRef.current = loaded.version;
      setSave(loaded.save);
    });
    return () => {
      cancelled = true;
      runEpoch.current += 1;
    };
  }, [host]);

  const persist = useCallback(
    async (previous: OfficeSave, next: OfficeSave) => {
      saveRef.current = next;
      setSave(next);
      const persisted = await writeOfficeSave(host, previous, next, versionRef.current);
      saveRef.current = persisted.save;
      versionRef.current = persisted.version;
      setSave(persisted.save);
    },
    [host],
  );

  useEffect(() => {
    if (!active || state.intro || state.caught || state.done) return;
    const timer = window.setInterval(() => {
      setState((current) =>
        advanceOfficeTick(current, random() < content.days[current.day].inspectionChance),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, content.days, random, state.caught, state.done, state.intro]);

  useEffect(() => {
    if (state.time !== 0 || state.caught || state.done || settledDay.current === state.day) return;
    settledDay.current = state.day;
    const timer = window.setTimeout(() => {
      const previous = saveRef.current;
      const result = finishOfficeDay(state, previous, content);
      setState(result.state);
      void persist(previous, result.save);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [content, persist, state]);

  useEffect(() => {
    if (!active) return;
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      setState((current) => ({ ...current, slacking: true }));
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setState((current) => ({ ...current, slacking: false }));
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [active]);

  const setSlacking = useCallback(
    (slacking: boolean) => {
      if (active) setState((current) => ({ ...current, slacking }));
    },
    [active],
  );

  function restart() {
    runEpoch.current += 1;
    settledDay.current = -1;
    setRescuePending(false);
    setState((current) => restartOfficeRun(current, content));
  }

  function upgrade() {
    const previous = saveRef.current;
    const result = buyPrivacyScreen(state, previous);
    setState(result.state);
    if (result.save !== previous) void persist(previous, result.save);
  }

  async function rescue() {
    if (rescuePending) return;
    const epoch = runEpoch.current;
    setRescuePending(true);
    let outcome;
    try {
      outcome = await host.ads.offer({
        id: 'office.destroy-history',
        reward: { suspicion: 15 },
      });
    } catch {
      outcome = { status: 'failed' } as const;
    }
    if (runEpoch.current !== epoch) return;
    setRescuePending(false);
    if (outcome.status === 'completed') setState((current) => rescueOfficeRun(current));
  }

  return {
    state,
    save,
    rescuePending,
    start: () => setState((current) => ({ ...current, intro: false })),
    setSlacking,
    restart,
    upgrade,
    rescue,
  };
}

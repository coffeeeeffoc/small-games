import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameHost } from '@coffeeeeffoc/game-contract';
import { initialArenaSave, loadArenaSave, writeArenaSave } from '../adapter/save.js';
import type { ArenaContent, Trait } from '../content/schema.js';
import {
  advanceLeague,
  chooseMutation,
  createArenaState,
  hatchArena,
  rewardedMutation,
  settleBattle,
  startBattle,
  controlArena,
  tickArena,
  type DuelInput,
  type ArenaSave,
} from '../domain/index.js';

/** Owns the arena state machine, shared save, and rewarded mutation boundary. */
export function useArenaGame(
  host: GameHost,
  content: ArenaContent,
  active: boolean,
  random: () => number,
) {
  const [state, setState] = useState(createArenaState);
  const [save, setSave] = useState<ArenaSave>(initialArenaSave);
  const [ready, setReady] = useState(false);
  const [rewardPending, setRewardPending] = useState(false);
  const saveRef = useRef(save);
  const versionRef = useRef<string | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    let cancelled = false;
    void loadArenaSave(host).then((loaded) => {
      if (cancelled) return;
      saveRef.current = loaded.save;
      versionRef.current = loaded.version;
      setSave(loaded.save);
      setReady(true);
    });
    return () => {
      cancelled = true;
      epoch.current += 1;
    };
  }, [host]);
  const persist = useCallback(
    async (previous: ArenaSave, next: ArenaSave) => {
      saveRef.current = next;
      setSave(next);
      const persisted = await writeArenaSave(host, previous, next, versionRef.current);
      saveRef.current = persisted.save;
      versionRef.current = persisted.version;
      setSave(persisted.save);
    },
    [host],
  );
  function hatch(seed = random()) {
    epoch.current += 1;
    setState(hatchArena(content, seed));
  }
  function pick(trait: Trait) {
    setState((current) => chooseMutation(current, trait));
  }
  function battle() {
    setState((current) => startBattle(current, content));
  }
  function next() {
    epoch.current += 1;
    setState(state.win ? advanceLeague(state) : createArenaState());
  }
  const control = useCallback(
    (input: DuelInput) => {
      if (active || input === 'cancel') setState((current) => controlArena(current, input));
    },
    [active],
  );
  async function reward() {
    if (rewardPending) return;
    const requestEpoch = epoch.current;
    setRewardPending(true);
    let completed = false;
    try {
      completed =
        (await host.ads.offer({ id: 'arena.post-match-mutation', reward: { mutation: 1 } }))
          .status === 'completed';
    } catch {
      completed = false;
    }
    if (epoch.current !== requestEpoch) return;
    setRewardPending(false);
    if (completed)
      setState((current) =>
        rewardedMutation(current, content.traits[Math.floor(random() * content.traits.length)]),
      );
  }
  useEffect(() => {
    if (!active) return;
    if (state.phase !== 'battle') return;
    const timer = window.setInterval(() => setState(tickArena), 50);
    return () => {
      window.clearInterval(timer);
      setState((current) => controlArena(current, 'cancel'));
    };
  }, [active, control, state.phase]);
  useEffect(() => {
    if (!active || state.phase !== 'battle' || state.duel?.winner == null) return;
    const timer = window.setTimeout(() => {
      const previous = saveRef.current;
      const result = settleBattle(state, previous);
      setState(result.state);
      if (result.save !== previous) void persist(previous, result.save);
    });
    return () => window.clearTimeout(timer);
  }, [active, content, persist, state]);
  return { state, save, ready, rewardPending, hatch, pick, battle, next, reward, control };
}

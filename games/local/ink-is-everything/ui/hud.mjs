import { $, esc, setText, amount } from './dom.mjs';

/** Presentation derives from definitions/stats, so registering a chapter needs no UI edits. */
export function createHUD({ engine, icon, getState, getDefinition, isPaused, input, audio }) {
  let feedbackUntil = 0;
  return {
    feedback(text, error = false, duration = 3200) {
      if (!text) return;
      $('#feedback').textContent = text;
      $('#feedback').className = `visible${error ? ' error' : ''}`;
      feedbackUntil = performance.now() + duration;
    },
    expire(now) {
      if (now > feedbackUntil) $('#feedback').classList.remove('visible');
    },
    soundButton() {
      $('#sound').innerHTML = icon(audio.muted ? 'muted' : 'sound');
      $('#sound').setAttribute('aria-label', audio.muted ? '开启声音' : '静音');
    },
    update() {
      const state = getState(),
        p = state.player,
        definition = getDefinition(),
        paused = isPaused(),
        stats = engine.getPlayerStats(state);
      $('#game-root').dataset.status = state.status;
      $('#game-root').dataset.started = String(state.status !== 'ready');
      $('#game-root').dataset.paused = String(paused);
      setText('#ink-value', amount(p.ink));
      setText('#max-ink', amount(p.maxInk));
      setText('#seal-value', state.seals);
      setText('#seal-total', definition.requiredSeals);
      const danger = p.ink <= Math.max(p.maxInk * 0.2, stats.novaCost + stats.minInkAfterSpend);
      $('#ink-fill').style.width = `${Math.max(0, (p.ink / p.maxInk) * 100)}%`;
      $('#ink-fill').style.background = danger ? '#c68266' : '';
      $('.ink-hud').classList.toggle('ink-danger', danger);
      $('.ink-track').setAttribute('aria-valuenow', p.ink);
      $('.ink-track').setAttribute('aria-valuemax', p.maxInk);
      $('.ink-track').setAttribute('aria-label', `生命墨汁 ${amount(p.ink)} / ${amount(p.maxInk)}`);
      setText('#level-value', state.progression.level);
      setText('#xp-value', `${amount(state.progression.xp)} / ${amount(state.progression.nextXp)}`);
      $('#xp-fill').style.width =
        `${Math.min(100, (state.progression.xp / Math.max(1, state.progression.nextXp)) * 100)}%`;
      setText('#chapter-name', definition.shortTitle || definition.title);
      setText('#room-name', engine.getRoom(state).name);
      setText('#objective', engine.getObjective(state));
      const markup = definition.rooms
        .map((room) => {
          const visit = state.rooms[room.id],
            cleared = visit.cleared && visit.visited;
          return `<span class="map-dot ${room.id === state.roomId ? 'current' : cleared ? 'cleared' : ''}" title="${esc(room.name)}">${esc(room.name.slice(0, 2))}<small>${room.id === state.roomId ? '所在' : cleared ? '已清' : visit.visited ? '已访' : '未访'}</small></span>`;
        })
        .join('');
      if ($('#room-map').innerHTML !== markup) $('#room-map').innerHTML = markup;
      const nearby = state.status === 'playing' ? engine.getNearbyInteractable(state) : null;
      $('#interact').hidden = !nearby || paused;
      if (nearby)
        setText(
          '#interact-label',
          nearby.label ||
            { merchant: '契约装备', spring: '恢复墨汁', chest: '开启墨匣' }[nearby.kind] ||
            '交互',
        );
      setText(
        '#context-hint',
        input.drawMode
          ? '从笔尖锚点拖到对岸圆点'
          : p.ink < stats.attackCost + stats.minInkAfterSpend
            ? '墨汁危险：近身汲墨，走位回收水滴'
            : '',
      );
      $('#nova').disabled = p.ink < stats.novaCost + stats.minInkAfterSpend || p.novaCd > 0;
      setText('#nova b', definition.skills.nova.name);
      setText('#melee b', definition.skills.melee.name);
      setText('#dash b', definition.skills.dash.name);
      setText('#nova small', `${amount(stats.novaCost)} 墨 · Q`);
      $('#nova').setAttribute(
        'aria-label',
        `${definition.skills.nova.name}，消耗 ${amount(stats.novaCost)} 点生命墨汁，周围落下可回收墨滴`,
      );
      for (const [id, cooldown, total] of [
        ['dash', p.dashCd, stats.dashCooldown],
        ['melee', p.meleeCd, stats.meleeCooldown],
        ['nova', p.novaCd, stats.novaCooldown],
      ])
        $(`#${id} .cooldown-mask`).style.transform =
          `translateY(${100 - Math.min(1, cooldown / Math.max(0.01, total)) * 100}%)`;
      const canShoot = p.ink >= stats.attackCost + stats.minInkAfterSpend;
      setText('#fire b', canShoot ? definition.skills.shot.name : definition.skills.melee.name);
      setText('#fire small', canShoot ? `按住 · ${amount(stats.attackCost)} 墨` : '近身 · 吸取');
      $('#fire').setAttribute(
        'aria-label',
        canShoot
          ? `按住发射墨弹，每发消耗 ${amount(stats.attackCost)} 点生命墨汁`
          : '生命墨汁不足，按住使用免费汲墨近战',
      );
      const equipment = engine.getEquipmentSummary(state);
      setText(
        '#equipment-count',
        equipment.reduce((sum, item) => sum + item.rank, 0),
      );
      $('#equipment').title = equipment.length
        ? equipment.map((item) => `${item.name} ${item.rank}阶`).join(' · ')
        : '装备与技能';
      $('#equipment').setAttribute(
        'aria-label',
        `查看装备与技能，已获得 ${equipment.length} 种装备`,
      );
      $('#tutorial-hint').classList.toggle(
        'faded',
        state.time > 12 ||
          state.stats.enemiesDefeated > 0 ||
          $('#feedback').classList.contains('visible'),
      );
      $('#draw-tool').setAttribute('aria-pressed', String(input.drawMode));
      $('#game-root').classList.toggle(
        'game-quiet',
        state.status === 'ready' || paused || ['won', 'lost'].includes(state.status),
      );
    },
  };
}

import { director } from 'cc';
import type { Overwatch } from './Overwatch';

type SnapshotSource = Pick<
  Overwatch,
  | 'hud'
  | 'world'
  | 'sim'
  | 'platform'
  | 'online'
  | 'quartermaster'
  | 'operationPractice'
  | 'measuredFps'
>;

/** Read-only telemetry: preserve the existing snapshot shape and reference/clone semantics. */
export function captureOverwatchSnapshot(game: SnapshotSource, presentedTime: number) {
  return {
    progression: game.quartermaster && {
      draft: game.quartermaster.loadout,
      slot: game.quartermaster.slot,
      dirty: game.quartermaster.dirty,
      scroll: game.quartermaster.loadoutScroll,
      gift: game.quartermaster.gift,
      leaveTo: game.quartermaster.leaveTo,
      drag: game.quartermaster.drag,
      page: game.quartermaster.page,
      mode: game.quartermaster.mode,
      actionMode: game.quartermaster.actionMode,
      busy: game.quartermaster.busy,
      assets: game.online?.assets,
      message: game.quartermaster.message,
      pending: !!game.quartermaster.pending,
    },
    skill: {
      kind: game.sim.skillKind,
      remaining: game.sim.skillRemaining,
      cooldown: game.sim.skillCooldown,
    },
    online: game.online && {
      identity: game.online.identity,
      onlineCount: game.online.onlineCount,
      panel: game.online.panel,
      room: game.online.room,
      active: game.online.active,
      message: game.online.message,
      rankStatus: game.online.rankStatus,
      release: game.online.release,
      checkingRelease: game.online.checkingRelease,
      releaseCheckFailed: game.online.releaseCheckFailed,
      reentryStatus: game.online.reentryStatus,
      rooms: game.online.rooms,
      history: game.online.history,
      ranking: game.online.ranking,
      board: game.online.board,
    },
    fireZones: game.sim.fireZones,
    battleReport: game.hud.reportOpen,
    equipmentOpen: game.hud.equipmentOpen,
    loadout: game.sim.loadout,
    attackCount: game.sim.attackCount,
    enemyEquipment: game.online?.view?.enemyEquipment,
    timeComparison: game.hud.timeComparison,
    homingAmmo: game.sim.homingAmmo,
    homingSelected: game.sim.homingSelected,
    homingTarget: game.sim.homingSelected ? game.sim.homingTarget?.id : undefined,
    zoomLimit: game.world.zoomLimit,
    advert: game.hud.advert,
    pendingSupply: game.platform.rewards.pendingSupply,
    supplySelection: game.hud.supplySelection,
    supplyMessage: game.hud.supplyMessage,
    extractionRemaining: game.sim.extractionRemaining,
    extractionRadioPending: game.sim.extractionRadioPending,
    buff: game.sim.buff ? { ...game.sim.buff } : null,
    resumeCountdown: game.sim.resumeCountdown,
    locks: game.hud.lockedTargets,
    phase: game.sim.phase,
    mission: {
      id: game.sim.mission.id,
      mode: game.sim.mission.mode,
      map: game.sim.mission.map,
      name: game.sim.mission.name,
      spawned: game.sim.spawned.size,
      total: game.sim.mission.events.length,
    },
    trainingBest: game.hud.trainingBest,
    operationProgress: game.hud.missionProgress,
    operationPractice: game.operationPractice,
    missionPage: game.hud.missionPage,
    scrollLists: game.hud.listAreas.map((a) => ({
      ...a,
      offset: a.key.startsWith('qm:')
        ? game.quartermaster?.scrolls[a.key] || 0
        : game.hud.listScroll[a.key] || 0,
    })),
    chat: game.online
      ? {
          messages: game.online.visibleChat,
          draft: game.online.chatDraft,
          status: game.online.chatStatus,
          blocked: Array.from(game.online.blockedPlayers),
          sending: game.online.chatSending,
        }
      : undefined,
    time: game.sim.time,
    presentedTime: presentedTime,
    completionTime: game.sim.completionTime,
    remaining: game.sim.remaining,
    pauses: Array.from(game.sim.pauses),
    convoy: game.sim.convoy,
    progress: game.sim.ratio,
    aim: game.sim.aim,
    aircraft: { ...game.sim.aircraft },
    aircraftModel: {
      status: game.world.aircraftModel.status,
      error: game.world.aircraftModel.error,
      triangles: game.world.aircraftModel.triangleCount,
      muzzle: game.world.aircraftModel.worldMuzzle,
    },
    flightTime: game.sim.flightTime(),
    threatsRemaining: game.sim.threatsRemaining,
    camera: {
      position: {
        x: game.world.cameraNode.position.x,
        y: game.world.cameraNode.position.y,
        z: game.world.cameraNode.position.z,
      },
      rotation: {
        x: game.world.cameraNode.eulerAngles.x,
        y: game.world.cameraNode.eulerAngles.y,
        z: game.world.cameraNode.eulerAngles.z,
      },
      center: { ...game.world.center },
      fov: game.world.camera.fov,
      projection: game.world.camera.projection,
    },
    shotPositions: game.sim.shots.map((shot) => ({ id: shot.id, ...game.sim.shotPosition(shot) })),
    unitLabels: Array.from(game.hud.unitLabels, ([id, label]) => ({
      id,
      text: label.string,
      active: label.node.activeInHierarchy,
      x: label.node.position.x,
      y: label.node.position.y,
    })),
    effects: game.hud.effects,
    recoil: game.world.recoil,
    lastSound: game.platform.lastSound,
    mousePointer: game.hud.mousePointer,
    selected: game.sim.selected,
    weaponReadiness: game.sim.guns.map((_, i) => game.sim.weaponReadiness(i)),
    lasers: game.sim.lasers,
    drones: game.sim.drones,
    guns: game.sim.guns.map((g) => ({ ...g, ammo: g.ammo === Infinity ? 'infinite' : g.ammo })),
    shots: game.sim.shots,
    units: game.sim.units.map((u) => ({ ...u })),
    kills: game.sim.kills,
    friendlyKills: game.sim.friendlyKills,
    groundAttacks: game.sim.events.filter((e) => e.type === 'attack').slice(-12),
    fired: game.sim.fired,
    ammoSpent: game.sim.ammoSpent,
    hits: game.sim.hits,
    friendlyDamage: game.sim.friendlyDamage,
    rescueDamage: game.sim.rescueDamage,
    damageByThreat: game.sim.damageByThreat,
    failureCause: game.sim.failureCause,
    impacts: game.sim.events.filter((e) => e.type === 'impact').slice(-5),
    rating: game.sim.rating,
    failure: game.sim.failure,
    failedGroup: game.sim.failedGroup,
    reason: game.sim.reason(),
    friendlyRisk: game.sim.friendlyRisk,
    aimedUnit: game.sim.aimedUnit?.id,
    ui: {
      homeArtworkReady: !!game.hud.homeArtwork.spriteFrame,
      interfaceArtworkReady: game.hud.interfaceArtworkReady,
      artwork: {
        loading: game.hud.progressionArt.loadingAssets,
        failed: Array.from(game.hud.progressionArt.failed),
        ready: Array.from(game.hud.progressionArt.frames.keys()),
      },
      pressedButton: game.hud.pressedButton,
      worldVisible: game.world.root.active,
      width: game.hud.w,
      height: game.hud.h,
      minimap: game.hud.minimapLayout,
      notice: game.hud.labels.get('notice')?.string,
      warning: game.hud.labels.get('friendWarning')?.string,
      warningColor: game.hud.labels.get('friendWarning')?.color.toHEX(),
      fire: game.hud.buttons.find((b) => b.id === 'fire')?.label.string,
      radio: game.hud.radioText,
      tutorial: game.hud.labels.get('tutorial')?.string,
      feedback: game.hud.labels.get('target')?.string,
      muted: game.platform.muted,
      voicePrompts: game.platform.voicePrompts,
      autoPriority: game.platform.autoPriority,
      viewMode: game.world.viewMode,
      battleStatus: game.hud.labels.get('health')?.string,
      combatantNames: [0, 1].map((side) => {
        const label = game.hud.labels.get('spectator:' + side);
        return {
          text: label?.string,
          active: label?.node.activeInHierarchy,
          fontSize: label?.fontSize,
          wrap: label?.enableWrapText,
        };
      }),
      reducedEffects: game.platform.reducedEffects,
    },
    held: Array.from(game.sim.held),
    completed: Array.from(game.sim.completed),
    modal: game.hud.modalKey,
    scroll: game.hud.scroll,
    scrollMax: game.hud.scrollMax,
    lastHelpLine: game.hud.lastHelpLine,
    buttons: game.hud.buttons
      .filter(
        (b) =>
          b.label.node.activeInHierarchy &&
          (!game.hud.modal || game.hud.inModal(b.label.node) || game.hud.isGlobalAction(b.id)),
      )
      .map(({ id, x, y, w, h, label, detail, visual, disabled, clip }) => {
        const right = clip ? Math.min(x + w, clip.x + clip.w) : x + w,
          bottom = clip ? Math.min(y + h, clip.y + clip.h) : y + h;
        if (clip) {
          x = Math.max(x, clip.x);
          y = Math.max(y, clip.y);
        }
        w = Math.max(0, right - x);
        h = Math.max(0, bottom - y);
        return {
          id,
          x,
          y,
          w,
          h,
          visual,
          clip,
          disabled: !!disabled,
          text: label.string+(detail?.node.active&&detail.string?"\n"+detail.string:""),
          status:detail?.node.active?detail.string:undefined,
          statusColor:detail?.node.active?detail.color.toHEX():undefined,
          bold: label.isBold,
          color: label.color.toHEX(),
        };
      })
      .filter((b) => b.w > 0 && b.h > 0),
    zoom: game.world.zoom,
    follow: game.world.follow,
    safe: game.hud.safe,
    temporary: game.world.temporary,
    thermal: game.world.thermal,
    viewMode: game.world.viewMode,
    modelImport: game.world.modelImport,
    visualMaterialStatus: game.world.visualMaterialStatus,
    visualMaterialError: game.world.visualMaterialError,
    audio: game.platform.audioStatus,
    enginePlaying: game.platform.engine.playing,
    radioPlaying: game.platform.radio.playing,
    radioPending: game.platform.radioPending,
    radioTime: game.platform.radio.currentTime,
    radioDuration: game.platform.radio.duration,
    light: game.sim.mission.light,
    priority: game.sim.priorityThreat && {
      id: game.sim.priorityThreat.unit.id,
      targetId: game.sim.priorityThreat.target.id,
      dueIn: game.sim.priorityThreat.dueIn,
      critical: game.sim.priorityThreat.critical,
    },
    assets: Array.from(game.world.assets),
    renderNodes: game.world.views.size,
    wrecks: Array.from(game.world.views, ([id, v]) => ({
      id,
      wreck: v.wreck,
      scale: v.node.scale.x,
    })),
    markerLabels: game.hud.unitLabels.size,
    frameRate: game.measuredFps,
    drawCalls: (director.root as any)?.device?.numDrawCalls,
    triangles: (director.root as any)?.device?.numTris,
    visibleEffects: game.sim.events.filter((e) => game.sim.time - e.time < 0.7).length,
  };
}

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { legalTargets } from '../src/engine.js';
import { completedHintFixture, loadPatrol, patrolSnapshot } from './browser-helpers.mjs';
import { equalSnapshot, minimizeCommands, seededRandom, snapshotModel } from './command-model.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.COMMAND_OUTPUT || resolve(project, 'outputs/command-model'));
const base = (process.env.BASE_URL || 'http://127.0.0.1:43420').replace(/\/$/, '');
const args = process.argv.slice(2), replayIndex = args.indexOf('--replay');
assert.ok(args.length === 0 || (args.length === 2 && replayIndex === 0), 'usage: check-command-model.mjs [--replay <file>]');
const replayFile = replayIndex < 0 ? null : resolve(args[1]);
const algorithm = 'observed-history-lcg-v1';
const viewport = { width: 390, height: 844 };
const report = { algorithm, base, started: new Date().toISOString(), passed: false, cases: [] };
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const errorText = error => error.stack || String(error);
let browser;

function integers(value, fallback) {
  const values = value ? value.split(',').map(Number) : fallback;
  assert.ok(values.length && values.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff), 'expected comma-separated unsigned integer IDs/seeds');
  return values;
}

function legalMoves(level, state) {
  // Rules select admissible inputs only; no step(), solve() or business history
  // implementation is used as the oracle for the three snapshot properties.
  return state.cops.flatMap((from, cop) => legalTargets(level, state, cop).map(to => ({ type: 'move', cop, from, to })));
}

function nextCommand(level, before, model, random, index) {
  if (before.phase === 'won') return { type: 'restart' };
  if (before.phase === 'lost') return { type: model.depth && random() < 0.7 ? 'undo' : 'restart' };
  const prefix = ['move', 'hint', 'undo', 'move', 'restart', 'hint'];
  const roll = random();
  const type = prefix[index] || (roll < 0.45 ? 'move' : roll < 0.7 && model.depth ? 'undo' : roll < 0.85 ? 'hint' : 'restart');
  if (type !== 'move') return { type };
  if (index === 0 || index === 3) {
    const plan = solutions[level.id][0], cop = Math.max(0, plan.findIndex((node, i) => node !== before.cops[i]));
    return { type, cop, from: before.cops[cop], to: plan[cop] };
  }
  const moves = legalMoves(level, before);
  return moves[Math.floor(random() * moves.length)];
}

function admissible(command, level, before, model) {
  if (command?.type === 'restart') return ['planning', 'lost', 'won'].includes(before.phase);
  if (command?.type === 'undo') return model.depth > 0 && ['planning', 'lost', 'won'].includes(before.phase);
  if (command?.type === 'hint') return before.phase === 'planning';
  return command?.type === 'move' && before.phase === 'planning'
    && [command.cop, command.from, command.to].every(Number.isInteger)
    && before.cops[command.cop] === command.from
    && legalMoves(level, before).some(move => move.cop === command.cop && move.to === command.to);
}

async function runScenario(scenario, { deadline = Infinity, screenshotPath } = {}) {
  const level = levels.find(item => item.id === scenario.levelId);
  assert.ok(level, `unknown level ${scenario.levelId}`);
  const context = await browser.newContext({ viewport: scenario.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const commands = [], trace = [], errors = [], counts = { move: 0, hint: 0, undo: 0, restart: 0 };
  let page, result, before;
  const remaining = max => Math.max(1, Math.min(max, deadline - Date.now()));
  try {
    await completedHintFixture(context);
    await context.addInitScript(() => {
      localStorage.setItem('cops-robbers-practice-v3', JSON.stringify({ version: 3, settings: { teaching: false, sound: false, reduced: true } }));
      // Observe each real search, so repeated hints cannot reuse stale result text.
      const NativeWorker = window.Worker;
      window.__commandHintActivity = { requested: 0, completed: 0 };
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          if (new URL(url, location.href).pathname.endsWith('/hint-worker.js')) {
            const post = this.postMessage.bind(this);
            this.postMessage = (...args) => {
              window.__commandHintActivity.requested++;
              return post(...args);
            };
            this.addEventListener('message', () => window.__commandHintActivity.completed++);
          }
        }
      };
    });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
    page.setDefaultNavigationTimeout(remaining(15000));
    page.setDefaultTimeout(remaining(6000));
    await loadPatrol(page, base, level.id);
    const initial = await patrolSnapshot(page, level), model = snapshotModel(initial), random = seededRandom(scenario.seed);
    const length = scenario.commands ? scenario.commands.length : scenario.steps;
    for (let index = 0; index < length; index++) {
      if (Date.now() >= deadline) throw new Error('shrink replay deadline reached');
      page.setDefaultTimeout(remaining(6000));
      before = await patrolSnapshot(page, level);
      const command = scenario.commands ? scenario.commands[index] : nextCommand(level, before, model, random, index);
      commands.push(structuredClone(command));
      if (!admissible(command, level, before, model)) {
        result = { status: 'invalid', index, reason: 'command precondition no longer holds', command, before };
        break;
      }
      const item = { index, command, before };
      trace.push(item);
      if (command.type === 'move') {
        await page.locator(`#squad [data-cop="${command.cop}"]`).tap();
        equalSnapshot(await patrolSnapshot(page, level), before, 'selection-preserves-board');
        await page.getByTestId(`node-${command.to}`).tap();
        await page.waitForFunction(turn => ['planning', 'won', 'lost'].includes(document.body.dataset.phase)
          && Number(document.body.dataset.turn) === turn, before.turn + 1, { timeout: remaining(6000) });
        const after = await patrolSnapshot(page, level);
        const expectedCops = [...before.cops]; expectedCops[command.cop] = command.to;
        equalSnapshot(after.cops, expectedCops, 'move-affects-selected-officer');
        model.moved(before);
      } else if (command.type === 'hint') {
        const request = await page.evaluate(() => window.__commandHintActivity.requested + 1);
        await page.getByTestId('hint').tap();
        await page.waitForFunction(request => window.__commandHintActivity.requested === request,
          request, { timeout: remaining(15000) });
        await page.waitForFunction(() => !document.querySelector('[data-testid="hint"]').disabled, null, { timeout: remaining(15000) });
        item.hintRequest = request;
        item.hintActivity = await page.evaluate(() => ({ ...window.__commandHintActivity }));
        model.hint(before, await patrolSnapshot(page, level));
        const text = await page.locator('#instruction').textContent();
        equalSnapshot(/最短还需|无法全部围捕|尚未确认最短路线/.test(text), true, 'hint-produces-search-result');
      } else if (command.type === 'undo') {
        if (before.phase === 'won') await page.locator('#win-dialog .dialog-close').tap();
        await page.getByTestId(before.phase === 'lost' ? 'undo-loss' : 'undo').tap();
        model.undo(await patrolSnapshot(page, level));
      } else {
        const restart = before.phase === 'won' ? page.locator('#replay') : page.getByTestId(before.phase === 'lost' ? 'retry' : 'restart');
        await restart.tap();
        model.restart(await patrolSnapshot(page, level));
      }
      item.after = await patrolSnapshot(page, level);
      counts[command.type]++;
      if (errors.length) throw new Error(`browser errors: ${errors.join('\n')}`);
    }
    result ||= { status: 'passed' };
  } catch (error) {
    result = { status: error.signature ? 'failed' : 'error', signature: error.signature, index: commands.length - 1,
      failure: errorText(error), before, actual: page ? await patrolSnapshot(page, level).catch(() => null) : null };
  } finally {
    if (screenshotPath && page) {
      try { await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 6000 }); }
      catch (error) { result.screenshotError = errorText(error); }
    }
    try { await context.close(); }
    catch (error) {
      result.contextCloseError = errorText(error);
      if (result.status === 'passed') result.status = 'error';
    }
  }
  return { ...result, commands, trace, counts, errors };
}

await mkdir(output, { recursive: true });
try {
  const hashes = {};
  for (const path of ['src/main.js', 'src/engine.js', 'src/levels.js', 'src/solutions.js', 'scripts/check-command-model.mjs', 'scripts/command-model.mjs', 'scripts/browser-helpers.mjs']) {
    hashes[path] = createHash('sha256').update(await readFile(resolve(project, path))).digest('hex');
  }
  report.sourceHashes = hashes;
  report.candidateSha = process.env.CANDIDATE_SHA || null;
  const launch = process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {};
  browser = await chromium.launch(launch);
  report.browser = browser.version();
  const replay = replayFile ? JSON.parse(await readFile(replayFile, 'utf8')) : null;
  if (replay) {
    assert.equal(replay.algorithm, algorithm, 'unsupported replay algorithm');
    assert.ok(Array.isArray(replay.commands), 'replay requires concrete commands');
    assert.ok(Number.isInteger(replay.levelId) && Number.isInteger(replay.seed), 'replay requires levelId and seed');
    report.replaySource = replayFile;
  }
  const steps = Number(process.env.COMMAND_STEPS || 24);
  assert.ok(Number.isInteger(steps) && steps >= 6 && steps <= 100, 'COMMAND_STEPS must be 6–100');
  const scenarios = replay ? [replay] : integers(process.env.LEVEL_IDS, [1, 28, 120]).flatMap(levelId =>
    integers(process.env.COMMAND_SEEDS, [91842, 20261020]).map(seed => ({ algorithm, levelId, seed, steps, viewport })));
  for (const scenario of scenarios) {
    const stem = `${replay ? `replay-${Date.now()}-` : ''}level-${scenario.levelId}-seed-${scenario.seed}`;
    const result = await runScenario(scenario, { screenshotPath: resolve(output, `${stem}.png`) });
    const evidence = { algorithm, levelId: scenario.levelId, seed: scenario.seed, viewport: scenario.viewport,
      candidateSha: report.candidateSha, sourceHashes: hashes, commands: result.commands, result };
    const path = resolve(output, `${stem}.json`);
    // Persist the complete first outcome before any minimization or second run.
    await writeJson(path, evidence);
    report.cases.push({ levelId: scenario.levelId, seed: scenario.seed, status: result.status, counts: result.counts, replayPath: path });
    console.log(`${stem}: ${result.status}; ${JSON.stringify(result.counts)}; replayPath=${path}`);
    if (result.status !== 'passed') {
      process.exitCode = 1;
      if (!replay && result.status === 'failed') {
        const minimalPath = resolve(output, `${stem}-minimal.json`);
        try {
          const minimized = await minimizeCommands(result.commands,
            (commands, deadline) => runScenario({ ...scenario, commands }, { deadline }),
            { signature: result.signature, onAccept: async (commands, reproduced) =>
              writeJson(minimalPath, { ...evidence, commands, result: reproduced, originalReplayPath: path }) });
          evidence.shrink = { ...minimized, replayPath: minimized.commands.length < result.commands.length ? minimalPath : path };
        } catch (error) { evidence.shrinkError = errorText(error); }
        await writeJson(path, evidence);
      }
      break;
    }
    if (!replay) assert.ok(Object.values(result.counts).every(count => count > 0), 'each generated case must execute every command kind');
  }
  report.passed = report.cases.length === scenarios.length && report.cases.every(item => item.status === 'passed');
} catch (error) {
  report.failure = errorText(error); process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  await writeJson(resolve(output, replayFile ? 'replay-report.json' : 'report.json'), report);
  await browser?.close();
}

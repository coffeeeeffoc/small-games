// Open the Bilibili phone preview's friend-room dialog, then run this with ADB connected.
// This exercises native UI; the normal Node test suite does not stand in for it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const output = new URL('../reports/bilibili-input-device/', import.meta.url);
mkdirSync(output, { recursive: true });
function adb(...args) {
  const result = spawnSync('adb', args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout;
}
assert.ok(/mCurrentFocus=.*tv\.danmaku\.bili/.test(adb('shell', 'dumpsys', 'window').toString()), 'Keep the Bilibili game preview in the foreground');
const initial = adb('exec-out', 'screencap', '-p');
const width = initial.readUInt32BE(16), height = initial.readUInt32BE(20);
assert.ok(width > height, 'Use the landscape game preview');
const scale = height / 540;
async function tap(x, y) {
  await tapScreen(width / 2 + x * scale, height / 2 - y * scale);
}
async function tapScreen(x, y) {
  adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
  await delay(750); // Cocos waits 600 ms when switching native EditBoxes.
}
function inputTree() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/kart-input-check.xml');
  return adb('exec-out', 'cat', '/sdcard/kart-input-check.xml').toString();
}
function inputVisible() {
  return inputTree().includes('tv.danmaku.bili:id/keyboard_input_field');
}
function bounds(tree, id) {
  const node = tree.match(new RegExp(`<node\\b[^>]*resource-id="tv.danmaku.bili:id/${id}"[^>]*>`))?.[0];
  assert.ok(node, `Missing ${id}`);
  return node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
}
function assertLayout(name) {
  const tree = inputTree();
  const panel = bounds(tree, 'keyboard_panel'), field = bounds(tree, 'keyboard_input_field');
  const top = field[1] - panel[1], bottom = panel[3] - field[3];
  screenshot(`${name}-layout`);
  console.log(`${name}: panel=${panel[3] - panel[1]}, text=${field[3] - field[1]}, padding=${top}/${bottom}`);
  assert.ok(Math.abs(bottom - top) <= 3, `${name}: native input has uneven blank space (${top}/${bottom})`);
}
function screenshot(name) {
  writeFileSync(new URL(`${name}.png`, output), adb('exec-out', 'screencap', '-p'));
}
async function collapse() {
  adb('shell', 'input', 'keyevent', 'BACK');
  await delay(500);
  assert.ok(/mInputShown=false/.test(adb('shell', 'dumpsys', 'input_method').toString()), 'IME did not hide');
}
async function confirm(field) {
  adb('shell', 'input', 'keyevent', 'ENTER');
  await delay(750);
  screenshot(field);
  assert.equal(inputVisible(), false, `${field}: native input remains after confirmation`);
  assert.ok(/mInputShown=false/.test(adb('shell', 'dumpsys', 'input_method').toString()), 'Confirmation must hide IME');
}
try {
  for (const [field, y] of [['nickname', 52], ['room-code', -10]]) {
    await tap(0, y);
    assert.equal(inputVisible(), true, `${field}: native input did not open`);
    assertLayout(field);
    for (let i = 0; i < 3; i++) {
      await collapse();
      // Folding the IME leaves the platform input present; resume that same input.
      const [left, top, right, bottom] = bounds(inputTree(), 'keyboard_input_field');
      await tapScreen((left + right) / 2, (top + bottom) / 2);
      assert.ok(/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method').toString()), 'IME did not reopen');
      assertLayout(`${field}-resumed-${i}`);
    }
    await confirm(field);
  }
  await tap(256, 150);
  await tap(-354, 153);
  await tap(0, -10);
  assert.equal(inputVisible(), true, 'Input must work after reopening the dialog');
  assertLayout('reopened');
  await confirm('reopened');
  console.log('PASS: both fields, fold/resume layout, confirmation and dialog reopen on the actual device');
} finally {
  adb('shell', 'rm', '-f', '/sdcard/kart-input-check.xml');
}

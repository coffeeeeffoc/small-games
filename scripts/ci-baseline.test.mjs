import assert from 'node:assert/strict';
import test from 'node:test';
import { readCIBaseline, selectCIPlan } from './ci-baseline.mjs';

const base = '64aa76f4baa0949a1e3eddf40a6c28bcc45a5b8a';
const head = '6dc7585f0429c6dc3f15ac28d951ccfa60999700';
const env = {
  GITHUB_REPOSITORY: 'owner/repo',
  GITHUB_REF_NAME: 'dev',
  GITHUB_EVENT_NAME: 'push',
  PAGES_DIFF_HEAD: head,
};
const workflow = { id: 17, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' };
const saved = {
  workflow_id: 17,
  path: workflow.path,
  head_branch: 'dev',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  head_sha: base,
  head_repository: { full_name: 'owner/repo' },
};
const response = (body) => ({ ok: true, json: async () => body });
const fetcher =
  (run = saved, definition = workflow) =>
  async (url) =>
    response(url.includes('/runs?') ? { workflow_runs: run ? [run] : [] } : definition);

test('CI reads only successful dev pushes from ci.yml and keeps the unvalidated cumulative range', async () => {
  const urls = [],
    calls = [];
  const plan = await selectCIPlan({
    env,
    root: '/candidate',
    fetchFn: async (url) => {
      urls.push(url);
      return fetcher()(url);
    },
    execute: (command, args) => {
      calls.push(args);
      return args[0] === 'rev-parse' ? head : '';
    },
    selectPlan: async (actual) => {
      assert.equal(actual.PAGES_VALIDATED_BASE, base);
      assert.equal(actual.PAGES_DIFF_BASE, base);
      assert.equal(actual.PAGES_DIFF_HEAD, head);
      return { diff_base: base, diff_head: head };
    },
  });
  assert.equal(plan.diff_base, base);
  assert.deepEqual(urls, [
    'https://api.github.com/repos/owner/repo/actions/workflows/ci.yml',
    'https://api.github.com/repos/owner/repo/actions/workflows/ci.yml/runs?branch=dev&status=success&event=push&per_page=1',
  ]);
  assert.deepEqual(calls, [
    ['rev-parse', 'HEAD'],
    ['cat-file', '-e', base + '^{commit}'],
    ['merge-base', '--is-ancestor', base, head],
  ]);
});

test('missing history, API failure and wrong workflow/branch/repository/event/SHA fail closed', async () => {
  for (const override of [
    { workflow_id: 18 },
    { path: '.github/workflows/pages.yml' },
    { head_branch: 'main' },
    { event: 'pull_request' },
    { status: 'in_progress' },
    { conclusion: 'cancelled' },
    { head_sha: 'HEAD' },
    { head_sha: '0'.repeat(40) },
    { head_repository: { full_name: 'fork/repo' } },
  ])
    await assert.rejects(
      readCIBaseline(env, fetcher({ ...saved, ...override })),
      /Invalid successful/,
    );
  await assert.rejects(readCIBaseline(env, fetcher(null)), /No successful dev CI/);
  await assert.rejects(
    readCIBaseline(env, fetcher(saved, { ...workflow, path: '.github/workflows/pages.yml' })),
    /Unexpected CI workflow/,
  );
  await assert.rejects(
    readCIBaseline(env, async () => ({ ok: false, status: 403 })),
    /HTTP 403/,
  );
  await assert.rejects(
    readCIBaseline(env, async () => {
      throw Error('network failure');
    }),
    /network failure/,
  );
});

test('unavailable or non-ancestor baseline cannot reach selection; checkout and selector SHAs are bound', async () => {
  for (const fail of ['rev-parse', 'cat-file', 'merge-base']) {
    await assert.rejects(
      selectCIPlan({
        env,
        fetchFn: fetcher(),
        execute: (command, args) => {
          if (args[0] === fail) throw Error('git proof failed');
          return head;
        },
        selectPlan: () => assert.fail('No fallback to Pages or empty diff'),
      }),
      /git proof failed/,
    );
  }
  for (const selected of [
    { diff_base: head, diff_head: head },
    { diff_base: base, diff_head: base },
  ])
    await assert.rejects(
      selectCIPlan({
        env,
        fetchFn: fetcher(),
        execute: () => head,
        selectPlan: async () => selected,
      }),
      /CI selector/,
    );
  await assert.rejects(
    selectCIPlan({ env: { ...env, PAGES_DIFF_HEAD: 'dev' }, execute: () => head }),
    /Invalid CI target/,
  );
  await assert.rejects(selectCIPlan({ env, execute: () => base }), /checkout SHA mismatch/);
});

test('PR and other branch comparisons retain the shared selector without querying dev history', async () => {
  for (const extra of [
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF_NAME: 'main' },
    { GITHUB_REF_NAME: 'test' },
  ]) {
    await selectCIPlan({
      env: { ...env, ...extra, PAGES_DIFF_BASE: base },
      execute: () => head,
      fetchFn: () => assert.fail('No dev baseline for another event or branch'),
      selectPlan: async (actual) => {
        assert.equal(actual.PAGES_VALIDATED_BASE, undefined);
        assert.equal(actual.PAGES_DIFF_BASE, base);
        return { diff_base: base, diff_head: head };
      },
    });
  }
});

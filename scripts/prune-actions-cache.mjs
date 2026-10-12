import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const managedRefs = new Set(['refs/heads/main', 'refs/heads/dev', 'refs/heads/test']);
const shaPattern = /^[0-9a-f]{40}$/;
const minimumAge = 60 * 60 * 1000;

export function turboKey(key) {
  const match =
    /^turbo-bounded-v1-(?:(pages)-(Linux|Windows|macOS)-(build|logic)|(Linux|Windows|macOS))-([0-9a-f]{40})$/.exec(
      key,
    );
  return (
    match && {
      category: match[1] ? `pages-${match[3]}` : 'ci',
      os: match[2] || match[4],
      sha: match[5],
    }
  );
}

// gh --paginate --slurp must return every page. Count drift/duplicates fail closed.
export function flattenPages(pages, field) {
  assert(Array.isArray(pages) && pages.length > 0, 'Missing API pages');
  const rows = pages.flatMap((page) => {
    assert(
      Array.isArray(page[field]) && Number.isSafeInteger(page.total_count),
      'Invalid API page',
    );
    assert(page.total_count === pages[0].total_count, 'API inventory changed during pagination');
    return page[field];
  });
  assert(rows.length === pages[0].total_count, 'Incomplete API pagination');
  assert(new Set(rows.map((row) => row.id)).size === rows.length, 'Duplicate API IDs');
  return rows;
}

export function retentionPlan(snapshot, now = Date.now()) {
  const { caches, branches, pulls, activeRuns } = snapshot;
  assert(Array.isArray(caches) && Array.isArray(activeRuns), 'Invalid snapshot');
  assert(branches && pulls && Number.isFinite(now), 'Missing protection data');
  assert(new Set(caches.map((cache) => cache.id)).size === caches.length, 'Duplicate cache IDs');
  const groups = new Map();
  for (const cache of caches) {
    assert(Number.isSafeInteger(cache.id) && cache.id > 0, 'Invalid cache ID');
    assert(
      Number.isSafeInteger(cache.size_in_bytes) && cache.size_in_bytes >= 0,
      'Invalid cache size',
    );
    assert(
      typeof cache.key === 'string' && typeof cache.ref === 'string',
      'Invalid cache identity',
    );
    assert(/^[0-9a-f]{64}$/.test(cache.version), 'Invalid cache version');
    assert(
      Number.isFinite(Date.parse(cache.created_at)) &&
        Number.isFinite(Date.parse(cache.last_accessed_at)),
      'Invalid cache timestamps',
    );
    const key = turboKey(cache.key);
    if (!key || !managedRefs.has(cache.ref) || !shaPattern.test(branches[cache.ref] || ''))
      continue;
    const group = [cache.ref, key.category, key.os, cache.version].join('/');
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(cache);
  }
  const newest = new Set();
  for (const group of groups.values()) {
    // Logic is a retired writer. Keep one rollback snapshot until GitHub expires it.
    const count = turboKey(group[0].key).category === 'pages-logic' ? 1 : 2;
    group.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
    for (const cache of group.slice(0, count)) newest.add(cache.id);
  }
  const keep = [],
    remove = [];
  for (const cache of caches) {
    const key = turboKey(cache.key);
    const pr = /^refs\/pull\/([1-9][0-9]*)\/merge$/.exec(cache.ref);
    let reason;
    if (!key) reason = 'outside managed Turbo namespace';
    else if (activeRuns.length) reason = 'active workflow may restore this or a fallback cache';
    else if (
      now - Math.max(Date.parse(cache.created_at), Date.parse(cache.last_accessed_at)) <
      minimumAge
    )
      reason = 'created or accessed within the last hour';
    else if (pr) {
      reason = pulls[pr[1]] === 'closed' ? null : 'PR open or status unknown';
    } else if (!managedRefs.has(cache.ref) || !shaPattern.test(branches[cache.ref] || ''))
      reason = 'unmanaged or missing branch';
    else if (branches[cache.ref] === key.sha) reason = 'current branch SHA';
    else if (newest.has(cache.id)) reason = 'newest snapshots for branch/category/OS/version';
    const entry = {
      ...cache,
      reason: reason || (pr ? 'closed PR Turbo cache' : 'older Turbo snapshot'),
    };
    (reason ? keep : remove).push(entry);
  }
  return {
    policy:
      'two CI/build snapshots and one legacy logic snapshot per managed branch/OS/version; protections take priority',
    count: caches.length,
    bytes: caches.reduce((sum, cache) => sum + cache.size_in_bytes, 0),
    deleteBytes: remove.reduce((sum, cache) => sum + cache.size_in_bytes, 0),
    keep,
    remove,
  };
}

export function ghApi(endpoint, { method = 'GET', paginate = false } = {}) {
  const args = ['api', '--method', method, '-H', 'Accept: application/vnd.github+json'];
  if (paginate) args.push('--paginate', '--slurp');
  args.push(endpoint);
  // Do not retry writes: a timeout may mean the deletion already succeeded.
  const result = execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.trim() ? JSON.parse(result) : null;
}

export function readSnapshot(repo, api = ghApi, ownRunId = '') {
  assert(/^[\w.-]+\/[\w.-]+$/.test(repo), 'Use --repo owner/repository');
  const prefix = `repos/${repo}`;
  const caches = flattenPages(
    api(`${prefix}/actions/caches?per_page=100`, { paginate: true }),
    'actions_caches',
  );
  const branchPages = api(`${prefix}/branches?per_page=100`, { paginate: true });
  assert(
    Array.isArray(branchPages) && branchPages.length && branchPages.every(Array.isArray),
    'Invalid branch pages',
  );
  const branches = {};
  for (const branch of branchPages.flat()) {
    assert(
      typeof branch.name === 'string' && shaPattern.test(branch.commit?.sha),
      'Invalid branch',
    );
    assert(!Object.hasOwn(branches, `refs/heads/${branch.name}`), 'Duplicate branch');
    branches[`refs/heads/${branch.name}`] = branch.commit.sha;
  }
  // One complete, unfiltered inventory: separate status queries can miss a run
  // transitioning from waiting to in_progress between those queries.
  const runs = flattenPages(
    api(`${prefix}/actions/runs?per_page=100`, { paginate: true }),
    'workflow_runs',
  );
  const activeRuns = runs.filter((run) => {
    assert(Number.isSafeInteger(run.id) && typeof run.status === 'string', 'Unexpected run state');
    if (run.status === 'completed') return false;
    // Unknown future statuses also protect caches.
    // Only the trusted maintenance job itself can be omitted. Never omit a build.
    return !(
      String(run.id) === String(ownRunId) &&
      run.path === '.github/workflows/cache-maintenance.yml' &&
      run.head_branch === 'main' &&
      ['schedule', 'workflow_dispatch'].includes(run.event)
    );
  });
  const pulls = {};
  for (const cache of caches) {
    const match = /^refs\/pull\/([1-9][0-9]*)\/merge$/.exec(cache.ref);
    if (!match || !turboKey(cache.key) || Object.hasOwn(pulls, match[1])) continue;
    const pull = api(`${prefix}/pulls/${match[1]}`);
    assert(
      pull.number === Number(match[1]) && ['open', 'closed'].includes(pull.state),
      'Unexpected PR response',
    );
    pulls[match[1]] = pull.state;
  }
  return { caches, branches, pulls, activeRuns };
}

export function pruneActionsCache({
  repo,
  apply = false,
  api = ghApi,
  now = Date.now,
  ownRunId = '',
  report = () => {},
}) {
  const snapshot = () => readSnapshot(repo, api, ownRunId);
  const original = retentionPlan(snapshot(), now());
  const result = {
    repo,
    apply,
    status: apply ? 'applying' : 'dry-run',
    before: original,
    deleted: [],
    deferred: [],
    after: apply ? null : original,
  };
  report(result);
  if (!apply) return result;
  try {
    for (const candidate of original.remove) {
      // Fresh full inventory, branch heads, PR state and active-run check before EACH delete.
      const fresh = retentionPlan(snapshot(), now());
      const current = fresh.remove.find((cache) => cache.id === candidate.id);
      if (
        !current ||
        ['key', 'ref', 'version', 'created_at', 'last_accessed_at', 'size_in_bytes'].some(
          (key) => current[key] !== candidate[key],
        )
      ) {
        result.deferred.push(candidate.id);
        report(result);
        continue;
      }
      api(`repos/${repo}/actions/caches/${candidate.id}`, { method: 'DELETE' });
      result.deleted.push({
        id: candidate.id,
        bytes: candidate.size_in_bytes,
        key: candidate.key,
        ref: candidate.ref,
      });
      report(result);
    }
    result.after = retentionPlan(snapshot(), now());
    assert(
      result.deleted.every(
        ({ id }) =>
          ![...result.after.keep, ...result.after.remove].some((cache) => cache.id === id),
      ),
      'Deleted IDs still present; re-inventory before retrying',
    );
    result.status = 'completed';
    report(result);
    return result;
  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
    report(result);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    let repo,
      output,
      apply = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--apply') apply = true;
      else if (args[i] === '--repo') repo = args[++i];
      else if (args[i] === '--output') output = args[++i];
      else throw new Error(`Unknown argument: ${args[i]}`);
    }
    assert(
      repo && output,
      'Usage: node scripts/prune-actions-cache.mjs --repo owner/repository --output report.json [--apply]',
    );
    const result = pruneActionsCache({
      repo,
      apply,
      ownRunId: process.env.GITHUB_RUN_ID,
      report: (value) => writeFileSync(output, JSON.stringify(value, null, 2) + '\n'),
    });
    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          count: result.before.count,
          bytes: result.before.bytes,
          proposedIds: result.before.remove.map((cache) => cache.id),
          proposedBytes: result.before.deleteBytes,
          deleted: result.deleted,
          deferred: result.deferred,
          remainingCount: result.after.count,
          remainingBytes: result.after.bytes,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(`Cache cleanup stopped: ${error.message}`);
    process.exitCode = 1;
  }
}

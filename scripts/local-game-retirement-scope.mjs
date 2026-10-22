import { createHash } from 'node:crypto';
import {
  localRetirementReviews,
  localRetirementTrees,
  portfolioRetirementReviews,
  portfolioRetirementTrees,
  mainIntegrationBase,
  mainRetirementTrees,
  mainRetirementMoves,
} from './local-game-retirement-reviews.mjs';

const proofs = new WeakMap();
const digest = (value) => createHash('sha256').update(value).digest('hex');
export function localRetirementHeadQueryPaths(changedPaths) {
  return [
    ...new Set([
      ...changedPaths,
      ...Object.keys(localRetirementTrees),
      ...Object.keys(localRetirementReviews),
      ...Object.keys(portfolioRetirementTrees),
      ...Object.keys(portfolioRetirementReviews),
      ...Object.keys(mainRetirementMoves),
      ...Object.values(mainRetirementMoves).map((move) => move.to),
    ]),
  ];
}

/** A retired tree binds every former source/asset; edits bind both exact file snapshots. */
export function localRetirementScopesForReview(context, trees, reviews) {
  const scopes = new Map();
  const { changedPaths, readBaseEntry, readBase, readHead, readHeadEntry, headHasPath } = context;
  try {
    for (const [root, entry] of Object.entries(trees)) {
      if (readBaseEntry(root) !== entry || headHasPath(root) !== false) return scopes;
    }
    for (const [file, review] of Object.entries(reviews)) {
      if (review.afterEntry && readHeadEntry(file) !== review.afterEntry) return scopes;
      if (
        review.movedFrom &&
        (!Object.keys(trees).some((root) => review.movedFrom.startsWith(root + '/')) ||
          readBaseEntry(review.movedFrom).split('\t')[0] + '\t' + file + '\n' !== review.afterEntry)
      )
        return scopes;
      if (
        review.before === null
          ? readBaseEntry(file) !== ''
          : digest(readBase(file)) !== review.before
      )
        return scopes;
      if (
        review.after === null
          ? headHasPath(file) !== false
          : headHasPath(file) !== true || digest(readHead(file)) !== review.after
      )
        return scopes;
    }
    for (const file of changedPaths) {
      const root = Object.keys(trees).find((dir) => file === dir || file.startsWith(dir + '/'));
      const review = reviews[file];
      if (root) {
        const entry = readBaseEntry(file);
        if (
          !(file === root
            ? /^160000 commit [a-f\d]{40}\t[^\n]+\n$/.test(entry)
            : /^(?:100644|100755) blob [a-f\d]{40}\t[^\n]+\n$/.test(entry)) ||
          headHasPath(file) !== false
        )
          return new Map();
      } else if (!review) continue;
      const value = Object.freeze([...(review?.sources ?? [])]);
      scopes.set(file, value);
      if (
        (trees === localRetirementTrees && reviews === localRetirementReviews) ||
        (trees === portfolioRetirementTrees && reviews === portfolioRetirementReviews)
      )
        proofs.set(value, {
          file,
          deleted: !!root || review.after === null,
          after: review?.after,
          movedFrom: review?.movedFrom,
        });
    }
  } catch {
    return new Map();
  }
  return scopes;
}
export function localRetirementFileScopes(context) {
  return new Map([
    ...localRetirementScopesForReview(context, localRetirementTrees, localRetirementReviews),
    ...localRetirementScopesForReview(
      context,
      portfolioRetirementTrees,
      portfolioRetirementReviews,
    ),
    ...mainRetirementDeletionScopes(context),
  ]);
}

export function mainRetirementTreesMatch(context) {
  try {
    if (context.baseCommit !== mainIntegrationBase) return false;
    for (const [root, entry] of Object.entries(mainRetirementTrees))
      if (context.readBaseEntry(root) !== entry || context.headHasPath(root) !== false)
        return false;
    const games = JSON.parse(context.readHead('apps/shell-web/src/standalone-games.json'));
    return (
      Array.isArray(games) &&
      games.every(
        (game) =>
          typeof game.source === 'string' &&
          !Object.keys(mainRetirementTrees).some(
            (root) => game.source === root || game.source.startsWith(root + '/'),
          ),
      )
    );
  } catch {
    return false;
  }
}

// Cumulative proof covers only removals. Every surviving rename destination goes
// through its ordinary workspace/shared-source checks, including Creator inputs.
export function mainRetirementDeletionScopes(context) {
  const scopes = new Map();
  if (!mainRetirementTreesMatch(context)) return scopes;
  const reviews = { ...localRetirementReviews, ...portfolioRetirementReviews };
  try {
    for (const [from, move] of Object.entries(mainRetirementMoves)) {
      if (
        !Object.keys(mainRetirementTrees).some((root) => from.startsWith(root + '/')) ||
        context.readBaseEntry(from) !== move.beforeEntry ||
        context.readBaseEntry(move.to) !== '' ||
        context.readHeadEntry(move.to) !== move.afterEntry ||
        context.headHasPath(from) !== false ||
        context.headHasPath(move.to) !== true
      )
        return new Map();
    }
    for (const file of context.changedPaths) {
      const root = Object.keys(mainRetirementTrees).find(
        (dir) => file === dir || file.startsWith(dir + '/'),
      );
      const review = reviews[file];
      if (!root && review?.after !== null) continue;
      if (context.headHasPath(file) !== false) return new Map();
      if (root) {
        const entry = context.readBaseEntry(file);
        if (
          !(file === root
            ? /^160000 commit [a-f\d]{40}\t[^\n]+\n$/.test(entry)
            : /^(?:100644|100755) blob [a-f\d]{40}\t[^\n]+\n$/.test(entry))
        )
          return new Map();
      } else if (digest(context.readBase(file)) !== review.before) return new Map();
      const value = Object.freeze([...(root ? [] : review.sources)]);
      scopes.set(file, value);
      proofs.set(value, { file, deleted: true, move: mainRetirementMoves[file] });
    }
  } catch {
    return new Map();
  }
  return scopes;
}
export function hasLocalRetirementDeletionProof(file, value) {
  const proof = proofs.get(value);
  return !!proof && proof.file === file && proof.deleted;
}
export function hasLocalRetirementFileProof(file, value, readSource) {
  const proof = proofs.get(value);
  if (!proof || proof.file !== file || proof.deleted || !readSource) return false;
  try {
    return digest(readSource(file)) === proof.after;
  } catch {
    return false;
  }
}
export function isReviewedLocalRetirementDeletion(change, scopes) {
  if (change.status === 'D' && change.paths.length === 1)
    return hasLocalRetirementDeletionProof(change.paths[0], scopes.get(change.paths[0]));
  if (/^R\d{3}$/.test(change.status) && change.paths.length === 2) {
    const [before, after] = change.paths;
    const proof = proofs.get(scopes.get(before));
    if (
      proof?.file === before &&
      proof.deleted &&
      proof.move?.to === after &&
      proof.move.status === change.status
    )
      return true;
  }
  if (change.status === 'R100' && change.paths.length === 2) {
    const [before, after] = change.paths;
    const destination = proofs.get(scopes.get(after));
    return (
      hasLocalRetirementDeletionProof(before, scopes.get(before)) &&
      !!destination &&
      !destination.deleted &&
      destination.file === after &&
      destination.movedFrom === before
    );
  }
  return false;
}

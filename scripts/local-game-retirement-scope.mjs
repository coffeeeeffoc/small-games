import { createHash } from 'node:crypto';
import { localRetirementReviews, localRetirementTrees } from './local-game-retirement-reviews.mjs';

const proofs = new WeakMap();
const digest = (value) => createHash('sha256').update(value).digest('hex');
export function localRetirementHeadQueryPaths(changedPaths) {
  return [
    ...new Set([
      ...changedPaths,
      ...Object.keys(localRetirementTrees),
      ...Object.keys(localRetirementReviews),
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
      const root = Object.keys(trees).find((dir) => file.startsWith(dir + '/'));
      const review = reviews[file];
      if (root) {
        const entry = readBaseEntry(file);
        if (
          !/^(?:100644|100755) blob [a-f\d]{40}\t[^\n]+\n$/.test(entry) ||
          headHasPath(file) !== false
        )
          return new Map();
      } else if (!review) continue;
      const value = Object.freeze([...(review?.sources ?? [])]);
      scopes.set(file, value);
      if (trees === localRetirementTrees && reviews === localRetirementReviews)
        proofs.set(value, { file, deleted: !!root || review.after === null, after: review?.after });
    }
  } catch {
    return new Map();
  }
  return scopes;
}
export function localRetirementFileScopes(context) {
  return localRetirementScopesForReview(context, localRetirementTrees, localRetirementReviews);
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
  return false;
}

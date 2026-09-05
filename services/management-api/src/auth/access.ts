import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasRole, type AuthStore, type Operator } from './model.js';

export const accessCookie = 'studio_access';
/** One-way token representation used by both access and refresh persistence. */
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Resolves the current operator without exposing raw access tokens outside auth. */
export function authenticatedOperator(store: AuthStore, request: FastifyRequest, now = Date.now()) {
  return store.authenticate(digest(request.cookies[accessCookie] ?? ''), now);
}

/** Non-hierarchical role guard, shared by Management business-route adapters. */
export function requireRole(store: AuthStore, role: Operator['roles'][number]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const operator = await authenticatedOperator(store, request);
    if (!operator) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    if (!hasRole(operator, role)) return reply.code(403).send({ error: 'FORBIDDEN' });
  };
}

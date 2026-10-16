import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AdminSession } from './store.js';
import type { ControlService } from './control-service.js';
import {
  emailSchema,
  permissionSchema,
  reasonSchema,
  roleIdSchema,
  snapshotSchema,
  versionSchema,
} from './control-model.js';

const uuid = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;
const roleId = (params: unknown) => z.object({ id: roleIdSchema }).parse(params).id;
const reason = z.object({ reason: reasonSchema }).strict();
/** Registered inside the existing authenticated admin scope: host, Origin and CSRF apply first. */
export async function registerControlRoutes(
  app: FastifyInstance,
  control: ControlService,
  session: (request: FastifyRequest) => AdminSession,
) {
  await app.register(
    async (routes) => {
      routes.get('/catalog', (request) => control.catalog(session(request)));
      routes.get('/state', (request) => control.state(session(request)));
      routes.get('/revisions', (request) => control.revisions(session(request)));
      routes.get('/members', (request) => control.members(session(request)));
      routes.get('/roles', (request) => control.roles(session(request)));
      routes.get('/audit', (request) => control.audits(session(request)));
      routes.post('/revisions', { bodyLimit: 16_384 }, (request) =>
        control.draft(
          session(request),
          z
            .object({
              expectedVersion: versionSchema,
              snapshot: snapshotSchema,
              reason: reasonSchema,
            })
            .strict()
            .parse(request.body),
        ),
      );
      routes.post('/revisions/:id/publish', (request) =>
        control.publish(
          session(request),
          uuid(request.params),
          z.object({ expectedVersion: versionSchema }).strict().parse(request.body).expectedVersion,
        ),
      );
      routes.post('/rollback', (request) =>
        control.rollback(
          session(request),
          z
            .object({ revisionId: z.uuid(), expectedVersion: versionSchema, reason: reasonSchema })
            .strict()
            .parse(request.body),
        ),
      );
      const member = z
        .object({
          email: emailSchema,
          active: z.boolean().optional(),
          roleIds: z.array(roleIdSchema).max(32),
          reason: reasonSchema,
        })
        .strict();
      routes.post('/members', (request) =>
        control.saveMember(session(request), undefined, member.parse(request.body)),
      );
      routes.post('/members/:id', (request) =>
        control.saveMember(
          session(request),
          uuid(request.params),
          member.partial({ email: true, roleIds: true }).parse(request.body),
        ),
      );
      routes.post('/members/:id/delete', (request) =>
        control.deleteMember(
          session(request),
          uuid(request.params),
          reason.parse(request.body).reason,
        ),
      );
      routes.post('/roles/:id', (request) =>
        control.saveRole(
          session(request),
          roleId(request.params),
          z
            .object({
              name: z.string().trim().min(1).max(80),
              permissions: z.array(permissionSchema).max(32),
              reason: reasonSchema,
            })
            .strict()
            .parse(request.body),
        ),
      );
      routes.post('/roles/:id/delete', (request) =>
        control.deleteRole(
          session(request),
          roleId(request.params),
          reason.parse(request.body).reason,
        ),
      );
    },
    { prefix: '/control' },
  );
}

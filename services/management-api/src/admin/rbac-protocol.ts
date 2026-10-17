import type { ControlService } from './control-service.js';
import type { AdminSession } from './store.js';

/** This pure module is both the deployment capability contract and the live RBAC adapter. */
export const ADMIN_RBAC_PROTOCOL = Object.freeze({ control: 1, dbMemberRecheck: 1 });

export function readAdminControlFlag(value: string | undefined) {
  if (value !== undefined && value !== 'true' && value !== 'false')
    throw new Error('Invalid management configuration: ADMIN_CONTROL_ENABLED');
  return value === 'true';
}

/** Never cache a principal: revocation must be read for each authenticated request. */
export function readAdminRbacPrincipal(control: ControlService, session: AdminSession) {
  return control.access.session(session);
}

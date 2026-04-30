import type { PermissionMode, LegacyPermissionMode } from '../unified/index.js';
import { translateLegacyPermissionMode } from '../unified/index.js';

export interface ModeOps {
  modeSet: 'interactive' | 'plan' | 'autopilot';
  approveAll: boolean;
  autoEdit: boolean;
}

/**
 * Map a unified PermissionMode to the Copilot SDK ops needed:
 *   - mode.set(...)
 *   - permissions.setApproveAll(...)
 *   - queue.setAutoEdit(...) — internal queue auto-approve toggle for write requests
 */
export function permissionModeToOps(mode: PermissionMode | LegacyPermissionMode): ModeOps {
  const m = translateLegacyPermissionMode(mode);
  switch (m) {
    case 'prompt':    return { modeSet: 'interactive', approveAll: false, autoEdit: false };
    case 'auto-edit': return { modeSet: 'interactive', approveAll: false, autoEdit: true  };
    case 'auto-all':  return { modeSet: 'interactive', approveAll: true,  autoEdit: false };
    case 'plan':      return { modeSet: 'plan',        approveAll: false, autoEdit: false };
    case 'autopilot': return { modeSet: 'autopilot',   approveAll: false, autoEdit: false };
  }
}

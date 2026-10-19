import { SAP_SYSID_PATTERN } from './multi-target-identity.js';

export function isIdeSystemId(value: string): boolean {
  return SAP_SYSID_PATTERN.test(value);
}

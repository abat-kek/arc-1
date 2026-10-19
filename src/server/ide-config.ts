import { SAP_SYSID_PATTERN } from './multi-target-identity.js';

export function isIdeSystemId(value: string): boolean {
  return SAP_SYSID_PATTERN.test(value);
}

/** Local ADT alias, not a SAP SID, BTP Destination name, host or authorization selector. */
export function isIdeDestination(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 128 &&
    value === value.trim() &&
    /^[\p{L}\p{N}_][\p{L}\p{N} _().-]*$/u.test(value)
  );
}

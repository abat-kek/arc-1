import { AdtApiError } from './errors.js';

/** A 406 can reject the text itself, not the Accept header. These validation keys were
 * verified on 758/816 and BTP. Keep unknown messages on the existing negotiation path. */
export function acceptFallback(
  body: string,
  accept: string | undefined,
  method: string,
  path: string,
): string | undefined {
  if (
    method === 'PUT' &&
    /^\/sap\/bc\/adt\/textelements\/(classes|programs|functiongroups)\/[^/]+\/source\/(symbols|selections|headings)$/.test(
      path,
    )
  ) {
    const props = AdtApiError.extractProperties(body);
    const id = props['T100KEY-ID'] ?? props['T100KEY-MSGID'];
    const number = props['T100KEY-NO'] ?? props['T100KEY-MSGNO'];
    if ((id === 'SEDX_ADT' && (number === '107' || number === '110')) || (id === 'DS' && number === '512')) {
      return undefined;
    }
  }

  const inferred = body.match(/application\/[\w.+-]+(?:\/[\w.+-]+)?/)?.[0];
  if (inferred && inferred !== accept) return inferred;
  if (accept && accept !== '*/*' && accept !== 'application/xml') return 'application/xml';
  if (accept === 'application/xml') return '*/*';
  return undefined;
}

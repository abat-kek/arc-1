import { describe, expect, it, vi } from 'vitest';
import { unrestrictedSafetyConfig } from '../../../src/adt/safety.js';
import { mockResponse } from '../../helpers/mock-fetch.js';

const mockFetch = vi.fn();
vi.mock('undici', async (importOriginal) => ({
  ...(await importOriginal<typeof import('undici')>()),
  fetch: mockFetch,
}));
const { AdtClient } = await import('../../../src/adt/client.js');
const createClient = () => new AdtClient({ baseUrl: 'http://sap:8000', safety: unrestrictedSafetyConfig() });

describe('canonical function lookup (COMPAT-09)', () => {
  it.each([
    ['BAPI_USER_GET_DETAIL', 'bapi_user_get_detail', 'SU_USER'],
    ['/UI2/CATALOG_PFCG_CHANGE', '%2fui2%2fcatalog_pfcg_change', '%2fui2%2fcatalog_pfcg'],
  ])('uses the function URI identity for decorated names: %s', async (name, encodedName, group) => {
    mockFetch.mockReset();
    const uri = `/sap/bc/adt/functions/groups/${group}/fmodules/${encodedName}`;
    mockFetch.mockResolvedValue(
      mockResponse(
        200,
        `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
        <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/other/fmodules/other" adtcore:type="FUGR/FF" adtcore:name="${name}"/>
        <adtcore:objectReference adtcore:uri="${uri}" adtcore:type="FUGR/FF" adtcore:name="${name} (Function Module)"/>
        <adtcore:objectReference adtcore:uri="${uri}" adtcore:type="FUGR/FF" adtcore:name="${name}"/>
      </adtcore:objectReferences>`,
      ),
    );
    const [result] = await createClient().lookupObjects([name]);
    expect(result?.found).toBe(true);
    expect(result?.matches).toEqual([expect.objectContaining({ objectName: name, objectType: 'FUGR/FF', uri })]);
  });

  it.each([
    ['FUGR/FF', '/sap/bc/adt/functions/groups/z/fmodules/%ZZ'],
    ['FUGR/FF', '/sap/bc/adt/functions/groups/z/fmodules/zfoo/source/main'],
    ['FUGR/FF', 'https://other.example/sap/bc/adt/functions/groups/z/fmodules/zfoo'],
    ['CLAS/OC', '/sap/bc/adt/oo/classes/zfoo'],
  ])('does not infer names from unverified search results: %s %s', async (type, uri) => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(
      mockResponse(
        200,
        `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
        <adtcore:objectReference adtcore:uri="${uri}" adtcore:type="${type}" adtcore:name="ZFOO (Label)"/>
      </adtcore:objectReferences>`,
      ),
    );
    expect(await createClient().lookupObjects(['ZFOO'])).toEqual([{ name: 'ZFOO', found: false, matches: [] }]);
  });

  it('preserves ambiguity between distinct function URIs', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(
      mockResponse(
        200,
        `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
      <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/z1/fmodules/zfoo" adtcore:type="FUGR/FF" adtcore:name="ZFOO (Function Module)"/>
      <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/z2/fmodules/zfoo" adtcore:type="FUGR/FF" adtcore:name="ZFOO (Function Module)"/>
    </adtcore:objectReferences>`,
      ),
    );
    expect((await createClient().lookupObjects(['ZFOO']))[0]?.matches).toHaveLength(2);
  });
});

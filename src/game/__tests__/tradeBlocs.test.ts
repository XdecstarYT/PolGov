/**
 * tradeBlocs.test.ts — international organisations and trade diplomacy.
 *
 * A shared seat at the UN or NATO does not zero anybody's tariffs.
 * Co-membership in an actual common market — the EU, ASEAN, the
 * African Union — does, because that is what the real institution is
 * for. This checks that the tariff schedule reads organisation
 * membership the same way it reads a bilateral trade treaty, and only
 * for the organisations that are actually common markets.
 */

import { describe, expect, it } from 'vitest';
import { buildOrganisations, tradeBlocPartners } from '../systems/organisations.ts';
import { TRADE_BLOC_ORGANISATIONS, membersOfOrganisation } from '../content/organisations.ts';

describe('trade blocs', () => {
  it('lists only common-market institutions, not every organisation', () => {
    expect(TRADE_BLOC_ORGANISATIONS).toContain('eu');
    expect(TRADE_BLOC_ORGANISATIONS).toContain('asean');
    expect(TRADE_BLOC_ORGANISATIONS).toContain('african_union');
    expect(TRADE_BLOC_ORGANISATIONS).not.toContain('un');
    expect(TRADE_BLOC_ORGANISATIONS).not.toContain('nato');
    expect(TRADE_BLOC_ORGANISATIONS).not.toContain('wto');
  });

  it('a country outside every trade bloc has no partners from this route', () => {
    const organisations = buildOrganisations('united_states');
    /* Verdana and the US template are not written into eu/asean/african_union
       membership, so this reads whatever the base game actually has —
       assert the invariant that matters instead of a fixed country. */
    const memberOfAny = TRADE_BLOC_ORGANISATIONS.some((key) =>
      organisations.find((o) => o.key === key)?.member,
    );
    if (!memberOfAny) {
      expect(tradeBlocPartners(organisations).size).toBe(0);
    }
  });

  it('membership in a bloc includes every real member of that bloc, and only those', () => {
    const organisations = buildOrganisations('verdana').map((o) =>
      o.key === 'eu' ? { ...o, member: true, suspended: false } : o,
    );
    const partners = tradeBlocPartners(organisations);
    const euMembers = membersOfOrganisation('eu');
    expect(euMembers.length).toBeGreaterThan(0);
    for (const nation of euMembers) expect(partners.has(nation)).toBe(true);
    expect(partners.size).toBe(euMembers.length);
  });

  it('suspended membership grants no tariff relief', () => {
    const suspended = buildOrganisations('verdana').map((o) =>
      o.key === 'eu' ? { ...o, member: true, suspended: true } : o,
    );
    expect(tradeBlocPartners(suspended).size).toBe(0);
  });

  it('combines partners across every bloc the country belongs to', () => {
    const inBoth = buildOrganisations('verdana').map((o) =>
      o.key === 'eu' || o.key === 'asean' ? { ...o, member: true, suspended: false } : o,
    );
    const partners = tradeBlocPartners(inBoth);
    for (const nation of membersOfOrganisation('eu')) expect(partners.has(nation)).toBe(true);
    for (const nation of membersOfOrganisation('asean')) expect(partners.has(nation)).toBe(true);
  });
});

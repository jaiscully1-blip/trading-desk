import { describe, expect, it } from 'vitest';
import { FEEDS, faa, gdacs, travel, tsunami, usgs, who } from '../shared/wmon';

const NOW = Date.parse('2026-11-24T12:00:00Z');
describe('world monitor parsers', () => {
  it('grades earthquakes by magnitude', () => {
    const e = usgs({ features: [{ id: 'a', properties: { mag: 6.4, place: 'off Chile', time: NOW, url: 'u' }, geometry: { coordinates: [-72, -33, 10] } }] });
    expect(e[0]).toMatchObject({ cat: 'quake', sev: 2, lat: -33, lon: -72, title: 'M6.4 earthquake, off Chile' });
  });
  it('treats a tsunami information bulletin as info, not a warning', () => {
    const xml = '<feed><title>Tsunami Information Statement Number 1</title><entry><title>40 miles SW of Palmer, Alaska</title><updated>2026-11-24T16:43:10Z</updated><geo:lat>61.3</geo:lat><geo:long>-150.1</geo:long><summary type="xhtml"><div>Category: Information Bulletin. Tsunami Warning Center Palmer AK</div></summary></entry></feed>';
    expect(tsunami(xml)[0]).toMatchObject({ sev: 1, lat: 61.3 });
  });
  it('drops GDACS events that ended more than 10 days ago', () => {
    const f = (to: string, lvl: string) => ({ properties: { eventtype: 'FL', eventid: to, name: 'Flood', alertlevel: lvl, fromdate: '2026-01-01', todate: to }, geometry: { coordinates: [0, 0] } });
    expect(gdacs({ features: [f('2026-11-22', 'Red'), f('2026-09-01', 'Orange')] }, NOW).map((e) => e.sev)).toEqual([3]);
  });
  it('reads FAA ground stops and delays', () => {
    const x = faa('<A><Ground_Stop><ARPT>JFK</ARPT><Reason>weather</Reason></Ground_Stop><Ground_Delay><ARPT>SFO</ARPT><Reason>wind</Reason><Avg>2 hours</Avg></Ground_Delay></A>', NOW);
    expect(x.map((e) => [e.title, e.sev])).toEqual([['Ground stop at JFK', 2], ['Ground delay at SFO, avg 2 hours', 1]]);
  });
  it('keeps only recent level 3-4 travel advisories and finds WHO countries', () => {
    expect(travel([{ Title: 'Chad - Level 4: Do Not Travel', Updated: '2026-11-20T00:00:00Z', id: 'x' }, { Title: 'France - Level 2: Exercise Increased Caution', Updated: '2026-11-20T00:00:00Z', id: 'y' }], NOW).map((e) => e.country)).toEqual(['Chad']);
    expect(who({ value: [{ Title: 'Influenza A(H5N1) - United States of America', UrlName: 'x', PublicationDateAndTime: '2026-11-24T00:00:00Z' }] })[0].country).toBe('United States of America');
  });
  it('every feed has a unique id', () => {
    expect(new Set(FEEDS.map((f) => f.id)).size).toBe(FEEDS.length);
  });
});

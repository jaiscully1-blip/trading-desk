// Suggested values for inputs that need facts most people don't know offhand (a jet's ICAO hex, a lot's coordinates, a
// fund's SEC CIK) plus common picks for free-text fields (setup tags, journal tags, rules). Every fact here was looked up
// on 2026-11-18: aircraft hexes against the FAA registry (US civil) and hexdb.io (US Air Force), CIKs against SEC EDGAR,
// coordinates against OpenStreetMap (building centres, so use "adjust" to move the box onto the parking itself).

export interface JetPick { icao: string; label: string; note: string; group: 'Government' | 'Company' }
export const JETS: JetPick[] = [
  { icao: 'adfdf8', label: 'Air Force One (VC-25A 82-8000)', note: 'US Air Force. Called Air Force One only with the President aboard; military jets often fly without public position data.', group: 'Government' },
  { icao: 'adfdf9', label: 'Air Force One (VC-25A 92-9000)', note: 'US Air Force, the second VC-25A.', group: 'Government' },
  { icao: 'adfeb7', label: 'C-32A 98-0001 (Air Force Two fleet)', note: 'US Air Force Boeing 757 used by the Vice President, First Lady and cabinet.', group: 'Government' },
  { icao: 'adfeb8', label: 'C-32A 98-0002 (Air Force Two fleet)', note: 'US Air Force Boeing 757, VIP transport.', group: 'Government' },
  { icao: 'adfeb9', label: 'C-32A 99-0003 (Air Force Two fleet)', note: 'US Air Force Boeing 757, VIP transport.', group: 'Government' },
  { icao: 'adfeba', label: 'C-32A 99-0004 (Air Force Two fleet)', note: 'US Air Force Boeing 757, VIP transport.', group: 'Government' },
  { icao: 'adfeb3', label: 'E-4B 73-1676 (“Nightwatch”)', note: 'US Air Force airborne command post; often carries the Defense Secretary on trips.', group: 'Government' },
  { icao: 'adfeb6', label: 'E-4B 75-0125 (“Nightwatch”)', note: 'US Air Force airborne command post.', group: 'Government' },
  { icao: 'a5ce12', label: 'Homeland Security Gulfstream (N473US)', note: 'FAA registry: U S Department of Homeland Security.', group: 'Government' },
  { icao: 'a16aad', label: 'Chevron jet (N1901G)', note: 'FAA registry: Chevron U S A Inc, Sugar Land TX. CVX.', group: 'Company' },
  { icao: 'a8b82a', label: 'JPMorgan Chase jet (N661CH)', note: 'FAA registry: JPMorgan Chase Bank NA, White Plains NY. JPM.', group: 'Company' },
  { icao: 'a7eaa4', label: 'Warner Bros. Discovery jet (N609WB)', note: 'FAA registry: Discovery Communications LLC, New York. WBD.', group: 'Company' },
  { icao: 'a79b1c', label: 'DXC Technology jet (N59AP)', note: 'FAA registry: Computer Sciences Corp (now DXC), Tysons VA. DXC.', group: 'Company' },
  /* COMPANY_JETS */
];

export interface LotPick { name: string; what: string; lat: number; lon: number; size: number; sym: string }
export const LOTS: LotPick[] = [
  { name: 'Rivian Normal', what: 'Rivian factory lots, Illinois', lat: 40.51404, lon: -89.05354, size: 900, sym: 'RIVN' },
  { name: 'Lucid Casa Grande', what: 'Lucid factory lots, Arizona', lat: 32.85685, lon: -111.7784, size: 900, sym: 'LCID' },
  { name: 'Ford Kentucky Truck', what: 'Super Duty / Expedition plant, Louisville', lat: 38.29627, lon: -85.53068, size: 900, sym: 'F' },
  { name: 'Ford Kansas City', what: 'F-150 / Transit plant, Claycomo', lat: 39.1994, lon: -94.47921, size: 900, sym: 'F' },
  { name: 'GM Factory Zero', what: 'EV truck plant, Detroit', lat: 42.38151, lon: -83.04534, size: 900, sym: 'GM' },
  { name: 'Toyota Georgetown', what: 'Largest Toyota plant, Kentucky', lat: 38.25851, lon: -84.53931, size: 900, sym: 'TM' },
  { name: 'Boeing Everett', what: 'Widebody plant and flight line, Washington', lat: 47.92533, lon: -122.2721, size: 1200, sym: 'BA' },
  { name: 'Disneyland parking', what: 'Mickey and Friends structure, Anaheim', lat: 33.81528, lon: -117.9262, size: 500, sym: 'DIS' },
  { name: 'Magic Kingdom parking', what: 'Transportation and Ticket Center lot, Florida', lat: 28.40608, lon: -81.58049, size: 900, sym: 'DIS' },
  { name: 'Universal Hollywood', what: 'Theme park lots, Los Angeles', lat: 34.13923, lon: -118.3543, size: 700, sym: 'CMCSA' },
  { name: 'Six Flags Magic Mountain', what: 'Theme park lot, Valencia', lat: 34.42505, lon: -118.597, size: 700, sym: 'FUN' },
  { name: 'SeaWorld Orlando', what: 'Theme park lot, Florida', lat: 28.411, lon: -81.46187, size: 700, sym: 'PRKS' },
  { name: 'Mall of America', what: 'Mall parking (retail traffic), Minnesota', lat: 44.85502, lon: -93.24211, size: 800, sym: 'retail' },
  { name: 'Caesars Palace', what: 'Las Vegas Strip resort (Caesars Entertainment)', lat: 36.11662, lon: -115.1767, size: 600, sym: 'CZR' },
];

export interface FundPick { cik: string; who: string; note: string }
export const FUNDS: FundPick[] = [
  { cik: '1167483', who: 'Tiger Global', note: 'Chase Coleman’s tech growth fund' },
  { cik: '1135730', who: 'Coatue', note: 'Philippe Laffont, tech long/short' },
  { cik: '1541617', who: 'Altimeter Capital', note: 'Brad Gerstner, tech growth' },
  { cik: '1798849', who: 'Durable Capital', note: 'Henry Ellenbogen, growth' },
  { cik: '1747057', who: 'D1 Capital', note: 'Dan Sundheim, long/short' },
  { cik: '1387322', who: 'Whale Rock', note: 'Alex Sacerdote, tech' },
  { cik: '1112520', who: 'Akre Capital', note: 'Quality compounders' },
  { cik: '1166559', who: 'Gates Foundation Trust', note: 'Foundation endowment' },
  { cik: '1034524', who: 'Polen Capital', note: 'Concentrated quality growth' },
  { cik: '1840735', who: 'Greenoaks', note: 'Tech growth' },
  { cik: '1602189', who: 'Dragoneer', note: 'Growth, public and private' },
  { cik: '1115373', who: 'Semper Augustus', note: 'Chris Bloomstran, value' },
  { cik: '1510281', who: 'Saba Capital', note: 'Boaz Weinstein, credit and closed-end funds' },
  { cik: '1536411', who: 'Duquesne Family Office', note: 'Stanley Druckenmiller' },
  { cik: '1336528', who: 'Pershing Square', note: 'Bill Ackman' },
];

export interface SourcePick { label: string; url: string; note: string; country?: string }
export const REG_SOURCES: SourcePick[] = [
  { country: 'Norway', label: 'OFV registration statistics', url: 'https://ofv.no/registreringsstatistikk', note: 'Monthly new cars by brand, out on the 1st working day.' },
  { country: 'United Kingdom', label: 'SMMT car registrations', url: 'https://www.smmt.co.uk/vehicle-data/car-registrations/', note: 'Monthly, around the 5th; Tesla appears in the brand table.' },
  { country: 'Germany', label: 'KBA new registrations', url: 'https://www.kba.de/DE/Statistik/Fahrzeuge/Neuzulassungen/neuzulassungen_node.html', note: 'Monthly press release with registrations by brand (German).' },
  { country: 'Sweden', label: 'Mobility Sweden statistics', url: 'https://mobilitysweden.se/statistik', note: 'Monthly new registrations by brand.' },
  { country: 'Denmark', label: 'Mobility Denmark', url: 'https://mobility.dk/', note: 'Monthly brand registrations (Danish).' },
  { country: 'Spain', label: 'ANFAC', url: 'https://anfac.com/', note: 'Monthly registrations; Tesla shown in brand tables.' },
  { country: 'France', label: 'PFA (French auto industry)', url: 'https://www.pfa-auto.fr/', note: 'Monthly French registrations by brand.' },
  { country: 'Australia', label: 'FCAI VFACTS', url: 'https://www.fcai.com.au/', note: 'Monthly sales by brand; Tesla included.' },
  { label: 'EU-EVs (daily, several countries)', url: 'https://www.eu-evs.com/', note: 'Tracks EV registrations by brand day by day for many European countries.' },
  { country: 'China', label: 'CPCA (China Passenger Car Association)', url: 'http://www.cpcaauto.com/', note: 'Monthly wholesale and retail by maker (Chinese); news sites report Tesla China weekly insurance registrations.' },
];

export const INVENTORY_TIPS: string[] = [
  'Use the same zip code and “new” filter every time so the count is comparable.',
  'Log on the same weekday each week; late-quarter weeks matter most.',
  'Count only cars available now (ignore “in transit” if the site separates it).',
  'A rising count while prices are being cut is a stronger demand signal than either alone.',
];

export const SETUP_TAGS = ['ORB', 'Bull flag', 'Bear flag', 'Gap and go', 'Gap fill', 'VWAP reclaim', 'VWAP rejection', 'Breakout', 'Pullback to support', 'Failed breakdown', 'First red day', 'Earnings drift', 'Short squeeze', 'Range fade', 'Trend continuation', 'Mean reversion'];
export const JOURNAL_TAGS = ['A+ setup', 'Followed plan', 'Chased', 'FOMO', 'Revenge trade', 'Sized too big', 'Cut early', 'Held loser', 'FOMC', 'CPI day', 'Earnings', 'Low sleep', 'Choppy market', 'Trend day', 'Overtraded', 'Great patience'];
export const RULE_PICKS = [
  'Risk no more than 1% of the account on one trade',
  'Stop trading for the day after losing 2R',
  'Every trade has a stop before entry',
  'No trades in the first 5 minutes',
  'Only trade setups from my playbook',
  'No adding to a losing position',
  'Check the economic calendar before the open',
  'Take partial profit at 2R, move stop to break-even',
  'No new trades in the last 15 minutes',
  'Journal every trade the same day',
  'Walk away after three losses in a row',
  'Size down the day after a big loss',
];
export const MERGER_TIPS: string[] = [
  'Terms are in the merger press release and the company’s 8-K filing: “$X in cash” and/or “Y shares of [acquirer] for each share”.',
  'Cash deal: fill Cash per share only. Stock deal: fill Acquirer and the ratio. Mixed: fill both.',
  'Expected close is usually stated as a quarter (“expected to close in Q2 2027”): use the end of that quarter.',
  'The Mergers card above lists recent merger votes and tender offers with links to the filings.',
];

#!/usr/bin/env python3
"""Build public/data/reviewtone.json from the free Amazon Reviews 2023 dataset (McAuley Lab, UC San Diego).

We do not scrape Amazon (its terms forbid it and it blocks bots). This streams the public research files,
keeps reviews of products sold under each company's brands, scores the tone of each review and tags the
reason, then saves only per-quarter totals (no review text). Coverage ends Sep 2023, where the dataset ends.

Run:  python3 -I scripts/build-review-tone.py   (streams about 3 GB; takes 10 to 30 minutes)
Source: https://amazon-reviews-2023.github.io/  (Hou et al., 2024, "Bridging Language and Items for Retrieval and Recommendation")
"""
import gzip, json, re, subprocess, sys, collections, datetime, time

BASE = 'https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw'
CATS = ['Video_Games', 'Grocery_and_Gourmet_Food']

# ticker -> (name, category, brand regex matched against the product's "store" field)
COMPANIES = {
    'NTDOY': ('Nintendo', 'Video_Games', r'^nintendo\b'),
    'SONY': ('Sony (PlayStation)', 'Video_Games', r'^(sony|playstation)\b'),
    'MSFT': ('Microsoft (Xbox)', 'Video_Games', r'^(microsoft|xbox)\b'),
    'EA': ('Electronic Arts', 'Video_Games', r'^(electronic arts|ea sports|ea\b)'),
    'TTWO': ('Take-Two (2K, Rockstar)', 'Video_Games', r'^(2k\b|2k games|rockstar|take-?two)'),
    'LOGI': ('Logitech', 'Video_Games', r'^logitech'),
    'CRSR': ('Corsair', 'Video_Games', r'^corsair'),
    'UBSFY': ('Ubisoft', 'Video_Games', r'^ubisoft'),
    'HSY': ('Hershey', 'Grocery_and_Gourmet_Food', r"^(hershey|reese'?s|kit kat|jolly rancher|twizzlers|skinnypop)"),
    'KHC': ('Kraft Heinz', 'Grocery_and_Gourmet_Food', r'^(kraft|heinz|maxwell house|oscar mayer|jell-?o|kool-?aid|planters$|grey poupon|philadelphia)'),
    'GIS': ('General Mills', 'Grocery_and_Gourmet_Food', r'^(general mills|cheerios|nature valley|betty crocker|pillsbury|annie\'?s|blue buffalo|larabar)'),
    'MDLZ': ('Mondelez', 'Grocery_and_Gourmet_Food', r'^(mondelez|oreo|nabisco|ritz|belvita|cadbury|toblerone|sour patch|trident|wheat thins|triscuit|chips ahoy)'),
    'PEP': ('PepsiCo', 'Grocery_and_Gourmet_Food', r'^(pepsi|quaker|frito|lay\'?s|doritos|cheetos|gatorade|tropicana|sabra|bubly|rockstar energy|sunchips|smartfood)'),
    'KO': ('Coca-Cola', 'Grocery_and_Gourmet_Food', r'^(coca-?cola|coke\b|sprite|fanta|minute maid|smartwater|dasani|vitaminwater|topo chico)'),
    'SJM': ('J.M. Smucker', 'Grocery_and_Gourmet_Food', r"^(smucker|folgers|jif\b|dunkin|cafe bustelo|caf[eé] bustelo|milk-?bone|meow mix|uncrustables)"),
    'SBUX': ('Starbucks', 'Grocery_and_Gourmet_Food', r'^starbucks'),
    'KDP': ('Keurig Dr Pepper', 'Grocery_and_Gourmet_Food', r"^(keurig|green mountain|dr pepper|snapple|canada dry|mott'?s|the original donut shop|mccaf[eé])"),
    'MKC': ('McCormick', 'Grocery_and_Gourmet_Food', r"^(mccormick|frank'?s|french'?s|cholula|old bay|lawry'?s|zatarain)"),
    'HRL': ('Hormel', 'Grocery_and_Gourmet_Food', r'^(hormel|skippy|spam\b|planters|justin\'?s|wholly)'),
    'MNST': ('Monster Beverage', 'Grocery_and_Gourmet_Food', r'^(monster energy|monster\b|reign)'),
    'CELH': ('Celsius', 'Grocery_and_Gourmet_Food', r'^celsius'),
    'CPB': ('Campbell\'s', 'Grocery_and_Gourmet_Food', r"^(campbell|pepperidge farm|goldfish|v8\b|prego|pace\b|snyder'?s|kettle brand|cape cod|pacific foods)"),
}

# Small tone lexicon (word -> weight). Negation flips the next 3 words; intensifiers scale them.
POS = dict.fromkeys('good great love loved loves excellent amazing awesome perfect best delicious tasty fun favorite favourite happy nice wonderful fantastic recommend recommended fresh smooth works worked worth beautiful enjoy enjoyed enjoyable easy fast quality solid sturdy comfortable addictive impressed satisfied incredible superb yummy glad pleased reliable responsive'.split(), 1.0)
NEG = dict.fromkeys('bad terrible awful horrible worst hate hated disappointed disappointing disappointment broken broke poor waste cheap stale expired defective useless boring buggy laggy refund return returned returning damaged leaking leaked crushed melted gross disgusting bland fake counterfeit wrong missing junk garbage annoying unplayable crash crashes crashed overpriced fail failed failure stopped dead died moldy rancid'.split(), -1.0)
LEX = {**POS, **NEG}
NEGATE = set("not no never isn't wasn't doesn't don't didn't won't can't cannot aren't hardly barely".split())
BOOST = {'very': 1.5, 'really': 1.4, 'so': 1.3, 'extremely': 1.8, 'super': 1.5, 'totally': 1.4, 'absolutely': 1.6, 'too': 1.2}

# Reason tags: what the review is about. A review can carry several.
REASONS = {
    'quality': r'\b(quality|well made|cheaply made|flimsy|sturdy|build)\b',
    'price/value': r'\b(price|priced|expensive|overpriced|cheap|value|worth|deal|cost)\b',
    'taste': r'\b(taste|tastes|tasted|flavor|flavour|delicious|bland|sweet|salty|yummy)\b',
    'freshness': r'\b(stale|expired|expiration|fresh|moldy|rancid|best by|old)\b',
    'shipping/packaging': r'\b(shipping|shipped|arrived|package|packaging|box|crushed|melted|leak\w*|damaged|delivery)\b',
    'broke/defect': r'\b(broke|broken|defective|stopped working|died|dead|faulty|doa)\b',
    'performance': r'\b(lag|laggy|fps|frame rate|crash\w*|bug\w*|glitch\w*|slow|fast|responsive|latency)\b',
    'fun/gameplay': r'\b(fun|gameplay|story|graphics|boring|addictive|multiplayer|levels?)\b',
    'fake/counterfeit': r'\b(fake|counterfeit|knock ?off|not genuine|not authentic)\b',
    'size/quantity': r'\b(size|small|smaller|tiny|quantity|ounces?|oz|portion|count)\b',
    'ingredients/health': r'\b(ingredients?|sugar|calories|healthy|protein|caffeine|artificial|organic|gluten)\b',
    'compatibility/setup': r'\b(compatible|compatibility|setup|set up|install|connect\w*|bluetooth|driver|pair\w*)\b',
    'service/seller': r'\b(customer service|seller|support|refund|warranty|replacement)\b',
}
REASON_RX = {k: re.compile(v) for k, v in REASONS.items()}
WORD = re.compile(r"[a-z']+")

def text_score(t):
    w = WORD.findall(t.lower()); s = 0.0; hits = 0
    for i, x in enumerate(w):
        v = LEX.get(x)
        if v is None: continue
        if any(p in NEGATE for p in w[max(0, i - 3):i]): v = -v * 0.75
        if i and w[i - 1] in BOOST: v *= BOOST[w[i - 1]]
        s += v; hits += 1
    return 0.0 if not hits else max(-1.0, min(1.0, s / (hits ** 0.5) / 2))

def tone(stars, title, body):
    # Stars carry most of the signal; the text tells us how strongly. Both mapped to -1..+1.
    return round(0.6 * ((stars - 3) / 2) + 0.4 * text_score(f'{title} {body}'), 4)

def stream(path):
    # curl handles TLS certificates on every platform; gzip decompresses as it streams (nothing saved to disk)
    p = subprocess.Popen(['curl', '-sSL', '--fail', '-A', 'trading-desk research script', f'{BASE}/{path}'], stdout=subprocess.PIPE)
    with gzip.GzipFile(fileobj=p.stdout) as g:
        for line in g:
            try: yield json.loads(line)
            except Exception: continue
    if p.wait() != 0: raise RuntimeError(f'download failed: {path}')

def quarter(ms):
    d = datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc); return f'{d.year}Q{(d.month - 1) // 3 + 1}'

def main():
    rx = {t: re.compile(c[2], re.I) for t, c in COMPANIES.items()}
    out = {t: {'name': c[0], 'category': c[1], 'products': 0, 'q': {}} for t, c in COMPANIES.items()}
    for cat in CATS:
        tick_in = [t for t, c in COMPANIES.items() if c[1] == cat]; asin = {}; t0 = time.time()
        for m in stream(f'meta_categories/meta_{cat}.jsonl.gz'):
            store = (m.get('store') or '').strip()
            if not store: continue
            for t in tick_in:
                if rx[t].search(store): asin[m['parent_asin']] = t; out[t]['products'] += 1; break
        print(f'{cat}: {len(asin)} products matched in {time.time() - t0:.0f}s', file=sys.stderr, flush=True)
        n = 0
        for r in stream(f'review_categories/{cat}.jsonl.gz'):
            n += 1
            if n % 2_000_000 == 0: print(f'  {cat}: {n:,} reviews read', file=sys.stderr, flush=True)
            t = asin.get(r.get('parent_asin'))
            if not t: continue
            stars = float(r.get('rating') or 0)
            if not stars: continue
            text = f"{r.get('title', '')} {r.get('text', '')}".lower()
            sc = tone(stars, r.get('title', ''), r.get('text', ''))
            b = out[t]['q'].setdefault(quarter(r['timestamp']), {'n': 0, 'stars': 0.0, 'tone': 0.0, 'pos': 0, 'neg': 0, 'verified': 0, 'reasons': {}})
            b['n'] += 1; b['stars'] += stars; b['tone'] += sc; b['verified'] += 1 if r.get('verified_purchase') else 0
            side = 'pos' if sc > 0.15 else 'neg' if sc < -0.15 else None
            if side: b[side] += 1
            for k, rr in REASON_RX.items():
                if rr.search(text):
                    c = b['reasons'].setdefault(k, [0, 0]); c[0 if side != 'neg' else 1] += 1
        print(f'{cat}: done, {n:,} reviews read', file=sys.stderr, flush=True)
    for t, o in out.items():
        rows = []
        for q in sorted(o['q']):
            b = o['q'][q]
            rows.append({'q': q, 'n': b['n'], 'stars': round(b['stars'] / b['n'], 3), 'tone': round(b['tone'] / b['n'], 4),
                         'posPct': round(b['pos'] / b['n'], 4), 'negPct': round(b['neg'] / b['n'], 4), 'verifiedPct': round(b['verified'] / b['n'], 3),
                         'reasons': {k: v for k, v in sorted(b['reasons'].items(), key=lambda kv: -sum(kv[1]))}})
        o['q'] = rows
    doc = {'source': 'Amazon Reviews 2023 (McAuley Lab, UC San Diego), https://amazon-reviews-2023.github.io/',
           'built': datetime.date.today().isoformat(), 'coverageEnds': '2023-09',
           'method': 'tone = 0.6 x star score + 0.4 x text lexicon score, each -1..+1; positive > +0.15, negative < -0.15',
           'reasons': list(REASONS), 'companies': {t: o for t, o in out.items() if o['q']}}
    json.dump(doc, open(sys.argv[1] if len(sys.argv) > 1 else 'public/data/reviewtone.json', 'w'), separators=(',', ':'))
    print('wrote', len(doc['companies']), 'companies', file=sys.stderr)

if __name__ == '__main__':
    main()

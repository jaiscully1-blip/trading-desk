"""Generates src/assets/river.svg: a dusk river scene with depth (far / mid / near lanes), shaded boats that
cross the whole width, V wakes, rippled reflections, sun glitter and parallax waves. Every class / id starts rv-
so the SVG can be inlined into the app without clashing. Original drawing (Tampa-inspired minarets, no logos)."""
import random, os
random.seed(7)
TD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = 372  # horizon / far bank waterline
B = H - 452  # the bank drawings were made for a 452 horizon
D = 600 - H

def waves(y0, y1, n, seg, gap, w, op, dur, color='#cdeff2', tile=300):
    """rows of short dashes that loop seamlessly every `tile` units; nearer rows are longer, thicker and faster"""
    rows = []
    for i in range(n):
        y = y0 + (y1 - y0) * (i / max(1, n - 1)) ** 1.6
        d, x = [], random.uniform(0, gap)
        while x < tile:
            L = random.uniform(seg * .5, seg * 1.4)
            d.append((x, L)); x += L + random.uniform(gap * .6, gap * 1.5)
        p = ''.join(f'M{x + k * tile - tile:.0f},{y:.1f}h{L:.0f}' for k in range(6) for x, L in d)
        rows.append(f'<path d="{p}"/>')
    return (f'<g class="rv-wave" style="--d:{dur}s" stroke="{color}" stroke-width="{w}" stroke-linecap="round" opacity="{op}" fill="none">'
            + ''.join(rows) + '</g>')

def glitter():
    out = []
    for i in range(46):
        t = i / 45
        y = H + 3 + t ** 1.5 * (D - 12)
        wd = 6 + t * 70 * random.uniform(.5, 1.2)
        x = 860 + random.gauss(0, 10 + t * 60) - wd / 2
        out.append(f'<rect class="rv-gl g{i % 3}" x="{x:.0f}" y="{y:.1f}" width="{wd:.0f}" height="{.8 + t * 2.2:.1f}" rx="1"/>')
    return '<g fill="#ffe3b0">' + ''.join(out) + '</g>'

# ---------- boats (waterline at y=0, bow toward +x) ----------
SAIL = '''<symbol id="rv-sail" overflow="visible">
<ellipse cx="0" cy="1" rx="40" ry="3" fill="#06121d" opacity=".35"/>
<path d="M-38,-12 H40 L30,0 H-30 Z" fill="url(#rv-hull)"/><path d="M-38,-12 H40" stroke="#ffc58a" stroke-width="1.4" opacity=".85"/>
<path d="M-30,0 H30 L28,-3 H-28 Z" fill="#0b1824" opacity=".55"/>
<rect x="-1.2" y="-86" width="2.4" height="74" fill="#1a2532"/>
<path d="M2,-84 L2,-14 L38,-14 Z" fill="url(#rv-sailg)"/><path d="M2,-84 L38,-14" stroke="#fff3dc" stroke-width=".8" opacity=".7"/>
<path d="M-2,-70 L-2,-14 L-30,-14 Z" fill="url(#rv-jib)"/>
<rect x="-8" y="-20" width="14" height="6" rx="1" fill="#1a2532"/><rect x="-6" y="-19" width="3" height="3" fill="#ffd9a0"/>
</symbol>'''
MOTOR = '''<symbol id="rv-motor" overflow="visible">
<ellipse cx="0" cy="1" rx="46" ry="3.4" fill="#06121d" opacity=".4"/>
<path d="M-44,-12 H30 Q44,-12 52,-4 L46,0 H-42 Z" fill="url(#rv-hull)"/><path d="M-44,-12 H30 Q44,-12 52,-4" stroke="#ffc58a" stroke-width="1.4" fill="none" opacity=".9"/>
<path d="M-42,0 H46 L44,-4 H-42 Z" fill="#163a4c" opacity=".8"/>
<path d="M-18,-12 L-14,-26 H10 L20,-12 Z" fill="#dfe7ea"/><path d="M-12,-24 H8 L15,-14 H-14 Z" fill="#244c5e"/><path d="M2,-24 H8 L15,-14 H6 Z" fill="#ffd9a0" opacity=".55"/>
<rect x="-46" y="-16" width="6" height="12" rx="1.5" fill="#1a2532"/>
</symbol>'''
TAXI = '''<symbol id="rv-taxi" overflow="visible">
<ellipse cx="0" cy="1" rx="54" ry="3.6" fill="#06121d" opacity=".4"/>
<path d="M-54,-10 H46 Q56,-10 60,-3 L54,0 H-52 Z" fill="url(#rv-hull)"/><path d="M-54,-10 H46 Q56,-10 60,-3" stroke="#ffc58a" stroke-width="1.4" fill="none"/>
<path d="M-40,-10 V-30 H34 L42,-10 Z" fill="#e9eef0"/><path d="M-44,-31 H38 V-34 H-44 Z" fill="#c9695a"/>
<g fill="#ffd9a0"><rect x="-34" y="-25" width="9" height="8" rx="1"/><rect x="-21" y="-25" width="9" height="8" rx="1"/><rect x="-8" y="-25" width="9" height="8" rx="1"/><rect x="5" y="-25" width="9" height="8" rx="1"/><rect x="18" y="-25" width="10" height="8" rx="1" opacity=".7"/></g>
<path d="M-40,-10 V-30 H-30 V-10 Z" fill="#0b1824" opacity=".25"/>
</symbol>'''
SHELL = '''<symbol id="rv-shell" overflow="visible">
<ellipse cx="0" cy="1" rx="76" ry="2.6" fill="#06121d" opacity=".35"/>
<path d="M-78,-2 Q0,-9 84,-3 L80,0 Q0,3 -76,0 Z" fill="url(#rv-hull)"/><path d="M-78,-2 Q0,-9 84,-3" stroke="#ffc58a" stroke-width="1.2" fill="none"/>
<g class="rv-oar"><g stroke="#e8e2d6" stroke-width="1.6"><path d="M-50,-6 L-62,16 M-26,-6 L-38,16 M-2,-6 L-14,16 M22,-6 L10,16"/></g>
<g fill="#c9695a"><path d="M-64,13 l4,-1 l-3,8 l-4,1 z M-40,13 l4,-1 l-3,8 l-4,1 z M-16,13 l4,-1 l-3,8 l-4,1 z M8,13 l4,-1 l-3,8 l-4,1 z"/></g></g>
<g class="rv-row"><g fill="#18222e"><path d="M-54,-6 h8 l-2,-11 h-5 z M-30,-6 h8 l-2,-11 h-5 z M-6,-6 h8 l-2,-11 h-5 z M18,-6 h8 l-2,-11 h-5 z"/></g>
<g fill="#f2c79a"><circle cx="-50" cy="-20" r="3.4"/><circle cx="-26" cy="-20" r="3.4"/><circle cx="-2" cy="-20" r="3.4"/><circle cx="22" cy="-20" r="3.4"/></g>
<g fill="#ffd9a0" opacity=".7"><path d="M-47,-17 v-6 M-23,-17 v-6"/><rect x="-47.5" y="-17" width="1.5" height="9"/><rect x="-23.5" y="-17" width="1.5" height="9"/><rect x=".5" y="-17" width="1.5" height="9"/><rect x="24.5" y="-17" width="1.5" height="9"/></g></g>
<circle cx="52" cy="-12" r="3" fill="#f2c79a"/><path d="M48,-6 h8 l-1,-4 h-6 z" fill="#c9695a"/>
</symbol>'''
CANOE = '''<symbol id="rv-canoe" overflow="visible">
<ellipse cx="0" cy="1" rx="40" ry="2.6" fill="#06121d" opacity=".35"/>
<path d="M-42,-8 Q-30,2 0,2 Q30,2 42,-8 Q40,-3 34,-3 H-34 Q-40,-3 -42,-8 Z" fill="url(#rv-canoeg)"/><path d="M-42,-8 Q-38,-3 -34,-3 H34 Q38,-3 42,-8" stroke="#ffc58a" stroke-width="1.2" fill="none"/>
<g fill="#18222e"><path d="M-16,-3 h10 l-3,-14 h-5 z"/><path d="M12,-3 h10 l-3,-14 h-5 z"/></g>
<g fill="#f2c79a"><circle cx="-10" cy="-21" r="3.6"/><circle cx="18" cy="-21" r="3.6"/></g>
<g class="rv-pad"><path d="M-22,-24 L4,6" stroke="#d8c3a2" stroke-width="1.6"/><path d="M1,2 l5,-2 l2,9 l-5,2 z" fill="#c9695a"/></g>
<g class="rv-pad b"><path d="M8,-24 L30,6" stroke="#d8c3a2" stroke-width="1.6"/><path d="M27,2 l5,-2 l2,9 l-5,2 z" fill="#c9695a"/></g>
</symbol>'''

def wake(length, spread, foam=True):
    """V wake on the water behind the bow: one arm toward the viewer (down), one away (up, flattened by perspective)"""
    a = (f'<path d="M30,1 L{-length},{spread:.0f}" stroke="url(#rv-wk)"/>'
         f'<path d="M30,0 L{-length},{-spread * .35:.0f}" stroke="url(#rv-wk)" opacity=".6"/>')
    f = (f'<path class="rv-foam" d="M-30,1 L{-length * .8:.0f},2" stroke="#eaf7f8" stroke-width="3.2" stroke-dasharray="10 14" opacity=".6"/>'
         if foam else '')
    return f'<g fill="none" stroke-width="2.4" stroke-linecap="round">{a}{f}</g>'

def boat(sym, y, s, dur, delay, left=False, wk=(160, 14), foam=True, haze=0.0, bob=4.2, ref_h=90, extra=''):
    sx = -s if left else s
    filt = ' filter="url(#rv-haze)"' if haze else ''
    return (f'<g class="rv-lane{" l" if left else ""}" style="--d:{dur}s;--o:{delay}s">'
            f'<g transform="translate(0 {y}) scale({sx} {s})"{filt}>'
            f'{wake(*wk, foam)}'
            f'<g transform="scale(1 -1)" opacity=".42" filter="url(#rv-rip)"><g mask="url(#rv-rfade)"><use href="#rv-{sym}"/></g></g>'
            f'<g class="rv-bob" style="--b:{bob}s"><use href="#rv-{sym}"/>{extra}</g>'
            f'</g></g>')

skyline = '''<g fill="#0c1622">
<rect x="250" y="378" width="640" height="72"/><rect x="250" y="366" width="640" height="14"/>
<g fill="#f3a660" opacity=".55" class="rv-lit"><rect x="280" y="400" width="6" height="14"/><rect x="330" y="400" width="6" height="14"/><rect x="380" y="400" width="6" height="14"/><rect x="470" y="400" width="6" height="14"/><rect x="520" y="400" width="6" height="14"/><rect x="620" y="400" width="6" height="14"/><rect x="670" y="400" width="6" height="14"/><rect x="760" y="400" width="6" height="14"/><rect x="820" y="400" width="6" height="14"/></g>
<use href="#rv-min" x="268" y="310"/><use href="#rv-min" transform="translate(388 292) scale(1.25)"/><use href="#rv-min" x="500" y="306"/><use href="#rv-min" x="640" y="306"/><use href="#rv-min" transform="translate(752 292) scale(1.25)"/><use href="#rv-min" x="872" y="310"/>
<rect x="0" y="444" width="1200" height="10"/>
</g>'''
far_city = '<g fill="#1b2d45" opacity=".8"><rect x="0" y="390" width="90" height="62"/><rect x="92" y="360" width="46" height="92"/><rect x="140" y="400" width="40" height="52"/><rect x="980" y="370" width="60" height="82"/><rect x="1044" y="340" width="50" height="112"/><rect x="1098" y="382" width="102" height="70"/><g fill="#f6c384" opacity=".5"><rect x="104" y="372" width="4" height="4"/><rect x="118" y="388" width="4" height="4"/><rect x="1056" y="352" width="4" height="4"/><rect x="1072" y="372" width="4" height="4"/><rect x="1060" y="396" width="4" height="4"/><rect x="996" y="384" width="4" height="4"/></g></g>'
palms = '<use href="#rv-palm" x="170" y="452"/><use href="#rv-palm" transform="translate(214 454) scale(.8)"/><use href="#rv-palm" x="930" y="452"/><use href="#rv-palm" transform="translate(968 454) scale(.75)"/>'
stars = ''.join(f'<circle class="rv-star s{i % 3}" cx="{random.uniform(0, 1200):.0f}" cy="{random.uniform(10, 200):.0f}" r="{random.uniform(.6, 1.4):.1f}"/>' for i in range(34))
streaks = ''.join(f'<rect x="{x - 2}" y="{H + 4}" width="5" height="{random.uniform(18, 40):.0f}" opacity="{random.uniform(.18, .32):.2f}"/>' for x in (283, 333, 383, 473, 523, 623, 673, 763, 823, 106, 1058, 1074))

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" class="rv" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<defs>
<linearGradient id="rv-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1730"/><stop offset=".3" stop-color="#22406a"/><stop offset=".48" stop-color="#9c5a68"/><stop offset=".57" stop-color="#e08760"/><stop offset=".62" stop-color="#f7c486"/></linearGradient>
<linearGradient id="rv-riv" x1="0" y1="{H}" x2="0" y2="600" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f0a86a"/><stop offset=".06" stop-color="#b9806e"/><stop offset=".2" stop-color="#3f7d8c"/><stop offset=".55" stop-color="#174a5d"/><stop offset="1" stop-color="#071a28"/></linearGradient>
<radialGradient id="rv-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff0c2"/><stop offset=".18" stop-color="#ffd896" stop-opacity=".9"/><stop offset="1" stop-color="#ffb86e" stop-opacity="0"/></radialGradient>
<linearGradient id="rv-hazeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3b07a" stop-opacity=".55"/><stop offset="1" stop-color="#f3b07a" stop-opacity="0"/></linearGradient>
<linearGradient id="rv-hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf6ec"/><stop offset=".55" stop-color="#d6d3cc"/><stop offset="1" stop-color="#7e8d98"/></linearGradient>
<linearGradient id="rv-canoeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f08a5d"/><stop offset="1" stop-color="#7a3a33"/></linearGradient>
<linearGradient id="rv-sailg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c8ad92"/><stop offset=".35" stop-color="#f3e2c8"/><stop offset="1" stop-color="#fff6e4"/></linearGradient>
<linearGradient id="rv-jib" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#b8664c"/><stop offset="1" stop-color="#f6b26b"/></linearGradient>
<linearGradient id="rv-wk" x1="30" y1="0" x2="-200" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f2fbfc" stop-opacity=".95"/><stop offset="1" stop-color="#f2fbfc" stop-opacity="0"/></linearGradient>
<linearGradient id="rv-fadeg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="rv-rfade" maskUnits="userSpaceOnUse" x="-120" y="-120" width="240" height="124"><rect x="-120" y="-100" width="240" height="102" fill="url(#rv-fadeg)"/></mask>
<filter id="rv-rip" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.015 0.32" numOctaves="1" seed="3"/><feDisplacementMap in="SourceGraphic" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>
<filter id="rv-ripc" x="-5%" y="-5%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.01 0.22" numOctaves="1" seed="9"/><feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>
<filter id="rv-haze"><feColorMatrix type="matrix" values=".55 0 0 0 .38  0 .55 0 0 .26  0 0 .55 0 .22  0 0 0 .85 0"/></filter>
<g id="rv-min"><rect x="-5" y="0" width="10" height="70"/><rect x="-8" y="-6" width="16" height="8"/><path d="M0,-44 C-16,-30 -15,-12 -9,-6 L9,-6 C15,-12 16,-30 0,-44 Z"/><rect x="-1" y="-58" width="2" height="16"/><circle cx="0" cy="-60" r="2.4"/></g>
<g id="rv-palm"><path d="M0,0 C2,-30 -3,-60 2,-92" fill="none" stroke="#0c1622" stroke-width="5" stroke-linecap="round"/><g fill="none" stroke="#0c1622" stroke-width="4" stroke-linecap="round"><path d="M2,-92 C-18,-108 -38,-102 -50,-88"/><path d="M2,-92 C-12,-116 -30,-122 -46,-116"/><path d="M2,-92 C4,-118 16,-128 32,-128"/><path d="M2,-92 C24,-110 42,-106 54,-92"/><path d="M2,-92 C20,-96 36,-88 44,-74"/><path d="M2,-92 C-16,-94 -30,-84 -36,-70"/></g></g>
{SAIL}{MOTOR}{TAXI}{SHELL}{CANOE}
</defs>
<style>
.rv-lane{{animation:rv-x var(--d) linear var(--o) infinite;will-change:transform}}
.rv-lane.l{{animation-direction:reverse}}
@keyframes rv-x{{from{{transform:translateX(-260px)}}to{{transform:translateX(1460px)}}}}
.rv-bob{{animation:rv-bob var(--b) ease-in-out infinite;transform-origin:0 0}}
@keyframes rv-bob{{0%,100%{{transform:translateY(0) rotate(0)}}30%{{transform:translateY(1.6px) rotate(-1.4deg)}}70%{{transform:translateY(-.6px) rotate(1deg)}}}}
.rv-wave{{animation:rv-w var(--d) linear infinite}}
@keyframes rv-w{{to{{transform:translateX(-300px)}}}}
.rv-foam{{animation:rv-f 1.1s linear infinite}}@keyframes rv-f{{to{{stroke-dashoffset:24}}}}
.rv-oar{{animation:rv-oar 1.6s ease-in-out infinite;transform-origin:0 -6px}}
@keyframes rv-oar{{0%,100%{{transform:skewX(-26deg)}}45%{{transform:skewX(22deg)}}}}
.rv-row{{animation:rv-row 1.6s ease-in-out infinite}}@keyframes rv-row{{0%,100%{{transform:translateX(-2px)}}45%{{transform:translateX(3px)}}}}
.rv-pad{{animation:rv-pad 1.8s ease-in-out infinite;transform-origin:-9px -22px}}.rv-pad.b{{animation-delay:-.9s;transform-origin:19px -22px}}
@keyframes rv-pad{{0%,100%{{transform:rotate(-18deg)}}50%{{transform:rotate(16deg)}}}}
.rv-gl{{animation:rv-gl 3.2s ease-in-out infinite}}.rv-gl.g1{{animation-delay:-1.1s}}.rv-gl.g2{{animation-delay:-2.2s}}
@keyframes rv-gl{{0%,100%{{opacity:.85}}50%{{opacity:.15}}}}
.rv-star{{fill:#fff;animation:rv-gl 5s ease-in-out infinite}}.rv-star.s1{{animation-delay:-1.7s}}.rv-star.s2{{animation-delay:-3.4s}}
.rv-lit{{animation:rv-lit 7s ease-in-out infinite}}@keyframes rv-lit{{50%{{opacity:.3}}}}
.rv-gull{{animation:rv-gx 70s linear infinite;will-change:transform}}@keyframes rv-gx{{from{{transform:translate(-80px,0)}}50%{{transform:translate(600px,-24px)}}to{{transform:translate(1300px,6px)}}}}
.rv-flap{{animation:rv-flap .9s ease-in-out infinite;transform-origin:center;transform-box:fill-box}}@keyframes rv-flap{{50%{{transform:scaleY(.4)}}}}
.still .rv *,.rv.still *{{animation-play-state:paused!important}}
@media (prefers-reduced-motion:reduce){{.rv *{{animation:none!important}}}}
</style>
<rect width="1200" height="600" fill="url(#rv-sky)"/>
<g>{stars}</g>
<circle cx="860" cy="{H - 6}" r="170" fill="url(#rv-sun)"/>
<circle cx="860" cy="{H}" r="26" fill="#ffe7b4" opacity=".9"/>
<g class="rv-gull" fill="none" stroke="#1a2436" stroke-width="1.6" stroke-linecap="round"><path class="rv-flap" d="M300,190 q6,-6 12,0 q6,-6 12,0"/><path class="rv-flap" d="M340,176 q5,-5 10,0 q5,-5 10,0" style="animation-delay:-.3s"/></g>
<g transform="translate(0 {B})">{far_city}
{skyline}
{palms}</g>
<rect x="0" y="{H}" width="1200" height="{600 - H}" fill="url(#rv-riv)"/>
<g filter="url(#rv-ripc)">
<g fill="#0c1622" opacity=".32" transform="translate(0 {2 * H}) scale(1 -1) translate(0 {B})"><rect x="250" y="378" width="640" height="74"/><use href="#rv-min" transform="translate(388 292) scale(1.25)"/><use href="#rv-min" transform="translate(752 292) scale(1.25)"/><use href="#rv-min" x="500" y="306"/><use href="#rv-min" x="640" y="306"/><use href="#rv-min" x="268" y="310"/><use href="#rv-min" x="872" y="310"/></g>
<g fill="#f6c384">{streaks}</g>
</g>
{glitter()}
{waves(H + 3, H + 50, 7, 18, 60, 1, .32, 60)}
{boat('sail', H + 18, .5, 150, -40, haze=.5, wk=(110, 6), foam=False, bob=5.5)}
{boat('taxi', H + 30, .56, 120, -75, left=True, haze=.5, wk=(140, 6), foam=False, bob=4.8)}
<rect x="0" y="{H}" width="1200" height="56" fill="url(#rv-hazeg)" opacity=".7"/>
{waves(H + 44, H + 120, 7, 34, 70, 1.4, .34, 34)}
{boat('sail', H + 68, .9, 92, -10, wk=(150, 10), foam=False, bob=4.6)}
{boat('motor', H + 92, 1.0, 28, -6, left=True, wk=(230, 22), bob=2.2)}
{waves(H + 110, 600, 8, 60, 90, 2, .36, 20)}
{boat('shell', H + 140, 1.35, 54, -30, wk=(180, 12), bob=3.6)}
{boat('canoe', H + 196, 1.7, 70, -52, wk=(130, 12), bob=3.2)}
{waves(H + 170, 600, 4, 110, 130, 3, .3, 13, '#9fd3db')}
</svg>
'''
os.makedirs(f'{TD}/src/assets', exist_ok=True)
open(f'{TD}/src/assets/river.svg', 'w').write(svg)
print(len(svg))

import json, re
items = json.load(open('items.json', encoding='utf-8'))
EXCLU = re.compile(r"commune|canton|arrondissement français|arrondissement municipal|département|région de france|province de france|ville frontalière|grande ville|^ville$|^ville |établissement humain|bataille|édition|saison sportive|épreuve|cérémonie|discipline sportive|fleuve|rivière|natura 2000|parçan|collectivité|intercommunal|circonscription|^pays|quartier administratif|siège militaire|organisation|entreprise|^région|subdivision|chef-lieu|capitale|ancienne|village|hameau|lieu-dit|pays traditionnel|terroir|appellation|langue|traité|incendie|occurrence|zone géographique|^mer$|événement|attentat|accident|élection|concile|manifestation|grève|émeute|massacre|naufrage|explosion|épidémie|tempête|séisme|réouverture|course|tour de france|grand prix|championnat|tournoi|festival|jeux|exposition universelle|traité", re.I)
POINT = re.compile(r'Point\((-?[\d.]+) (-?[\d.]+)\)')
import os
COMM = json.load(open('communes.json', encoding='utf-8')) if os.path.exists('communes.json') else {}
lieux = []
choisis = []
for q, it in items.items():
    lab = it['label'].strip()
    if not lab or re.fullmatch(r'Q\d+', lab): continue
    types = [l for l in it['types'].values() if l and not re.fullmatch(r'Q\d+', l)]
    if any(EXCLU.search(t) for t in types): continue
    m = POINT.search(it['coord'])
    if not m: continue
    lon, lat = float(m.group(1)), float(m.group(2))
    premiere = next((c for c in it['communes'] if not re.fullmatch(r'Q\d+', c)), '')
    ville = re.search(r'arrondissement de (Paris|Lyon|Marseille)', premiere)
    commune = COMM.get(q) or (ville.group(1) if ville else '') or ('Paris' if 48.815 <= float(POINT.search(it['coord']).group(2)) <= 48.902 and 2.224 <= float(POINT.search(it['coord']).group(1)) <= 2.47 and POINT.search(it['coord']) else '') or premiere
    choisis.append(q)
    typ = types[0] if types else 'Lieu'
    lab = lab[0].upper() + lab[1:]
    lieux.append([round(lon, 5), round(lat, 5), lab, commune, typ, it['sl']])
lieux.sort(key=lambda l: -l[5])
json.dump(choisis, open('choisis.json', 'w'))
print('lieux', len(lieux))
for s in (8, 10, 15, 20):
    print(s, sum(1 for l in lieux if l[5] >= s))
for l in lieux[:15]: print(l)
for nom in ('Sacré', 'Pont du Gard', 'Fourvière', 'Notre-Dame de Paris', 'Puy de Dôme', 'Accor', 'Stade de France', 'Sorbonne', 'Louvre', 'Défense', 'Mondial', 'Galibier', 'Sophia', 'Belle', 'Vélizy', 'Montmartre', 'Panthéon'):
    print(nom, [l for l in lieux if nom.lower() in l[2].lower()][:3])
doc = {'source': "Wikidata (Wikimedia Foundation, États-Unis), données sous CC0 1.0 — extrait du 09/10/2026 (lot 144) : les éléments situés en France (P17 = Q142) avec des coordonnées (P625) et au moins 8 articles Wikimédia (sitelinks), hors communes, cantons, départements, régions, cours d'eau et événements ; nom (français, sinon anglais), commune (P131), type (P31), nombre d'articles. Engendré par scripts/generer-lieux-wikidata.mjs.",
       'licence': 'CC0-1.0', 'date': '2026-10-09', 'seuilArticles': 8, 'lieux': lieux}
s = json.dumps(doc, ensure_ascii=False, separators=(',', ':'))
open('lieux-wikidata.json', 'w', encoding='utf-8').write(s)
import gzip
print('octets', len(s.encode()), 'gzip', len(gzip.compress(s.encode(), 9)))

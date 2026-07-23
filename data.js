/*
Nom........ : data.js
Description : Accès à l'API Flask
Usage...... : Charger après config.js et avant app.js.
*/

const CENTROIDS = {
  // --- Amérique du Nord ---
  US:[-100,40], CA:[-95,56], MX:[-102,24],
  BZ:[-88.5,17.2], CR:[-84,10], SV:[-88.9,13.8], GT:[-90.3,15.5],
  HN:[-86.6,15], NI:[-85.2,12.9], PA:[-80.8,8.5],

  // --- Caraïbes ---
  BS:[-77,24], BB:[-59.5,13.2], CU:[-79,21.5], DM:[-61.4,15.4],
  DO:[-70.5,19], GD:[-61.7,12.1], HT:[-72.3,19], JM:[-77.3,18.1],
  KN:[-62.8,17.3], LC:[-60.9,13.9], VC:[-61.2,13], TT:[-61.3,10.7],

  // --- Amérique du Sud ---
  BR:[-53,-10], AR:[-64,-34], BO:[-64.7,-16.7], CL:[-71,-32],
  CO:[-74,4], EC:[-78.5,-1.8], GY:[-58.9,4.9], PY:[-58.4,-23.4],
  PE:[-76,-9.2], SR:[-56,4], UY:[-56,-33], VE:[-66,8],

  // --- Europe ---
  FR:[2,46], DE:[10,51], GB:[-2,54], ES:[-3,40], IT:[12,42],
  CH:[8,47], NL:[5,52], SE:[18,60], PL:[20,52], AT:[14,47],
  CZ:[16,50], BE:[4,51], DK:[10,56], FI:[26,62], NO:[10,62],
  PT:[-8,39], IE:[-8,53], GR:[22,39], AL:[20,41], AD:[1.5,42.5],
  BY:[28,53.5], BA:[17.8,44], BG:[25.5,42.7], HR:[15.9,45.1],
  EE:[25.5,58.6], HU:[19.5,47.2], IS:[-18,65], XK:[20.9,42.6],
  LV:[24.6,56.9], LI:[9.5,47.2], LT:[23.9,55.2], LU:[6.1,49.8],
  MT:[14.4,35.9], MD:[28.4,47.2], MC:[7.4,43.7], ME:[19.3,42.7],
  MK:[21.7,41.6], RO:[25,45.9], SM:[12.4,43.9], RS:[21,44],
  SK:[19.5,48.7], SI:[14.8,46.1], UA:[31.2,48.4], VA:[12.45,41.9],
  RU:[100,60], TR:[35,39], CY:[33.4,35.1],

  // --- Asie ---
  CN:[104,35], JP:[138,36], IN:[79,22], KR:[128,36], HK:[114,22],
  SG:[104,1], TW:[121,24], IL:[35,31], SA:[45,24],
  AF:[66,34], AM:[45,40], AZ:[47.5,40.3], BH:[50.5,26], BD:[90,24],
  BT:[90.4,27.5], BN:[114.7,4.5], KH:[105,12.5], GE:[43.4,42.2],
  ID:[113.9,-0.8], IR:[53,32], IQ:[44,33], JO:[36.2,31.2],
  KZ:[66.9,48], KW:[47.5,29.3], KG:[74.6,41.2], LA:[102.5,18],
  LB:[35.9,33.9], MY:[109.5,3.5], MV:[73.2,3.2], MN:[103.8,46.9],
  MM:[95.9,17.2], NP:[84.1,28.2], KP:[127.5,40], OM:[56.1,20.5],
  PK:[69.3,30], PS:[35.2,31.9], PH:[122,13], QA:[51.2,25.3],
  LK:[80.8,7.9], SY:[38.5,35], TJ:[71,38.9], TH:[101,15],
  TL:[125.6,-8.8], TM:[59.6,39], AE:[54,24], UZ:[64.6,41.4],
  VN:[106,16], YE:[48,15.5],

  // --- Afrique ---
  ZA:[25,-29], DZ:[3,28], AO:[18,-12], BJ:[2.3,9.3], BW:[24,-22],
  BF:[-1.5,12.3], BI:[29.9,-3.4], CM:[12.5,7.4], CV:[-24,16],
  CF:[21,6.6], TD:[19,15], KM:[43.3,-11.9], CG:[15.8,-0.7],
  CD:[23.6,-2.9], CI:[-5.5,7.5], DJ:[42.5,11.8], EG:[30,26],
  GQ:[10.3,1.6], ER:[39,15.2], SZ:[31.5,-26.5], ET:[40,9.1],
  GA:[11.6,-0.8], GM:[-15.4,13.4], GH:[-1,7.9], GN:[-9.7,10.4],
  GW:[-15,12], KE:[37.9,0.0], LS:[28.2,-29.6], LR:[-9.4,6.4],
  LY:[17,26.3], MG:[46.9,-18.9], MW:[34,-13.3], ML:[-4,17.6],
  MR:[-10.9,20.3], MU:[57.6,-20.3], MA:[-7,31.8], MZ:[35.5,-18.7],
  NA:[18.5,-22.9], NE:[8.1,17.6], NG:[8.7,9.1], RW:[29.9,-1.9],
  ST:[6.6,0.2], SN:[-14.5,14.5], SC:[55.5,-4.6], SL:[-11.8,8.5],
  SO:[46,5.2], SS:[30,7], SD:[30,15.5], TZ:[35,-6.4], TG:[1.2,8.6],
  TN:[9.5,34], UG:[32.3,1.4], ZM:[28,-13.1], ZW:[30,-19], EH:[-12.9,24.2],

  // --- Océanie ---
  AU:[133,-27], FJ:[178,-18], KI:[173,1.4], MH:[171,7],
  FM:[150,6.9], NR:[166.9,-0.5], NZ:[174,-41], PW:[134.6,7.5],
  PG:[144,-6], WS:[-172,-13.8], SB:[160,-9], TO:[-175,-21],
  TV:[179,-8], VU:[167,-16],
};

/* ============================================================
   Noms français des pays (clé = code ISO 3166-1 alpha-2)
   Les drapeaux sont générés automatiquement à partir du code
   ISO via getFlagEmoji(), pour éviter toute erreur de saisie.
   ============================================================ */
function getFlagEmoji(isoCode) {
  // Cas particuliers sans indicatif ISO standard à 2 lettres classique
  const special = { XK: '🇽🇰' }; // Kosovo (code non officiel ISO mais couramment utilisé)
  if (special[isoCode]) return special[isoCode];
  return isoCode
    .toUpperCase()
    .replace(/./g, (char) =>
      String.fromCodePoint(127397 + char.charCodeAt(0))
    );
}

/* ⚠ getFlagEmoji() ci-dessus produit un VRAI drapeau (🇫🇷) uniquement si la
 * police d'emoji du système d'exploitation du visiteur sait dessiner la
 * paire de caractères Unicode "Regional Indicator Symbol" (U+1F1E6-1F1FF)
 * comme un drapeau. C'est le cas sur iOS/Android/macOS (police emoji
 * couleur complète), mais PAS forcément sur Windows (Microsoft a
 * longtemps affiché les deux lettres du code pays dans des carrés plutôt
 * qu'un drapeau) ni sur Linux (police Noto Emoji sans glyphes de
 * drapeaux, pour des raisons de licence). Le rendu dépend donc de la
 * machine du VISITEUR, pas du code du site.
 *
 * getFlagImgHtml() ci-dessous contourne ce problème en utilisant une
 * vraie image (flagcdn.com, gratuit, sans clé API) : une image se rend à
 * l'identique sur toutes les plateformes, quelle que soit la police
 * d'emoji installée. */
function getFlagImgHtml(isoCode) {
  const special = { XK: 'xk' }; // Kosovo : flagcdn.com le référence sous 'xk'
  const code = (special[isoCode] || isoCode).toLowerCase();
  return `<img src="https://flagcdn.com/16x12/${code}.png" `
    + `srcset="https://flagcdn.com/32x24/${code}.png 2x" `
    + `width="16" height="12" alt="${isoCode}" loading="lazy" `
    + `style="vertical-align:middle;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.08);">`;
}

const NOMS_PAYS = {
  // --- Amérique du Nord ---
  US:'États-Unis', CA:'Canada', MX:'Mexique',
  BZ:'Belize', CR:'Costa Rica', SV:'Salvador', GT:'Guatemala',
  HN:'Honduras', NI:'Nicaragua', PA:'Panama',

  // --- Caraïbes ---
  BS:'Bahamas', BB:'Barbade', CU:'Cuba', DM:'Dominique',
  DO:'République dominicaine', GD:'Grenade', HT:'Haïti', JM:'Jamaïque',
  KN:'Saint-Christophe-et-Niévès', LC:'Sainte-Lucie',
  VC:'Saint-Vincent-et-les-Grenadines', TT:'Trinité-et-Tobago',

  // --- Amérique du Sud ---
  BR:'Brésil', AR:'Argentine', BO:'Bolivie', CL:'Chili',
  CO:'Colombie', EC:'Équateur', GY:'Guyana', PY:'Paraguay',
  PE:'Pérou', SR:'Suriname', UY:'Uruguay', VE:'Venezuela',

  // --- Europe ---
  FR:'France', DE:'Allemagne', GB:'Royaume-Uni', ES:'Espagne', IT:'Italie',
  CH:'Suisse', NL:'Pays-Bas', SE:'Suède', PL:'Pologne', AT:'Autriche',
  CZ:'Tchéquie', BE:'Belgique', DK:'Danemark', FI:'Finlande', NO:'Norvège',
  PT:'Portugal', IE:'Irlande', GR:'Grèce', AL:'Albanie', AD:'Andorre',
  BY:'Biélorussie', BA:'Bosnie-Herzégovine', BG:'Bulgarie', HR:'Croatie',
  EE:'Estonie', HU:'Hongrie', IS:'Islande', XK:'Kosovo',
  LV:'Lettonie', LI:'Liechtenstein', LT:'Lituanie', LU:'Luxembourg',
  MT:'Malte', MD:'Moldavie', MC:'Monaco', ME:'Monténégro',
  MK:'Macédoine du Nord', RO:'Roumanie', SM:'Saint-Marin', RS:'Serbie',
  SK:'Slovaquie', SI:'Slovénie', UA:'Ukraine', VA:'Vatican',
  RU:'Russie', TR:'Turquie', CY:'Chypre',

  // --- Asie ---
  CN:'Chine', JP:'Japon', IN:'Inde', KR:'Corée du Sud', HK:'Hong Kong',
  SG:'Singapour', TW:'Taïwan', IL:'Israël', SA:'Arabie Saoudite',
  AF:'Afghanistan', AM:'Arménie', AZ:'Azerbaïdjan', BH:'Bahreïn',
  BD:'Bangladesh', BT:'Bhoutan', BN:'Brunei', KH:'Cambodge',
  GE:'Géorgie', ID:'Indonésie', IR:'Iran', IQ:'Irak', JO:'Jordanie',
  KZ:'Kazakhstan', KW:'Koweït', KG:'Kirghizstan', LA:'Laos',
  LB:'Liban', MY:'Malaisie', MV:'Maldives', MN:'Mongolie',
  MM:'Birmanie', NP:'Népal', KP:'Corée du Nord', OM:'Oman',
  PK:'Pakistan', PS:'Palestine', PH:'Philippines', QA:'Qatar',
  LK:'Sri Lanka', SY:'Syrie', TJ:'Tadjikistan', TH:'Thaïlande',
  TL:'Timor oriental', TM:'Turkménistan', AE:'Émirats arabes unis',
  UZ:'Ouzbékistan', VN:'Vietnam', YE:'Yémen',

  // --- Afrique ---
  ZA:'Afrique du Sud', DZ:'Algérie', AO:'Angola', BJ:'Bénin',
  BW:'Botswana', BF:'Burkina Faso', BI:'Burundi', CM:'Cameroun',
  CV:'Cap-Vert', CF:'République centrafricaine', TD:'Tchad',
  KM:'Comores', CG:'Congo', CD:'République démocratique du Congo',
  CI:"Côte d'Ivoire", DJ:'Djibouti', EG:'Égypte', GQ:'Guinée équatoriale',
  ER:'Érythrée', SZ:'Eswatini', ET:'Éthiopie', GA:'Gabon',
  GM:'Gambie', GH:'Ghana', GN:'Guinée', GW:'Guinée-Bissau',
  KE:'Kenya', LS:'Lesotho', LR:'Liberia', LY:'Libye',
  MG:'Madagascar', MW:'Malawi', ML:'Mali', MR:'Mauritanie',
  MU:'Maurice', MA:'Maroc', MZ:'Mozambique', NA:'Namibie',
  NE:'Niger', NG:'Nigéria', RW:'Rwanda', ST:'Sao Tomé-et-Principe',
  SN:'Sénégal', SC:'Seychelles', SL:'Sierra Leone', SO:'Somalie',
  SS:'Soudan du Sud', SD:'Soudan', TZ:'Tanzanie', TG:'Togo',
  TN:'Tunisie', UG:'Ouganda', ZM:'Zambie', ZW:'Zimbabwe',
  EH:'Sahara occidental',

  // --- Océanie ---
  AU:'Australie', FJ:'Fidji', KI:'Kiribati', MH:'Îles Marshall',
  FM:'Micronésie', NR:'Nauru', NZ:'Nouvelle-Zélande', PW:'Palaos',
  PG:'Papouasie-Nouvelle-Guinée', WS:'Samoa', SB:'Salomon',
  TO:'Tonga', TV:'Tuvalu', VU:'Vanuatu',
};

/* Libellés et drapeaux affichés pour les pays (généré à partir de NOMS_PAYS).
 * `flag` contient directement le HTML de l'image (voir getFlagImgHtml) :
 * app.js n'a rien à changer, il interpole déjà `${info.flag}` tel quel
 * dans ses templates (tooltip de la carte, panneau pays, pastilles
 * d'articles) — un <img> s'y insère aussi bien qu'un caractère emoji. */
const PAYS_INFO = Object.fromEntries(
  Object.entries(NOMS_PAYS).map(([code, label]) => [
    code,
    { label, flag: getFlagImgHtml(code) },
  ])
);

module.exports = { CENTROIDS, PAYS_INFO, getFlagEmoji, getFlagImgHtml };

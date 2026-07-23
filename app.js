/*
Nom........ : app.js
Description : config.js (APP_CONFIG), data.js (CENTROIDS, PAYS_INFO), et
              key_word.json (référentiel de mots-clés, servi statiquement à côté de
              index.html — même dépôt que le front). Ces fichiers doivent être
              chargés AVANT celui-ci dans index.html.

              Ne charge pas tous les articles dans le navigateur :
                - le nuage de mots (par mois + global) vient précalculé de
                  /agregats/nuage ;
                - la carte du monde par pays vient précalculée de
                  /agregats/carte, calculée sur L'INTÉGRALITÉ du corpus, à
                  la fois globalement ET par mois (voir CARTE_DATA /
                  appliquerCarteMois ci-dessous) ;
                - la liste d'articles affichée (top cités, résultats de
                  recherche) vient de /articles/recherche, qui embarque déjà
                  les auteurs (plus d'appel séparé par article).
              Les trois routes s'appuient sur des tables précalculées une
              fois par precompute.py côté serveur.

              La carte réagit maintenant au changement de mois (setMonth) :
              /agregats/carte est chargée UNE SEULE FOIS au démarrage et
              contient déjà la répartition par pays pour chaque mois, donc
              changer de mois ne déclenche aucun nouvel appel réseau — juste
              une bascule locale + une transition D3 sur les bulles.
Usage...... : Charger après data.js et config.js
Auteur .....: Script généré par claude.ia
*/


const API = APP_CONFIG.BACKEND_API_URL;

/* ══ Référentiel de mots-clés (key_word.json), chargé une fois ══════════ */
let MOTS_CLES_SIMPLES = new Set(); // mots simples (1 token) autorisés
let PHRASES_CLES = [];              // [{mots:[...], phrase:"..."}] (2+ tokens)

async function chargerReferentiel() {
  try {
    const categories = await fetch('key_word.json').then(r => r.json());
    Object.values(categories).forEach(termes => {
      termes.forEach(terme => {
        const t = terme.toLowerCase().trim();
        if (!t) return;
        const mots = t.split(' ');
        if (mots.length === 1) MOTS_CLES_SIMPLES.add(mots[0]);
        else PHRASES_CLES.push({ mots, phrase: t });
      });
    });
  } catch (err) {
    console.error('key_word.json introuvable/invalide — aucun mot-clé ne sera détecté.', err);
  }
}

/** Ne garde que les mots/expressions du référentiel dans un
 *  index_inverse_compte ({"mot": nombre_occurrences}). Pour une expression
 *  composée, pas de positions dans ce format (juste un compteur), donc pas
 *  de vérification de contiguïté possible : on vérifie que tous les mots
 *  de l'expression sont présents, avec un poids = leur minimum. */
function extraireMotsArticle(indexJsonStr) {
  const resultat = {};
  if (!indexJsonStr) return resultat;
  let compte;
  try { compte = JSON.parse(indexJsonStr); } catch { return resultat; }
  if (!compte || typeof compte !== 'object') return resultat;

  const normalise = {};
  Object.entries(compte).forEach(([mot, val]) => {
    const m = mot.toLowerCase().trim();
    const n = Number(val);
    if (!Number.isFinite(n)) return;
    normalise[m] = (normalise[m] || 0) + n;
  });

  Object.entries(normalise).forEach(([mot, n]) => {
    if (MOTS_CLES_SIMPLES.has(mot)) resultat[mot] = (resultat[mot] || 0) + n;
  });
  PHRASES_CLES.forEach(({ mots, phrase }) => {
    if (mots.every(m => m in normalise)) {
      resultat[phrase] = (resultat[phrase] || 0) + Math.min(...mots.map(m => normalise[m]));
    }
  });
  return resultat;
}

/* ══ Accès API ═════════════════════════════════════════════════════════ */

/** Nuage de mots précalculé (par mois + global) — quelques centaines de Ko
 *  au lieu de télécharger les 500 000+ articles pour le recalculer. */
async function fetchAgregatsNuage() {
  const r = await fetch(`${API}/agregats/nuage`);
  if (!r.ok) throw new Error(`API ${r.status} sur /agregats/nuage`);
  return r.json();
}

/** Répartition par pays précalculée sur TOUT le corpus, globale ET par
 *  mois — chargée une seule fois, voir CARTE_DATA. */
async function fetchAgregatsCarte() {
  const r = await fetch(`${API}/agregats/carte`);
  if (!r.ok) throw new Error(`API ${r.status} sur /agregats/carte`);
  return r.json();
}

/** Recherche/filtrage d'articles fait côté serveur (SQL indexé), auteurs
 *  déjà embarqués dans la réponse. Sans aucun paramètre : top articles par
 *  citations (utilisé pour la liste "articles à fort impact"). */
async function fetchArticlesRecherche({ mot = '', q = '', mois = '', limite = 20 } = {}) {
  const params = new URLSearchParams();
  if (mot) params.set('mot', mot);
  if (q) params.set('q', q);
  if (mois) params.set('mois', mois);
  params.set('limite', limite);
  const r = await fetch(`${API}/articles/recherche?${params}`);
  if (!r.ok) throw new Error(`API ${r.status} sur /articles/recherche`);
  return r.json();
}

/* ══ État applicatif ═══════════════════════════════════════════════════ */
let MONTHLY_KW       = {}; // { "2025-03": {mot:poids}, ... } — précalculé côté serveur
let GLOBAL_KW        = {}; // agrégat tous mois confondus — précalculé côté serveur
let MONTH_ORDER      = [];
let ARTICLES_PAR_MOIS = {}; // { "2025-03": 12345, ... } — précalculé côté serveur
let countryMap       = {}; // vue COURANTE (dérivée de CARTE_DATA selon ACTIVE_MONTH)

/** Données brutes complètes reçues de /agregats/carte : contient déjà tout
 *  (global + chaque mois), donc changer de mois ne redemande jamais rien
 *  au serveur — voir appliquerCarteMois(). */
let CARTE_DATA = {
  global: { par_pays: {}, total_pays: 0, total_articles_avec_pays: 0 },
  par_mois: {},
};

let DERIVED_STATS    = {
  total_articles: 0,
  total_citations: 0,
  total_mois: 0,
  total_pays: null,
  total_articles_avec_pays: null,
};

let ACTIVE_MONTH     = '';
let ACTIVE_COUNTRY   = null;
let EVO_WORD         = null;
let CURRENT_ARTICLES = [];

const MOIS_FR = ['Janv', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
function formatMonthLabel(moisIso) {
  if (!moisIso) return moisIso;
  const [annee, m] = moisIso.split('-');
  const idx = parseInt(m, 10) - 1;
  if (!annee || Number.isNaN(idx) || idx < 0 || idx > 11) return moisIso;
  return `${MOIS_FR[idx]} ${annee}`;
}

/** Version courte pour les colonnes de la timeline (largeur limitée) :
 *  année sur 2 chiffres, jamais tronquée. Remplace l'ancien
 *  `formatMonthLabel(m).slice(0,7)` qui coupait la fin de l'année
 *  ("Sept 2025" -> "Sept 20", "Mars 2025" -> "Mars 20"). */
function formatMonthLabelCourt(moisIso) {
  if (!moisIso) return moisIso;
  const [annee, m] = moisIso.split('-');
  const idx = parseInt(m, 10) - 1;
  if (!annee || Number.isNaN(idx) || idx < 0 || idx > 11) return moisIso;
  return `${MOIS_FR[idx]} ${annee.slice(-2)}`;
}

/** Normalise un article brut renvoyé par /articles/recherche. `auteurs` est
 *  déjà embarqué par le serveur (sinon tableau vide) — plus besoin d'appel
 *  séparé à /auteurs/<id> par article. */
function normaliserArticle(raw) {
  const auteurs = raw.auteurs || [];
  return {
    id: raw.id,
    titre: raw.titre || 'Sans titre',
    date: raw.date || '',
    mois: (raw.date || '').slice(0, 7),
    langue: raw.langue || 'en',
    citations: raw.citations || 0,
    _kw: extraireMotsArticle(raw.index_inverse_compte),
    auteurs,
    pays: [...new Set(auteurs.map(au => au.pays).filter(Boolean))],
  };
}

/* ══ Particules (fond du hero) ═════════════════════════════════════════ */
(function(){
  const c=document.getElementById('starCanvas');if(!c)return;
  const ctx=c.getContext('2d');let P=[],W,H;
  function resize(){W=c.width=c.offsetWidth;H=c.height=c.offsetHeight;
    P=Array.from({length:30},()=>({x:Math.random()*W,y:Math.random()*H,
      r:Math.random()*1.2+.3,vx:(Math.random()-.5)*.12,vy:(Math.random()-.5)*.08,
      alpha:Math.random()*.28+.08,phase:Math.random()*Math.PI*2,speed:Math.random()*.012+.004}));}
  function draw(){ctx.clearRect(0,0,W,H);
    P.forEach(s=>{s.phase+=s.speed;s.x+=s.vx;s.y+=s.vy;
      if(s.x<0)s.x=W;if(s.x>W)s.x=0;if(s.y<0)s.y=H;if(s.y>H)s.y=0;
      const a=s.alpha*(.55+.45*Math.sin(s.phase));
      ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(180,140,60,${a})`;ctx.fill();});
    requestAnimationFrame(draw);}
  window.addEventListener('resize',resize);resize();draw();
})();
window.addEventListener('scroll',()=>{
  document.getElementById('header').classList.toggle('scrolled',window.scrollY>10);
},{passive:true});

const revObs=new IntersectionObserver(entries=>{
  entries.forEach((e,i)=>{if(e.isIntersecting){
    e.target.style.animationDelay=(i*50)+'ms';
    e.target.classList.add('visible');revObs.unobserve(e.target);}});
},{threshold:.07});

// FIX : passé en innerHTML (au lieu de textContent) pour pouvoir afficher
// des balises <img> (ex. info.flag, voir getFlagImgHtml() dans data.js) en
// plus du texte brut. Sans risque ici : tous les appels à toast() dans ce
// fichier utilisent des chaînes construites en interne (labels de pays,
// mots-clés du référentiel, messages fixes), jamais de contenu HTML saisi
// librement par un tiers.
function toast(msg,d=2400){const t=document.getElementById('toast');
  t.innerHTML=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),d);}
function showToast(msg,d){toast(msg,d);}

function animCount(el,v,d=650){if(!el)return;const s=performance.now();
  (function step(n){const p=Math.min((n-s)/d,1);
    el.textContent=Math.round(v*(1-Math.pow(1-p,3))).toLocaleString('fr-FR');
    if(p<1)requestAnimationFrame(step);})(performance.now());}

function animBars(){setTimeout(()=>{
  document.querySelectorAll('.bar-fill').forEach(el=>{
    requestAnimationFrame(()=>el.style.width=el.dataset.w+'%');});},60);}

function showTab(name,btn){ /* single page — no-op */ }

/* ══ Stat strip ════════════════════════════════════════════════════════ */
function renderStatStrip(){
  const topKW = Object.entries((ACTIVE_MONTH ? MONTHLY_KW[ACTIVE_MONTH] : GLOBAL_KW) || {})
    .sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
  const totalPaysAffiche = DERIVED_STATS.total_pays===null ? '…' : DERIVED_STATS.total_pays;

  const notePays = DERIVED_STATS.total_articles_avec_pays
    ? `sur ${DERIVED_STATS.total_articles_avec_pays.toLocaleString('fr-FR')} art. avec pays identifié${ACTIVE_MONTH ? ' ce mois' : ''}`
    : 'aucune donnée pour ce mois';

  // Nombre d'articles affiché : celui du mois sélectionné (précalculé côté
  // serveur), ou le total global si "Tous les mois" est actif. Auparavant
  // cette carte affichait toujours DERIVED_STATS.total_articles (le total
  // global), même en filtrant par mois.
  const articlesAffiches = ACTIVE_MONTH
    ? (ARTICLES_PAR_MOIS[ACTIVE_MONTH] || 0)
    : DERIVED_STATS.total_articles;
  const noteArticles = ACTIVE_MONTH ? formatMonthLabel(ACTIVE_MONTH) : 'arXiv via OpenAlex';

  document.getElementById('statStrip').innerHTML=`
    <div class="stat-card"><div class="stat-label">Articles chargés</div>
      <div class="stat-val g" id="sc-tot">0</div><div class="stat-note">${noteArticles}</div></div>
    <div class="stat-card"><div class="stat-label">Mois couverts</div>
      <div class="stat-val">${DERIVED_STATS.total_mois}</div></div>
    <div class="stat-card"><div class="stat-label">Pays</div>
      <div class="stat-val">${totalPaysAffiche}</div><div class="stat-note">${notePays}</div></div>
    <div class="stat-card"><div class="stat-label">Mot top (${ACTIVE_MONTH?formatMonthLabel(ACTIVE_MONTH):'tous les mois'})</div>
      <div class="stat-val" style="font-size:1rem;padding-top:3px;font-style:italic;">${topKW}</div></div>
  `;
  setTimeout(()=>animCount(document.getElementById('sc-tot'),articlesAffiches),80);
}

/* ══ Cloud ═════════════════════════════════════════════════════════════ */
function renderCloud(mois){
  const wrap=document.getElementById('cloudMain');
  if(!wrap) return;
  wrap.classList.add('fading');
  setTimeout(()=>{
    const data = mois ? (MONTHLY_KW[mois]||{}) : GLOBAL_KW;
    const sorted=Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,55);
    if(!sorted.length){wrap.innerHTML='<p style="color:var(--text-3);font-size:13px;">Aucune donnée.</p>';wrap.classList.remove('fading');return;}
    const maxF=sorted[0][1];
    wrap.innerHTML=sorted.map(([w,f])=>{
      const size=11+Math.round((f/maxF)*20);
      const op=(.38+(f/maxF)*.62).toFixed(2);
      const isEvo=w===EVO_WORD;
      return `<span class="cloud-word${isEvo?' selected':''}" style="font-size:${size}px;opacity:${op}"
        onclick="onCloudClick('${w.replace(/'/g,"\\'")}')" title="${w}: score ${Math.round(f)}">${w}</span>`;
    }).join('');
    wrap.classList.remove('fading');
  },180);
}

function onCloudClick(word){
  EVO_WORD=word;
  document.querySelectorAll('.cloud-word').forEach(el=>{
    el.classList.toggle('selected',el.textContent===word);
  });
  traceEvolution(word);
  const input=document.getElementById('evoInput');
  if(input) input.value=word;
  renderTopArticles(word);
  setTimeout(()=>{
    const el=document.getElementById('topArticlesList');
    if(el) el.closest('.section-card').scrollIntoView({behavior:'smooth',block:'start'});
  },200);
  toast(`Évolution de "${word}" tracée — onglet Évolution`);
}

/* ══ Month pills ════════════════════════════════════════════════════════ */
function initMonthPills(){
  const c=document.getElementById('monthPills');
  if(!c) return;
  c.innerHTML='';
  const bTous=document.createElement('button');
  bTous.className='m-pill'+(ACTIVE_MONTH===''?' active':'');
  bTous.textContent='Tous les mois';
  bTous.onclick=()=>setMonth('',-1);
  c.appendChild(bTous);

  MONTH_ORDER.forEach((m,i)=>{
    const b=document.createElement('button');
    b.className='m-pill'+(m===ACTIVE_MONTH?' active':'');
    b.textContent=formatMonthLabel(m);
    b.onclick=()=>setMonth(m,i);
    c.appendChild(b);
  });
}

/** Change de mois : met à jour le nuage de mots-clés ET la carte des pays
 *  (les deux sont précalculés, donc c'est instantané — aucun appel réseau
 *  supplémentaire). */
function setMonth(m,i){
  ACTIVE_MONTH=m;
  document.querySelectorAll('.m-pill').forEach((b,j)=>b.classList.toggle('active',j===i+1));
  renderCloud(m);
  appliquerCarteMois(m);
  renderTopArticles(EVO_WORD || undefined);
  if(EVO_WORD) renderEvoChart();
}

function renderCompare(){ /* single page — removed */ }

/* ══ CARTE DU MONDE D3 ══════════════════════════════════════════════════ */
let mapInitialized = false;
let mapProjection, mapPath, mapSvg, mapG, mapZoom;

const ISO_A2_MAP = {
  'AD':'020', 'AE':'784', 'AF':'004', 'AG':'028', 'AI':'660', 'AL':'008',
  'AM':'051', 'AO':'024', 'AQ':'010', 'AR':'032', 'AS':'016', 'AT':'040',
  'AU':'036', 'AW':'533', 'AX':'248', 'AZ':'031', 'BA':'070', 'BB':'052',
  'BD':'050', 'BE':'056', 'BF':'854', 'BG':'100', 'BH':'048', 'BI':'108',
  'BJ':'204', 'BL':'652', 'BM':'060', 'BN':'096', 'BO':'068', 'BQ':'535',
  'BR':'076', 'BS':'044', 'BT':'064', 'BV':'074', 'BW':'072', 'BY':'112',
  'BZ':'084', 'CA':'124', 'CC':'166', 'CD':'180', 'CF':'140', 'CG':'178',
  'CH':'756', 'CI':'384', 'CK':'184', 'CL':'152', 'CM':'120', 'CN':'156',
  'CO':'170', 'CR':'188', 'CU':'192', 'CV':'132', 'CW':'531', 'CX':'162',
  'CY':'196', 'CZ':'203', 'DE':'276', 'DJ':'262', 'DK':'208', 'DM':'212',
  'DO':'214', 'DZ':'012', 'EC':'218', 'EE':'233', 'EG':'818', 'EH':'732',
  'ER':'232', 'ES':'724', 'ET':'231', 'FI':'246', 'FJ':'242', 'FK':'238',
  'FM':'583', 'FO':'234', 'FR':'250', 'GA':'266', 'GB':'826', 'GD':'308',
  'GE':'268', 'GF':'254', 'GG':'831', 'GH':'288', 'GI':'292', 'GL':'304',
  'GM':'270', 'GN':'324', 'GP':'312', 'GQ':'226', 'GR':'300', 'GS':'239',
  'GT':'320', 'GU':'316', 'GW':'624', 'GY':'328', 'HK':'344', 'HM':'334',
  'HN':'340', 'HR':'191', 'HT':'332', 'HU':'348', 'ID':'360', 'IE':'372',
  'IL':'376', 'IM':'833', 'IN':'356', 'IO':'086', 'IQ':'368', 'IR':'364',
  'IS':'352', 'IT':'380', 'JE':'832', 'JM':'388', 'JO':'400', 'JP':'392',
  'KE':'404', 'KG':'417', 'KH':'116', 'KI':'296', 'KM':'174', 'KN':'659',
  'KP':'408', 'KR':'410', 'KW':'414', 'KY':'136', 'KZ':'398', 'LA':'418',
  'LB':'422', 'LC':'662', 'LI':'438', 'LK':'144', 'LR':'430', 'LS':'426',
  'LT':'440', 'LU':'442', 'LV':'428', 'LY':'434', 'MA':'504', 'MC':'492',
  'MD':'498', 'ME':'499', 'MF':'663', 'MG':'450', 'MH':'584', 'MK':'807',
  'ML':'466', 'MM':'104', 'MN':'496', 'MO':'446', 'MP':'580', 'MQ':'474',
  'MR':'478', 'MS':'500', 'MT':'470', 'MU':'480', 'MV':'462', 'MW':'454',
  'MX':'484', 'MY':'458', 'MZ':'508', 'NA':'516', 'NC':'540', 'NE':'562',
  'NF':'574', 'NG':'566', 'NI':'558', 'NL':'528', 'NO':'578', 'NP':'524',
  'NR':'520', 'NU':'570', 'NZ':'554', 'OM':'512', 'PA':'591', 'PE':'604',
  'PF':'258', 'PG':'598', 'PH':'608', 'PK':'586', 'PL':'616', 'PM':'666',
  'PN':'612', 'PR':'630', 'PS':'275', 'PT':'620', 'PW':'585', 'PY':'600',
  'QA':'634', 'RE':'638', 'RO':'642', 'RS':'688', 'RU':'643', 'RW':'646',
  'SA':'682', 'SB':'090', 'SC':'690', 'SD':'729', 'SE':'752', 'SG':'702',
  'SH':'654', 'SI':'705', 'SJ':'744', 'SK':'703', 'SL':'694', 'SM':'674',
  'SN':'686', 'SO':'706', 'SR':'740', 'SS':'728', 'ST':'678', 'SV':'222',
  'SX':'534', 'SY':'760', 'SZ':'748', 'TC':'796', 'TD':'148', 'TF':'260',
  'TG':'768', 'TH':'764', 'TJ':'762', 'TK':'772', 'TL':'626', 'TM':'795',
  'TN':'788', 'TO':'776', 'TR':'792', 'TT':'780', 'TV':'798', 'TW':'158',
  'TZ':'834', 'UA':'804', 'UG':'800', 'UM':'581', 'US':'840', 'UY':'858',
  'UZ':'860', 'VA':'336', 'VC':'670', 'VE':'862', 'VG':'092', 'VI':'850',
  'VN':'704', 'VU':'548', 'WF':'876', 'WS':'882', 'YE':'887', 'YT':'175',
  'ZA':'710', 'ZM':'894', 'ZW':'716',
};
const NUM_TO_A2 = Object.fromEntries(Object.entries(ISO_A2_MAP).map(([a2,num])=>[num,a2]));

/** Taille de police (en unités locales SVG, avant contre-scale par le
 *  zoom) pour le code à 2 lettres d'une bulle, calculée en PROPORTION de
 *  son rayon plutôt qu'un choix binaire (8px/6px) : garantit que le texte
 *  tient toujours dans sa bulle, quelle que soit sa taille. Plancher à 6px
 *  (au lieu de 4px) pour rester lisible même sur la plus petite bulle
 *  possible (rBase=4, le minimum de l'échelle rScale) — vérifié : à ce
 *  plancher, le texte tient encore avec de la marge (largeur ~7.2,
 *  diamètre de la bulle = 8). */
function tailleFontePourBulle(rBase) {
  return Math.max(6, rBase * 0.9);
}
/** ⚠ Avant, un seuil (rBase > 13) cachait le code des petits pays "pour
 *  éviter que le texte déborde" — mais la formule ci-dessus garantit déjà
 *  qu'il n'y a jamais de débordement, à AUCUNE taille de bulle. Ce seuil
 *  ne servait donc plus à rien et empêchait juste la moitié des pays
 *  d'afficher leur code. Tous les pays présents sur la carte affichent
 *  maintenant leurs initiales. */
function bulleAssezGrandePourTexte(rBase) {
  return true;
}

/** Légende sous la carte : précise la couverture pour la vue courante
 *  (globale ou filtrée par mois). */
function updateMapCoverageNote(){
  const container = document.getElementById('mapContainer');
  if(!container) return;
  let note = document.getElementById('mapSampleNote');
  if(!note){
    note = document.createElement('div');
    note.id = 'mapSampleNote';
    note.style.cssText = 'font-size:12px;color:var(--text-3);margin-top:8px;text-align:center;font-style:italic;';
    container.insertAdjacentElement('afterend', note);
  }
  const n = DERIVED_STATS.total_articles_avec_pays;
  const suffixe = ACTIVE_MONTH ? ` pour ${formatMonthLabel(ACTIVE_MONTH)}` : ' (toutes dates confondues)';
  note.textContent = n
    ? `Carte basée sur l'intégralité des articles indexés${suffixe} (${n.toLocaleString('fr-FR')} avec au moins un pays identifié).`
    : `Aucun article avec un pays identifié${suffixe}.`;
}

/** Bascule countryMap sur la vue globale ou sur un mois précis, à partir
 *  des données déjà chargées dans CARTE_DATA (aucun appel réseau). Met à
 *  jour les stats, la légende, les bulles de la carte (avec transition
 *  D3 fluide si la carte est déjà affichée), et rafraîchit le panneau
 *  latéral du pays actif s'il existe encore dans la nouvelle vue. */
function appliquerCarteMois(mois){
  const bloc = mois
    ? (CARTE_DATA.par_mois[mois] || { par_pays: {}, total_pays: 0, total_articles_avec_pays: 0 })
    : CARTE_DATA.global;

  countryMap = bloc.par_pays || {};
  DERIVED_STATS.total_pays = bloc.total_pays || 0;
  DERIVED_STATS.total_articles_avec_pays = bloc.total_articles_avec_pays || 0;

  renderStatStrip();
  updateMapCoverageNote();

  if(mapInitialized) updateMapBubbles();

  // Le pays mis en avant est TOUJOURS celui qui pèse le plus dans la vue
  // courante (global ou mois sélectionné) -- recalculé à CHAQUE changement
  // de mois, pour ne jamais rester bloqué sur un pays qui n'est plus le
  // plus représentatif de cette période (ex. un pays dominant globalement
  // mais absent du top sur un mois donné).
  const premier = Object.entries(countryMap).sort((a,b)=>b[1].total-a[1].total)[0];
  ACTIVE_COUNTRY = premier ? premier[0] : null;

  if(ACTIVE_COUNTRY && document.getElementById('sidebarBars')){
    selectCountry(ACTIVE_COUNTRY);
  } else if(!ACTIVE_COUNTRY){
    const titre=document.getElementById('sidebarTitle');
    if(titre) titre.textContent = 'Aucune donnée';
    const barres=document.getElementById('sidebarBars');
    if(barres) barres.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Aucun pays identifié pour cette période.</p>`;
  }
}

/** Charge la répartition par pays (globale + par mois) une seule fois au
 *  démarrage, puis applique la vue correspondant au mois actif. */
async function loadPaysEtCarte(){
  try {
    CARTE_DATA = await fetchAgregatsCarte();
  } catch(err) {
    console.error(err);
    toast('Erreur pendant le chargement de la carte des pays');
    CARTE_DATA = { global: { par_pays: {}, total_pays: 0, total_articles_avec_pays: 0 }, par_mois: {} };
  }
  appliquerCarteMois(ACTIVE_MONTH);
}

function renderMap(){
  if(mapInitialized){ updateMapBubbles(); return; }
  mapInitialized = true;

  const container = document.getElementById('mapContainer');
  if(!container) return;
  const W = container.clientWidth || 700;
  const H = Math.round(W * 0.52);

  const svg = d3.select('#worldMapSvg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', W).attr('height', H);

  mapProjection = d3.geoNaturalEarth1().scale(W / 6.5).translate([W/2, H/2]);
  mapPath = d3.geoPath().projection(mapProjection);

  // ⚠ FIX carte (taille des bulles au zoom) + FIX labels (révélation
  // progressive des petits pays en zoomant, au lieu d'un seuil figé) :
  // Contre-scale : bulles/textes/traits gardent une taille apparente
  // constante à l'écran au lieu de grossir avec le zoom (bug carte n°1).
  // Le texte utilise la MÊME fonction que la création initiale (voir
  // tailleFontePourBulle/bulleAssezGrandePourTexte) pour ne jamais
  // déborder de sa bulle, à aucun niveau de zoom (bug n°2).
  mapZoom = d3.zoom().scaleExtent([1, 8]).on('zoom', (event) => {
    const k = event.transform.k;
    mapG.attr('transform', event.transform);
    mapG.selectAll('.bubble')
      .attr('r', d => (d.rBase || 4) / k)
      .attr('stroke-width', 1.2 / k);
    mapG.selectAll('.bubble-label')
      .style('font-size', d => (tailleFontePourBulle(d.rBase || 0) / k) + 'px')
      .text(d => bulleAssezGrandePourTexte(d.rBase || 0) ? d.code : '');
    mapG.selectAll('.country').attr('stroke-width', 0.3 / k);
  });
  svg.call(mapZoom);

  mapG = svg.append('g');
  mapG.append('rect').attr('width', W).attr('height', H).attr('fill', '#c8e6f5');

  const graticule = d3.geoGraticule().step([20,20]);
  mapG.append('path').datum(graticule()).attr('d', mapPath)
    .attr('fill','none').attr('stroke','rgba(255,255,255,.25)').attr('stroke-width',.3);

  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(world => {
    const countries = topojson.feature(world, world.objects.countries);
    mapG.selectAll('.country')
      .data(countries.features)
      .join('path')
      .attr('class', 'country')
      .attr('d', mapPath)
      .attr('fill', '#e8dcc8')
      .attr('stroke','#c0aa88').attr('stroke-width',.3)
      .on('click', (event, d) => {
        const a2 = NUM_TO_A2[String(d.id)];
        if(a2 && countryMap[a2]) selectCountry(a2, event);
      })
      .on('mouseover', (event, d) => {
        const a2 = NUM_TO_A2[String(d.id)];
        if(!a2 || !countryMap[a2]) return;
        showMapTooltip(event, a2);
      })
      .on('mousemove', (event) => moveMapTooltip(event))
      .on('mouseleave', () => hideMapTooltip());

    mapG.append('path')
      .datum(topojson.mesh(world, world.objects.countries, (a,b)=>a!==b))
      .attr('d', mapPath).attr('fill','none').attr('stroke','rgba(255,255,255,.55)').attr('stroke-width',.4);

    updateMapBubbles(); // colore les pays + place les bulles selon countryMap déjà chargé
  }).catch(err => {
    console.error('Erreur chargement carte:', err);
    const t=document.getElementById('sidebarTitle');
    if(t) t.textContent = 'Erreur chargement carte';
  });
}

/** Recolore les pays + repositionne les bulles selon countryMap COURANT
 *  (rappelée à chaque changement de mois, avec transition D3 fluide sur
 *  le rayon des bulles pour un rendu "site pro" plutôt qu'un rafraîchissement
 *  brutal). */
function updateMapBubbles(){
  if(!mapG) return;

  const maxVol = Math.max(...Object.values(countryMap).map(c=>c.total), 1);
  const colorScale = d3.scaleSequential().domain([0, maxVol]).interpolator(d3.interpolate('#e8dcc8', '#c9963a'));

  // Recolore chaque pays selon les données du mois/de la vue active.
  mapG.selectAll('.country')
    .classed('has-data', d => {
      const a2 = NUM_TO_A2[String(d.id)];
      return !!(a2 && countryMap[a2]);
    })
    .transition().duration(400)
    .attr('fill', d => {
      const a2 = NUM_TO_A2[String(d.id)];
      if(!a2 || !countryMap[a2]) return '#e8dcc8';
      return colorScale(countryMap[a2].total);
    });

  const bubbleData = Object.entries(CENTROIDS)
    .filter(([code]) => countryMap[code])
    .map(([code,[lon,lat]]) => ({ code, vol: countryMap[code].total||0, xy: mapProjection([lon, lat]) }))
    .filter(d => d.xy);

  const rScale = d3.scaleSqrt().domain([0, maxVol]).range([4, 28]);
  bubbleData.forEach(d => { d.rBase = rScale(d.vol); });

  const groups = mapG.selectAll('.bubble-group')
    .data(bubbleData, d=>d.code)
    .join(
      enter => {
        const g = enter.append('g').attr('class','bubble-group').style('cursor','pointer');
        g.append('circle')
          .attr('class','bubble')
          .attr('cx', d => d.xy[0]).attr('cy', d => d.xy[1])
          .attr('r', 0)
          .attr('fill', d => d.code===ACTIVE_COUNTRY ? 'rgba(201,150,58,.9)' : 'rgba(139,58,42,.72)')
          .attr('stroke','rgba(255,255,255,.7)').attr('stroke-width',1.2)
          .transition().duration(500).ease(d3.easeCubicOut)
          .attr('r', d => d.rBase);
        g.append('text')
          .attr('class','bubble-label')
          .attr('x', d=>d.xy[0]).attr('y', d=>d.xy[1])
          .text(d => bulleAssezGrandePourTexte(d.rBase) ? d.code : '')
          .style('font-size', d => tailleFontePourBulle(d.rBase) + 'px')
          .attr('fill','#fff').attr('text-anchor','middle').attr('dominant-baseline','central')
          .attr('pointer-events','none');
        return g;
      },
      update => {
        // Mois différent : la bulle existe déjà -> anime sa taille au lieu
        // de la recréer (transition fluide au changement de mois).
        update.select('.bubble')
          .transition().duration(500).ease(d3.easeCubicOut)
          .attr('r', d => d.rBase);
        update.select('.bubble-label')
          .transition().duration(500)
          .style('font-size', d => tailleFontePourBulle(d.rBase) + 'px');
        return update;
      },
      exit => exit
        .select('.bubble')
        .transition().duration(300)
        .attr('r', 0)
        .on('end', function(){ d3.select(this.parentNode).remove(); })
    );

  groups
    .on('mouseover', (event, d) => showMapTooltip(event, d.code))
    .on('mousemove', (event) => moveMapTooltip(event))
    .on('mouseleave', () => hideMapTooltip())
    .on('click', (event, d) => selectCountry(d.code, event));
}

function showMapTooltip(event, code){
  const info = PAYS_INFO[code]||{label:code,flag:'🌐'};
  const top3 = (countryMap[code]?.mots||[]).slice(0,4).map(m=>m.mot);
  const tt = document.getElementById('mapTooltip');
  if(!tt) return;
  tt.innerHTML = `<div class="tt-country">${info.flag} ${info.label}</div>
    <div class="tt-kw">🔑 ${top3.join(' &nbsp;·&nbsp; ')}</div>`;
  moveMapTooltip(event);
  tt.classList.add('show');
}
function moveMapTooltip(event){
  const container=document.getElementById('mapContainer');
  const tt = document.getElementById('mapTooltip');
  if(!container||!tt) return;
  const rect = container.getBoundingClientRect();
  let x = event.clientX - rect.left + 14;
  let y = event.clientY - rect.top - 10;
  if(x + 220 > rect.width) x -= 240;
  if(y + 80 > rect.height) y -= 90;
  tt.style.left = x + 'px'; tt.style.top = y + 'px';
}
function hideMapTooltip(){ const t=document.getElementById('mapTooltip'); if(t) t.classList.remove('show'); }

function selectCountry(code, event){
  if(event) event.stopPropagation();
  ACTIVE_COUNTRY = code;
  const info = PAYS_INFO[code]||{label:code,flag:'🌐'};
  const sorted = countryMap[code]?.mots||[];
  const maxV = sorted[0]?.poids||1;

  const titre=document.getElementById('sidebarTitle');
  // FIX : `info.flag` contient maintenant du HTML (une balise <img>, voir
  // getFlagImgHtml() dans data.js) et non plus un simple caractère emoji.
  // `textContent` affichait donc le tag <img ...> tel quel, en texte brut,
  // au lieu de rendre le drapeau. On utilise `innerHTML` ici (comme c'est
  // déjà le cas partout ailleurs : tooltip de la carte, cartes d'articles).
  if(titre) titre.innerHTML = `${info.flag} ${info.label}`;
  const barres=document.getElementById('sidebarBars');
  if(barres){
    barres.innerHTML = sorted.length ? sorted.map(({mot:w,poids:v})=>`
      <div class="bar-row">
        <span class="bar-label" title="${w}">${w}</span>
        <div class="bar-track"><div class="bar-fill" style="background:var(--teal)" data-w="${Math.round(v/maxV*100)}"></div></div>
        <span class="bar-count">${Math.round(v)}</span>
      </div>`).join('') : `<p style="color:var(--text-3);font-size:13px;">Aucune donnée pour ce mois.</p>`;
    animBars();
  }

  if(mapG){
    mapG.selectAll('.bubble').attr('fill', d => d.code===code ? 'rgba(201,150,58,.9)' : 'rgba(139,58,42,.72)');
    mapG.selectAll('.country').classed('active', d => NUM_TO_A2[String(d.id)]===code);
  }
  if(event) toast(`${info.flag} ${info.label} — ${sorted.length} mots-clés`);
}

function resetMapZoom(){
  if(mapZoom){
    d3.select('#worldMapSvg').transition().duration(600).call(mapZoom.transform, d3.zoomIdentity);
  }
}

/* ══ ÉVOLUTION ══════════════════════════════════════════════════════════ */
function traceEvolution(word){
  if(!word) return;
  EVO_WORD=word.toLowerCase().trim();
  const input=document.getElementById('evoInput');
  if(input) input.value=EVO_WORD;
  renderEvoChart();
  renderTopArticles(EVO_WORD);
}

/** Matching par inclusion plutôt qu'égalité stricte : "data" seul n'existe
 *  pas comme clé exacte dans key_word.json (seules des expressions comme
 *  "data mining"/"big data" y figurent) — sans ça, chercher "data" ne
 *  trouvait jamais rien dans MONTHLY_KW. */
function poidsMotDansMois(mot, kwMois) {
  if (!kwMois) return 0;
  let total = 0;
  Object.entries(kwMois).forEach(([k, v]) => { if (k.includes(mot)) total += v; });
  return total;
}

function renderEvoChart(){
  const vals = MONTH_ORDER.map(m => poidsMotDansMois(EVO_WORD, MONTHLY_KW[m]));
  const maxV = Math.max(...vals, 1);
  const hasData = vals.some(v=>v>0);

  const label=document.getElementById('evoLabel');
  if(label) label.innerHTML=hasData
    ?`Évolution de <strong style="color:var(--gold)">"${EVO_WORD}"</strong> sur ${MONTH_ORDER.length} mois`
    :`<span style="color:var(--rust)">Mot "<strong>${EVO_WORD}</strong>" non trouvé dans les données.</span>`;

  const chart=document.getElementById('evoChart');
  if(chart) chart.innerHTML=MONTH_ORDER.map((m,i)=>{
    const h=Math.max(4,Math.round((vals[i]/maxV)*100));
    const isActive=m===ACTIVE_MONTH;
    return `<div class="tl-col${isActive?' hi':''}" onclick="setMonth('${m}',${i})">
      <div class="tl-val" style="font-size:9px;color:var(--text-3);">${vals[i]>0?Math.round(vals[i]):'—'}</div>
      <div class="tl-bar" style="height:${h}px;${vals[i]>0?'background:var(--gold)':''}"></div>
      <div class="tl-lbl">${formatMonthLabelCourt(m)}</div>
    </div>`;
  }).join('');

  const note=document.getElementById('evoNote');
  if(note) note.textContent=hasData
    ?`Score = fréquence cumulée du mot (et des expressions qui le contiennent) dans les articles`
    :"Ce mot n'apparaît pas dans les données. Essayez un synonyme.";
}

function renderEvoSuggestions(){
  const c=document.getElementById('evoSuggestions');
  if(!c) return;
  const top=Object.entries(GLOBAL_KW).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([w])=>w);
  c.innerHTML=
    `<span style="font-size:12px;color:var(--text-3);margin-right:4px;">Suggestions :</span>`+
    top.map(w=>`<span class="kw-tag" onclick="traceEvolution('${w.replace(/'/g,"\\'")}')">${w}</span>`).join('');
}

function renderMultiEvo(){ /* single page — removed */ }

/* ══ ARTICLES ═══════════════════════════════════════════════════════════ */

/** Recherche/filtre fait côté serveur (mot-clé -> table `mot_articles`
 *  indexée, mois -> filtre SQL) au lieu de filtrer un tableau de 500 000
 *  articles en mémoire. Auteurs déjà embarqués dans la réponse. */
/** Résout une saisie libre (ex. "data") vers les mots-clés RÉELS du
 *  référentiel qui la contiennent (ex. "dataset", "data analysis", ...) --
 *  la même logique d'inclusion que poidsMotDansMois() utilise déjà pour la
 *  frise d'évolution. Égalité exacte prioritaire (cas le plus fréquent :
 *  clic direct sur un mot du nuage), sinon toutes les correspondances par
 *  inclusion. Sans cette résolution, chercher "data" ne trouvait aucun
 *  article (recherche exacte dans mot_articles) alors que la frise
 *  d'évolution affichait pourtant un score non nul pour ce même terme. */
function resoudreMotsCorrespondants(saisie){
  const s = (saisie || '').toLowerCase().trim();
  if (!s) return [];
  if (Object.prototype.hasOwnProperty.call(GLOBAL_KW, s)) return [s];
  return Object.keys(GLOBAL_KW).filter(m => m.includes(s));
}

async function renderTopArticles(keyword){
  const sub = document.getElementById('articlesSub');
  if(sub) sub.textContent = 'Recherche des articles…';

  let arts = [];
  try {
    if (keyword) {
      const motsCorrespondants = resoudreMotsCorrespondants(keyword);
      if (motsCorrespondants.length) {
        const resultats = await Promise.all(
          motsCorrespondants.map(m => fetchArticlesRecherche({ mot: m, mois: ACTIVE_MONTH || '', limite: 20 }))
        );
        // Fusionne les résultats des différents mots-clés correspondants
        // (un même article peut apparaître pour plusieurs), déduplique par
        // id, retrie par citations, garde le top 20 global.
        const parId = new Map();
        resultats.flat().forEach(a => { if (!parId.has(a.id)) parId.set(a.id, a); });
        const bruts = [...parId.values()].sort((a,b)=>(b.citations||0)-(a.citations||0)).slice(0,20);
        arts = bruts.map(normaliserArticle);
      }
      // Si aucun mot-clé du référentiel ne contient la saisie, `arts` reste
      // vide -- comportement correct (aucune expression réelle à chercher).
    } else {
      const bruts = await fetchArticlesRecherche({ mois: ACTIVE_MONTH || '', limite: 20 });
      arts = bruts.map(normaliserArticle);
    }
  } catch(err) {
    console.error(err);
    toast('Erreur pendant la recherche d\'articles');
  }

  CURRENT_ARTICLES = arts;
  updateArticlesHeader(keyword, arts.length);
  displayArticles(arts, keyword);
}

function updateArticlesHeader(keyword, count){
  const sub = document.getElementById('articlesSub');
  const btn = document.getElementById('resetArticlesBtn');
  if(keyword){
    if(sub) sub.innerHTML = `Articles contenant <strong style="color:var(--gold)">"${keyword}"</strong> · ${count} résultat${count!==1?'s':''}`;
    if(btn) btn.style.display = 'inline-block';
  } else {
    if(sub) sub.textContent = 'Sélection des articles à fort impact · cliquez sur un mot du nuage pour filtrer';
    if(btn) btn.style.display = 'none';
  }
}

function displayArticles(arts, keyword){
  const container=document.getElementById('topArticlesList');
  if(!container) return;
  if(!arts.length){
    container.innerHTML=
      `<div style="padding:2rem;text-align:center;color:var(--text-3);font-size:14px;">
        <div style="font-size:32px;opacity:.35;margin-bottom:10px;">🔍</div>
        Aucun article trouvé${keyword ? ` pour <strong>"${keyword}"</strong>` : ''} dans les données.
        <div style="margin-top:8px;font-size:12px;">Essayez un autre mot du nuage.</div>
      </div>`;
    return;
  }
  container.innerHTML = arts.map((a) => {
    const oa = a.id && a.id.startsWith('https://openalex.org/') ? a.id : null;
    const ax = `https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(a.titre)}`;
    const auths = (a.auteurs||[]).slice(0,3).map(au=>`<strong>${au.nom||'?'}</strong>`).join(', ');
    const pays  = (a.pays||[]).slice(0,3).map(p=>`<span class="meta-pill">${PAYS_INFO[p]?PAYS_INFO[p].flag+' '+p:p}</span>`).join('');
    const motsCles = Object.entries(a._kw).sort((x,y)=>y[1]-x[1]).slice(0,10).map(([w])=>w);
    return `<div class="article-card">
      <div class="article-title"><a href="${oa||ax}" target="_blank" rel="noopener">${a.titre}</a></div>
      ${auths?`<div class="article-authors">${auths}</div>`:''}
      <div class="meta-row">
        <span class="meta-pill date">📅 ${(a.date||'').slice(0,7)}</span>
        ${a.citations>0?`<span class="meta-pill cit">⭐ ${a.citations} citations</span>`:''}
        ${pays}
      </div>
      <div class="link-row">
        ${oa?`<a class="link-btn oa" href="${oa}" target="_blank" rel="noopener">🔗 OpenAlex</a>`:''}
        <a class="link-btn ax" href="${ax}" target="_blank" rel="noopener">📄 arXiv</a>
      </div>
      ${motsCles.length?`<div class="kw-row">${motsCles.map(kw=>{
        const isMatch = keyword && kw.toLowerCase().includes(keyword.toLowerCase());
        return `<span class="kw-tag" style="${isMatch?'background:var(--gold);color:#fff;border-color:var(--gold);':''}" onclick="onCloudClick('${kw.replace(/'/g,"\\'")}')">${kw}</span>`;
      }).join('')}</div>`:''}
    </div>`;
  }).join('');
  setTimeout(()=>document.querySelectorAll('.article-card:not(.visible)').forEach(el=>revObs.observe(el)),50);
}

function resetArticles(){
  EVO_WORD = null;
  document.querySelectorAll('.cloud-word').forEach(el=>el.classList.remove('selected'));
  const btn=document.getElementById('resetArticlesBtn');
  if(btn) btn.style.display='none';
  const label=document.getElementById('evoLabel');
  if(label) label.textContent='Saisissez un mot-clé ci-dessus ou cliquez sur le nuage.';
  const chart=document.getElementById('evoChart');
  if(chart) chart.innerHTML='';
  const note=document.getElementById('evoNote');
  if(note) note.textContent='';
  renderTopArticles();
}

/* ══ Export CSV ═════════════════════════════════════════════════════════ */
function exportArticlesCSV(){
  if(!CURRENT_ARTICLES.length){ showToast('Aucun article à exporter'); return; }
  const headers = ['Titre','Date','Auteurs','Pays','Citations','Mots-clés','URL OpenAlex','URL arXiv'];
  const rows = CURRENT_ARTICLES.map(a => [
    `"${(a.titre||'').replace(/"/g,'""')}"`,
    a.date || '',
    `"${(a.auteurs||[]).map(au=>au.nom||'?').join(';')}"`,
    `"${(a.pays||[]).join(';')}"`,
    a.citations || 0,
    `"${Object.keys(a._kw).join(';')}"`,
    a.id || '',
    `"https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(a.titre)}"`,
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = `articles_${EVO_WORD ? EVO_WORD + '_' : ''}${new Date().toISOString().slice(0,10)}.csv`;
  el.click();
  URL.revokeObjectURL(url);
  showToast(`✓ ${CURRENT_ARTICLES.length} articles exportés en CSV`);
}

/* ══ Init (page unique) ═════════════════════════════════════════════════ */
async function initApp() {
  toast('Chargement des données…', 1800);
  await chargerReferentiel();

  try {
    const agregats = await fetchAgregatsNuage();
    MONTHLY_KW = agregats.par_mois || {};
    GLOBAL_KW  = agregats.global || {};
    MONTH_ORDER = Object.keys(MONTHLY_KW).sort();
    ARTICLES_PAR_MOIS = agregats.articles_par_mois || {};
    DERIVED_STATS.total_articles  = agregats.total_articles  || 0;
    DERIVED_STATS.total_citations = agregats.total_citations || 0;
    DERIVED_STATS.total_mois      = MONTH_ORDER.length;
  } catch(e) {
    console.error('Erreur lors du chargement des agrégats', e);
    toast('⚠ API indisponible — vérifie que le backend Flask est démarré');
  }

  ACTIVE_MONTH = '';
  initMonthPills();
  renderCloud(ACTIVE_MONTH);
  renderStatStrip();
  renderEvoSuggestions();
  await renderTopArticles();
  await loadPaysEtCarte();       // charge global + par_mois une seule fois
  setTimeout(renderMap, 100);
}
initApp();

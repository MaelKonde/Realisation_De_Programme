/*
Nom........ : app.js
Description : config.js (APP_CONFIG), data.js (CENTROIDS, PAYS_INFO), et
              key_word.json (référentiel de mots-clés, servi statiquement à côté de
              index.html — même dépôt que le front). Ces fichiers doivent être
              chargés AVANT celui-ci dans index.html.
Usage...... : Charger après data.js et config.js
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
async function fetchCompteArticles() {
  const r = await fetch(`${API}/articles/count`);
  if (!r.ok) throw new Error(`API ${r.status} sur /articles/count`);
  return (await r.json()).total;
}
async function fetchPageArticles(numero, taille) {
  const r = await fetch(`${API}/articles/page/${numero}?taille=${taille}`);
  if (!r.ok) throw new Error(`API ${r.status} sur /articles/page/${numero}`);
  return r.json();
}

const _authCache = {};
function fetchAuteurs(idArticle) {
  if (_authCache[idArticle]) return _authCache[idArticle];
  const p = fetch(`${API}/auteurs/${encodeURIComponent(idArticle)}`)
    .then(r => { if (!r.ok) throw new Error(`API ${r.status} sur /auteurs`); return r.json(); })
    .catch(err => { console.error(err); return []; });
  _authCache[idArticle] = p;
  return p;
}

/** Lance `worker(item)` sur chaque élément de `items`, au plus `concurrency`
 *  en parallèle — nécessaire aussi bien pour la pagination des articles que
 *  pour /auteurs/<id> (un appel par article). */
async function avecConcurrenceLimitee(items, worker, concurrency = 6) {
  const resultats = new Array(items.length);
  let curseur = 0;
  async function travailleur() {
    while (curseur < items.length) {
      const i = curseur++;
      resultats[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, travailleur));
  return resultats;
}

/** Charge TOUS les articles par petites pages plutôt qu'en un seul appel
 *  géant (voir le commentaire en tête de fichier). */
async function fetchTousLesArticles(onProgress) {
  const taille = APP_CONFIG.TAILLE_PAGE_ARTICLES;
  const total = await fetchCompteArticles();
  const nbPages = Math.max(1, Math.ceil(total / taille));
  const numerosDePage = Array.from({ length: nbPages }, (_, i) => i);

  let charges = 0;
  const pages = await avecConcurrenceLimitee(numerosDePage, async (numero) => {
    const page = await fetchPageArticles(numero, taille);
    charges += page.length;
    if (onProgress) onProgress(charges, total);
    return page;
  }, APP_CONFIG.CONCURRENCE_PAGES);

  return pages.flat();
}

/* ══ État applicatif ═══════════════════════════════════════════════════ */
let ARTICLES        = [];  // tous les articles, normalisés + _kw calculé
let MONTHLY_KW       = {}; // { "2025-03": {mot:poids}, ... }
let GLOBAL_KW        = {}; // agrégat tous mois confondus
let MONTH_ORDER      = [];
let countryMap       = {}; // { code: {total, mots:[{mot,poids}]} } — échantillon
let DERIVED_STATS    = { total_articles: 0, total_citations: 0, total_mois: 0, total_pays: null };

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

function normaliserArticle(raw) {
  return {
    id: raw.id,
    titre: raw.titre || 'Sans titre',
    date: raw.date || '',
    mois: (raw.date || '').slice(0, 7),
    langue: raw.langue || 'en',
    citations: raw.citations || 0,
    _kw: extraireMotsArticle(raw.index_inverse_compte),
    auteurs: null,   // rempli à la demande via fetchAuteurs()
    pays: [],
  };
}

function construireAgregats() {
  MONTHLY_KW = {};
  ARTICLES.forEach(a => {
    if (!a.mois) return;
    MONTHLY_KW[a.mois] = MONTHLY_KW[a.mois] || {};
    Object.entries(a._kw).forEach(([w, c]) => {
      MONTHLY_KW[a.mois][w] = (MONTHLY_KW[a.mois][w] || 0) + c;
    });
  });
  MONTH_ORDER = Object.keys(MONTHLY_KW).sort();

  GLOBAL_KW = {};
  Object.values(MONTHLY_KW).forEach(kw => {
    Object.entries(kw).forEach(([w, c]) => { GLOBAL_KW[w] = (GLOBAL_KW[w] || 0) + c; });
  });
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

function toast(msg,d=2400){const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),d);}
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
  document.getElementById('statStrip').innerHTML=`
    <div class="stat-card"><div class="stat-label">Articles chargés</div>
      <div class="stat-val g" id="sc-tot">0</div><div class="stat-note">arXiv via OpenAlex</div></div>
    <div class="stat-card"><div class="stat-label">Mois couverts</div>
      <div class="stat-val">${DERIVED_STATS.total_mois}</div></div>
    <div class="stat-card"><div class="stat-label">Pays (échantillon)</div>
      <div class="stat-val">${totalPaysAffiche}</div></div>
    <div class="stat-card"><div class="stat-label">Mot top (${ACTIVE_MONTH?formatMonthLabel(ACTIVE_MONTH):'tous les mois'})</div>
      <div class="stat-val" style="font-size:1rem;padding-top:3px;font-style:italic;">${topKW}</div></div>
  `;
  setTimeout(()=>animCount(document.getElementById('sc-tot'),DERIVED_STATS.total_articles),80);
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

function setMonth(m,i){
  ACTIVE_MONTH=m;
  document.querySelectorAll('.m-pill').forEach((b,j)=>b.classList.toggle('active',j===i+1));
  renderCloud(m);
  renderStatStrip();
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

/** Construit countryMap à partir d'un ÉCHANTILLON (les articles les plus
 *  cités, toutes dates confondues) — voir le commentaire en tête de
 *  fichier pour pourquoi on ne peut pas le faire sur tous les articles. */
async function loadPaysEtCarte(){
  const echantillon = [...ARTICLES].sort((a,b)=>b.citations-a.citations)
    .slice(0, APP_CONFIG.NB_ARTICLES_POUR_CARTE_PAYS);

  let traites = 0;
  try {
    await avecConcurrenceLimitee(echantillon, async (a) => {
      a.auteurs = await fetchAuteurs(a.id);
      a.pays = [...new Set(a.auteurs.map(au=>au.pays).filter(Boolean))];
      traites++;
      if (traites % 200 === 0) toast(`Chargement de la carte… ${traites}/${echantillon.length} articles`, 1200);
    }, APP_CONFIG.CONCURRENCE_AUTEURS_CARTE);
  } catch(err) {
    console.error(err);
    toast('Erreur pendant le chargement des pays (auteurs)');
  }

  countryMap = {};
  echantillon.forEach(a => {
    a.pays.forEach(code => {
      countryMap[code] = countryMap[code] || { total: 0, _kw: {} };
      countryMap[code].total += 1;
      Object.entries(a._kw).forEach(([w,c])=>{
        countryMap[code]._kw[w] = (countryMap[code]._kw[w]||0)+c;
      });
    });
  });
  Object.values(countryMap).forEach(c=>{
    c.mots = Object.entries(c._kw).sort((a,b)=>b[1]-a[1]).slice(0,14).map(([mot,poids])=>({mot,poids}));
    delete c._kw;
  });

  DERIVED_STATS.total_pays = Object.keys(countryMap).length;
  renderStatStrip();

  if(!ACTIVE_COUNTRY){
    const premier = Object.entries(countryMap).sort((a,b)=>b[1].total-a[1].total)[0];
    if(premier) ACTIVE_COUNTRY = premier[0];
  }
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

    const maxVol = Math.max(...Object.values(countryMap).map(c=>c.total), 1);
    const colorScale = d3.scaleSequential().domain([0, maxVol]).interpolator(d3.interpolate('#e8dcc8', '#c9963a'));

    mapG.selectAll('.country')
      .data(countries.features)
      .join('path')
      .attr('class', d => {
        const a2 = NUM_TO_A2[String(d.id)];
        return 'country' + (a2 && countryMap[a2] ? ' has-data' : '');
      })
      .attr('d', mapPath)
      .attr('fill', d => {
        const a2 = NUM_TO_A2[String(d.id)];
        if(!a2 || !countryMap[a2]) return '#e8dcc8';
        return colorScale(countryMap[a2].total);
      })
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

    updateMapBubbles();
  }).catch(err => {
    console.error('Erreur chargement carte:', err);
    const t=document.getElementById('sidebarTitle');
    if(t) t.textContent = 'Erreur chargement carte';
  });
}

function updateMapBubbles(){
  if(!mapG) return;
  mapG.selectAll('.bubble-group').remove();

  const maxVol = Math.max(...Object.values(countryMap).map(c=>c.total), 1);

  const bubbleData = Object.entries(CENTROIDS)
    .filter(([code]) => countryMap[code])
    .map(([code,[lon,lat]]) => ({ code, vol: countryMap[code].total||0, xy: mapProjection([lon, lat]) }))
    .filter(d => d.xy);

  const rScale = d3.scaleSqrt().domain([0, maxVol]).range([4, 28]);
  bubbleData.forEach(d => { d.rBase = rScale(d.vol); });

  const groups = mapG.selectAll('.bubble-group')
    .data(bubbleData, d=>d.code)
    .join('g')
    .attr('class','bubble-group')
    .style('cursor','pointer');

  groups.append('circle')
    .attr('class','bubble')
    .attr('cx', d => d.xy[0]).attr('cy', d => d.xy[1])
    .attr('r', 0)
    .attr('fill', d => d.code===ACTIVE_COUNTRY ? 'rgba(201,150,58,.9)' : 'rgba(139,58,42,.72)')
    .attr('stroke','rgba(255,255,255,.7)').attr('stroke-width',1.2)
    .transition().duration(600).ease(d3.easeCubicOut)
    .attr('r', d => d.rBase);

  groups.append('text')
    .attr('class','bubble-label')
    .attr('x', d=>d.xy[0]).attr('y', d=>d.xy[1])
    .text(d => bulleAssezGrandePourTexte(d.rBase) ? d.code : '')   // état initial (zoom = x1)
    .style('font-size', d => tailleFontePourBulle(d.rBase) + 'px')
    .attr('fill','#fff').attr('text-anchor','middle').attr('dominant-baseline','central')
    .attr('pointer-events','none');

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
  if(titre) titre.textContent = `${info.flag} ${info.label}`;
  const barres=document.getElementById('sidebarBars');
  if(barres){
    barres.innerHTML = sorted.map(({mot:w,poids:v})=>`
      <div class="bar-row">
        <span class="bar-label" title="${w}">${w}</span>
        <div class="bar-track"><div class="bar-fill" style="background:var(--teal)" data-w="${Math.round(v/maxV*100)}"></div></div>
        <span class="bar-count">${Math.round(v)}</span>
      </div>`).join('');
    animBars();
  }

  if(mapG){
    mapG.selectAll('.bubble').attr('fill', d => d.code===code ? 'rgba(201,150,58,.9)' : 'rgba(139,58,42,.72)');
    mapG.selectAll('.country').classed('active', d => NUM_TO_A2[String(d.id)]===code);
  }
  toast(`${info.flag} ${info.label} — ${sorted.length} mots-clés`);
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
    ?`Score = fréquence cumulée du mot (et des expressions qui le contiennent) dans les articles chargés du mois`
    :"Ce mot n'apparaît pas dans les données chargées. Essayez un synonyme.";
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
async function renderTopArticles(keyword){
  const sub = document.getElementById('articlesSub');
  if(sub) sub.textContent = 'Recherche des articles…';

  let arts = ACTIVE_MONTH ? ARTICLES.filter(a=>a.mois===ACTIVE_MONTH) : ARTICLES;
  if(keyword){
    const kw = keyword.toLowerCase();
    arts = arts.filter(a => (kw in a._kw) || (a.titre||'').toLowerCase().includes(kw));
  }
  arts = [...arts].sort((a,b)=>b.citations-a.citations).slice(0,20);

  try {
    await avecConcurrenceLimitee(arts.filter(a=>a.auteurs===null), async (a) => {
      a.auteurs = await fetchAuteurs(a.id);
      a.pays = [...new Set(a.auteurs.map(au=>au.pays).filter(Boolean))];
    }, 6);
  } catch(err) { console.error(err); }

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
        Aucun article trouvé${keyword ? ` pour <strong>"${keyword}"</strong>` : ''} dans les données chargées.
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
    const bruts = await fetchTousLesArticles((n, total) => {
      toast(`Chargement des articles… ${n}/${total}`, 1500);
    });
    ARTICLES = bruts.map(normaliserArticle);
  } catch(e) {
    console.error('Erreur lors du chargement des articles', e);
    ARTICLES = [];
    toast('⚠ API indisponible — vérifie que le backend Flask est démarré');
  }

  construireAgregats();
  DERIVED_STATS.total_articles  = ARTICLES.length;
  DERIVED_STATS.total_citations = ARTICLES.reduce((s,a)=>s+(a.citations||0),0);
  DERIVED_STATS.total_mois      = MONTH_ORDER.length;

  ACTIVE_MONTH = '';
  initMonthPills();
  renderCloud(ACTIVE_MONTH);
  renderStatStrip();
  renderEvoSuggestions();
  await renderTopArticles();
  await loadPaysEtCarte();       // met aussi à jour total_pays + renderStatStrip()
  setTimeout(renderMap, 100);
}
initApp();

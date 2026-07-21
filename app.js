/* ══════════════════════════════════════════════════════════════════════
   LOGIQUE APPLICATIVE — Tendances Scientifiques (agrégation SERVEUR)
   ══════════════════════════════════════════════════════════════════════
   Dépend de : config.js (APP_CONFIG.BACKEND_API_URL) et data.js
   (CENTROIDS, PAYS_INFO). Ces deux fichiers doivent être chargés AVANT
   celui-ci dans index.html.

   ⚠ Toute la logique de calcul (nuage de mots via key_word.json, carte
   par pays, évolution, suggestions, stats) est faite CÔTÉ SERVEUR
   (api_flask.py), pas ici. Le navigateur ne télécharge jamais les
   articles bruts en masse — chaque vue appelle un endpoint qui renvoie
   directement un petit résultat déjà agrégé. C'est indispensable pour
   rester réactif avec ~500 000 articles en base (voir la conversation :
   l'ancienne architecture "tout calculer dans le navigateur" prenait
   plusieurs minutes à charger).
   ══════════════════════════════════════════════════════════════════════ */

const API = APP_CONFIG.BACKEND_API_URL;

async function requeteApi(chemin, params) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  const r = await fetch(`${API}${chemin}${qs}`);
  if (!r.ok) throw new Error(`API ${r.status} sur ${chemin}`);
  return r.json();
}
const fetchMois          = ()              => requeteApi('/api/mois');
const fetchMotsCles      = (mois = '')     => requeteApi('/api/mots-cles', mois ? { mois } : {});
const fetchPays          = ()              => requeteApi('/api/pays');
const fetchEvolution     = (mot)           => requeteApi('/api/evolution', { mot });
const fetchArticlesTop   = (mot, limit=20) => requeteApi('/api/articles-top', mot ? { mot, limit } : { limit });
const fetchSuggestions   = ()              => requeteApi('/api/suggestions');
const fetchStatsGlobales = ()              => requeteApi('/api/stats-globales');

/* État applicatif */
let MONTH_ORDER      = [];
let STATS_GLOBALES   = { total_articles: 0, total_citations: 0, total_pays: 0, total_mois: 0 };
let ACTIVE_MONTH     = '';
let ACTIVE_COUNTRY   = null;
let EVO_WORD         = null;
let currentCloudMots = [];
let CURRENT_ARTICLES = [];

const MOIS_FR = ['Janv', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
function formatMonthLabel(moisIso) {
  if (!moisIso) return moisIso;
  const [annee, m] = moisIso.split('-');
  const idx = parseInt(m, 10) - 1;
  if (!annee || Number.isNaN(idx) || idx < 0 || idx > 11) return moisIso;
  return `${MOIS_FR[idx]} ${annee}`;
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
  const topKW = currentCloudMots[0]?.mot || '—';
  document.getElementById('statStrip').innerHTML=`
    <div class="stat-card"><div class="stat-label">Articles collectés</div>
      <div class="stat-val g" id="sc-tot">0</div><div class="stat-note">arXiv via OpenAlex</div></div>
    <div class="stat-card"><div class="stat-label">Mois couverts</div>
      <div class="stat-val">${STATS_GLOBALES.total_mois}</div></div>
    <div class="stat-card"><div class="stat-label">Pays avec données</div>
      <div class="stat-val">${STATS_GLOBALES.total_pays}</div></div>
    <div class="stat-card"><div class="stat-label">Mot top (${ACTIVE_MONTH ? formatMonthLabel(ACTIVE_MONTH) : 'tous les mois'})</div>
      <div class="stat-val" style="font-size:1rem;padding-top:3px;font-style:italic;">${topKW}</div></div>
  `;
  setTimeout(()=>animCount(document.getElementById('sc-tot'),STATS_GLOBALES.total_articles),80);
}

/* ══ Cloud ═════════════════════════════════════════════════════════════ */
async function renderCloud(mois){
  const wrap=document.getElementById('cloudMain');
  wrap.classList.add('fading');
  try {
    const data = await fetchMotsCles(mois);
    currentCloudMots = data.mots || [];
    setTimeout(()=>{
      if(!currentCloudMots.length){wrap.innerHTML='<p style="color:var(--text-3);font-size:13px;">Aucune donnée.</p>';wrap.classList.remove('fading');return;}
      const maxF=currentCloudMots[0].poids;
      wrap.innerHTML=currentCloudMots.map(({mot:w,poids:f})=>{
        const size=11+Math.round((f/maxF)*20);
        const op=(.38+(f/maxF)*.62).toFixed(2);
        const isEvo=w===EVO_WORD;
        return `<span class="cloud-word${isEvo?' selected':''}" style="font-size:${size}px;opacity:${op}"
          onclick="onCloudClick('${w.replace(/'/g,"\\'")}')" title="${w}: score ${Math.round(f)}">${w}</span>`;
      }).join('');
      wrap.classList.remove('fading');
    },180);
  } catch(err) {
    console.error(err);
    wrap.innerHTML='<p style="color:var(--rust);font-size:13px;">Erreur de chargement du nuage (API indisponible).</p>';
    wrap.classList.remove('fading');
  }
}

function onCloudClick(word){
  EVO_WORD=word;
  document.querySelectorAll('.cloud-word').forEach(el=>{
    el.classList.toggle('selected',el.textContent===word);
  });
  traceEvolution(word);
  document.getElementById('evoInput').value=word;
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
  renderCloud(m).then(renderStatStrip);
  if(EVO_WORD) renderEvoChart();
}

function renderCompare(){ /* single page — removed */ }

/* ══ CARTE DU MONDE D3 ══════════════════════════════════════════════════ */
let mapInitialized = false;
let mapProjection, mapPath, mapSvg, mapG, mapZoom;
let countryMap = {}; // { code: { total, mots:[{mot,poids}] } } — depuis /api/pays

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

async function loadPaysEtCarte(){
  try {
    const data = await fetchPays();
    countryMap = {};
    (data.pays || []).forEach(p => { countryMap[p.code] = { total: p.total, mots: p.mots || [] }; });
    if(!ACTIVE_COUNTRY){
      const premier = (data.pays||[])[0];
      if(premier) ACTIVE_COUNTRY = premier.code;
    }
  } catch(err) {
    console.error(err);
    toast('Impossible de charger la carte des pays (API indisponible)');
  }
}

function renderMap(){
  if(mapInitialized){ updateMapBubbles(); return; }
  mapInitialized = true;

  const container = document.getElementById('mapContainer');
  const W = container.clientWidth || 700;
  const H = Math.round(W * 0.52);

  const svg = d3.select('#worldMapSvg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', W).attr('height', H);

  mapProjection = d3.geoNaturalEarth1().scale(W / 6.5).translate([W/2, H/2]);
  mapPath = d3.geoPath().projection(mapProjection);

  mapZoom = d3.zoom().scaleExtent([1, 8]).on('zoom', (event) => mapG.attr('transform', event.transform));
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
    document.getElementById('sidebarTitle').textContent = 'Erreur chargement carte';
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
    .attr('r', d => rScale(d.vol));

  groups.append('text')
    .attr('class','bubble-label')
    .attr('x', d=>d.xy[0]).attr('y', d=>d.xy[1])
    .text(d => rScale(d.vol) > 13 ? d.code : '')
    .attr('font-size', d => rScale(d.vol) > 18 ? '8' : '6')
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
  const kws  = (countryMap[code]?.mots)||[];
  const top3 = kws.slice(0,4).map(m=>m.mot);
  const tt   = document.getElementById('mapTooltip');
  tt.innerHTML = `<div class="tt-country">${info.flag} ${info.label}</div>
    <div class="tt-kw">🔑 ${top3.join(' &nbsp;·&nbsp; ')}</div>`;
  moveMapTooltip(event);
  tt.classList.add('show');
}
function moveMapTooltip(event){
  const rect = document.getElementById('mapContainer').getBoundingClientRect();
  const tt   = document.getElementById('mapTooltip');
  let x = event.clientX - rect.left + 14;
  let y = event.clientY - rect.top  - 10;
  if(x + 220 > rect.width)  x -= 240;
  if(y + 80  > rect.height) y -= 90;
  tt.style.left = x + 'px';
  tt.style.top  = y + 'px';
}
function hideMapTooltip(){
  document.getElementById('mapTooltip').classList.remove('show');
}

function selectCountry(code, event){
  if(event) event.stopPropagation();
  ACTIVE_COUNTRY = code;
  const info = PAYS_INFO[code]||{label:code,flag:'🌐'};
  const sorted = (countryMap[code]?.mots)||[];
  const maxV   = sorted[0]?.poids||1;

  document.getElementById('sidebarTitle').textContent = `${info.flag} ${info.label}`;
  document.getElementById('sidebarBars').innerHTML = sorted.map(({mot:w,poids:v})=>`
    <div class="bar-row">
      <span class="bar-label" title="${w}">${w}</span>
      <div class="bar-track"><div class="bar-fill" style="background:var(--teal)" data-w="${Math.round(v/maxV*100)}"></div></div>
      <span class="bar-count">${Math.round(v)}</span>
    </div>`).join('');
  animBars();

  if(mapG){
    mapG.selectAll('.bubble').attr('fill', d =>
      d.code===code ? 'rgba(201,150,58,.9)' : 'rgba(139,58,42,.72)');
    mapG.selectAll('.country').classed('active', d => NUM_TO_A2[String(d.id)]===code);
  }
  toast(`${info.flag} ${info.label} — ${sorted.length} mots-clés`);
}

function resetMapZoom(){
  if(mapZoom){
    d3.select('#worldMapSvg')
      .transition().duration(600)
      .call(mapZoom.transform, d3.zoomIdentity);
  }
}

/* ══ ÉVOLUTION ══════════════════════════════════════════════════════════ */
async function traceEvolution(word){
  if(!word) return;
  EVO_WORD=word.toLowerCase().trim();
  document.getElementById('evoInput').value=EVO_WORD;

  const chart=document.getElementById('evoChart');
  chart.innerHTML='<p style="opacity:.6;font-size:13px;">Chargement…</p>';

  try {
    const data = await fetchEvolution(EVO_WORD);
    currentEvoSerie = data.serie || [];
    renderEvoChart();
    await renderTopArticles(EVO_WORD);
  } catch(err) {
    console.error(err);
    toast("Erreur lors du calcul de l'évolution (API indisponible)");
  }
}
let currentEvoSerie = [];

function renderEvoChart(){
  const vals = currentEvoSerie.map(s=>s.poids);
  const maxV = Math.max(...vals, 1);
  const hasData = vals.some(v=>v>0);

  document.getElementById('evoLabel').innerHTML=hasData
    ?`Évolution de <strong style="color:var(--gold)">"${EVO_WORD}"</strong> sur ${currentEvoSerie.length} mois`
    :`<span style="color:var(--rust)">Mot "<strong>${EVO_WORD}</strong>" non trouvé dans les données.</span>`;

  document.getElementById('evoChart').innerHTML=currentEvoSerie.map((s,i)=>{
    const h=Math.max(4,Math.round((s.poids/maxV)*100));
    const isActive=s.mois===ACTIVE_MONTH;
    return `<div class="tl-col${isActive?' hi':''}" onclick="setMonth('${s.mois}',${i})">
      <div class="tl-val" style="font-size:9px;color:var(--text-3);">${s.poids>0?Math.round(s.poids):'—'}</div>
      <div class="tl-bar" style="height:${h}px;${s.poids>0?'background:var(--gold)':''}"></div>
      <div class="tl-lbl">${formatMonthLabel(s.mois).slice(0,7)}</div>
    </div>`;
  }).join('');

  document.getElementById('evoNote').textContent=hasData
    ?`Score = fréquence cumulée du mot dans les articles les plus cités du mois (échantillon)`
    :"Ce mot n'apparaît pas dans les mois disponibles. Essayez un synonyme.";
}

async function renderEvoSuggestions(){
  try {
    const data = await fetchSuggestions();
    const top = data.suggestions || [];
    document.getElementById('evoSuggestions').innerHTML=
      `<span style="font-size:12px;color:var(--text-3);margin-right:4px;">Suggestions :</span>`+
      top.map(w=>`<span class="kw-tag" onclick="traceEvolution('${w.replace(/'/g,"\\'")}')">${w}</span>`).join('');
  } catch(err) {
    console.error(err);
  }
}

function renderMultiEvo(){ /* single page — removed */ }

/* ══ ARTICLES ═══════════════════════════════════════════════════════════ */
async function renderTopArticles(keyword){
  const sub = document.getElementById('articlesSub');
  if(sub) sub.textContent = 'Chargement depuis la base de données…';
  try {
    const data = await fetchArticlesTop(keyword, 20);
    CURRENT_ARTICLES = data.articles || [];
    updateArticlesHeader(keyword, CURRENT_ARTICLES.length);
    displayArticles(CURRENT_ARTICLES, keyword);
  } catch(err) {
    console.error(err);
    if(sub) sub.innerHTML = `<span style="color:var(--rust);">Erreur API : ${err.message}</span>`;
    displayArticles([], keyword);
  }
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

function urlArticle(id){
  if(!id) return null;
  const valeur = String(id).trim();
  if(/^https?:\/\//i.test(valeur)) return valeur;
  if(/^\d{4}\.\d{4,5}(v\d+)?$/.test(valeur)) return `https://arxiv.org/abs/${valeur}`;
  if(/^[a-z-]+\/\d{7}$/i.test(valeur)) return `https://arxiv.org/abs/${valeur}`;
  if(/^W\d+$/i.test(valeur)) return `https://openalex.org/${valeur}`;
  return null;
}

function displayArticles(arts, keyword){
  if(!arts.length){
    document.getElementById('topArticlesList').innerHTML=
      `<div style="padding:2rem;text-align:center;color:var(--text-3);font-size:14px;">
        <div style="font-size:32px;opacity:.35;margin-bottom:10px;">🔍</div>
        Aucun article trouvé${keyword ? ` pour <strong>"${keyword}"</strong>` : ''} dans les données chargées.
        <div style="margin-top:8px;font-size:12px;">Essayez un autre mot du nuage.</div>
      </div>`;
    return;
  }
  document.getElementById('topArticlesList').innerHTML = arts.map((a) => {
    const oa = urlArticle(a.id);
    const ax = `https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(a.titre||'')}`;
    const auths = (a.auteurs||[]).slice(0,3).map(au=>`<strong>${au.nom||'?'}</strong>`).join(', ');
    const paysListe = a.pays && a.pays.length ? a.pays : [...new Set((a.auteurs||[]).map(au=>au.pays).filter(Boolean))];
    const pays  = paysListe.slice(0,3).map(p=>`<span class="meta-pill">${PAYS_INFO[p]?PAYS_INFO[p].flag+' '+p:p}</span>`).join('');
    return `<div class="article-card">
      <div class="article-title"><a href="${oa||ax}" target="_blank" rel="noopener">${a.titre||'Sans titre'}</a></div>
      <div class="article-authors">${auths}</div>
      <div class="meta-row">
        <span class="meta-pill date">📅 ${(a.date||'').slice(0,7)||'date inconnue'}</span>
        ${a.citations>0?`<span class="meta-pill cit">⭐ ${a.citations} citations</span>`:''}
        ${pays}
      </div>
      <div class="link-row">
        ${oa?`<a class="link-btn oa" href="${oa}" target="_blank" rel="noopener">🔗 OpenAlex</a>`:''}
        <a class="link-btn ax" href="${ax}" target="_blank" rel="noopener">📄 arXiv</a>
      </div>
      ${(a.mots_cles||[]).length?`<div class="kw-row">${a.mots_cles.map(kw=>{
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
  document.getElementById('resetArticlesBtn').style.display='none';
  document.getElementById('evoLabel').textContent='Saisissez un mot-clé ci-dessus ou cliquez sur le nuage.';
  document.getElementById('evoChart').innerHTML='';
  document.getElementById('evoNote').textContent='';
  currentEvoSerie = [];
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
    `"${(a.pays||(a.auteurs||[]).map(au=>au.pays)||[]).join(';')}"`,
    a.citations || 0,
    `"${(a.mots_cles||[]).join(';')}"`,
    urlArticle(a.id) || '',
    `"https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(a.titre||'')}"`,
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const el   = document.createElement('a');
  el.href = url;
  el.download = `articles_${EVO_WORD ? EVO_WORD + '_' : ''}${new Date().toISOString().slice(0,10)}.csv`;
  el.click();
  URL.revokeObjectURL(url);
  showToast(`✓ ${CURRENT_ARTICLES.length} articles exportés en CSV`);
}

/* ══ Init (page unique) ═════════════════════════════════════════════════ */
async function initApp() {
  toast('Chargement des données depuis l’API…', 1800);

  try {
    const [moisData, statsData] = await Promise.all([fetchMois(), fetchStatsGlobales()]);
    MONTH_ORDER    = moisData.mois || [];
    STATS_GLOBALES = statsData;
  } catch(e) {
    console.error('Erreur lors du chargement initial', e);
    toast('⚠ API indisponible — vérifie que le backend Flask est démarré et que bdd.db est bien téléchargée');
  }

  ACTIVE_MONTH = '';
  initMonthPills();
  await renderCloud(ACTIVE_MONTH);
  renderStatStrip();
  await loadPaysEtCarte();
  renderEvoSuggestions();
  await renderTopArticles();
  setTimeout(renderMap, 100);
}
initApp();

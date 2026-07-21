/* ══════════════════════════════════════════════════════════════════════
   LOGIQUE APPLICATIVE — Tendances Scientifiques
   ══════════════════════════════════════════════════════════════════════
   Dépend de : config.js (APP_CONFIG), data.js (PAYS_INFO — utilisé si des
   auteurs/pays arrivent à être résolus, voir plus bas).

   ⚠ PÉRIMÈTRE RÉEL avec l'API minimale (api_flask.py, 2 routes) :
   - /articles/<limite> ne renvoie NI index_inverse_compte NI les auteurs
     → aucune donnée de mots-clés n'existe côté front. Nuage de mots,
     carte par pays, évolution temporelle et suggestions sont donc
     IMPOSSIBLES avec ce fichier — ces sections affichent un message
     explicite plutôt que de faire semblant de fonctionner.
   - /auteurs/<id_article> utilise un convertisseur Flask qui ne matche
     pas les "/" : comme un id réel est une URL OpenAlex complète
     (https://openalex.org/W123...), cette route renvoie 404 pour
     pratiquement tous les articles réels. Le code ci-dessous gère ça
     silencieusement (aucun auteur affiché plutôt qu'une erreur visible),
     mais c'est un vrai manque de données, pas un bug du front.
   - Ce qui MARCHE réellement : la liste des articles (titre, date, langue,
     citations), filtrable par mois (calculé à partir du champ `date`) et
     par titre (recherche texte simple, réutilisant le champ de recherche
     prévu pour "l'évolution").
   ══════════════════════════════════════════════════════════════════════ */

const API = APP_CONFIG.BACKEND_API_URL;

let ARTICLES        = [];  // tous les articles chargés
let MONTH_ORDER      = [];
let ACTIVE_MONTH     = '';
let FILTRE_TITRE     = null;
let CURRENT_ARTICLES = [];

const MOIS_FR = ['Janv', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
function formatMonthLabel(moisIso) {
  if (!moisIso) return moisIso;
  const [annee, m] = moisIso.split('-');
  const idx = parseInt(m, 10) - 1;
  if (!annee || Number.isNaN(idx) || idx < 0 || idx > 11) return moisIso;
  return `${MOIS_FR[idx]} ${annee}`;
}

/* ══ Accès API ═════════════════════════════════════════════════════════ */
async function fetchArticlesBruts(limite) {
  const r = await fetch(`${API}/articles/${limite}`);
  if (!r.ok) throw new Error(`API ${r.status} sur /articles/${limite}`);
  return r.json();
}

const _authCache = {};
function fetchAuteurs(idArticle) {
  if (_authCache[idArticle]) return _authCache[idArticle];
  const p = fetch(`${API}/auteurs/${encodeURIComponent(idArticle)}`)
    .then(r => { if (!r.ok) return []; return r.json(); })   // 404 attendu pour les ids réels — pas une erreur à afficher
    .catch(() => []);
  _authCache[idArticle] = p;
  return p;
}

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

function normaliserArticle(raw) {
  return {
    id: raw.id,
    titre: raw.titre || 'Sans titre',
    date: raw.date || '',
    mois: (raw.date || '').slice(0, 7),
    langue: raw.langue || 'en',
    citations: raw.citations || 0,
    auteurs: null,
    pays: [],
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

function toast(msg,d=2400){const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),d);}
function showToast(msg,d){toast(msg,d);}

function animCount(el,v,d=650){if(!el)return;const s=performance.now();
  (function step(n){const p=Math.min((n-s)/d,1);
    el.textContent=Math.round(v*(1-Math.pow(1-p,3))).toLocaleString('fr-FR');
    if(p<1)requestAnimationFrame(step);})(performance.now());}

function showTab(name,btn){ /* single page — no-op */ }

/* ══ Stat strip (uniquement ce qui est calculable sans mots-clés) ═══════ */
function renderStatStrip(){
  const totalCitations = ARTICLES.reduce((s,a)=>s+(a.citations||0),0);
  document.getElementById('statStrip').innerHTML=`
    <div class="stat-card"><div class="stat-label">Articles chargés</div>
      <div class="stat-val g" id="sc-tot">0</div><div class="stat-note">arXiv via OpenAlex</div></div>
    <div class="stat-card"><div class="stat-label">Mois couverts</div>
      <div class="stat-val">${MONTH_ORDER.length}</div></div>
    <div class="stat-card"><div class="stat-label">Citations cumulées</div>
      <div class="stat-val">${totalCitations.toLocaleString('fr-FR')}</div></div>
    <div class="stat-card"><div class="stat-label">Mots-clés / pays</div>
      <div class="stat-val" style="font-size:.85rem;padding-top:3px;color:var(--text-3);font-style:italic;">indisponibles</div></div>
  `;
  setTimeout(()=>animCount(document.getElementById('sc-tot'),ARTICLES.length),80);
}

/* ══ Sections désactivées (nuage / carte / évolution / suggestions) ═════
   Ces vues nécessitent des mots-clés que l'API minimale ne fournit pas.
   On affiche un message clair plutôt que de laisser des zones vides ou
   de faire planter le reste de la page. */
function renderCloud(){
  const wrap=document.getElementById('cloudMain');
  if(wrap) wrap.innerHTML='<p style="color:var(--text-3);font-size:13px;">Nuage de mots-clés indisponible : l\'API actuelle (/articles/&lt;limite&gt;) ne renvoie pas les données de mots-clés des articles.</p>';
}

function renderMap(){
  const conteneurCarte = document.getElementById('mapContainer');
  if(conteneurCarte) conteneurCarte.insertAdjacentHTML('afterbegin',
    '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center;font-size:13px;color:var(--text-3);background:rgba(255,255,255,.85);z-index:2;">Carte indisponible : les pays des auteurs ne sont pas exploitables avec l\'API actuelle.</div>');
  const titre = document.getElementById('sidebarTitle');
  if(titre) titre.textContent = 'Indisponible';
  const barres = document.getElementById('sidebarBars');
  if(barres) barres.innerHTML = '<p style="font-size:12px;color:var(--text-3);">Données pays non exploitables avec cette API.</p>';
}
function resetMapZoom(){ /* carte désactivée — no-op */ }

function renderEvoSuggestions(){
  const c = document.getElementById('evoSuggestions');
  if(c) c.innerHTML = '<span style="font-size:12px;color:var(--text-3);">Suggestions indisponibles (nécessitent des mots-clés non fournis par l\'API).</span>';
}

/** L'encart "évolution" est réutilisé comme recherche par titre — c'est la
 *  seule recherche possible avec les champs disponibles (pas de mots-clés
 *  par article avec cette API). */
function traceEvolution(mot){
  if(!mot) return;
  FILTRE_TITRE = mot.toLowerCase().trim();
  const input=document.getElementById('evoInput');
  if(input) input.value=FILTRE_TITRE;

  const label=document.getElementById('evoLabel');
  if(label) label.innerHTML=`Recherche dans les titres : <strong style="color:var(--gold)">"${FILTRE_TITRE}"</strong> <span style="color:var(--text-3);font-size:12px;">(évolution temporelle indisponible sans mots-clés)</span>`;
  const chart=document.getElementById('evoChart');
  if(chart) chart.innerHTML='';
  const note=document.getElementById('evoNote');
  if(note) note.textContent='';

  renderTopArticles();
}

function renderMultiEvo(){ /* désactivé */ }

/* ══ Month pills (filtrent la liste d'articles par mois) ════════════════ */
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
  renderTopArticles();
}

/* ══ ARTICLES (la seule vue réellement fonctionnelle) ════════════════════ */
async function renderTopArticles(){
  const sub = document.getElementById('articlesSub');
  if(sub) sub.textContent = 'Recherche des articles…';

  let arts = ARTICLES;
  if(ACTIVE_MONTH) arts = arts.filter(a=>a.mois===ACTIVE_MONTH);
  if(FILTRE_TITRE) arts = arts.filter(a=>(a.titre||'').toLowerCase().includes(FILTRE_TITRE));
  arts = [...arts].sort((a,b)=>b.citations-a.citations).slice(0,20);

  try {
    await avecConcurrenceLimitee(arts.filter(a=>a.auteurs===null), async (a) => {
      a.auteurs = await fetchAuteurs(a.id);
      a.pays = [...new Set(a.auteurs.map(au=>au.pays).filter(Boolean))];
    }, 6);
  } catch(err) { console.error(err); }

  CURRENT_ARTICLES = arts;
  updateArticlesHeader(arts.length);
  displayArticles(arts);
}

function updateArticlesHeader(count){
  const sub = document.getElementById('articlesSub');
  const btn = document.getElementById('resetArticlesBtn');
  const filtres = [];
  if(ACTIVE_MONTH) filtres.push(formatMonthLabel(ACTIVE_MONTH));
  if(FILTRE_TITRE) filtres.push(`titre contenant "${FILTRE_TITRE}"`);
  if(filtres.length){
    if(sub) sub.innerHTML = `Articles filtrés (${filtres.join(' · ')}) · ${count} résultat${count!==1?'s':''}`;
    if(btn) btn.style.display = 'inline-block';
  } else {
    if(sub) sub.textContent = 'Articles les plus récemment publiés (triés par citations)';
    if(btn) btn.style.display = 'none';
  }
}

function displayArticles(arts){
  if(!arts.length){
    document.getElementById('topArticlesList').innerHTML=
      `<div style="padding:2rem;text-align:center;color:var(--text-3);font-size:14px;">
        <div style="font-size:32px;opacity:.35;margin-bottom:10px;">🔍</div>
        Aucun article trouvé.
      </div>`;
    return;
  }
  document.getElementById('topArticlesList').innerHTML = arts.map((a) => {
    const oa = a.id && a.id.startsWith('https://openalex.org/') ? a.id : null;
    const ax = `https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(a.titre)}`;
    const auths = (a.auteurs||[]).slice(0,3).map(au=>`<strong>${au.nom||'?'}</strong>`).join(', ');
    const pays  = (a.pays||[]).slice(0,3).map(p=>`<span class="meta-pill">${PAYS_INFO[p]?PAYS_INFO[p].flag+' '+p:p}</span>`).join('');
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
    </div>`;
  }).join('');
  setTimeout(()=>document.querySelectorAll('.article-card:not(.visible)').forEach(el=>revObs.observe(el)),50);
}

function resetArticles(){
  FILTRE_TITRE = null;
  const input=document.getElementById('evoInput');
  if(input) input.value='';
  document.getElementById('resetArticlesBtn').style.display='none';
  const label=document.getElementById('evoLabel');
  if(label) label.textContent='Saisissez un mot-clé de titre ci-dessus.';
  renderTopArticles();
}

/* ══ Export CSV ═══════════════════════════════════════════════════════ */
function exportArticlesCSV(){
  if(!CURRENT_ARTICLES.length){ showToast('Aucun article à exporter'); return; }
  const headers = ['Titre','Date','Langue','Auteurs','Pays','Citations','URL OpenAlex','URL arXiv'];
  const rows = CURRENT_ARTICLES.map(a => [
    `"${(a.titre||'').replace(/"/g,'""')}"`,
    a.date || '',
    a.langue || '',
    `"${(a.auteurs||[]).map(au=>au.nom||'?').join(';')}"`,
    `"${(a.pays||[]).join(';')}"`,
    a.citations || 0,
    a.id || '',
    `"https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(a.titre)}"`,
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = `articles_${new Date().toISOString().slice(0,10)}.csv`;
  el.click();
  URL.revokeObjectURL(url);
  showToast(`✓ ${CURRENT_ARTICLES.length} articles exportés en CSV`);
}

/* ══ Init (page unique) ═══════════════════════════════════════════════ */
async function initApp() {
  toast('Chargement des articles…', 1800);

  try {
    const bruts = await fetchArticlesBruts(APP_CONFIG.NB_ARTICLES_A_CHARGER);
    ARTICLES = bruts.map(normaliserArticle);
  } catch(e) {
    console.error('Erreur lors du chargement des articles', e);
    ARTICLES = [];
    toast('⚠ API indisponible — vérifie que le backend Flask est démarré et que CORS est bien activé');
  }

  MONTH_ORDER = [...new Set(ARTICLES.map(a=>a.mois).filter(Boolean))].sort();

  ACTIVE_MONTH = '';
  initMonthPills();
  renderStatStrip();
  renderCloud();
  renderEvoSuggestions();
  renderMap();
  await renderTopArticles();
}
initApp();

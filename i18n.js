/*
Nom........ : i18n.js
Description : Système de traduction FR/EN du front-end "Veille Scientifique".
              Principe volontairement simple (pas de framework i18n) :
                - LANG est déterminée une fois au chargement de la page
                  (localStorage, sinon 'fr' par défaut) ;
                - t(cle) renvoie la chaîne traduite dans la langue courante ;
                - changer de langue (setLang) sauvegarde le choix puis
                  RECHARGE la page plutôt que de re-rendre dynamiquement
                  chaque élément : app.js exécute déjà tout son pipeline de
                  rendu au chargement (initApp), donc un rechargement
                  garantit que tout le contenu dynamique (nuage, carte,
                  articles...) est régénéré dans la nouvelle langue sans
                  avoir à dupliquer cette logique ailleurs.
Usage...... : Charger juste après config.js, AVANT data.js et app.js
              (data.js a besoin de LANG pour choisir NOMS_PAYS/NOMS_PAYS_EN,
              app.js a besoin de t() et MOIS_LABELS).
*/

let LANG = (function () {
  const sauvegarde = localStorage.getItem('lang');
  return (sauvegarde === 'fr' || sauvegarde === 'en') ? sauvegarde : 'fr';
})();

const I18N = {
  fr: {
    hero_eyebrow: '✦ arXiv · OpenAlex · Fév 2025 → Juin 2026',
    page_title: 'Tendances Scientifiques · arXiv',
    hero_title_html: 'Mots-clés <em>tendance</em><br>de la recherche mondiale',
    hero_sub: "Visualisez les sujets scientifiques dominants mois par mois et par pays, extraits de l'index inversé des abstracts arXiv via OpenAlex.",

    nuage_title: 'Nuage de mots-clés par mois',
    nuage_sub: "Mots scientifiques extraits des abstracts · cliquez sur un mot pour tracer son évolution",
    mois_tous: 'Tous les mois',

    carte_title: 'Carte mondiale des mots-clés',
    carte_sub: 'Taille des bulles = volume de recherche · Cliquez sur un pays pour ses mots dominants',
    btn_recentrer: '⟳ Recentrer',
    legend_bas: 'Peu de recherches',
    legend_moyen: 'Volume moyen',
    legend_haut: 'Très actif',
    sidebar_titre_defaut: 'Survolez un pays',
    sidebar_texte_defaut: 'Cliquez sur une bulle pour voir les mots-clés dominants.',

    evo_title: "Évolution d'un mot-clé dans le temps",
    evo_sub: 'Cliquez sur un mot du nuage ou saisissez un terme',
    evo_placeholder: 'Ex : quantum, diffusion, multimodal…',
    btn_tracer: 'Tracer →',
    evo_label_defaut: 'Saisissez un mot-clé ci-dessus ou cliquez sur le nuage.',
    evo_suggestions_label: 'Suggestions :',

    articles_title: 'Articles les plus cités',
    articles_sub_defaut: 'Sélection des articles à fort impact · cliquez sur un mot du nuage pour filtrer',
    btn_tous: '✕ Tous',
    btn_export_csv: '⬇ Export CSV',

    footer_desc: 'Outil de veille scientifique basé sur les données',
    footer_etudiants: 'Étudiants',
    footer_stack: 'Stack technique',
    footer_role_cyril: 'Analyse & traitement des données et Collecte · OpenAlex API',
    footer_role_mael: 'Interface front-end',
    footer_role_matthieu: 'Base de données SQLite',
    footer_role_paloma: 'Project Owner et Collecte des données',
    footer_stack_bientot: '(à venir)',
    footer_projet: 'Projet Universitaire de validation du cours',
    footer_licence: 'Licence 2 Informatique IED',

    // Chaînes générées dynamiquement par app.js
    stat_articles_label: 'Articles chargés',
    stat_articles_note: 'arXiv via OpenAlex',
    stat_months_label: 'Mois couverts',
    stat_countries_label: 'Pays',
    stat_countries_note_with: (n, moisActif) => `sur ${n.toLocaleString('fr-FR')} art. avec pays identifié${moisActif ? ' ce mois' : ''}`,
    stat_countries_note_empty: 'aucune donnée pour ce mois',
    stat_top_word_label: (mois) => `Mot top (${mois || 'tous les mois'})`,

    cloud_no_data: 'Aucune donnée.',
    evo_traced_toast: (mot) => `Évolution de "${mot}" tracée — onglet Évolution`,

    map_coverage_full: (n, suffixe) => `Carte basée sur l'intégralité des articles indexés${suffixe} (${n.toLocaleString('fr-FR')} avec au moins un pays identifié).`,
    map_coverage_empty: (suffixe) => `Aucun article avec un pays identifié${suffixe}.`,
    map_coverage_suffix_mois: (mois) => ` pour ${mois}`,
    map_coverage_suffix_toutes: ' (toutes dates confondues)',
    sidebar_aucune_donnee: 'Aucune donnée',
    toast_erreur_carte: 'Erreur pendant le chargement de la carte des pays',
    sidebar_aucune_donnee_mois: 'Aucune donnée pour ce mois.',
    sidebar_aucun_pays_periode: 'Aucun pays identifié pour cette période.',
    toast_pays_mots: (flag, label, n) => `${flag} ${label} — ${n} mots-clés`,

    evo_label_trouve: (mot, n) => `Évolution de <strong style="color:var(--gold)">"${mot}"</strong> sur ${n} mois`,
    evo_label_non_trouve: (mot) => `<span style="color:var(--rust)">Mot "<strong>${mot}</strong>" non trouvé dans les données.</span>`,
    evo_note_score: 'Score = fréquence cumulée du mot (et des expressions qui le contiennent) dans les articles',
    evo_note_non_trouve: "Ce mot n'apparaît pas dans les données. Essayez un synonyme.",

    articles_recherche_en_cours: 'Recherche des articles…',
    toast_erreur_recherche: "Erreur pendant la recherche d'articles",
    articles_header_filtre: (mot, n) => `Articles contenant <strong style="color:var(--gold)">"${mot}"</strong> · ${n} résultat${n !== 1 ? 's' : ''}`,
    articles_aucun_trouve: (mot) => `Aucun article trouvé${mot ? ` pour <strong>"${mot}"</strong>` : ''} dans les données.`,
    articles_essayer_autre: 'Essayez un autre mot du nuage.',
    citations_mot: 'citations',

    export_aucun: 'Aucun article à exporter',
    export_succes: (n) => `✓ ${n} articles exportés en CSV`,
    init_chargement: 'Chargement des données…',
    init_erreur_api: '⚠ API indisponible — vérifie que le backend Flask est démarré',
  },

  en: {
    hero_eyebrow: '✦ arXiv · OpenAlex · Feb 2025 → Jun 2026',
    page_title: 'Scientific Trends · arXiv',
    hero_title_html: '<em>Trending</em> keywords<br>in global research',
    hero_sub: 'Visualize dominant scientific topics month by month and by country, extracted from the inverted index of arXiv abstracts via OpenAlex.',

    nuage_title: 'Monthly keyword cloud',
    nuage_sub: 'Scientific terms extracted from abstracts · click a word to trace its evolution',
    mois_tous: 'All months',

    carte_title: 'World map of keywords',
    carte_sub: 'Bubble size = research volume · Click a country for its dominant terms',
    btn_recentrer: '⟳ Recenter',
    legend_bas: 'Low activity',
    legend_moyen: 'Medium volume',
    legend_haut: 'Highly active',
    sidebar_titre_defaut: 'Hover over a country',
    sidebar_texte_defaut: 'Click a bubble to see its dominant keywords.',

    evo_title: 'Keyword evolution over time',
    evo_sub: 'Click a word in the cloud or type a term',
    evo_placeholder: 'E.g.: quantum, diffusion, multimodal…',
    btn_tracer: 'Plot →',
    evo_label_defaut: 'Type a keyword above or click on the cloud.',
    evo_suggestions_label: 'Suggestions:',

    articles_title: 'Most cited articles',
    articles_sub_defaut: 'Selection of high-impact articles · click a word in the cloud to filter',
    btn_tous: '✕ All',
    btn_export_csv: '⬇ Export CSV',

    footer_desc: 'Scientific watch tool based on data from',
    footer_etudiants: 'Students',
    footer_stack: 'Tech stack',
    footer_role_cyril: 'Data analysis & processing, and collection · OpenAlex API',
    footer_role_mael: 'Front-end interface',
    footer_role_matthieu: 'SQLite database',
    footer_role_paloma: 'Project owner and data collection',
    footer_stack_bientot: '(coming soon)',
    footer_projet: 'University project for the course',
    footer_licence: 'BSc 2 Computer Science (IED, distance learning)',

    stat_articles_label: 'Articles loaded',
    stat_articles_note: 'arXiv via OpenAlex',
    stat_months_label: 'Months covered',
    stat_countries_label: 'Countries',
    stat_countries_note_with: (n, moisActif) => `across ${n.toLocaleString('en-US')} articles with a country identified${moisActif ? ' this month' : ''}`,
    stat_countries_note_empty: 'no data for this month',
    stat_top_word_label: (mois) => `Top word (${mois || 'all months'})`,

    cloud_no_data: 'No data.',
    evo_traced_toast: (mot) => `Evolution of "${mot}" plotted — Evolution section`,

    map_coverage_full: (n, suffixe) => `Map based on the entire indexed corpus${suffixe} (${n.toLocaleString('en-US')} with at least one country identified).`,
    map_coverage_empty: (suffixe) => `No article with a country identified${suffixe}.`,
    map_coverage_suffix_mois: (mois) => ` for ${mois}`,
    map_coverage_suffix_toutes: ' (all dates combined)',
    sidebar_aucune_donnee: 'No data',
    toast_erreur_carte: 'Error loading the country map',
    sidebar_aucune_donnee_mois: 'No data for this month.',
    sidebar_aucun_pays_periode: 'No country identified for this period.',
    toast_pays_mots: (flag, label, n) => `${flag} ${label} — ${n} keywords`,

    evo_label_trouve: (mot, n) => `Evolution of <strong style="color:var(--gold)">"${mot}"</strong> over ${n} months`,
    evo_label_non_trouve: (mot) => `<span style="color:var(--rust)">Term "<strong>${mot}</strong>" not found in the data.</span>`,
    evo_note_score: 'Score = cumulative frequency of the word (and expressions containing it) across articles',
    evo_note_non_trouve: 'This term does not appear in the data. Try a synonym.',

    articles_recherche_en_cours: 'Searching articles…',
    toast_erreur_recherche: 'Error while searching articles',
    articles_header_filtre: (mot, n) => `Articles containing <strong style="color:var(--gold)">"${mot}"</strong> · ${n} result${n !== 1 ? 's' : ''}`,
    articles_aucun_trouve: (mot) => `No article found${mot ? ` for <strong>"${mot}"</strong>` : ''} in the data.`,
    articles_essayer_autre: 'Try another word from the cloud.',
    citations_mot: 'citations',

    export_aucun: 'No articles to export',
    export_succes: (n) => `✓ ${n} articles exported to CSV`,
    init_chargement: 'Loading data…',
    init_erreur_api: '⚠ API unavailable — check that the Flask backend is running',
  },
};

/** Renvoie la traduction associée à `cle` dans la langue courante (LANG).
 *  Accepte soit une chaîne statique, soit une fonction (pour les chaînes
 *  paramétrées, ex. avec un nombre ou un mot à interpoler) : dans ce cas,
 *  passer les arguments après la clé, ex. t('export_succes', 12). */
function t(cle, ...args) {
  const dico = I18N[LANG] || I18N.fr;
  const valeur = (cle in dico) ? dico[cle] : (I18N.fr[cle] ?? cle);
  return (typeof valeur === 'function') ? valeur(...args) : valeur;
}

/** Change la langue active et recharge la page (voir note en tête de
 *  fichier sur ce choix de conception). */
function setLang(langue) {
  if (langue !== 'fr' && langue !== 'en') return;
  if (langue === LANG) return;
  localStorage.setItem('lang', langue);
  location.reload();
}

/** Applique les traductions aux éléments statiques du DOM (index.html),
 *  identifiés par les attributs data-i18n / data-i18n-html /
 *  data-i18n-placeholder. Les éléments injectés dynamiquement par app.js
 *  (nuage, carte, articles...) utilisent directement t() dans leur code de
 *  rendu et n'ont pas besoin de cette étape. */
function appliquerTraductionsStatiques() {
  document.documentElement.lang = LANG;
  document.title = t('page_title');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === LANG);
  });
}

/** Libellés des mois, dans chaque langue (remplace l'ancien MOIS_FR de
 *  app.js, qui était figé en français). */
const MOIS_LABELS = {
  fr: ['Janv', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

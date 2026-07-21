/* ══════════════════════════════════════════════════════════════════════
   CONFIGURATION — Tendances Scientifiques
   ══════════════════════════════════════════════════════════════════════
   👉 C'est le SEUL endroit à modifier si l'URL de l'API change.

   Le front charge TOUS les articles de la base, mais par PAGES (voir
   fetchTousLesArticles dans app.js) plutôt qu'en un seul appel géant —
   un seul /articles/<très_grand_nombre> peut saturer le service (temps +
   mémoire d'une requête unique), quelle que soit la RAM de l'instance.
   ══════════════════════════════════════════════════════════════════════ */
const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',

  // Taille d'une page (/articles/page/<n>?taille=...). Le nombre de pages
  // est déduit automatiquement de /articles/count — pas besoin de deviner
  // le total.
  TAILLE_PAGE_ARTICLES: 500,

  // Combien de pages sont demandées EN PARALLÈLE. Plus haut = chargement
  // plus rapide, mais plus de charge simultanée sur le service gratuit.
  CONCURRENCE_PAGES: 3,

  // /auteurs/<id> est un appel par article : impossible de le faire pour
  // tous les articles (des milliers de requêtes). La carte par pays est
  // donc calculée sur un ÉCHANTILLON : les N articles les plus cités,
  // toutes dates confondues.
  NB_ARTICLES_POUR_CARTE_PAYS: 300,
};

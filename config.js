/* ══════════════════════════════════════════════════════════════════════
   CONFIGURATION DE LA SOURCE DE DONNÉES — Tendances Scientifiques
   ══════════════════════════════════════════════════════════════════════
   👉 C'est le SEUL endroit à modifier si l'URL de l'API change.

   ⚠ Architecture "front-first" : api_flask.py ne renvoie que des données
   brutes (/articles/<limite>, /auteurs/<id_article>). Tout le calcul
   (mots-clés via key_word.json, nuage, carte par pays, évolution,
   suggestions, stats) est fait ici, côté navigateur, dans app.js.

   TAILLE_PAGE_ARTICLES : app.js charge maintenant TOUS les articles de la
   base automatiquement, mais page par page (via ?offset=...) plutôt qu'en
   un seul appel géant — sinon ça sature la mémoire/le worker du service et
   fait échouer le health check Render (vécu : voir la conversation).
   Cette valeur est juste la taille d'une page ; pas besoin de connaître le
   total à l'avance (mais /articles/count reste utile pour estimer le temps
   de chargement).
   ══════════════════════════════════════════════════════════════════════ */
const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',
  TAILLE_PAGE_ARTICLES: 2000,
  // Nombre d'articles (les plus cités) pour lesquels on va chercher les
  // auteurs/pays — /auteurs/<id> est un appel par article, donc ce nombre
  // est volontairement limité pour rester praticable dans un navigateur
  // (voir le commentaire détaillé dans app.js, section "CARTE DU MONDE").
  NB_ARTICLES_POUR_CARTE_PAYS: 300,
};

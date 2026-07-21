/* ══════════════════════════════════════════════════════════════════════
   CONFIGURATION DE LA SOURCE DE DONNÉES — Tendances Scientifiques
   ══════════════════════════════════════════════════════════════════════
   👉 C'est le SEUL endroit à modifier si l'URL de l'API change.

   ⚠ Architecture "front-first" : api_flask.py ne renvoie que des données
   brutes (/articles/<limite>, /auteurs/<id_article>). Tout le calcul
   (mots-clés via key_word.json, nuage, carte par pays, évolution,
   suggestions, stats) est fait ici, côté navigateur, dans app.js.

   NB_ARTICLES_A_CHARGER : nombre d'articles à demander à /articles/<n>.
   L'API n'a pas de notion de "tous les articles" ni de filtre par mois :
   on demande donc un grand nombre d'un coup (SQLite plafonne de lui-même
   si la base en contient moins) et on filtre par mois côté client à
   partir du champ `date` de chaque article.
   ══════════════════════════════════════════════════════════════════════ */
const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',
  NB_ARTICLES_A_CHARGER: 600000,
  // Nombre d'articles (les plus cités) pour lesquels on va chercher les
  // auteurs/pays — /auteurs/<id> est un appel par article, donc ce nombre
  // est volontairement limité pour rester praticable dans un navigateur
  // (voir le commentaire détaillé dans app.js, section "CARTE DU MONDE").
  NB_ARTICLES_POUR_CARTE_PAYS: 1000,
};

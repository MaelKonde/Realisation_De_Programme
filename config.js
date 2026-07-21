/* ══════════════════════════════════════════════════════════════════════
   CONFIGURATION DE LA SOURCE DE DONNÉES — Tendances Scientifiques
   ══════════════════════════════════════════════════════════════════════
   👉 C'est le SEUL endroit à modifier si l'URL de l'API change.

   ⚠ api_flask.py est volontairement le fichier minimal (2 routes,
   /articles/<limite> et /auteurs/<id_article>, sans mots-clés ni
   pagination). Conséquence assumée : pas de nuage de mots, pas de carte
   par pays, pas d'évolution temporelle — seule la liste des articles est
   disponible (voir app.js pour le détail des sections désactivées).

   NB_ARTICLES_A_CHARGER : /articles/<limite> n'a pas de notion d'offset,
   donc "charger tous les articles" = un seul appel avec un grand nombre.
   Comme cette route ne renvoie plus index_inverse_compte (retiré du
   SELECT dans le fichier minimal), le payload par article est minuscule
   (5 champs texte/nombre) : un seul gros appel reste praticable, pas
   besoin de pagination ici.
   ══════════════════════════════════════════════════════════════════════ */
const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',
  NB_ARTICLES_A_CHARGER: 100000,
};

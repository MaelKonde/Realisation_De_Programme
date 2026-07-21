/* ══════════════════════════════════════════════════════════════════════
   CONFIGURATION DE LA SOURCE DE DONNÉES — Tendances Scientifiques
   ══════════════════════════════════════════════════════════════════════
   👉 C'est le SEUL endroit à modifier si l'URL de l'API change.

   ⚠ Avant : ce fichier contenait aussi MONTHS_FILES/DATA_SOURCE, utilisés
   par app.js pour reconstruire les mots-clés côté client à partir de
   fichiers arxiv_<mois>.json ou d'un faux endpoint /articles?mois=...
   Ce n'est plus nécessaire : le calcul des mots-clés (référentiel
   key_word.json + bdd.db) est maintenant fait entièrement côté serveur
   par api_flask.py, et app.js interroge directement les vrais endpoints
   (/api/mois, /api/mots-cles, /api/pays, /api/evolution,
   /api/articles-top, /api/suggestions, /api/stats-globales).
   ══════════════════════════════════════════════════════════════════════ */
const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',
};

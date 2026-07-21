/* ══════════════════════════════════════════════════════════════════════
   CONFIGURATION DE LA SOURCE DE DONNÉES — Tendances Scientifiques
   ══════════════════════════════════════════════════════════════════════
   👉 C'est le SEUL endroit à modifier si l'URL de l'API change.

   ⚠ api_flask.py calcule tout côté serveur (nuage, carte, évolution,
   suggestions, stats, top articles) via SQL + key_word.json. Le
   navigateur ne télécharge jamais les articles bruts en masse — chaque
   vue appelle un endpoint qui renvoie un résultat déjà agrégé. Voir le
   commentaire en tête de app.js et de api_flask.py.
   ══════════════════════════════════════════════════════════════════════ */
const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',
};

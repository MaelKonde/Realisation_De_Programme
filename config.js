/* ══════════════════════════════════════════════════════════════════════
   CONFIGURATION DE LA SOURCE DE DONNÉES — Tendances Scientifiques
   ══════════════════════════════════════════════════════════════════════
   👉 C'est le SEUL endroit à modifier si l'URL de l'API change.

   ⚠ api_flask.py est ici volontairement le fichier minimal (2 routes,
   /articles/<limite> et /auteurs/<id_article>, sans mots-clés, sans
   pagination/offset, sans /articles/count). Conséquences assumées :
   - Pas de nuage de mots, pas de carte par pays, pas d'évolution
     temporelle : ces vues ont besoin de index_inverse_compte, que cette
     API ne renvoie pas. Seule la liste des articles est disponible.
   - /articles/<limite> ne supporte pas ?offset=..., donc "charger tous
     les articles" ne peut être qu'UN SEUL appel avec un grand nombre —
     pas de pagination possible avec ce fichier. D'où NB_ARTICLES_A_CHARGER
     ci-dessous : garde une valeur raisonnable (pas un million) pour éviter
     de saturer la mémoire/le worker du service (vécu précédemment).
   ══════════════════════════════════════════════════════════════════════ */
const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',
  NB_ARTICLES_A_CHARGER: 5000,
};

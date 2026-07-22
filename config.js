/*
Nom........ : config.js
Description : Configuration globale du front-end "Veille Scientifique"
Usage...... : Charger en premier (avant data.js et app.js)
*/
const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',
  TAILLE_PAGE_ARTICLES: 500,
  CONCURRENCE_PAGES: 3,

  // /auteurs/<id> est un appel HTTP PAR ARTICLE : impossible de le faire
  // pour toute la base (552 132 articles au 22/07/2026 — voir
  // /articles/count). La carte par pays est donc calculée sur un
  // ÉCHANTILLON : les N articles les plus cités, toutes dates confondues.
  //
  // ⚠ Ne PAS mettre un nombre proche du total (ou "600000" pour être sûr
  // de "tout prendre") : ça ferait des dizaines/centaines de milliers de
  // requêtes une par une, ingérable dans un navigateur (risque de
  // timeouts, requêtes qui échouent silencieusement -> pays sous-comptés
  // plutôt que sur-comptés). Le vrai fix pour une carte exhaustive est de
  // calculer les totaux par pays en SQL côté serveur (JOIN + GROUP BY en
  // une seule requête) plutôt que d'augmenter ce nombre indéfiniment.
  //
  // Repères de temps de chargement mesurés avec CONCURRENCE_AUTEURS_CARTE
  // ci-dessous (latence réseau ~150ms/requête) :
  //   2 000 articles  x concurrence 15 -> ~20s
  //   5 000 articles  x concurrence 25 -> ~30s
  //  15 000 articles  x concurrence 25 -> ~90s
  NB_ARTICLES_POUR_CARTE_PAYS: 5000,

  // Nombre de requêtes /auteurs/<id> en parallèle pendant la construction
  // de la carte. Plus haut = plus rapide, mais plus de charge simultanée
  // sur l'API (et sur le plan gratuit Render, ça peut saturer plus vite).
  CONCURRENCE_AUTEURS_CARTE: 25,
};

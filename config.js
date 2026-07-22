/*
Nom........ : config.js
Description : Configuration globale du front-end "Veille Scientifique"
Usage...... : Charger en premier (avant data.js et app.js)
*/
const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',
  TAILLE_PAGE_ARTICLES: 500,
  CONCURRENCE_PAGES: 3,

  // NB_ARTICLES_POUR_CARTE_PAYS a été retirée : la carte du monde par pays
  // est désormais précalculée sur L'INTÉGRALITÉ du corpus par precompute.py
  // (route /agregats/carte), et non plus construite côté front à partir
  // d'un échantillon des articles les plus cités. Cet échantillonnage
  // provoquait un biais (un mot-clé fréquent surtout dans des articles peu
  // cités, comme "galaxy" ou "learning", était sous-représenté sur la
  // carte alors qu'il apparaissait fort dans le nuage de mots/la frise
  // d'évolution — voir loadPaysEtCarte() dans app.js).
};

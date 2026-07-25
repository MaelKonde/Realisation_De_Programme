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
  // est désormais précalculée sur L'INTÉGRALITÉ du corpus
  // (route /agregats/carte), et non plus construite côté front à partir
  // d'un échantillon des articles les plus cités.
};

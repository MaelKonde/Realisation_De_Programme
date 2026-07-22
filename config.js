/*
Nom........ : config.js
Description : Configuration globale du front-end "Veille Scientifique"
Usage...... : Charger en premier (avant data.js et app.js)
*/

const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',

  TAILLE_PAGE_ARTICLES: 500,

  CONCURRENCE_PAGES: 3,

  // /auteurs/<id> est un appel par article : impossible de le faire pour
  // tous les articles (des milliers de requêtes). La carte par pays est
  // donc calculée sur un ÉCHANTILLON : les N articles les plus cités,
  // toutes dates confondues.
  NB_ARTICLES_POUR_CARTE_PAYS: 5000,
};

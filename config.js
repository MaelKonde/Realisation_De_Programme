/*
Nom........ : config.js
Description : Configuration globale du front-end "Veille Scientifique"
Usage...... : Charger en premier (avant data.js et app.js)
*/
const APP_CONFIG = {
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',
  TAILLE_PAGE_ARTICLES: 500,
  CONCURRENCE_PAGES: 3,

  // /articles/recherche embarque les auteurs (GROUP_CONCAT), donc la carte
  // par pays est calculée sur un ÉCHANTILLON : les N articles les plus
  // cités, toutes dates confondues (pas un filtrage par mois — voir
  // loadPaysEtCarte() dans app.js).
  //
  // ⚠ Cette valeur est plafonnée côté serveur par LIMITE_RECHERCHE_MAX
  // dans api_flask.py (actuellement 47000). Une valeur ici supérieure au
  // plafond serveur ne change RIEN en pratique : la requête est tronquée
  // silencieusement à 47000 par l'API, mais le commentaire précédent
  // laissait croire à tort que l'échantillon utilisé était de 600000
  // articles. Garder cette constante synchronisée avec LIMITE_RECHERCHE_MAX
  // évite ce genre de confusion — modifier les deux ensemble si besoin.
  NB_ARTICLES_POUR_CARTE_PAYS: 47000,
};

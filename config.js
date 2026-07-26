/*
NOM DU SCRIPT : config.js
ROLE          : Configuration globale du projet
DESCRIPTION   : Configuration globale du front-end "Veille Scientifique"
VERSION     : 1.1
LICENCE     : réalisation de programme - config.js
USAGE       : Charger en premier avant translateSystem.js, data.js et app.js
AUTEUR      : Maël Khonde Mbumba

*/
const APP_CONFIG = {
 
  // URL racine de l'API Flask (service Render "veille-scientifique-api",
  // voir render.yaml). Utilisée par app.js pour préfixer tous les appels
  // fetch : /agregats/nuage, /agregats/carte, /articles/recherche, etc.
  // À changer ici uniquement si l'API change d'adresse (ex : environnement
  // de test/local) — ne jamais dupliquer cette URL ailleurs dans le code.
  
  BACKEND_API_URL: 'https://veille-scientifique-api.onrender.com',
 
};

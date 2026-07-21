/* ══════════════════════════════════════════════════════════════════════
   DONNÉES STATIQUES & CONSTANTES — Tendances Scientifiques
   ══════════════════════════════════════════════════════════════════════
   ⚠ Ce fichier ne contient plus STOPWORDS ni TD_FALLBACK :
   - STOPWORDS : le filtrage des mots-clés se fait maintenant côté serveur
     (api_flask.py), à partir du référentiel key_word.json — plus besoin
     de dupliquer une logique de filtrage côté client.
   - TD_FALLBACK : app.js n'a plus de "mode local" avec données de démo ;
     si l'API ne répond pas, un message d'erreur clair est affiché plutôt
     que de faire croire que des données réelles sont chargées.
   ══════════════════════════════════════════════════════════════════════ */

/* Coordonnées géographiques approximatives (centroïdes) pour les bulles de la carte */
const CENTROIDS = {"US": [-100, 40], "FR": [2, 46], "CN": [104, 35], "DE": [10, 51], "GB": [-2, 54], "JP": [138, 36], "ES": [-3, 40], "IT": [12, 42], "IN": [79, 22], "CH": [8, 47], "NL": [5, 52], "CA": [-95, 56], "KR": [128, 36], "AU": [133, -27], "RU": [100, 60], "HK": [114, 22], "SE": [18, 60], "PL": [20, 52], "AT": [14, 47], "CZ": [16, 50], "BE": [4, 51], "DK": [10, 56], "FI": [26, 62], "NO": [10, 62], "PT": [-8, 39], "IE": [-8, 53], "IL": [35, 31], "SG": [104, 1], "TW": [121, 24], "BR": [-53, -10], "MX": [-102, 24], "AR": [-64, -34], "ZA": [25, -29], "SA": [45, 24], "TR": [35, 39], "GR": [22, 39]};

/* Libellés et drapeaux affichés pour les pays connus */
const PAYS_INFO = {
  US:{label:'États-Unis',flag:'🇺🇸'},FR:{label:'France',flag:'🇫🇷'},
  CN:{label:'Chine',flag:'🇨🇳'},DE:{label:'Allemagne',flag:'🇩🇪'},
  GB:{label:'Royaume-Uni',flag:'🇬🇧'},JP:{label:'Japon',flag:'🇯🇵'},
  ES:{label:'Espagne',flag:'🇪🇸'},IT:{label:'Italie',flag:'🇮🇹'},
  IN:{label:'Inde',flag:'🇮🇳'},CH:{label:'Suisse',flag:'🇨🇭'},
  NL:{label:'Pays-Bas',flag:'🇳🇱'},CA:{label:'Canada',flag:'🇨🇦'},
  KR:{label:'Corée du Sud',flag:'🇰🇷'},AU:{label:'Australie',flag:'🇦🇺'},
  RU:{label:'Russie',flag:'🇷🇺'},HK:{label:'Hong Kong',flag:'🇭🇰'},
  SE:{label:'Suède',flag:'🇸🇪'},PL:{label:'Pologne',flag:'🇵🇱'},
  AT:{label:'Autriche',flag:'🇦🇹'},CZ:{label:'Tchéquie',flag:'🇨🇿'},
  BE:{label:'Belgique',flag:'🇧🇪'},DK:{label:'Danemark',flag:'🇩🇰'},
  FI:{label:'Finlande',flag:'🇫🇮'},NO:{label:'Norvège',flag:'🇳🇴'},
  PT:{label:'Portugal',flag:'🇵🇹'},IE:{label:'Irlande',flag:'🇮🇪'},
  IL:{label:'Israël',flag:'🇮🇱'},SG:{label:'Singapour',flag:'🇸🇬'},
  TW:{label:'Taïwan',flag:'🇹🇼'},BR:{label:'Brésil',flag:'🇧🇷'},
  MX:{label:'Mexique',flag:'🇲🇽'},AR:{label:'Argentine',flag:'🇦🇷'},
  ZA:{label:'Afrique du Sud',flag:'🇿🇦'},SA:{label:'Arabie Saoudite',flag:'🇸🇦'},
  TR:{label:'Turquie',flag:'🇹🇷'},GR:{label:'Grèce',flag:'🇬🇷'},
};

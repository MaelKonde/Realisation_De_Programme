"""
Nom........ : api_flask.py
Description : API "Tendances Scientifiques" — calcule les agrégats
               (nuage de mots, carte par pays, évolution, suggestions,
               stats, top articles) CÔTÉ SERVEUR, via SQL + key_word.json.

⚠ POURQUOI CE CHOIX (relire avant de repasser en "front-first") :
Avec ~500 000 articles dans bdd.db, envoyer index_inverse_compte de
CHAQUE article au navigateur pour qu'il calcule lui-même le nuage de mots
prend plusieurs minutes (transfert + parsing JSON + calculs sur des
centaines de milliers d'objets). Ici, le calcul se fait en SQL avec des
échantillons bornés (LIMIT), donc la taille de la base n'a presque plus
d'impact sur le temps de réponse : le navigateur ne reçoit jamais que de
petits résultats déjà agrégés (quelques dizaines/centaines de mots-clés
ou d'articles), jamais des dizaines de milliers de lignes brutes.

Schéma SQLite (confirmé par alimenter_bdd.py) :
  articles(id, titre, date, langue, citations, index_inverse_compte)
    - index_inverse_compte : TEXT JSON {"mot": nombre_occurrences, ...}
  auteurs(id_article, nom, pays)
    - une ligne par (article, pays)
"""

import json
import os
import sqlite3
import time

from flask import Flask, jsonify, request
from flask_cors import CORS

application = Flask(__name__)
CORS(application)


# ─────────────────────────────────────────────────────────────────────────
# Cache mémoire simple (bdd.db ne change qu'au redéploiement)
# ─────────────────────────────────────────────────────────────────────────
_cache = {}
CACHE_TTL = 600  # 10 minutes


def cache_get(cle):
    entree = _cache.get(cle)
    if entree and (time.time() - entree[0]) < CACHE_TTL:
        return entree[1]
    return None


def cache_set(cle, valeur):
    _cache[cle] = (time.time(), valeur)


def connecter_bdd():
    connexion = sqlite3.connect("bdd.db")
    connexion.row_factory = sqlite3.Row
    return connexion


# ─────────────────────────────────────────────────────────────────────────
# Référentiel de mots-clés scientifiques (key_word.json = liste blanche)
# ─────────────────────────────────────────────────────────────────────────
CHEMIN_KEY_WORD = os.environ.get(
    "KEY_WORD_JSON", os.path.join(os.path.dirname(os.path.abspath(__file__)), "key_word.json")
)


def charger_referentiel(chemin):
    """key_word.json ({catégorie: [termes]}) -> mots simples + expressions
    composées (ex. "machine learning"). Ne fait jamais planter le
    démarrage : référentiel vide si le fichier est absent/invalide."""
    mots_simples, phrases = {}, []
    try:
        with open(chemin, encoding="utf-8") as f:
            categories = json.load(f)
        for categorie, termes in categories.items():
            for terme in termes:
                t = terme.lower().strip()
                if not t:
                    continue
                mots = t.split()
                if len(mots) == 1:
                    mots_simples[mots[0]] = categorie
                else:
                    phrases.append((tuple(mots), t, categorie))
    except FileNotFoundError:
        application.logger.warning("key_word.json introuvable (%s)", chemin)
    except (json.JSONDecodeError, TypeError, AttributeError):
        application.logger.exception("key_word.json invalide (%s)", chemin)
    phrases.sort(key=lambda item: len(item[0]), reverse=True)
    return mots_simples, phrases


MOTS_CLES_SIMPLES, PHRASES_CLES = charger_referentiel(CHEMIN_KEY_WORD)

# Échantillons (les articles les plus cités) pour ne jamais scanner toute
# la base à chaque requête sur les endpoints agrégés.
TAILLE_ECHANTILLON_MOIS = 250
TAILLE_ECHANTILLON_PAYS = 100
TAILLE_ECHANTILLON_EVOLUTION = 100
TAILLE_ECHANTILLON_SUGGESTIONS = 250


def extraire_mots(index_json_str, cible):
    """Ajoute à `cible` (mot -> poids cumulé) les mots-clés du référentiel
    trouvés dans un index_inverse_compte (JSON {"mot": nombre}).
    Pour une expression composée : le format est un simple compteur (pas
    des positions), donc pas de vérification de contiguïté possible — on
    vérifie juste que tous les mots de l'expression sont présents, avec un
    poids = le minimum de leurs comptes."""
    if not index_json_str:
        return
    try:
        compte = json.loads(index_json_str)
    except (json.JSONDecodeError, TypeError):
        return
    if not isinstance(compte, dict):
        return

    normalise = {}
    for mot, val in compte.items():
        m = mot.lower().strip()
        try:
            normalise[m] = normalise.get(m, 0) + int(val)
        except (TypeError, ValueError):
            continue

    for mot, n in normalise.items():
        if mot in MOTS_CLES_SIMPLES:
            cible[mot] = cible.get(mot, 0) + n

    for mots_phrase, phrase, _categorie in PHRASES_CLES:
        if all(m in normalise for m in mots_phrase):
            poids = min(normalise[m] for m in mots_phrase)
            cible[phrase] = cible.get(phrase, 0) + poids


def occurrences_mot_dans_index(mot, compte):
    """Occurrences d'un mot simple OU d'une expression composée dans un
    index_inverse_compte déjà décodé (dict)."""
    if not mot or not isinstance(compte, dict):
        return 0
    normalise = {}
    for m, v in compte.items():
        try:
            normalise[m.lower().strip()] = normalise.get(m.lower().strip(), 0) + int(v)
        except (TypeError, ValueError):
            continue
    mots_recherche = mot.split()
    if len(mots_recherche) == 1:
        return normalise.get(mots_recherche[0], 0)
    if all(m in normalise for m in mots_recherche):
        return min(normalise[m] for m in mots_recherche)
    return 0


def bornes_du_mois(mois):
    """'2025-03' -> ('2025-03-01', '2025-04-01')."""
    annee, mois_num = mois.split("-")
    annee, mois_num = int(annee), int(mois_num)
    debut = f"{annee:04d}-{mois_num:02d}-01"
    fin = f"{annee + 1:04d}-01-01" if mois_num == 12 else f"{annee:04d}-{mois_num + 1:02d}-01"
    return debut, fin


# ─────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────
@application.route("/health")
def health():
    return jsonify({"status": "ok"})


@application.route("/api/mois")
def api_mois():
    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT DISTINCT substr(date, 1, 7) AS mois
        FROM articles
        WHERE date IS NOT NULL AND date != ''
        ORDER BY mois
    """)
    mois = [ligne["mois"] for ligne in curseur.fetchall() if ligne["mois"]]
    connexion.close()
    return jsonify({"mois": mois})


@application.route("/api/mots-cles")
def api_mots_cles():
    mois = request.args.get("mois", "").strip()
    try:
        limite_mots = min(max(int(request.args.get("limit", 55)), 5), 150)
    except ValueError:
        limite_mots = 55

    cle_cache = f"mots-cles:{mois}:{limite_mots}"
    en_cache = cache_get(cle_cache)
    if en_cache is not None:
        return jsonify(en_cache)

    connexion = connecter_bdd()
    curseur = connexion.cursor()

    if mois:
        try:
            debut, fin = bornes_du_mois(mois)
            curseur.execute("""
                SELECT index_inverse_compte FROM articles
                WHERE date >= ? AND date < ?
                ORDER BY citations DESC LIMIT ?
            """, (debut, fin, TAILLE_ECHANTILLON_MOIS))
        except ValueError:
            mois = ""
            curseur.execute("""
                SELECT index_inverse_compte FROM articles
                ORDER BY citations DESC LIMIT ?
            """, (TAILLE_ECHANTILLON_MOIS,))
    else:
        curseur.execute("""
            SELECT index_inverse_compte FROM articles
            ORDER BY citations DESC LIMIT ?
        """, (TAILLE_ECHANTILLON_MOIS,))

    lignes = curseur.fetchall()
    connexion.close()

    compteur = {}
    for ligne in lignes:
        extraire_mots(ligne["index_inverse_compte"], compteur)

    mots = sorted(compteur.items(), key=lambda item: item[1], reverse=True)[:limite_mots]
    resultat = {
        "mois": mois or "tous",
        "mots": [{"mot": m, "poids": p} for m, p in mots],
        "echantillon": len(lignes),
    }
    cache_set(cle_cache, resultat)
    return jsonify(resultat)


@application.route("/api/pays")
def api_pays():
    try:
        limite_pays = min(max(int(request.args.get("limit_pays", 40)), 1), 60)
    except ValueError:
        limite_pays = 40
    try:
        limite_mots = min(max(int(request.args.get("mots_par_pays", 14)), 1), 30)
    except ValueError:
        limite_mots = 14

    cle_cache = f"pays:{limite_pays}:{limite_mots}"
    en_cache = cache_get(cle_cache)
    if en_cache is not None:
        return jsonify(en_cache)

    connexion = connecter_bdd()
    curseur = connexion.cursor()

    curseur.execute("""
        SELECT pays, COUNT(DISTINCT id_article) AS total
        FROM auteurs
        WHERE pays IS NOT NULL AND pays != ''
        GROUP BY pays
        ORDER BY total DESC
        LIMIT ?
    """, (limite_pays,))
    lignes_pays = curseur.fetchall()

    resultat = []
    for ligne_pays in lignes_pays:
        code = ligne_pays["pays"]
        curseur.execute("""
            SELECT articles.index_inverse_compte
            FROM articles
            JOIN auteurs ON auteurs.id_article = articles.id
            WHERE auteurs.pays = ?
            ORDER BY articles.citations DESC
            LIMIT ?
        """, (code, TAILLE_ECHANTILLON_PAYS))

        compteur = {}
        for ligne in curseur.fetchall():
            extraire_mots(ligne["index_inverse_compte"], compteur)
        mots = sorted(compteur.items(), key=lambda item: item[1], reverse=True)[:limite_mots]

        resultat.append({
            "code": code,
            "total": ligne_pays["total"],
            "mots": [{"mot": m, "poids": p} for m, p in mots],
        })

    connexion.close()
    resultat = {"pays": resultat}
    cache_set(cle_cache, resultat)
    return jsonify(resultat)


@application.route("/api/evolution")
def api_evolution():
    mot = request.args.get("mot", "").strip().lower()
    if not mot:
        return jsonify({"error": "Paramètre 'mot' requis."}), 400

    connexion = connecter_bdd()
    curseur = connexion.cursor()

    curseur.execute("""
        SELECT DISTINCT substr(date, 1, 7) AS mois
        FROM articles
        WHERE date IS NOT NULL AND date != ''
        ORDER BY mois
    """)
    tous_les_mois = [l["mois"] for l in curseur.fetchall() if l["mois"]]

    serie = []
    for mois in tous_les_mois:
        try:
            debut, fin = bornes_du_mois(mois)
        except ValueError:
            continue

        curseur.execute("""
            SELECT index_inverse_compte FROM articles
            WHERE date >= ? AND date < ?
            ORDER BY citations DESC LIMIT ?
        """, (debut, fin, TAILLE_ECHANTILLON_EVOLUTION))

        poids_mois = 0
        for ligne in curseur.fetchall():
            if not ligne["index_inverse_compte"]:
                continue
            try:
                compte = json.loads(ligne["index_inverse_compte"])
            except (json.JSONDecodeError, TypeError):
                continue
            poids_mois += occurrences_mot_dans_index(mot, compte)

        serie.append({"mois": mois, "poids": poids_mois})

    connexion.close()
    return jsonify({"mot": mot, "serie": serie})


@application.route("/api/articles-top")
def api_articles_top():
    mot = request.args.get("mot", "").strip().lower()
    try:
        limite = min(max(int(request.args.get("limit", 20)), 1), 100)
    except ValueError:
        limite = 20

    connexion = connecter_bdd()
    curseur = connexion.cursor()

    if mot:
        # Pré-filtre SQL sur le 1er mot (LIKE = scan, mais borné par LIMIT
        # côté résultats vérifiés ensuite en Python).
        premier_mot = mot.split()[0] if mot.split() else mot
        curseur.execute("""
            SELECT id, titre, date, langue, citations, index_inverse_compte
            FROM articles
            WHERE index_inverse_compte LIKE ?
            ORDER BY citations DESC
            LIMIT ?
        """, (f'%"{premier_mot}"%', limite * 5))

        lignes = []
        for ligne in curseur.fetchall():
            try:
                compte = json.loads(ligne["index_inverse_compte"] or "{}")
            except (json.JSONDecodeError, TypeError):
                continue
            if occurrences_mot_dans_index(mot, compte) > 0:
                lignes.append(ligne)
            if len(lignes) >= limite:
                break
    else:
        curseur.execute("""
            SELECT id, titre, date, langue, citations, index_inverse_compte
            FROM articles
            ORDER BY citations DESC
            LIMIT ?
        """, (limite,))
        lignes = curseur.fetchall()

    articles = []
    if lignes:
        ids = [ligne["id"] for ligne in lignes]
        marqueurs = ",".join("?" for _ in ids)
        curseur.execute(f"""
            SELECT id_article, nom, pays FROM auteurs
            WHERE id_article IN ({marqueurs})
        """, ids)
        auteurs_par_article = {}
        for ligne_auteur in curseur.fetchall():
            auteurs_par_article.setdefault(ligne_auteur["id_article"], []).append(
                {"nom": ligne_auteur["nom"], "pays": ligne_auteur["pays"]}
            )

        for ligne in lignes:
            compteur_mots = {}
            extraire_mots(ligne["index_inverse_compte"], compteur_mots)
            mots_article = sorted(compteur_mots.items(), key=lambda item: item[1], reverse=True)[:10]

            articles.append({
                "id": ligne["id"],
                "titre": ligne["titre"],
                "date": ligne["date"],
                "langue": ligne["langue"],
                "citations": ligne["citations"],
                "auteurs": auteurs_par_article.get(ligne["id"], []),
                "mots_cles": [m for m, _ in mots_article],
                "pays": sorted({a["pays"] for a in auteurs_par_article.get(ligne["id"], []) if a["pays"]}),
            })

    connexion.close()
    return jsonify({"articles": articles, "mot": mot or None})


@application.route("/api/suggestions")
def api_suggestions():
    try:
        limite = min(max(int(request.args.get("limit", 20)), 1), 40)
    except ValueError:
        limite = 20

    cle_cache = f"suggestions:{limite}"
    en_cache = cache_get(cle_cache)
    if en_cache is not None:
        return jsonify(en_cache)

    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT index_inverse_compte FROM articles
        ORDER BY citations DESC LIMIT ?
    """, (TAILLE_ECHANTILLON_SUGGESTIONS,))

    compteur = {}
    for ligne in curseur.fetchall():
        extraire_mots(ligne["index_inverse_compte"], compteur)
    connexion.close()

    mots = sorted(compteur.items(), key=lambda item: item[1], reverse=True)[:limite]
    resultat = {"suggestions": [m for m, _ in mots]}
    cache_set(cle_cache, resultat)
    return jsonify(resultat)


@application.route("/api/stats-globales")
def api_stats_globales():
    en_cache = cache_get("stats-globales")
    if en_cache is not None:
        return jsonify(en_cache)

    connexion = connecter_bdd()
    curseur = connexion.cursor()

    curseur.execute("SELECT COUNT(*) AS n, SUM(citations) AS total_citations FROM articles")
    ligne = curseur.fetchone()
    total_articles = ligne["n"] or 0
    total_citations = ligne["total_citations"] or 0

    curseur.execute("SELECT COUNT(DISTINCT pays) AS n FROM auteurs WHERE pays IS NOT NULL AND pays != ''")
    total_pays = curseur.fetchone()["n"] or 0

    curseur.execute("""
        SELECT COUNT(DISTINCT substr(date, 1, 7)) AS n
        FROM articles WHERE date IS NOT NULL AND date != ''
    """)
    total_mois = curseur.fetchone()["n"] or 0

    connexion.close()
    resultat = {
        "total_articles": total_articles,
        "total_citations": total_citations,
        "total_pays": total_pays,
        "total_mois": total_mois,
    }
    cache_set("stats-globales", resultat)
    return jsonify(resultat)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    application.run(host="0.0.0.0", port=port, debug=True)

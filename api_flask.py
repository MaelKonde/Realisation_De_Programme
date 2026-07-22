"""
Nom........ : api_flask.py
Description : API Flask pour "Tendances Scientifiques" (nuage de mots par mois,
               carte mondiale par pays, évolution temporelle d'un mot-clé,
               articles les plus cités).
Usage : python3 api_flask.py
"""

import sqlite3

from flask import Flask, jsonify, request
from flask_cors import CORS

application = Flask(__name__)
CORS(application)

# Plafond de sécurité pour /articles/recherche : couvre largement le plus
# gros usage légitime (échantillon pour la carte des pays), sans permettre
# un ?limite=1000000 qui recréerait le problème de départ.
LIMITE_RECHERCHE_MAX = 40000


def connecter_bdd():
    connexion = sqlite3.connect("bdd.db")
    connexion.row_factory = sqlite3.Row
    return connexion


@application.route("/health")
def health():
    """Utilisé par Render pour vérifier que le service est prêt (healthCheckPath)."""
    return jsonify({"status": "ok"})


# ─────────────────────────────────────────────────────────────────────────
# Nouvelles routes (précalculées) — utiliseé par le front
# ─────────────────────────────────────────────────────────────────────────

@application.route("/agregats/nuage")
def agregats_nuage():
    """Nuage de mots-clés précalculé (par mois + global), écrit une fois par
    precompute.py dans la table `agregats`. Quelques centaines de Ko max,
    quel que soit le nombre d'articles en base."""
    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("SELECT valeur FROM agregats WHERE cle = 'nuage_mots'")
    ligne = curseur.fetchone()
    connexion.close()

    if not ligne:
        # precompute.py n'a pas encore tourné sur cette bdd.db.
        return jsonify({
            "par_mois": {},
            "global": {},
            "total_articles": 0,
            "total_citations": 0,
            "total_mois": 0,
        })

    return application.response_class(ligne["valeur"], mimetype="application/json")


@application.route("/articles/recherche")
def recherche_articles():
    """Recherche/filtrage d'articles fait entièrement en SQL (indexé), avec
    auteurs embarqués (pas d'appel séparé à /auteurs/<id> par article).

    Paramètres (tous optionnels) :
      - mot    : mot-clé du référentiel -> lookup indexé dans `mot_articles`
                 (précalculé par precompute.py), donc pas de scan de `articles`.
      - q      : sous-chaîne recherchée dans le titre (LIKE).
      - mois   : filtre sur le mois (format YYYY-MM).
      - limite : nombre de résultats (défaut 20, plafonné à LIMITE_RECHERCHE_MAX).

    Sans aucun paramètre : renvoie le top articles par citations (utilisé
    pour l'échantillon de la carte des pays).
    """
    mot = (request.args.get("mot") or "").lower().strip()
    q = (request.args.get("q") or "").strip()
    mois = (request.args.get("mois") or "").strip()
    try:
        limite = min(max(int(request.args.get("limite", 20)), 1), LIMITE_RECHERCHE_MAX)
    except ValueError:
        limite = 20

    connexion = connecter_bdd()
    curseur = connexion.cursor()

    if mot:
        # Chemin rapide : lecture indexée dans mot_articles (mot, citations)
        # ou (mot, mois, citations) — jamais de scan de `articles`.
        if mois:
            curseur.execute("""
                SELECT article_id FROM mot_articles
                WHERE mot = ? AND mois = ?
                ORDER BY citations DESC LIMIT ?
            """, (mot, mois, limite))
        else:
            curseur.execute("""
                SELECT article_id FROM mot_articles
                WHERE mot = ?
                ORDER BY citations DESC LIMIT ?
            """, (mot, limite))
        ids = [r["article_id"] for r in curseur.fetchall()]

        if not ids:
            connexion.close()
            return jsonify([])

        placeholders = ",".join("?" * len(ids))
        params = list(ids)
        where_titre = ""
        if q:
            where_titre = " AND a.titre LIKE ?"
            params.append(f"%{q}%")

        curseur.execute(f"""
            SELECT a.id, a.titre, a.date, a.langue, a.citations, a.index_inverse_compte,
                   GROUP_CONCAT(au.nom || '|' || au.pays, ';;') AS auteurs_bruts
            FROM articles a
            LEFT JOIN auteurs au ON au.id_article = a.id
            WHERE a.id IN ({placeholders}){where_titre}
            GROUP BY a.id
            ORDER BY a.citations DESC
        """, params)
    else:
        # Pas de mot-clé : recherche par titre et/ou mois, ou top articles bruts
        # (utilisé sans filtre pour l'échantillon de la carte des pays).
        #
        # ⚠ Ne JAMAIS joindre `auteurs` avant d'avoir limité `articles` : avec
        # GROUP BY + ORDER BY + LIMIT sur une requête jointe, SQLite ne peut
        # pas utiliser l'index sur `citations` — il doit joindre + regrouper
        # TOUTE la table avant de trier et de couper au LIMIT (mesuré : passe
        # de ~150ms à ~9ms sur un jeu de 100k lignes en corrigeant ce point;
        # à 500k+ lignes en production, c'est la cause des "quelques minutes"
        # de chargement des pays/de la carte). Solution : sélectionner
        # d'abord les IDs triés (index utilisé), puis ne joindre `auteurs`
        # que sur ce petit ensemble.
        conditions, params = [], []
        if q:
            conditions.append("titre LIKE ?")
            params.append(f"%{q}%")
        if mois:
            conditions.append("date LIKE ?")
            params.append(f"{mois}%")
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        curseur.execute(f"""
            SELECT id FROM articles
            {where}
            ORDER BY citations DESC LIMIT ?
        """, (*params, limite))
        ids = [r["id"] for r in curseur.fetchall()]

        if not ids:
            connexion.close()
            return jsonify([])

        placeholders = ",".join("?" * len(ids))
        curseur.execute(f"""
            SELECT a.id, a.titre, a.date, a.langue, a.citations, a.index_inverse_compte,
                   GROUP_CONCAT(au.nom || '|' || au.pays, ';;') AS auteurs_bruts
            FROM articles a
            LEFT JOIN auteurs au ON au.id_article = a.id
            WHERE a.id IN ({placeholders})
            GROUP BY a.id
            ORDER BY a.citations DESC
        """, ids)

    lignes = curseur.fetchall()
    connexion.close()

    articles = []
    for ligne in lignes:
        auteurs = []
        if ligne["auteurs_bruts"]:
            for entree in ligne["auteurs_bruts"].split(";;"):
                nom, pays = entree.split("|", 1)
                auteurs.append({"nom": nom, "pays": pays})
        articles.append({
            "id": ligne["id"],
            "titre": ligne["titre"],
            "date": ligne["date"],
            "langue": ligne["langue"],
            "citations": ligne["citations"],
            "index_inverse_compte": ligne["index_inverse_compte"],
            "auteurs": auteurs,
        })

    return jsonify(articles)


# ─────────────────────────────────────────────────────────────────────────
# Routes historiques — conservées pour compatibilité, non appelées par le
# front depuis le passage à /agregats/nuage + /articles/recherche.
# ─────────────────────────────────────────────────────────────────────────

@application.route("/articles/count")
def compter_articles():
    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("SELECT COUNT(*) AS n FROM articles")
    total = curseur.fetchone()["n"]
    connexion.close()
    return jsonify({"total": total})


@application.route("/articles/page/<int:numero>")
def page_articles(numero):
    try:
        taille = min(max(int(request.args.get("taille", 500)), 1), 2000)
    except ValueError:
        taille = 500

    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT id, titre, date, langue, citations, index_inverse_compte
        FROM articles
        ORDER BY date DESC
        LIMIT ? OFFSET ?
    """, (taille, numero * taille))
    lignes = curseur.fetchall()
    connexion.close()

    articles = [
        {
            "id": ligne["id"],
            "titre": ligne["titre"],
            "date": ligne["date"],
            "langue": ligne["langue"],
            "citations": ligne["citations"],
            "index_inverse_compte": ligne["index_inverse_compte"],
        }
        for ligne in lignes
    ]
    return jsonify(articles)


@application.route("/articles/<int:limite>")
def liste_articles(limite):
    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT id, titre, date, langue, citations, index_inverse_compte
        FROM articles
        ORDER BY date DESC
        LIMIT ?
    """, (limite,))
    lignes = curseur.fetchall()
    connexion.close()

    articles = [
        {
            "id": ligne["id"],
            "titre": ligne["titre"],
            "date": ligne["date"],
            "langue": ligne["langue"],
            "citations": ligne["citations"],
            "index_inverse_compte": ligne["index_inverse_compte"],
        }
        for ligne in lignes
    ]
    return jsonify(articles)


@application.route("/auteurs/<path:id_article>")
def liste_auteurs(id_article):
    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT nom, pays
        FROM auteurs
        WHERE id_article = ?
    """, (id_article,))
    lignes = curseur.fetchall()
    connexion.close()

    auteurs = [
        {"nom": ligne["nom"], "pays": ligne["pays"]}
        for ligne in lignes
    ]
    return jsonify(auteurs)


if __name__ == "__main__":
    # Utilisé uniquement en local (`python3 api_flask.py`).
    # En production sur Render, c'est gunicorn qui démarre l'app.
    import os
    port = int(os.environ.get("PORT", 5000))
    application.run(host="0.0.0.0", port=port, debug=True)

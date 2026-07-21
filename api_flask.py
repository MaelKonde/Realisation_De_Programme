"""
Nom........ : api_flask.py
Description : Renvoie les données de la base de données par le biais d'une API Flask
"""
import sqlite3

from flask import Flask, jsonify, request
from flask_cors import CORS

application = Flask(__name__)
CORS(application)


# ---------------------------------------------------------------------
# Connexion SQLite
# ---------------------------------------------------------------------

def connecter_bdd():
    connexion = sqlite3.connect("bdd.db")

    connexion.row_factory = sqlite3.Row

    # améliore légèrement les performances
    connexion.execute("PRAGMA journal_mode=WAL")
    connexion.execute("PRAGMA synchronous=NORMAL")

    return connexion


# ---------------------------------------------------------------------
# Nombre total d'articles
# ---------------------------------------------------------------------

@application.route("/count")
def nombre_articles():

    connexion = connecter_bdd()

    curseur = connexion.cursor()

    curseur.execute("SELECT COUNT(*) FROM articles")

    total = curseur.fetchone()[0]

    connexion.close()

    return jsonify({
        "total": total
    })


# ---------------------------------------------------------------------
# Liste paginée des articles
# Exemple :
# /articles?page=1&limit=50
# ---------------------------------------------------------------------

@application.route("/articles")
def liste_articles():

    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 50))

    if page < 1:
        page = 1

    if limit < 1:
        limit = 50

    if limit > 500:
        limit = 500

    offset = (page - 1) * limit

    connexion = connecter_bdd()

    curseur = connexion.cursor()

    curseur.execute("""
        SELECT
            id,
            titre,
            date,
            langue,
            citations
        FROM articles
        ORDER BY date DESC
        LIMIT ?
        OFFSET ?
    """, (limit, offset))

    lignes = curseur.fetchall()

    connexion.close()

    articles = []

    for ligne in lignes:

        articles.append({

            "id": ligne["id"],
            "titre": ligne["titre"],
            "date": ligne["date"],
            "langue": ligne["langue"],
            "citations": ligne["citations"]

        })

    return jsonify(articles)


# ---------------------------------------------------------------------
# Recherche
# Exemple :
# /recherche?q=transformer
# ---------------------------------------------------------------------

@application.route("/recherche")
def recherche():

    texte = request.args.get("q", "").strip()

    connexion = connecter_bdd()

    curseur = connexion.cursor()

    curseur.execute("""
        SELECT
            id,
            titre,
            date,
            langue,
            citations
        FROM articles
        WHERE titre LIKE ?
        ORDER BY date DESC
        LIMIT 100
    """, (f"%{texte}%",))

    lignes = curseur.fetchall()

    connexion.close()

    resultat = []

    for ligne in lignes:

        resultat.append({

            "id": ligne["id"],
            "titre": ligne["titre"],
            "date": ligne["date"],
            "langue": ligne["langue"],
            "citations": ligne["citations"]

        })

    return jsonify(resultat)


# ---------------------------------------------------------------------
# Auteurs
# ---------------------------------------------------------------------

@application.route("/auteurs/<path:id_article>")
def liste_auteurs(id_article):

    connexion = connecter_bdd()

    curseur = connexion.cursor()

    curseur.execute("""
        SELECT
            nom,
            pays
        FROM auteurs
        WHERE id_article = ?
    """, (id_article,))

    lignes = curseur.fetchall()

    connexion.close()

    auteurs = []

    for ligne in lignes:

        auteurs.append({

            "nom": ligne["nom"],
            "pays": ligne["pays"]

        })

    return jsonify(auteurs)


# ---------------------------------------------------------------------

if __name__ == "__main__":

    application.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )

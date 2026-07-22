"""
Nom........ : api_flask.py
Description : API Flask "Tendances Scientifiques" — renvoie les articles
              (paginés) et les auteurs/pays associés, lus depuis bdd.db.

Contrat attendu par le front (app.js) :
  GET /articles/count
      -> {"total": <nombre total de lignes dans articles>}
  GET /articles/page/<numero>?taille=<taille>
      -> [ {id, titre, date, langue, citations, index_inverse_compte}, ... ]
         (page 0-indexée : numero=0 -> les <taille> premiers articles,
          numero=1 -> les <taille> suivants, etc. — triés par date DESC
          pour un ordre stable entre 2 appels)
  GET /auteurs/<id_article>
      -> [ {nom, pays}, ... ]
         ⚠ id_article est une URL OpenAlex complète (contient des "/"),
         d'où <path:id_article> plutôt que <id_article> dans la route.

Schéma SQLite attendu (voir alimenter_bdd.py) :
  articles(id, titre, date, langue, citations, index_inverse_compte)
  auteurs(id_article, nom, pays)   -- une ligne par (article, pays)
"""

import sqlite3
from flask import Flask, jsonify, request
from flask_cors import CORS

application = Flask(__name__)
CORS(application)  # le front est un site statique servi depuis un autre domaine


def connecter_bdd():
    connexion = sqlite3.connect("bdd.db")
    connexion.row_factory = sqlite3.Row
    return connexion


@application.route("/health")
def health():
    return jsonify({"status": "ok"})


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
        taille = int(request.args.get("taille", 500))
    except ValueError:
        taille = 500
    taille = min(max(taille, 1), 5000)  # garde-fou : évite un ?taille=999999999
    offset = numero * taille

    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT id, titre, date, langue, citations, index_inverse_compte
        FROM articles
        ORDER BY date DESC, id DESC
        LIMIT ? OFFSET ?
    """, (taille, offset))
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
    application.run(debug=True)

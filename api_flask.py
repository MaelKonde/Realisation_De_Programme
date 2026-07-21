"""
Nom........ : api_flask.py
Description : Renvoie les données de la base de données par le biais d'une API Flask

⚠ Version "front-first" : ce fichier reste volontairement proche de la
version de départ (2 routes, aucune logique de mots-clés côté serveur).
Tout le calcul (nuage de mots, carte par pays, évolution, suggestions,
stats) est fait côté client dans app.js, à partir de key_word.json et des
données brutes renvoyées ici.

Seules 2 modifications ont été faites par rapport à la version de départ,
et elles sont indispensables (pas de confort, de vrais blocages) :
  1. `index_inverse_compte` ajouté au SELECT de /articles/<limite> — sans
     ça, aucune donnée sur les mots-clés n'atteint jamais le navigateur,
     quoi qu'on fasse côté front.
  2. `<id_article>` -> `<path:id_article>` — l'id d'un article est une URL
     OpenAlex complète (ex. https://openalex.org/W123...), qui contient des
     "/". Le convertisseur Flask par défaut ne matche PAS les "/", donc
     /auteurs/<id_article> renvoyait un 404 sur absolument tous les
     articles réels (testé : voir la conversation).
"""

import sqlite3
from flask import Flask, jsonify
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
        {
            "nom": ligne["nom"],
            "pays": ligne["pays"]
        }
        for ligne in lignes
    ]

    return jsonify(auteurs)


if __name__ == "__main__":
    application.run(debug=True)

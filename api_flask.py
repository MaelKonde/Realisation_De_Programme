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

import json
import sqlite3
from flask import Flask, jsonify, request, Response, stream_with_context
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
    """Nombre total de lignes dans `articles` — permet au front de savoir
    combien de pages demander (voir /articles/<limite>?offset=...)."""
    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("SELECT COUNT(*) AS n FROM articles")
    total = curseur.fetchone()["n"]
    connexion.close()
    return jsonify({"total": total})


@application.route("/articles/<int:limite>")
def liste_articles(limite):
    """Renvoie une PAGE d'articles (paramètre ?offset=... pour les pages
    suivantes), en streamant la réponse ligne par ligne plutôt que de
    construire toute la liste en mémoire avant de répondre.

    ⚠ Pourquoi le streaming est indispensable ici (et pas juste "plus de
    RAM") : jsonify(une_grosse_liste) construit d'abord TOUTE la liste
    Python en mémoire, PUIS sérialise TOUT le JSON en une seule chaîne,
    PUIS l'envoie — pendant tout ce temps, le worker gunicorn qui traite
    cette requête est bloqué et ne peut répondre à rien d'autre (y compris
    /health). En streamant ligne par ligne, la mémoire utilisée reste
    proportionnelle à UNE ligne à la fois, peu importe la taille totale de
    la base — et le corps de la réponse commence à partir tout de suite.
    """
    offset = request.args.get("offset", 0, type=int)

    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT id, titre, date, langue, citations, index_inverse_compte
        FROM articles
        ORDER BY date DESC
        LIMIT ? OFFSET ?
    """, (limite, offset))

    def generer():
        yield "["
        premiere_ligne = True
        for ligne in curseur:
            if not premiere_ligne:
                yield ","
            premiere_ligne = False
            yield json.dumps({
                "id": ligne["id"],
                "titre": ligne["titre"],
                "date": ligne["date"],
                "langue": ligne["langue"],
                "citations": ligne["citations"],
                "index_inverse_compte": ligne["index_inverse_compte"],
            })
        yield "]"
        connexion.close()

    return Response(stream_with_context(generer()), mimetype="application/json")


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

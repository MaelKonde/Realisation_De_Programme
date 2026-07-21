"""
Nom........ : api_flask.py
Description : Renvoie les données de la base de données par le biais d'une API Flask

⚠ Version "front-first" : ce fichier reste volontairement proche de la
version de départ (2 routes principales, aucune logique de mots-clés côté
serveur). Tout le calcul (nuage de mots, carte par pays, évolution,
suggestions, stats) est fait côté client dans app.js, à partir de
key_word.json et des données brutes renvoyées ici.

Modifications par rapport à la version de départ (toutes indispensables,
pas de confort) :
  1. CORS activé — le front est un site statique servi depuis un autre
     domaine ; sans ça le navigateur bloque toute requête cross-origin.
  2. `index_inverse_compte` ajouté au SELECT de /articles/<limite> — sans
     ça, aucune donnée sur les mots-clés n'atteint jamais le navigateur.
  3. `<id_article>` -> `<path:id_article>` — l'id d'un article est une URL
     OpenAlex complète (https://openalex.org/W123...), qui contient des
     "/". Le convertisseur Flask par défaut ne matche PAS les "/", donc
     /auteurs/<id_article> renvoyait un 404 sur tous les articles réels.
  4. /health ajoutée — nécessaire pour le health check Render.
  5. /articles/count ajoutée — pour connaître le vrai total sans deviner.
  6. /articles/<limite> accepte ?offset=... et STREAME sa réponse ligne
     par ligne (au lieu de tout charger en mémoire avant de répondre) :
     indispensable pour charger tous les articles sans faire planter le
     service (mémoire + health check bloqué pendant une grosse requête).
"""

import json
import sqlite3
from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS

application = Flask(__name__)
CORS(application)


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

    ⚠ Le streaming est indispensable pour charger TOUS les articles sans
    faire planter le service : jsonify(une_grosse_liste) construit d'abord
    toute la liste Python en mémoire, PUIS sérialise tout le JSON d'un
    coup, PUIS l'envoie — pendant ce temps le worker gunicorn est bloqué
    et ne peut répondre à rien d'autre (y compris /health). En streamant
    ligne par ligne, la mémoire utilisée reste proportionnelle à UNE ligne
    à la fois, peu importe la taille totale de la base.
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

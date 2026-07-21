"""
Nom........ : api_flask.py
Description : Renvoie les données de la base de données par le biais d'une API Flask

⚠ Version "front-first" : ce fichier reste volontairement proche de la
version de départ (routes simples, aucune logique de mots-clés côté
serveur). Tout le calcul (nuage de mots, carte par pays, évolution,
suggestions, stats) est fait côté client dans app.js, à partir de
key_word.json et des données brutes renvoyées ici.

Modifications par rapport à la toute première version, chacune corrigeant
un blocage réel (pas du confort) :
  1. CORS activé — sans ça, le navigateur bloque toute requête cross-origin
     depuis le front (domaine différent de l'API), avant même qu'elle ne
     parte. Pas contournable côté front, quel que soit le code de app.js.
  2. `index_inverse_compte` ajouté au SELECT — sans lui, aucune donnée sur
     les mots-clés n'atteint jamais le navigateur.
  3. `<id_article>` -> `<path:id_article>` — l'id d'un article est une URL
     OpenAlex complète (https://openalex.org/W123...), qui contient des
     "/". Le convertisseur Flask par défaut ne matche PAS les "/", donc
     /auteurs/<id_article> renvoyait un 404 sur absolument tous les
     articles réels (testé et confirmé).
  4. /articles/count + /articles/page/<numero> ajoutés — un seul appel
     /articles/<très_grand_nombre> pour "tout charger d'un coup" peut
     saturer le service (temps de requête + sérialisation JSON d'un coup
     trop long/gros), quelle que soit la RAM allouée à l'instance. La
     pagination borne le coût de CHAQUE requête individuelle, donc plus de
     risque de timeout/OOM peu importe la taille totale de la base.
     /articles/<limite> est conservé pour compatibilité mais ne devrait
     plus être utilisé pour charger tout le jeu de données d'un coup.
"""

import sqlite3
from flask import Flask, jsonify, request
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
    combien de pages demander via /articles/page/<numero>."""
    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("SELECT COUNT(*) AS n FROM articles")
    total = curseur.fetchone()["n"]
    connexion.close()
    return jsonify({"total": total})


@application.route("/articles/page/<int:numero>")
def page_articles(numero):
    """Pagination : renvoie une page de `taille` articles (0-indexée).
    Permet au front de charger TOUS les articles sans jamais faire une
    seule requête géante. `taille` est plafonnée à 2000 pour ne pas
    pouvoir recréer le même problème par erreur (ex. ?taille=1000000)."""
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
    """Conservé pour compatibilité — préférer /articles/page/<n> pour
    charger de grandes quantités d'articles (voir pourquoi en tête de
    fichier)."""
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

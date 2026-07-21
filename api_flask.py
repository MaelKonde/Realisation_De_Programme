"""
Nom........ : api_flask.py
Description : API Flask pour "Tendances Scientifiques" (nuage de mots par mois,
               carte mondiale par pays, évolution temporelle d'un mot-clé,
               articles les plus cités).
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

# api_flask.py

@application.route("/agregats/nuage")
def agregats_nuage():
    """Nuage de mots précalculé par mois + global.
    Calculé une fois via un script batch (precompute.py), stocké
    dans une table `agregats` ou un fichier JSON servi tel quel."""
    connexion = connecter_bdd()
    curseur = connexion.cursor()
    curseur.execute("SELECT valeur FROM agregats WHERE cle = 'nuage_mots'")
    ligne = curseur.fetchone()
    connexion.close()
    return application.response_class(ligne["valeur"], mimetype="application/json")

@application.route("/articles/recherche")
def recherche_articles():
    """Recherche + tri fait par SQL, pas par le navigateur."""
    q = request.args.get("q", "")
    mois = request.args.get("mois", "")
    limite = min(int(request.args.get("limite", 20)), 100)
    connexion = connecter_bdd()
    curseur = connexion.cursor()
    conditions, params = [], []
    if q:
        conditions.append("titre LIKE ?")
        params.append(f"%{q}%")
    if mois:
        conditions.append("date LIKE ?")
        params.append(f"{mois}%")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    curseur.execute(f"""
        SELECT id, titre, date, langue, citations
        FROM articles {where}
        ORDER BY citations DESC LIMIT ?
    """, (*params, limite))
    lignes = curseur.fetchall()
    connexion.close()
    return jsonify([dict(l) for l in lignes])

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

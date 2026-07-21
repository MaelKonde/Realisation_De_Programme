"""
Nom........ : download_db.py
Description : Télécharge bdd.db depuis la Release GitHub au moment du build
              Render (le disque de Render est reconstruit à chaque
              déploiement, donc ce script doit tourner avant chaque
              démarrage du service — voir buildCommand dans render.yaml).
Usage...... : python download_db.py
"""
import os
import sqlite3
import sys
import urllib.request

DB_URL = os.environ.get(
    "DB_DOWNLOAD_URL",
    "https://github.com/MaelKonde/RealisationDeProgramme/releases/download/v1-db/bdd.db",
)
OUTPUT = "bdd.db"


def creer_index():
    """Crée les index une seule fois, ici au build, plutôt qu'à chaque
    démarrage de l'app (api_flask.py) — un service gratuit Render se
    redémarre à chaque réveil après mise en veille (15 min d'inactivité),
    et reconstruire des index sur ~1,3 Go de données à chaque réveil est
    inutilement lourd (risque d'OOM sur les 512 Mo de RAM du plan gratuit)."""
    print("Création des index SQLite...")
    try:
        connexion = sqlite3.connect(OUTPUT)
        curseur = connexion.cursor()
        curseur.execute("CREATE INDEX IF NOT EXISTS idx_articles_citations ON articles(citations)")
        curseur.execute("CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date)")
        curseur.execute("CREATE INDEX IF NOT EXISTS idx_auteurs_id_article ON auteurs(id_article)")
        curseur.execute("CREATE INDEX IF NOT EXISTS idx_auteurs_pays ON auteurs(pays)")
        connexion.commit()
        connexion.close()
        print("OK : index créés.")
    except Exception as exc:
        # On ne fait pas échouer le build pour autant : les index sont une
        # optimisation, pas un pré-requis pour que l'API réponde.
        print(f"AVERTISSEMENT : création des index impossible ({exc}) — "
              f"vérifie le nom des tables/colonnes si l'erreur persiste.", file=sys.stderr)


def main() -> None:
    print(f"Téléchargement de {OUTPUT} depuis {DB_URL} ...")
    try:
        # Les Releases GitHub redirigent vers un lien de stockage signé (302) ;
        # urllib suit les redirections automatiquement.
        req = urllib.request.Request(DB_URL, headers={"User-Agent": "render-build"})
        with urllib.request.urlopen(req) as reponse, open(OUTPUT, "wb") as fichier:
            taille_totale = reponse.getheader("Content-Length")
            taille_totale = int(taille_totale) if taille_totale else None
            telecharge = 0
            bloc = 1024 * 1024  # 1 Mo
            while True:
                morceau = reponse.read(bloc)
                if not morceau:
                    break
                fichier.write(morceau)
                telecharge += len(morceau)
                if taille_totale:
                    pourcent = telecharge / taille_totale * 100
                    print(f"  {telecharge / (1024*1024):.0f} Mo / {taille_totale / (1024*1024):.0f} Mo ({pourcent:.0f}%)", end="\r")
        print()
    except Exception as exc:
        print(f"ERREUR : le téléchargement a échoué : {exc}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(OUTPUT) or os.path.getsize(OUTPUT) < 1024:
        print("ERREUR : le fichier téléchargé est vide ou introuvable.", file=sys.stderr)
        sys.exit(1)

    taille_mo = os.path.getsize(OUTPUT) / (1024 * 1024)
    print(f"OK : {OUTPUT} téléchargé ({taille_mo:.1f} Mo).")

    creer_index()


if __name__ == "__main__":
    main()

"""
Nom........ : download_db.py
Description : Télécharge bdd.db depuis la Release GitHub, UNE SEULE FOIS,
              vers un disque persistant Render (voir render.yaml : disk
              monté sur DB_DIR). Ne retélécharge que si le fichier est
              absent ou si sa taille diffère de celle annoncée par GitHub
              (HEAD request), au lieu de le refaire à chaque déploiement.

              Le script doit tourner dans le startCommand (au démarrage
              du conteneur), PAS dans le buildCommand : l'environnement de
              build de Render est éphémère et n'a pas accès au disque
              persistant, qui n'est monté qu'au runtime du service.
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

# Répertoire du disque persistant Render (voir render.yaml -> disks.mountPath).
# En local (pas de disque monté), retombe sur le dossier courant.
DB_DIR = os.environ.get("DB_DIR", ".")
OUTPUT = os.path.join(DB_DIR, "bdd.db")


def taille_distante() -> int | None:
    """HEAD request pour connaître la taille du fichier sur GitHub, sans le
    télécharger. Permet de savoir si le fichier local est déjà à jour."""
    try:
        req = urllib.request.Request(DB_URL, method="HEAD", headers={"User-Agent": "render-build"})
        with urllib.request.urlopen(req) as reponse:
            taille = reponse.getheader("Content-Length")
            return int(taille) if taille else None
    except Exception as exc:
        print(f"AVERTISSEMENT : impossible de vérifier la taille distante ({exc}).", file=sys.stderr)
        return None


def fichier_local_a_jour() -> bool:
    """True si bdd.db existe déjà sur le disque persistant et que sa taille
    correspond à celle de la Release GitHub (donc pas besoin de retélécharger
    ~1,3 Go à chaque déploiement)."""
    if not os.path.exists(OUTPUT):
        return False
    taille_locale = os.path.getsize(OUTPUT)
    if taille_locale < 1024:
        return False  # fichier tronqué/corrompu d'un run précédent
    distante = taille_distante()
    if distante is None:
        # Impossible de vérifier : on garde le fichier local existant plutôt
        # que de forcer un téléchargement de 1,3 Go à chaque incertitude.
        print("Vérification impossible — conservation du fichier local existant.")
        return True
    return taille_locale == distante


def telecharger() -> None:
    print(f"Téléchargement de {OUTPUT} depuis {DB_URL} ...")
    tmp = OUTPUT + ".tmp"
    try:
        req = urllib.request.Request(DB_URL, headers={"User-Agent": "render-build"})
        with urllib.request.urlopen(req) as reponse, open(tmp, "wb") as fichier:
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
        if os.path.exists(tmp):
            os.remove(tmp)
        sys.exit(1)

    if not os.path.exists(tmp) or os.path.getsize(tmp) < 1024:
        print("ERREUR : le fichier téléchargé est vide ou introuvable.", file=sys.stderr)
        if os.path.exists(tmp):
            os.remove(tmp)
        sys.exit(1)

    # Remplacement atomique : évite de laisser un bdd.db à moitié écrit si
    # le process est tué en plein téléchargement (redéploiement, etc.).
    os.replace(tmp, OUTPUT)
    taille_mo = os.path.getsize(OUTPUT) / (1024 * 1024)
    print(f"OK : {OUTPUT} téléchargé ({taille_mo:.1f} Mo).")


def creer_index() -> None:
    """Crée les index une seule fois (idempotent grâce à IF NOT EXISTS) —
    quasi instantané si les index existent déjà, donc sans risque même
    appelé à chaque démarrage."""
    print("Vérification des index SQLite...")
    try:
        connexion = sqlite3.connect(OUTPUT)
        curseur = connexion.cursor()
        curseur.execute("CREATE INDEX IF NOT EXISTS idx_articles_citations ON articles(citations)")
        curseur.execute("CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date)")
        curseur.execute("CREATE INDEX IF NOT EXISTS idx_auteurs_id_article ON auteurs(id_article)")
        curseur.execute("CREATE INDEX IF NOT EXISTS idx_auteurs_pays ON auteurs(pays)")
        connexion.commit()
        connexion.close()
        print("OK : index prêts.")
    except Exception as exc:
        # On ne fait pas échouer le démarrage pour autant : les index sont
        # une optimisation, pas un pré-requis pour que l'API réponde.
        print(f"AVERTISSEMENT : création des index impossible ({exc}) — "
              f"vérifie le nom des tables/colonnes si l'erreur persiste.", file=sys.stderr)


def main() -> None:
    os.makedirs(DB_DIR, exist_ok=True)

    if fichier_local_a_jour():
        taille_mo = os.path.getsize(OUTPUT) / (1024 * 1024)
        print(f"OK : {OUTPUT} déjà à jour ({taille_mo:.1f} Mo) — téléchargement sauté.")
    else:
        telecharger()

    creer_index()


if __name__ == "__main__":
    main()

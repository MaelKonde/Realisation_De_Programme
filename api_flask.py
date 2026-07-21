# api_flask.py
import sqlite3
from flask import Flask, jsonify, request
from flask_cors import CORS

application = Flask(__name__)
CORS(application)

DB_PATH="bdd.db"

def connecter_bdd():
    c=sqlite3.connect(DB_PATH)
    c.row_factory=sqlite3.Row
    return c

@application.route("/health")
def health():
    return jsonify({"status":"ok"})

@application.route("/agregats/nuage")
def agregats_nuage():
    conn=connecter_bdd()
    try:
        cur=conn.cursor()
        cur.execute("SELECT valeur FROM agregats WHERE cle='nuage_mots'")
        row=cur.fetchone()
        if row is None:
            return jsonify({"par_mois":{},"global":{},"total_articles":0,"total_citations":0,"total_mois":0})
        return application.response_class(row["valeur"],mimetype="application/json")
    finally:
        conn.close()

@application.route("/articles/recherche")
def recherche_articles():
    mot=(request.args.get("mot") or "").lower().strip()
    q=(request.args.get("q") or "").strip()
    mois=(request.args.get("mois") or "").strip()
    try:
        limite=min(max(int(request.args.get("limite",20)),1),100)
    except ValueError:
        limite=20
    conn=connecter_bdd()
    try:
        cur=conn.cursor()
        if mot:
            if mois:
                cur.execute("SELECT article_id FROM mot_articles WHERE mot=? AND mois=? ORDER BY citations DESC LIMIT ?",(mot,mois,limite))
            else:
                cur.execute("SELECT article_id FROM mot_articles WHERE mot=? ORDER BY citations DESC LIMIT ?",(mot,limite))
            ids=[r["article_id"] for r in cur.fetchall()]
            if not ids:
                return jsonify([])
            sql=f"""SELECT a.id,a.titre,a.date,a.langue,a.citations,a.index_inverse_compte,
            GROUP_CONCAT(au.nom||'|'||COALESCE(au.pays,''),';;') auteurs
            FROM articles a LEFT JOIN auteurs au ON au.id_article=a.id
            WHERE a.id IN ({','.join('?'*len(ids))})"""
            params=list(ids)
            if q:
                sql+=" AND a.titre LIKE ?"
                params.append(f"%{q}%")
            sql+=" GROUP BY a.id ORDER BY a.citations DESC"
            cur.execute(sql,params)
        else:
            cond=[];params=[]
            if q:
                cond.append("a.titre LIKE ?");params.append(f"%{q}%")
            if mois:
                cond.append("a.date LIKE ?");params.append(f"{mois}%")
            where=("WHERE "+" AND ".join(cond)) if cond else ""
            cur.execute(f"""SELECT a.id,a.titre,a.date,a.langue,a.citations,a.index_inverse_compte,
            GROUP_CONCAT(au.nom||'|'||COALESCE(au.pays,''),';;') auteurs
            FROM articles a LEFT JOIN auteurs au ON au.id_article=a.id
            {where} GROUP BY a.id ORDER BY a.citations DESC LIMIT ?""",(*params,limite))
        out=[]
        for r in cur.fetchall():
            auteurs=[]
            if r["auteurs"]:
                for e in r["auteurs"].split(";;"):
                    nom,pays=(e.split("|",1)+[""])[:2]
                    auteurs.append({"nom":nom,"pays":pays})
            out.append({"id":r["id"],"titre":r["titre"],"date":r["date"],"langue":r["langue"],"citations":r["citations"],"index_inverse_compte":r["index_inverse_compte"],"auteurs":auteurs})
        return jsonify(out)
    finally:
        conn.close()

if __name__=="__main__":
    application.run(debug=True)

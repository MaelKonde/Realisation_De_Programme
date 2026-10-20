# Veille Scientifique (arXiv Trends)
 
This program can show the trends of scientific articles from arXiv on a web page, with a word cloud and a map of countries. It can search more than 600,000 articles by keyword, title or month. It can't download new articles from arXiv by itself, and it can't work without an internet connection.
 
The program is deployed on Render. It has two parts: a Flask API (Python) and a static website (HTML, CSS, JavaScript).
 
## How to install
 
1. Download the project from GitHub: `git clone https://github.com/MaelKonde/Realisation_De_Programme.git`
2. Open the Render dashboard, click **New**, then choose **Blueprint**.
3. Select your GitHub repository. Render reads the file `render.yaml` and creates the two services (`veille-scientifique-api` and `veille-scientifique-front`).
4. Click **Apply** and wait until both services are "Live".
## Requirements
 
- Python 3.11.9 (Render installs it for the API, so you don't install it yourself)
- 2 GB of free storage on the Render disk (the database `bdd.db` is about 1.7 GB)
- Render plan "standard" for the API (see `render.yaml`)
- A GitHub account and a Render account
- It works on Windows, Linux and macOS, in any recent web browser (the website is hosted online)
## FAQ
 
How many articles are in the database? There are about 610,000 articles from January 2025 to June 2026.
 
How much time does the first deploy take? It takes several minutes, because the API downloads the database (about 1.7 GB) one time. The next deploys are fast, because the file stays on the disk.
 
How much does the website cost to use? It is free for the visitors. The owner pays for the Render plan.
 
## How to use
 
1. Open the website of the project in your browser (the address of the `veille-scientifique-front` service on Render).
2. Look at the word cloud and the map of countries.
3. Choose a month to see the trends of this month.
4. Click a keyword to see the most cited articles about it.
Tips:
 
- You should open `https://veille-scientifique-api.onrender.com/health` if the website is empty. It must show `{"status": "ok"}`.
- You shouldn't delete the Render disk, because you must download the database again.
## Known bugs
 
- On 10 August, when I tested the program locally with Docker, the import stopped with the error "datatype mismatch". The article IDs were text, but the column was INTEGER. I changed the column type to TEXT. Status: fixed
- On 13 August, when I tested the program locally with Docker, the API returned the error "no such table: agregats". The program didn't create this table. I added the table in `alimenter_bdd.py` and I wrote a new script, `precalculer_agregats.py`. Status: fixed

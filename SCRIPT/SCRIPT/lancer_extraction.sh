#!/usr/bin/env bash
# Enchaîne l'extraction mSupply et la construction du classeur DQA :
#   1. psql exécute extraction_msupply.sql ; ses \copy écrivent les CSV
#      dans csv_extraction/ (chemins relatifs => on lance psql depuis ce dossier) ;
#   2. csv_vers_canevas.py assemble ces CSV dans une copie du gabarit, puis
#      relit le classeur et échoue si un compteur METADATA ne correspond pas.
#
# Connexion : variables standard PostgreSQL, rien n'est stocké dans ce script.
#   PGHOST, PGPORT, PGDATABASE, PGUSER (obligatoires sauf PGPORT)
#   Mot de passe : ~/.pgpass (recommandé), PGPASSWORD, ou saisie interactive.
#
# Usage :
#   PGHOST=... PGDATABASE=... PGUSER=... ./lancer_extraction.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSV_DIR="$DIR/csv_extraction"
PYTHON="${PYTHON:-python}"

CSV_ATTENDUS=(metadata sites site_programme produits transactions
              lignes_transactions stock_actuel inventaires
              inventaire_lignes requisitions)

: "${PGHOST:?définir PGHOST (serveur PostgreSQL mSupply)}"
: "${PGDATABASE:?définir PGDATABASE (base mSupply)}"
: "${PGUSER:?définir PGUSER (compte en lecture seule de préférence)}"

command -v psql >/dev/null || { echo "psql introuvable dans le PATH" >&2; exit 1; }
command -v "$PYTHON" >/dev/null || { echo "$PYTHON introuvable (définir PYTHON=...)" >&2; exit 1; }
"$PYTHON" -c "import openpyxl" 2>/dev/null || { echo "module openpyxl manquant : $PYTHON -m pip install openpyxl" >&2; exit 1; }
[[ -f "$DIR/listes_mission.sql" ]] || {
    echo "listes_mission.sql absent : copier listes_mission.exemple.sql sous ce nom et y mettre" >&2
    echo "les listes du périmètre et des traceurs transmises par la mission." >&2
    exit 1
}

mkdir -p "$CSV_DIR"
# Supprime les CSV d'un run précédent : si l'extraction échoue, on ne doit
# pas assembler un classeur avec d'anciennes données.
for f in "${CSV_ATTENDUS[@]}"; do rm -f "$CSV_DIR/$f.csv"; done

echo "== 1/2 Extraction SQL ($PGUSER@$PGHOST/$PGDATABASE) =="
# -X : ignore ~/.psqlrc ; ON_ERROR_STOP : s'arrête à la première erreur
# Chemin relatif : psql.exe (Windows) ne comprend pas les chemins /c/... de Git Bash
( cd "$CSV_DIR" && psql -X -v ON_ERROR_STOP=1 -f ../extraction_msupply.sql )

for f in "${CSV_ATTENDUS[@]}"; do
    [[ -f "$CSV_DIR/$f.csv" ]] || { echo "CSV manquant : $CSV_DIR/$f.csv" >&2; exit 1; }
done

echo "== 2/2 Construction et vérification du classeur =="
# Le script échoue (et arrête celui-ci, set -e) si le classeur enregistré
# ne respecte pas ses compteurs METADATA.
( cd "$DIR" && "$PYTHON" csv_vers_canevas.py csv_extraction )

echo
echo "Classeur prêt : l'envoyer TEL QUEL. Ne pas l'ouvrir ni le réenregistrer dans"
echo "Excel, et surtout ne supprimer aucune ligne : la ligne 6 contient déjà une donnée."
echo "S'il a été ouvert entre-temps, le contrôler avant l'envoi :"
echo "  $PYTHON csv_vers_canevas.py --verifier csv_extraction/<classeur.xlsx>"

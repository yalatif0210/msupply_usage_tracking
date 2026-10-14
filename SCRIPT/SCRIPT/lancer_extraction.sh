#!/usr/bin/env bash
# Enchaîne l'extraction mSupply et la construction du classeur DQA :
#   1. psql exécute extraction_msupply.sql ; ses \copy écrivent les CSV
#      dans csv_extraction/ (chemins relatifs => on lance psql depuis ce dossier) ;
#   2. csv_vers_canevas.py assemble ces CSV dans une copie du gabarit, puis
#      relit le classeur et échoue si un compteur METADATA ne correspond pas.
#
# Connexion : fichier connexion.env à côté de ce script (modèle :
# connexion.exemple.env), rempli une fois. Une variable PGHOST, PGPORT,
# PGDATABASE ou PGUSER déjà définie dans le terminal reste prioritaire.
#   Mot de passe : demandé à chaque lancement, jamais enregistré (ni dans
#   connexion.env, ni dans un fichier de mots de passe).
#
# Usage :
#   bash lancer_extraction.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSV_DIR="$DIR/csv_extraction"
PYTHON="${PYTHON:-python}"

CSV_ATTENDUS=(metadata sites site_programme produits transactions
              lignes_transactions stock_actuel inventaires
              inventaire_lignes requisitions)

# Lu ligne à ligne plutôt que par `source` : le Bloc-notes peut enregistrer des
# fins de ligne Windows ou une marque BOM, qui se colleraient aux valeurs et
# feraient échouer la connexion sans message clair.
if [[ -f "$DIR/connexion.env" ]]; then
    while IFS='=' read -r cle valeur || [[ -n "$cle" ]]; do
        cle="${cle#$'\xEF\xBB\xBF'}"
        cle="${cle//[$'\r\t ']/}"
        valeur="${valeur//$'\r'/}"
        valeur="${valeur#"${valeur%%[![:space:]]*}"}"
        valeur="${valeur%"${valeur##*[![:space:]]}"}"
        [[ -z "$cle" || "$cle" == \#* ]] && continue
        case "$cle" in
            PGHOST|PGPORT|PGDATABASE|PGUSER)
                [[ -n "${!cle:-}" ]] || export "$cle=$valeur" ;;
            PGPASSWORD)
                echo "connexion.env ne doit pas contenir de mot de passe : retirer la ligne PGPASSWORD" >&2
                echo "et utiliser le fichier de mots de passe de PostgreSQL (voir la procédure)." >&2
                exit 1 ;;
            *)
                echo "connexion.env : paramètre inconnu « $cle » ignoré" >&2 ;;
        esac
    done < "$DIR/connexion.env"
elif [[ -z "${PGHOST:-}" ]]; then
    echo "connexion.env absent : copier connexion.exemple.env sous le nom connexion.env," >&2
    echo "dans le dossier du script, puis y renseigner le serveur, la base et le compte." >&2
    exit 1
fi

: "${PGHOST:?renseigner PGHOST (serveur PostgreSQL mSupply) dans connexion.env}"
: "${PGDATABASE:?renseigner PGDATABASE (base mSupply) dans connexion.env}"
: "${PGUSER:?renseigner PGUSER (compte en lecture seule de préférence) dans connexion.env}"

command -v psql >/dev/null || { echo "psql introuvable dans le PATH" >&2; exit 1; }
command -v "$PYTHON" >/dev/null || { echo "$PYTHON introuvable (définir PYTHON=...)" >&2; exit 1; }
"$PYTHON" -c "import openpyxl" 2>/dev/null || { echo "module openpyxl manquant : $PYTHON -m pip install openpyxl" >&2; exit 1; }
[[ -f "$DIR/listes_mission.sql" ]] || {
    echo "listes_mission.sql absent : copier listes_mission.exemple.sql sous ce nom et y mettre" >&2
    echo "les listes du périmètre et des traceurs transmises par la mission." >&2
    exit 1
}

# Mot de passe demandé à chaque lancement et jamais enregistré. Saisi par bash
# plutôt que par psql : sous Git Bash, psql.exe ne peut pas toujours afficher
# sa propre invite (terminal mintty) et semblerait bloqué. Sans terminal
# (exécution automatisée, tests), il doit être fourni par PGPASSWORD.
if { : </dev/tty; } 2>/dev/null; then
    read -rsp "Mot de passe de $PGUSER sur $PGHOST : " MOT_DE_PASSE </dev/tty
    echo
elif [[ -n "${PGPASSWORD:-}" ]]; then
    MOT_DE_PASSE="$PGPASSWORD"
else
    echo "aucun terminal pour saisir le mot de passe : lancer depuis Git Bash" >&2
    exit 1
fi
[[ -n "$MOT_DE_PASSE" ]] || { echo "mot de passe vide : extraction annulée" >&2; exit 1; }

mkdir -p "$CSV_DIR"
# Supprime les CSV d'un run précédent : si l'extraction échoue, on ne doit
# pas assembler un classeur avec d'anciennes données.
for f in "${CSV_ATTENDUS[@]}"; do rm -f "$CSV_DIR/$f.csv"; done

echo "== 1/2 Extraction SQL ($PGUSER@$PGHOST/$PGDATABASE) =="
# -X : ignore ~/.psqlrc ; ON_ERROR_STOP : s'arrête à la première erreur ;
# -w : ne redemande jamais le mot de passe (un mauvais mot de passe échoue net).
# Le mot de passe n'est transmis qu'à ce psql, puis effacé.
# Chemin relatif : psql.exe (Windows) ne comprend pas les chemins /c/... de Git Bash
( cd "$CSV_DIR" && PGPASSWORD="$MOT_DE_PASSE" psql -X -w -v ON_ERROR_STOP=1 -f ../extraction_msupply.sql )
unset MOT_DE_PASSE

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

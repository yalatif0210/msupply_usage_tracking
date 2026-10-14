#!/usr/bin/env bash
# Remet la base de la pile démo à blanc pour un test réel : vide toutes les
# tables du schéma dqa SAUF les comptes (`utilisateur`), la grille de
# notation (`grille_*`) et le calendrier technique (`dim_temps`, posé par
# migration et lu par les calculs). Référentiels (`strate_structure`,
# `dim_produit_traceur`) compris : ils se ressaisissent dans /admin.
#
#   bash db/demo/purger_donnees.sh
#
# Garde-fous : la cible est forcément le service `db` du projet compose
# `dqa-demo` ; confirmation tapée obligatoire ; une seule transaction qui
# s'annule si une table conservée change de volume.
set -euo pipefail
cd "$(dirname "$0")/../.."

COMPOSE=(docker compose -f docker-compose.demo.yml)
PROJET=$("${COMPOSE[@]}" config --format json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).name))')
if [[ "$PROJET" != "dqa-demo" ]]; then
  echo "Cible refusée : projet compose « $PROJET », seul « dqa-demo » est autorisé." >&2
  exit 1
fi
"${COMPOSE[@]}" ps --status running --services | grep -qx db \
  || { echo "Le service db de dqa-demo ne tourne pas." >&2; exit 1; }

PHRASE="PURGER dqa-demo"
echo "Toutes les données de la base démo vont être supprimées (sauf utilisateur, grille_*, dim_temps)."
read -r -p "Tapez « $PHRASE » pour confirmer : " reponse
[[ "$reponse" == "$PHRASE" ]] || { echo "Confirmation incorrecte, rien n'a été fait." >&2; exit 1; }

"${COMPOSE[@]}" exec -T db psql -U dqa -d dqa -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

CREATE TEMP TABLE _avant AS
SELECT 'utilisateur' AS t, count(*) AS n FROM dqa.utilisateur
UNION ALL SELECT 'grille_parametre', count(*) FROM dqa.grille_parametre
UNION ALL SELECT 'grille_poids_pilier', count(*) FROM dqa.grille_poids_pilier
UNION ALL SELECT 'grille_seuil_sous_composante', count(*) FROM dqa.grille_seuil_sous_composante
UNION ALL SELECT 'dim_temps', count(*) FROM dqa.dim_temps;

-- Liste calculée : une table ajoutée par une migration future est purgée
-- d'office, seules les tables nommées ici sont épargnées.
DO $$
DECLARE liste text;
BEGIN
  SELECT string_agg(format('dqa.%I', tablename), ', ') INTO liste
  FROM pg_tables
  WHERE schemaname = 'dqa'
    AND tablename <> 'utilisateur'
    AND tablename <> 'dim_temps'
    AND tablename NOT LIKE 'grille\_%';
  EXECUTE 'TRUNCATE ' || liste || ' RESTART IDENTITY CASCADE';
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM _avant a
    WHERE a.n <> (CASE a.t
      WHEN 'utilisateur' THEN (SELECT count(*) FROM dqa.utilisateur)
      WHEN 'grille_parametre' THEN (SELECT count(*) FROM dqa.grille_parametre)
      WHEN 'grille_poids_pilier' THEN (SELECT count(*) FROM dqa.grille_poids_pilier)
      WHEN 'grille_seuil_sous_composante' THEN (SELECT count(*) FROM dqa.grille_seuil_sous_composante)
      WHEN 'dim_temps' THEN (SELECT count(*) FROM dqa.dim_temps)
    END)
  ) THEN
    RAISE EXCEPTION 'Une table conservée a été touchée par la cascade : purge annulée';
  END IF;
END $$;

COMMIT;

-- Ordre de rafraichir_et_geler : les vues de synthèse lisent les vues piliers.
REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
REFRESH MATERIALIZED VIEW dqa.mv_p2_promptitude;
REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart_produit;
REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
REFRESH MATERIALIZED VIEW dqa.mv_p6_ajustements;
REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;
REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
SQL

echo "Base démo purgée. Les sessions ont été vidées : reconnectez-vous."

-- ═══════════════════════════════════════════════════════════════════════════
--  Historisation des scores (ADR 0003)
--  Un gel par (site, mois PAQD, programme). `programme_id` NULL = tous
--  programmes. `score_composite` reste NULL tant que les six piliers ne sont
--  pas couverts. Chaque ligne référence la grille avec laquelle elle a été
--  calculée et n'est jamais recalculée.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE hist_score_site (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id         text        NOT NULL REFERENCES dim_site (site_id),
    mois_paqd       text        NOT NULL,                 -- 'AAAA-MM'
    programme_id    text REFERENCES dim_programme (programme_id),
    grille_id       bigint      NOT NULL REFERENCES grille_parametre (id),
    p_completude    numeric(5, 1),
    p_promptitude   numeric(5, 1),
    p_regularite    numeric(5, 1),
    p_ecart_sdu     numeric(5, 1),
    p_concordance   numeric(5, 1),
    p_ajustements   numeric(5, 1),
    score_composite numeric(5, 1),
    classification  text CHECK (classification IN
                        ('CONFORME', 'PARTIELLEMENT_CONFORME', 'NON_CONFORME')),
    lot_id          bigint REFERENCES import_lot (id),
    calcule_le      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_hist_site_mois_prog
        UNIQUE NULLS NOT DISTINCT (site_id, mois_paqd, programme_id)
);

CREATE INDEX idx_hist_site_mois ON hist_score_site (site_id, mois_paqd DESC);

COMMENT ON TABLE hist_score_site IS
    'Photographie du score de chaque site du périmètre par mois PAQD. Source des courbes de progression.';

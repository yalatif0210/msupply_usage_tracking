-- ═══════════════════════════════════════════════════════════════════════════
--  Contrôles sur la base mSupply : `stock_take.serial_number` (spécification d'extraction,
--  annexe B, point 5). LECTURE SEULE, à lancer sur la base mSupply.
--
--  Le tableau de bord retient, pour deux inventaires finalisés le même jour
--  au même site, le dernier finalisé : heure (`stock_take_time`), puis numéro
--  (`serial_number`). Ces requêtes vérifient que ce numéro le permet.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Numéro vide ou en double, par site. Résultat du 2026-10-13 : 157 sites
--    concernés. Sans conséquence : l'heure de finalisation fait foi, le
--    numéro ne départage que deux inventaires de même heure.
SELECT store_id,
       count(*)                                                            AS inventaires,
       count(*) FILTER (WHERE serial_number IS NULL OR serial_number = 0)  AS sans_numero,
       count(*) - count(DISTINCT serial_number)                            AS numeros_en_double
FROM stock_take
GROUP BY store_id
HAVING count(*) FILTER (WHERE serial_number IS NULL OR serial_number = 0) > 0
    OR count(*) <> count(DISTINCT serial_number);

-- 2. Inventaires finalisés le même jour au même site. Résultat du
--    2026-10-13 : l'heure suit la finalisation, le numéro la création ; ordres
--    opposés dans 14 % des journées. Le tableau de bord trie par l'heure.
SELECT store_id, stock_take_date, serial_number, stock_take_time,
       stock_take_created_date, programid, description
FROM stock_take
WHERE status = 'fn'
  AND (store_id, stock_take_date) IN (
        SELECT store_id, stock_take_date FROM stock_take
        WHERE status = 'fn'
        GROUP BY 1, 2 HAVING count(*) > 1)
ORDER BY store_id, stock_take_date, serial_number;

-- ═══════════════════════════════════════════════════════════════════════════
--  Contrôles complémentaires (audit du 2026-10-13), eux aussi en lecture seule
-- ═══════════════════════════════════════════════════════════════════════════

-- 3. Conditionnements différents de 1. Le script convertit les quantités en
--    unités (quantité x taille du conditionnement). Si ces trois nombres sont
--    à 0, la conversion est sans effet sur vos données actuelles.
SELECT
    (SELECT count(*) FROM stock_take_lines WHERE coalesce(snapshot_packsize, 1) NOT IN (0, 1)) AS lignes_inventaire,
    (SELECT count(*) FROM item_line        WHERE coalesce(pack_size, 1)         NOT IN (0, 1)) AS lignes_de_stock,
    (SELECT count(*) FROM trans_line       WHERE coalesce(pack_size, 1)         NOT IN (0, 1)) AS lignes_de_transaction;

-- 4. Lien entre la réquisition d'un site et la réponse du district qui le sert.
--    Le script remonte de la réponse (magasin du district) à la réquisition du
--    site via linked_requisition_id. Résultat attendu : la plupart des
--    distributions liées à une réquisition ont « lien_vers_un_autre_magasin »
--    non nul ; sinon, le signaler à la coordination nationale.
SELECT t.store_id                                                   AS magasin_qui_distribue,
       count(*)                                                      AS distributions_avec_requisition,
       count(*) FILTER (WHERE r.store_id = t.store_id)               AS requisition_du_meme_magasin,
       count(*) FILTER (WHERE r.store_id = t.store_id
                          AND l.store_id IS NOT NULL
                          AND l.store_id <> t.store_id)              AS lien_vers_un_autre_magasin
FROM transact t
JOIN requisition r      ON r.id = t.requisition_id
LEFT JOIN requisition l ON l.id = r.linked_requisition_id
WHERE t.type = 'ci' AND t.mode = 'store'
  AND t.confirm_date >= current_date - 60
GROUP BY t.store_id
ORDER BY distributions_avec_requisition DESC
LIMIT 20;

-- 5. Types de réquisition. Résultat obtenu sur la base de la DAP le
--    2026-10-13 : request 254 260, response 250 131 (dont 221 381 liées),
--    sh 42, im 32, vide 23, EPIWastageResponse 1. Le script exclut les
--    réponses (type se terminant par « response ») : relancer en cas de
--    nouveau type.
SELECT type, count(*) AS nb,
       count(*) FILTER (WHERE linked_requisition_id <> '') AS avec_lien
FROM requisition
GROUP BY type ORDER BY nb DESC;

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AnomalieImport, ResultatImport } from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';
import { ClasseurIllisibleError, lireClasseur, type ClasseurLu } from './lecture-classeur.js';
import { COMPTEURS_METADATA, JEUX } from './contrat-jeux.js';
import { StagingService } from './staging.service.js';
import { PromotionService } from './promotion.service.js';
import { ValidationService } from './validation.service.js';
import { ImportRepository } from './import.repository.js';

function rejet(motif: string, anomalies: AnomalieImport[]): ResultatImport {
  const liste: [AnomalieImport, ...AnomalieImport[]] =
    anomalies.length > 0
      ? [anomalies[0]!, ...anomalies.slice(1)]
      : [{ onglet: null, ligneSource: null, gravite: 'erreur', code: 'REJET', message: motif, valeurBrute: null }];
  return { statut: 'rejete', motif, anomalies: liste };
}

@Injectable()
export class ImportService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly validation: ValidationService,
    private readonly staging: StagingService,
    private readonly promotion: PromotionService,
    private readonly repo: ImportRepository,
  ) {}

  async traiter(nomFichier: string, buffer: Buffer): Promise<ResultatImport> {
    let classeur: ClasseurLu;
    try {
      classeur = lireClasseur(buffer);
    } catch (err) {
      const message = err instanceof ClasseurIllisibleError ? err.message : 'Classeur illisible';
      const lotId = await this.creerLot(nomFichier, null, {}, {});
      const anomalie: AnomalieImport = {
        onglet: null, ligneSource: null, gravite: 'erreur',
        code: 'CLASSEUR_ILLISIBLE', message, valeurBrute: null,
      };
      await this.enregistrerAnomalies(lotId, [anomalie]);
      await this.marquerRejete(lotId, message);
      return rejet(message, [anomalie]);
    }

    const lotId = await this.creerLot(
      nomFichier,
      classeur.metadata,
      this.compteursDeclares(classeur),
      this.compteursReels(classeur),
    );

    const { anomalies, bloquant, contexte } = this.validation.valider(classeur);
    await this.enregistrerAnomalies(lotId, anomalies);

    if (bloquant || !contexte) {
      const motif = anomalies.find((a) => a.gravite === 'erreur')?.message ?? 'classeur rejeté';
      await this.marquerRejete(lotId, motif);
      return rejet(motif, anomalies);
    }

    let anomaliesReferences: AnomalieImport[] = [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.staging.ecrire(lotId, classeur, client);
      await this.promotion.promouvoir(lotId, client);
      anomaliesReferences = await this.promotion.anomaliesReferences(lotId, client);
      await client.query(
        `UPDATE dqa.import_lot
         SET statut = 'valide', importe_le = now(),
             cycle_paqd = $2, mois_paqd = $3, mois_debut = $4, mois_fin = $5
         WHERE id = $1`,
        [lotId, contexte.cyclePaqd, contexte.moisPaqd, contexte.moisDebut, contexte.moisFin || null],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      const message = err instanceof Error ? err.message : 'échec du staging';
      const anomalie: AnomalieImport = {
        onglet: null, ligneSource: null, gravite: 'erreur',
        code: 'ECHEC_STAGING', message, valeurBrute: null,
      };
      await this.enregistrerAnomalies(lotId, [anomalie]);
      await this.marquerRejete(lotId, message);
      return rejet(message, [anomalie, ...anomalies]);
    } finally {
      client.release();
    }

    if (anomaliesReferences.length > 0) {
      await this.enregistrerAnomalies(lotId, anomaliesReferences);
    }
    const lot = await this.repo.lot(lotId);
    return { statut: 'valide', lot: lot!, anomalies: [...anomalies, ...anomaliesReferences] };
  }

  private compteursDeclares(classeur: ClasseurLu): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [jeu, champ] of Object.entries(COMPTEURS_METADATA)) {
      const v = classeur.metadata.get(champ);
      if (v !== undefined && Number.isFinite(Number(v))) out[jeu] = Number(v);
    }
    return out;
  }

  private compteursReels(classeur: ClasseurLu): Record<string, number> {
    const out: Record<string, number> = {};
    for (const def of JEUX) {
      out[def.onglet] = classeur.onglets.get(def.onglet)?.lignes.length ?? 0;
    }
    return out;
  }

  private async creerLot(
    nomFichier: string,
    metadata: Map<string, string> | null,
    declares: Record<string, number>,
    reels: Record<string, number>,
  ): Promise<number> {
    const g = (k: string): string | null => metadata?.get(k)?.trim() || null;
    const d = (k: string): string | null => {
      const v = g(k);
      return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    };
    const { rows } = await this.pool.query<{ id: number }>(
      `INSERT INTO dqa.import_lot
         (nom_fichier, date_extraction, realisee_par, version_msupply,
          fenetre_debut, fenetre_fin, statut, nb_lignes_declarees, nb_lignes_reelles)
       VALUES ($1, $2, $3, $4, $5, $6, 'en_cours', $7, $8)
       RETURNING id`,
      [
        nomFichier, d('date_extraction'), g('realisee_par'), g('version_msupply'),
        d('fenetre_debut'), d('fenetre_fin'),
        JSON.stringify(declares), JSON.stringify(reels),
      ],
    );
    return rows[0]!.id;
  }

  private async enregistrerAnomalies(lotId: number, anomalies: AnomalieImport[]): Promise<void> {
    if (anomalies.length === 0) return;
    const valeurs: unknown[] = [];
    const groupes: string[] = [];
    let p = 1;
    for (const a of anomalies) {
      groupes.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      valeurs.push(lotId, a.onglet, a.ligneSource, a.gravite, a.code, a.message, a.valeurBrute);
    }
    await this.pool.query(
      `INSERT INTO dqa.import_anomalie
         (lot_id, onglet, ligne_source, gravite, code, message, valeur_brute)
       VALUES ${groupes.join(', ')}`,
      valeurs,
    );
  }

  private async marquerRejete(lotId: number, motif: string): Promise<void> {
    await this.pool.query(
      `UPDATE dqa.import_lot SET statut = 'rejete', motif_rejet = $2 WHERE id = $1`,
      [lotId, motif.slice(0, 2000)],
    );
  }
}

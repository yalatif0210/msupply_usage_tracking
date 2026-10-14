import { Controller, Get } from '@nestjs/common';
import type { ProduitTraceur } from '@dqa/contracts';
import { TraceursRepository } from './traceurs.repository.js';

/**
 * Consultation seule : la liste vient de l'onglet PRODUITS des imports
 * (ADR 0015). Une saisie ici serait écrasée au lot suivant.
 */
@Controller('admin/traceurs')
export class TraceursController {
  constructor(private readonly repo: TraceursRepository) {}

  /** Lecture ouverte à tout utilisateur authentifié. */
  @Get()
  lister(): Promise<ProduitTraceur[]> {
    return this.repo.lister();
  }
}

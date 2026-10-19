import type { ProgrammeSite } from '@dqa/contracts';

/** Un programme sans inventaire ni réquisition sur la période : probablement pas géré par le site (ADR 0020). */
export const sansActivite = (p: Pick<ProgrammeSite, 'nbInventaires' | 'nbRequisitions'>): boolean =>
  p.nbInventaires === 0 && p.nbRequisitions === 0;

import { describe, expect, it } from 'vitest';
import { LIBELLES_PILIER, PILIERS } from '@dqa/contracts';

describe('consommation du package de contrats depuis le front', () => {
  it('expose les six piliers avec un libellé', () => {
    expect(PILIERS).toHaveLength(6);
    for (const p of PILIERS) {
      expect(LIBELLES_PILIER[p]).toBeTruthy();
    }
  });
});

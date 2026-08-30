import { Global, Module } from '@nestjs/common';
import { getPool } from '../db/pool.js';

/** Jeton d'injection du pool PostgreSQL. */
export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [{ provide: PG_POOL, useFactory: () => getPool() }],
  exports: [PG_POOL],
})
export class DatabaseModule {}

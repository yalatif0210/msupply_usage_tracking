import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AnomalieImport, LotImport, ResultatImport } from '@dqa/contracts';
import { Roles } from '../auth/auth.metadata.js';
import { ImportService } from './import.service.js';
import { ImportRepository } from './import.repository.js';

interface FichierTelecharge {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Controller('imports')
export class ImportController {
  constructor(
    private readonly service: ImportService,
    private readonly repo: ImportRepository,
  ) {}

  @Roles(['coordination'])
  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async importer(@UploadedFile() fichier?: FichierTelecharge): Promise<ResultatImport> {
    if (!fichier || fichier.size === 0) {
      throw new BadRequestException('Aucun fichier reçu (champ « fichier » attendu)');
    }
    return this.service.traiter(fichier.originalname, fichier.buffer);
  }

  @Get()
  lister(): Promise<LotImport[]> {
    return this.repo.listerLots();
  }

  @Get(':id/anomalies')
  async anomalies(@Param('id', ParseIntPipe) id: number): Promise<AnomalieImport[]> {
    const lot = await this.repo.lot(id);
    if (!lot) throw new NotFoundException('Lot inconnu');
    return this.repo.anomaliesDuLot(id);
  }
}

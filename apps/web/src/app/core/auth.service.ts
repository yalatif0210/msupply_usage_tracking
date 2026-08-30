import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { IdentifiantsConnexion, Utilisateur } from '@dqa/contracts';

const API = '/api/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _utilisateur = signal<Utilisateur | null>(null);
  private _chargeInitial = false;

  readonly utilisateur = this._utilisateur.asReadonly();
  readonly estConnecte = computed(() => this._utilisateur() !== null);

  /** Récupère la session courante depuis l'API (une fois). */
  async rafraichir(): Promise<Utilisateur | null> {
    try {
      const u = await firstValueFrom(this.http.get<Utilisateur>(`${API}/moi`));
      this._utilisateur.set(u);
      return u;
    } catch {
      this._utilisateur.set(null);
      return null;
    } finally {
      this._chargeInitial = true;
    }
  }

  async assurerCharge(): Promise<void> {
    if (!this._chargeInitial) await this.rafraichir();
  }

  async connexion(identifiants: IdentifiantsConnexion): Promise<Utilisateur> {
    const u = await firstValueFrom(
      this.http.post<Utilisateur>(`${API}/connexion`, identifiants),
    );
    this._utilisateur.set(u);
    return u;
  }

  async deconnexion(): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/deconnexion`, {}));
    this._utilisateur.set(null);
  }
}

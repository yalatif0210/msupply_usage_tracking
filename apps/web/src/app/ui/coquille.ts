import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBuilding2,
  lucideChartColumn,
  lucideChevronDown,
  lucideGrid3x3,
  lucideLayers,
  lucideLayoutDashboard,
  lucideLogOut,
  lucideMenu,
  lucideTarget,
  lucideUpload,
  lucideUsers,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import type { Role } from '@dqa/contracts';
import { AuthService } from '../core/auth.service';

interface LienSection {
  readonly chemin: string;
  readonly libelle: string;
  readonly icone: string;
  readonly exact: boolean;
}

/**
 * Coquille de la console : deux barres horizontales, aucune barre latérale
 * (registre shadcn-admin, DESIGN_SYSTEM §5). Barre 1 : titre et menu compte.
 * Barre 2 : navigation de sections, filtrée par rôle. Aucun sélecteur global
 * (mois, programme) : chaque écran porte ses propres filtres.
 *
 * Écran étroit (sous `md`) : la navigation de sections se replie dans un
 * `dropdown-menu` déclenché par un bouton icône « menu » ; au-dessus de `md`,
 * les liens sont affichés en ligne.
 */
@Component({
  selector: 'dqa-coquille',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, NgIcon, HlmButton, HlmDropdownMenuImports],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideChartColumn,
      lucideChevronDown,
      lucideGrid3x3,
      lucideLayers,
      lucideLayoutDashboard,
      lucideLogOut,
      lucideMenu,
      lucideTarget,
      lucideUpload,
      lucideUsers,
    }),
  ],
  template: `
    <header class="flex items-center justify-between gap-4 bg-primary px-4 py-2 text-primary-foreground sm:px-6">
      <a routerLink="/" class="shrink-0 text-base font-bold tracking-tight whitespace-nowrap text-primary-foreground">Tableau de bord DQA</a>

      @if (auth.utilisateur(); as u) {
        <!--
          Declencheur pose main : les variants hlmBtn (ghost/outline) visent une
          surface claire (hover bg-muted) et jurent sur la barre 1 bg-primary.
          Utilitaires du theme directement, comme le ProfileDropdown de shadcn-admin.
        -->
        <button
          type="button"
          class="inline-flex min-w-0 max-w-60 items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-primary-foreground hover:bg-primary-foreground/10 aria-expanded:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/40"
          [hlmDropdownMenuTrigger]="menuCompte"
          align="end"
        >
          <span class="truncate">{{ u.nom }} · {{ u.role }}</span>
          <ng-icon name="lucideChevronDown" class="shrink-0 text-sm" aria-hidden="true" />
        </button>
        <ng-template #menuCompte>
          <hlm-dropdown-menu class="min-w-48">
            <div hlmDropdownMenuLabel class="flex flex-col">
              <span class="text-sm font-semibold text-foreground">{{ u.nom }}</span>
              <span class="text-xs text-muted-foreground">{{ u.role }}</span>
            </div>
            <hlm-dropdown-menu-separator />
            <button hlmDropdownMenuItem variant="destructive" (click)="deconnexion()">
              <ng-icon name="lucideLogOut" aria-hidden="true" />
              Déconnexion
            </button>
          </hlm-dropdown-menu>
        </ng-template>
      }
    </header>

    @if (auth.utilisateur(); as u) {
      <nav class="flex items-center gap-1 border-b border-border bg-card px-4 sm:px-6" aria-label="Sections">
        <button
          hlmBtn
          variant="outline"
          size="icon"
          class="my-2 md:hidden"
          [hlmDropdownMenuTrigger]="menuSections"
          align="start"
        >
          <ng-icon name="lucideMenu" aria-hidden="true" />
          <span class="sr-only">Ouvrir la navigation</span>
        </button>
        <ng-template #menuSections>
          <hlm-dropdown-menu class="min-w-44">
            @for (lien of liens(); track lien.chemin) {
              <a
                hlmDropdownMenuItem
                [routerLink]="lien.chemin"
                routerLinkActive="text-foreground"
                [routerLinkActiveOptions]="{ exact: lien.exact }"
                ariaCurrentWhenActive="page"
                class="text-muted-foreground"
              >
                <ng-icon [name]="lien.icone" aria-hidden="true" />
                {{ lien.libelle }}
              </a>
            }
          </hlm-dropdown-menu>
        </ng-template>

        <div class="hidden md:flex md:items-center md:gap-1">
          @for (lien of liens(); track lien.chemin) {
            <a
              [routerLink]="lien.chemin"
              routerLinkActive="border-primary! font-semibold text-foreground"
              [routerLinkActiveOptions]="{ exact: lien.exact }"
              ariaCurrentWhenActive="page"
              class="inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-3 text-sm text-muted-foreground hover:text-foreground"
            >
              <ng-icon [name]="lien.icone" class="text-sm" aria-hidden="true" />
              {{ lien.libelle }}
            </a>
          }
        </div>
      </nav>
    }
  `,
})
export class Coquille {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly liens = computed<readonly LienSection[]>(() => {
    const u = this.auth.utilisateur();
    if (!u) return [];

    const sections: LienSection[] = [
      { chemin: '/', libelle: 'Tableau de bord', icone: 'lucideLayoutDashboard', exact: true },
      { chemin: '/sites', libelle: 'Sites', icone: 'lucideBuilding2', exact: false },
      { chemin: '/synthese', libelle: 'Synthèse', icone: 'lucideChartColumn', exact: false },
      { chemin: '/imports', libelle: 'Imports', icone: 'lucideUpload', exact: false },
    ];

    if (this.aAcces(u.role, ['coordination', 'admin'])) {
      sections.push({ chemin: '/admin/traceurs', libelle: 'Traceurs', icone: 'lucideTarget', exact: false });
    }
    if (this.aAcces(u.role, ['coordination'])) {
      sections.push({ chemin: '/admin/grille', libelle: 'Grille', icone: 'lucideGrid3x3', exact: false });
    }
    if (this.aAcces(u.role, ['admin'])) {
      sections.push({ chemin: '/admin/comptes', libelle: 'Comptes', icone: 'lucideUsers', exact: false });
    }
    // Strates : lecture ouverte à tout rôle (le lecteur la consulte en seule
    // lecture), écriture réservée à la coordination côté API.
    sections.push({ chemin: '/admin/strates', libelle: 'Strates', icone: 'lucideLayers', exact: false });

    return sections;
  });

  private aAcces(role: Role, autorises: readonly Role[]): boolean {
    return autorises.includes(role);
  }

  protected async deconnexion(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigate(['/connexion']);
  }
}

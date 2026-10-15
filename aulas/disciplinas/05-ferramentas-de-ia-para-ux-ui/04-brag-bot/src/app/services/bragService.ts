import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Brag {
  id: string;
  titulo: string;
  contexto: string;
  impacto: string;
  metricas: string[];
  tecnologias: string[];
}

interface BragApiResponse {
  id?: string;
  title: string;
  context: string;
  actionTaken: string;
  businessImpact: string;
  metrics: string[];
  technologiesUsed: string[];
}

@Injectable({ providedIn: 'root' })
export class BragService {
  private readonly http = inject(HttpClient);

  readonly brags = signal<Brag[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async generateBrag(definition: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<BragApiResponse>('/api/brag', { definition }),
      );

      const brag: Brag = {
        id: response.id ?? crypto.randomUUID(),
        titulo: response.title,
        contexto: response.context,
        impacto: response.businessImpact,
        metricas: response.metrics,
        tecnologias: response.technologiesUsed,
      };

      this.brags.update((list) => [brag, ...list]);
    } catch (err) {
      console.error('Failed to generate brag:', err);
      this.error.set('Não foi possível gerar o brag. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }

  getById(id: string): Brag | undefined {
    return this.brags().find((b) => b.id === id);
  }
}

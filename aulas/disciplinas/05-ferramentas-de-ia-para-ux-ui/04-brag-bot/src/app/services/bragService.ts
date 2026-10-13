import { Injectable, signal } from '@angular/core';

export interface Brag {
  id: string;
  titulo: string;
  contexto: string;
  impacto: string;
  metricas: string[];
  tecnologias: string[];
}

const MOCK_DELAY_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class BragService {
  readonly brags = signal<Brag[]>([]);
  readonly loading = signal(false);

  generateMockBrag(prompt: string): Promise<void> {
    this.loading.set(true);

    return new Promise((resolve) => {
      setTimeout(() => {
        const brag: Brag = {
          id: crypto.randomUUID(),
          titulo: 'Redução de 60% no tempo de deploy',
          contexto:
            prompt.trim() ||
            'O pipeline de deploy era manual e levava mais de 40 minutos, bloqueando entregas semanais do time.',
          impacto:
            'Automatizei o pipeline de CI/CD, eliminando etapas manuais e permitindo deploys diários com segurança, o que acelerou o feedback de produto.',
          metricas: ['-60% no tempo de deploy', '5x mais deploys por semana', '0 incidentes em 3 meses'],
          tecnologias: ['Angular', 'GitHub Actions', 'Docker', 'TypeScript'],
        };

        this.brags.update((list) => [brag, ...list]);
        this.loading.set(false);
        resolve();
      }, MOCK_DELAY_MS);
    });
  }

  getById(id: string): Brag | undefined {
    return this.brags().find((b) => b.id === id);
  }
}

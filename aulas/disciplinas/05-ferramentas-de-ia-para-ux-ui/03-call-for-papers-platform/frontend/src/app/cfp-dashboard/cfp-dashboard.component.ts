import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { SpeakerDTO } from '@call-for-papers-platform/shared-types';

@Component({
  selector: 'app-cfp-dashboard',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-busy]="loading()">
      <h1>Submitted talks</h1>

      @if (loading()) {
        <p class="status" role="status">Loading talks…</p>
      } @else if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      } @else if (speakers().length === 0) {
        <p class="status">No talks have been submitted yet.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <caption>
              Talks submitted to the call for papers
            </caption>
            <thead>
              <tr>
                <th scope="col">Speaker</th>
                <th scope="col">Talk title</th>
                <th scope="col">GDE</th>
              </tr>
            </thead>
            <tbody>
              @for (speaker of speakers(); track speaker.id) {
                <tr>
                  <td>{{ speaker.name }}</td>
                  <td>{{ speaker.talkTitle }}</td>
                  <td>{{ speaker.isGDE ? 'Yes' : 'No' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <a class="secondary" routerLink="/talks/submit">Submit a talk</a>
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding: 2rem 1rem;
    }

    section {
      max-width: 48rem;
      margin: 0 auto;
      padding: 2rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 4px 16px rgb(0 0 0 / 0.06);
    }

    h1 {
      margin: 0 0 1.5rem;
      font-size: 1.5rem;
    }

    .status {
      margin: 0 0 1.5rem;
      color: var(--muted);
    }

    .error {
      margin: 0 0 1.5rem;
      font-size: 0.9rem;
      color: var(--danger);
    }

    .table-wrap {
      margin-bottom: 1.5rem;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    caption {
      margin-bottom: 0.5rem;
      text-align: left;
      font-size: 0.9rem;
      color: var(--muted);
    }

    th,
    td {
      padding: 0.6rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--muted);
    }

    a.secondary {
      display: inline-block;
      padding: 0.6rem 1rem;
      font-weight: 600;
      color: var(--primary);
      background: var(--surface);
      border: 1px solid var(--primary);
      border-radius: var(--radius);
      text-decoration: none;
    }

    a.secondary:hover {
      color: var(--primary-hover);
      border-color: var(--primary-hover);
    }

    a.secondary:focus-visible {
      outline: 3px solid var(--primary);
      outline-offset: 2px;
    }
  `,
})
export class CfpDashboardComponent {
  private readonly http = inject(HttpClient);

  readonly speakers = signal<SpeakerDTO[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.http.get<SpeakerDTO[]>('/api/speakers').subscribe({
      next: (speakers) => {
        this.speakers.set(speakers);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the submitted talks. Please try again.');
        this.loading.set(false);
      },
    });
  }
}

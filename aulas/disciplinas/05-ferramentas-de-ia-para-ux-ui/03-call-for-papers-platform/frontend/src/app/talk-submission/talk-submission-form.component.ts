import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { SpeakerDTO } from '@call-for-papers-platform/shared-types';

type SubmitTalkPayload = Omit<SpeakerDTO, 'id'>;

@Component({
  selector: 'app-talk-submission-form',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" [attr.aria-busy]="submitting()" novalidate>
      <h1>Submit a talk</h1>

      <div>
        <label for="name">Name</label>
        <input
          id="name"
          type="text"
          formControlName="name"
          required
          [attr.aria-invalid]="isInvalid('name')"
          [attr.aria-describedby]="isInvalid('name') ? 'name-error' : null"
        />
        @if (isInvalid('name')) {
          <p id="name-error">Name is required.</p>
        }
      </div>

      <div>
        <label for="talkTitle">Talk title</label>
        <input
          id="talkTitle"
          type="text"
          formControlName="talkTitle"
          required
          [attr.aria-invalid]="isInvalid('talkTitle')"
          [attr.aria-describedby]="isInvalid('talkTitle') ? 'talkTitle-error' : null"
        />
        @if (isInvalid('talkTitle')) {
          <p id="talkTitle-error">Talk title is required.</p>
        }
      </div>

      <div>
        <input id="isGDE" type="checkbox" formControlName="isGDE" />
        <label for="isGDE">I am a Google Developer Expert (GDE)</label>
      </div>

      <div role="alert">
        @if (error(); as message) {
          <p>{{ message }}</p>
        }
      </div>

      <button type="submit" [disabled]="!canSubmit()">
        {{ submitting() ? 'Submitting…' : 'Submit talk' }}
      </button>

      <a class="secondary" routerLink="/dashboard">View dashboard</a>
    </form>
  `,
  styles: `
    :host {
      display: block;
      padding: 2rem 1rem;
    }

    form {
      max-width: 28rem;
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

    form > div {
      margin-bottom: 1.25rem;
    }

    label {
      display: block;
      margin-bottom: 0.35rem;
      font-weight: 600;
      font-size: 0.9rem;
    }

    input[type='text'] {
      width: 100%;
      padding: 0.6rem 0.75rem;
      font: inherit;
      color: inherit;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }

    input[aria-invalid='true'] {
      border-color: var(--danger);
    }

    input:focus-visible,
    button:focus-visible,
    a.secondary:focus-visible {
      outline: 3px solid var(--primary);
      outline-offset: 2px;
    }

    /* checkbox row */
    form > div:has(input[type='checkbox']) {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    form > div:has(input[type='checkbox']) label {
      margin: 0;
      font-weight: 400;
    }

    input[type='checkbox'] {
      width: 1.1rem;
      height: 1.1rem;
      accent-color: var(--primary);
    }

    [id$='-error'],
    [role='alert'] p {
      margin: 0.35rem 0 0;
      font-size: 0.85rem;
      color: var(--danger);
    }

    [role='alert'] {
      min-height: 1.5rem;
    }

    button[type='submit'] {
      width: 100%;
      padding: 0.7rem 1rem;
      font: inherit;
      font-weight: 600;
      color: #fff;
      background: var(--primary);
      border: 0;
      border-radius: var(--radius);
      cursor: pointer;
      transition: background 0.15s;
    }

    button[type='submit']:hover:not(:disabled) {
      background: var(--primary-hover);
    }

    button[type='submit']:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    a.secondary {
      display: block;
      margin-top: 0.75rem;
      padding: 0.7rem 1rem;
      font-weight: 600;
      text-align: center;
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
  `,
})
export class TalkSubmissionFormComponent {
  private readonly http = inject(HttpClient);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    talkTitle: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    isGDE: new FormControl(false, { nonNullable: true }),
  });

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  private readonly formValid = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  readonly canSubmit = computed(() => this.formValid() === 'VALID' && !this.submitting());

  isInvalid(field: 'name' | 'talkTitle'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  submit(): void {
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const payload: SubmitTalkPayload = this.form.getRawValue();
    this.http.post('/api/speakers', payload).subscribe({
      next: () => {
        this.form.reset();
        this.submitting.set(false);
      },
      error: () => {
        this.error.set('Could not submit your talk. Please try again.');
        this.submitting.set(false);
      },
    });
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { SpeakerDTO } from '@call-for-papers-platform/shared-types';

type SubmitTalkPayload = Omit<SpeakerDTO, 'id'>;

@Component({
  selector: 'app-talk-submission-form',
  imports: [ReactiveFormsModule],
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
    </form>
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

import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

let nextId = 0;

@Component({
  selector: 'app-error-modal',
  templateUrl: './error-modal.html',
  styleUrl: './error-modal.css',
})
export class ErrorModal {
  readonly title = input.required<string>();
  readonly message = input.required<string>();

  /** Emitido quando o modal é fechado (botão ou tecla ESC). */
  readonly closed = output<void>();

  protected readonly titleId = `error-modal-title-${nextId}`;
  protected readonly messageId = `error-modal-message-${nextId++}`;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Elemento que tinha o foco antes do modal abrir, para devolvê-lo ao fechar. */
  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => {
      this.previouslyFocused = document.activeElement as HTMLElement | null;
      // showModal() torna o resto da página inerte, prende o foco no diálogo
      // e fecha nativamente com ESC (disparando o evento `close`).
      this.dialog().nativeElement.showModal();
    });

    inject(DestroyRef).onDestroy(() => this.previouslyFocused?.focus());
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  /** Único ponto de saída: cobre tanto o botão quanto a tecla ESC. */
  protected onClose(): void {
    this.previouslyFocused?.focus();
    this.previouslyFocused = null;
    this.closed.emit();
  }
}

import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface PixReceiptData {
  recipientName: string;
  recipientInitials: string;
  recipientType: string;
  pixKey: string;
  institution: string;
  origin: string;
  amount: number;
  timestamp: Date;
  transactionId: string;
  authCode: string;
  protocol: string;
}

const DEMO_RECEIPT: PixReceiptData = {
  recipientName: 'Érick S.',
  recipientInitials: 'ES',
  recipientType: 'Pessoa Física',
  pixKey: '***.452.890-**',
  institution: 'Banco Inter S.A.',
  origin: 'Conta Digital VaultPix • Ag 0001',
  amount: 150,
  timestamp: new Date('2024-05-24T14:32:08'),
  transactionId: 'E18236120202405241432a98f12c',
  authCode: 'F7A9-3C28-990B',
  protocol: '#BR-SPI-2024-8921',
};

@Component({
  selector: 'app-pix-receipt',
  templateUrl: './pix-receipt.html',
  styleUrl: './pix-receipt.css',
})
export class PixReceipt {
  private readonly router = inject(Router);

  readonly data = input<PixReceiptData>(DEMO_RECEIPT);

  protected readonly copied = signal(false);

  protected readonly formattedAmount = computed(() => {
    const [reais, centavos] = this.data().amount.toFixed(2).split('.');
    return { reais, centavos };
  });

  protected readonly formattedTimestamp = computed(() =>
    new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(this.data().timestamp),
  );

  protected async copyTransactionId(): Promise<void> {
    await navigator.clipboard.writeText(this.data().transactionId);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected share(): void {
    if (navigator.share) {
      navigator.share({
        title: 'Comprovante Pix',
        text: `Comprovante Pix de R$ ${this.data().amount.toFixed(2)} para ${this.data().recipientName}`,
      });
      return;
    }

    void this.copyTransactionId();
  }

  protected downloadPdf(): void {
    window.print();
  }

  protected goToStart(): void {
    this.router.navigate(['/']);
  }
}

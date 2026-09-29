import { Component, computed, signal } from '@angular/core';
import { form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { ErrorModal } from '../error-modal/error-modal';
import { PixReceipt, PixReceiptData } from '../pix-receipt/pix-receipt';

interface PixTransfer {
  pixKey: string;
  amount: number;
  scheduledDate: string;
}

/** Valor máximo (em R$) permitido para um Pix sem aprovação do gerente. */
const PIX_TRANSFER_LIMIT = 5000;

@Component({
  selector: 'app-pix-transfer',
  imports: [FormRoot, FormField, ErrorModal, PixReceipt],
  templateUrl: './pix-transfer.html',
  styleUrl: './pix-transfer.css',
})
export class PixTransferComponent {
  private readonly initialModel: PixTransfer = { pixKey: '', amount: 0, scheduledDate: '' };

  protected readonly pixModel = signal<PixTransfer>({ ...this.initialModel });
  protected readonly confirmedTransfer = signal<PixTransfer | null>(null);
  protected readonly limitExceeded = signal(false);

  protected readonly receiptData = computed<PixReceiptData | null>(() => {
    const transfer = this.confirmedTransfer();
    if (!transfer) {
      return null;
    }

    return {
      recipientName: transfer.pixKey,
      recipientInitials: transfer.pixKey.slice(0, 2).toUpperCase(),
      recipientType: 'Pessoa Física',
      pixKey: transfer.pixKey,
      institution: 'Banco Inter S.A.',
      origin: 'Conta Digital VaultPix • Ag 0001',
      amount: transfer.amount,
      timestamp: new Date(),
      transactionId: crypto.randomUUID(),
      authCode: crypto.randomUUID().slice(0, 8).toUpperCase(),
      protocol: `#BR-SPI-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`,
    };
  });

  protected readonly pixForm = form(
    this.pixModel,
    (schemaPath) => {
      required(schemaPath.pixKey, { message: 'Informe a chave Pix.' });
      required(schemaPath.amount, { message: 'Informe o valor.' });
      min(schemaPath.amount, 0.01, { message: 'O valor deve ser maior que zero.' });
      required(schemaPath.scheduledDate, { message: 'Informe a data de agendamento.' });
    },
    {
      submission: {
        action: async (f) => {
          if (this.pixModel().amount > PIX_TRANSFER_LIMIT) {
            // Mantém os dados preenchidos para o usuário ajustar o valor.
            this.confirmedTransfer.set(null);
            this.limitExceeded.set(true);
            return;
          }

          this.confirmedTransfer.set(this.pixModel());
          f().reset({ ...this.initialModel });
        },
      },
    },
  );
}

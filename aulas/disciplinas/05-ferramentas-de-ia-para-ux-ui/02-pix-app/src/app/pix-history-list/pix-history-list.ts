import { Component, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';

export type PixTransactionType = 'received' | 'sent';

export interface PixTransaction {
  id: string;
  title: string;
  date: Date;
  amount: number;
  type: PixTransactionType;
}

const DEMO_TRANSACTIONS: PixTransaction[] = [
  {
    id: '1',
    title: 'Pix recebido de Maria Souza',
    date: new Date('2024-05-24T14:32:00'),
    amount: 250,
    type: 'received',
  },
  {
    id: '2',
    title: 'Pix enviado para Érick S.',
    date: new Date('2024-05-23T09:15:00'),
    amount: 150,
    type: 'sent',
  },
  {
    id: '3',
    title: 'Pix enviado para Mercado Central',
    date: new Date('2024-05-21T18:47:00'),
    amount: 89.9,
    type: 'sent',
  },
  {
    id: '4',
    title: 'Pix recebido de João Lima',
    date: new Date('2024-05-20T11:05:00'),
    amount: 1200,
    type: 'received',
  },
];

@Component({
  selector: 'app-pix-history-list',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './pix-history-list.html',
  styleUrl: './pix-history-list.css',
})
export class PixHistoryList {
  readonly transactions = input<PixTransaction[]>(DEMO_TRANSACTIONS);
}

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Pix',
    loadComponent: () =>
      import('./pix-transfer/pix-transfer').then((m) => m.PixTransferComponent),
  },
  {
    path: 'extrato',
    title: 'Extrato Pix',
    loadComponent: () =>
      import('./pix-history-list/pix-history-list').then((m) => m.PixHistoryList),
  },
  { path: '**', redirectTo: '' },
];

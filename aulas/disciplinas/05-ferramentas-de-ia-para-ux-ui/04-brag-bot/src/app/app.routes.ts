import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DetailComponent } from './detail/detail.component';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'detail/:id', component: DetailComponent },
  { path: '**', redirectTo: '' },
];

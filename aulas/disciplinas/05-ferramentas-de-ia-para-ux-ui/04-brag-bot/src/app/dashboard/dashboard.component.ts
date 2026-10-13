import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BragService } from '../services/bragService';

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  protected readonly bragService = inject(BragService);
  protected readonly prompt = signal('');

  protected async distill() {
    const text = this.prompt().trim();
    if (!text || this.bragService.loading()) return;
    await this.bragService.generateMockBrag(text);
    this.prompt.set('');
  }
}

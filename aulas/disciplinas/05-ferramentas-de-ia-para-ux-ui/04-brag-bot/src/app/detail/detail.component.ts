import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BragService } from '../services/bragService';

@Component({
  selector: 'app-detail',
  imports: [RouterLink],
  templateUrl: './detail.component.html',
})
export class DetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly bragService = inject(BragService);
  private readonly params = toSignal(this.route.paramMap);

  protected readonly brag = computed(() => {
    const id = this.params()?.get('id');
    return id ? this.bragService.getById(id) : undefined;
  });
}

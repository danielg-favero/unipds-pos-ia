import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CfpDashboardComponent } from './cfp-dashboard.component';

describe('CfpDashboardComponent', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [CfpDashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(CfpDashboardComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, http: TestBed.inject(HttpTestingController) };
  }

  it('lists talks in a semantic table', async () => {
    const { fixture, el, http } = await setup();
    http.expectOne('/api/speakers').flush([
      { id: '1', name: 'Ada', talkTitle: 'Signals', isGDE: true },
      { id: '2', name: 'Grace', talkTitle: 'Compilers', isGDE: false },
    ]);
    await fixture.whenStable();

    expect(el.querySelector('table caption')).not.toBeNull();
    expect(el.querySelectorAll('th[scope="col"]').length).toBe(3);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Ada');
    expect(rows[0].textContent).toContain('Yes');
    expect(rows[1].textContent).toContain('No');
  });

  it('shows an empty state instead of a table', async () => {
    const { fixture, el, http } = await setup();
    http.expectOne('/api/speakers').flush([]);
    await fixture.whenStable();

    expect(el.querySelector('table')).toBeNull();
    expect(el.textContent).toContain('No talks have been submitted yet');
  });

  it('announces a load failure via role=alert and shows no table', async () => {
    const { fixture, el, http } = await setup();
    http.expectOne('/api/speakers').flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
    expect(el.querySelector('table')).toBeNull();
  });

  it('links back to the submission form', async () => {
    const { fixture, el, http } = await setup();
    http.expectOne('/api/speakers').flush([]);
    await fixture.whenStable();

    expect(el.querySelector('a')?.getAttribute('href')).toBe('/talks/submit');
  });
});

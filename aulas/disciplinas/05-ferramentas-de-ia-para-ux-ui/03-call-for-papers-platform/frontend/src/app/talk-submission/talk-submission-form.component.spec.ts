import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TalkSubmissionFormComponent } from './talk-submission-form.component';

describe('TalkSubmissionFormComponent', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [TalkSubmissionFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(TalkSubmissionFormComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = () => el.querySelector('button[type="submit"]') as HTMLButtonElement;
    const fill = async () => {
      fixture.componentInstance.form.setValue({ name: 'Ada', talkTitle: 'Signals', isGDE: true });
      await fixture.whenStable();
    };
    return { fixture, button, fill, http: TestBed.inject(HttpTestingController) };
  }

  it('starts with a disabled submit button and canSubmit false', async () => {
    const { fixture, button } = await setup();
    expect(fixture.componentInstance.canSubmit()).toBe(false);
    expect(button().disabled).toBe(true);
  });

  it('enables the submit button once the form is valid', async () => {
    const { fixture, button, fill } = await setup();
    await fill();
    expect(fixture.componentInstance.canSubmit()).toBe(true);
    expect(button().disabled).toBe(false);
  });

  it('disables the submit button while a submission is in flight', async () => {
    const { fixture, button, fill, http } = await setup();
    await fill();
    fixture.componentInstance.submit();
    await fixture.whenStable();
    expect(button().disabled).toBe(true);

    http.expectOne('/api/speakers').flush({});
    await fixture.whenStable();
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('announces submission errors via role=alert and re-enables the form', async () => {
    const { fixture, fill, http } = await setup();
    await fill();
    fixture.componentInstance.submit();
    http.expectOne('/api/speakers').flush('bad', { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Could not submit');
    expect(fixture.componentInstance.canSubmit()).toBe(true);
  });

  it('links to the dashboard', async () => {
    const { fixture } = await setup();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a.secondary');
    expect(link?.getAttribute('href')).toBe('/dashboard');
  });
});

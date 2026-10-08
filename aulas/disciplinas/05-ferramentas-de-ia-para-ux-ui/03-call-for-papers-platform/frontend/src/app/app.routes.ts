import { Route } from '@angular/router';
import { CfpDashboardComponent } from './cfp-dashboard/cfp-dashboard.component';
import { TalkSubmissionFormComponent } from './talk-submission/talk-submission-form.component';

export const appRoutes: Route[] = [
  { path: 'talks/submit', component: TalkSubmissionFormComponent },
  { path: 'dashboard', component: CfpDashboardComponent },
];

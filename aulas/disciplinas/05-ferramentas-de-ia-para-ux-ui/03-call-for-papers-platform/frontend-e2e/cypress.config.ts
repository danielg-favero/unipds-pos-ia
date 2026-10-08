import { defineConfig } from 'cypress';
import { nxE2EPreset } from '@nx/cypress/plugins/cypress-preset';

export default defineConfig({
  projectId: 'sgmben',
  e2e: {
    ...nxE2EPreset(__filename, {
      cypressDir: 'src',
      webServerCommands: {
        default: 'npx nx run frontend:serve',
        production: 'npx nx run frontend:serve',
      },
      ciWebServerCommand: 'npx nx run frontend:serve',
    }),
    baseUrl: 'http://localhost:4200',
    specPattern: 'src/e2e/**/*.cy.ts',
    supportFile: false,
  },
});

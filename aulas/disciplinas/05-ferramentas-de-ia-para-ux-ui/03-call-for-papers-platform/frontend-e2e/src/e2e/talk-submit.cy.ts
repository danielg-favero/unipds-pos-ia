describe('Talk submission', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/speakers', {
      statusCode: 201,
      body: { id: 1 },
    }).as('submit');
    cy.visit('/talks/submit');
  });

  it('submits a valid form and resets it', () => {
    const name = 'Ada Lovelace';
    const talkTitle = 'Analytical Engines in 2026';

    cy.get('button[type="submit"]').should('be.disabled');
    cy.get('#name').type(name);
    cy.get('#talkTitle').type(talkTitle);
    cy.get('button[type="submit"]').should('not.be.disabled').click();

    cy.wait('@submit')
      .its('request.body')
      .should('deep.equal', { name, talkTitle, isGDE: false });

    cy.get('#name').should('have.value', '');
    cy.get('#talkTitle').should('have.value', '');
    cy.get('[role="alert"] p').should('not.exist');
  });

  it('shows required messages for an empty form and blocks submit', () => {
    cy.get('#name').focus();
    cy.get('#talkTitle').focus();
    cy.get('#name').focus();

    cy.contains('Name is required.').should('be.visible');
    cy.contains('Talk title is required.').should('be.visible');
    cy.get('button[type="submit"]').should('be.disabled');
    cy.get('@submit.all').should('have.length', 0);
  });
});

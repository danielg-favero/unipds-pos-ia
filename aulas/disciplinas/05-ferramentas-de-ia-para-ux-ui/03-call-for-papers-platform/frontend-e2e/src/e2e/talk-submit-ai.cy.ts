describe("Cadastro de Talk - AI Driven Testing", () => {
  it("Deve executar o fluxo de cadastro e validar o sucesso de forma semântica", () => {
    cy.visit("/talks/submit");

    cy.prompt([
      'Type "Ada Lovelace" in the name field',
      'Type "Analytical Engines in 2026" in the talk title field',
      'Check the "I am a Google Developer Expert" checkbox',
      "Click the button that submits or saves the talk",
    ]);

    cy.prompt(["Verify that a success message is visible"]);
  });
});

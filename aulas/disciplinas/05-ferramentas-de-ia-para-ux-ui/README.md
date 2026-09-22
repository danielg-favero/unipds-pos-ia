# Ferramentas de IA para UX / UI

## Refinamento de requisitos

É possível utilizar modelos de LLM para mapear refinamentos entre o time de desenvolvimento e PO. Muitas vezes, os desejos trazidos pelo PO não são detalhados o suficiente para o time de desenvolvimento e podem esconder detalhes que não foram mapeados.

Exemplo:

```md
# Ticket: Novo Fluxo de Transferência Pix Agendado

**Descrição:**
Precisamos criar uma tela onde o usuário possa agendar um Pix. Ele deve escolher o contato, colocar o valor, selecionar a data e confirmar. Se der sucesso, mostra a tela de comprovante.

**Regras:**

- O limite diário é R$ 5.000,00.
- Não pode agendar para o mesmo dia (se for hoje, é Pix normal).
- Tem que ter um botão para cancelar o agendamento depois.
```

Criando um agente de `Analista de Requisitos` é possível analisar esse pequeno refinamento e detalhar:

- Edge Cases
- Estados da UI: `loading`, `success` e `error`
- Regras de negócio não mapeadas

### Diagramação de fluxos de usuário

Durante a analise de requisitos, é possível utilizar a ferramenta [`Mermaid.js`](https://mermaid.js.org/) para auxiliar na criação de diagramas.

Exemplo:

```mermaid
graph TD
    %% Definições de Estilo
    classDef error fill:#f96,stroke:#333,stroke-width:2px;
    classDef success fill:#9f6,stroke:#333,stroke-width:2px;
    classDef uiState fill:#e1f5fe,stroke:#01579b,stroke-width:1px;
    classDef process fill:#fff,stroke:#333,stroke-width:1px;

    %% Fluxo de Seleção de Contato
    Start((Início)) --> GetContacts[Carregar Lista de Contatos]
    GetContacts --> LoadingContacts[UI: Loading Skeleton]
    LoadingContacts --> CheckContacts{Há contatos?}

    CheckContacts -- Não --> EmptyContacts[UI: Empty State - Nenhum Contato]
    EmptyContacts --> SearchContact[Busca Manual de Chave]

    CheckContacts -- Sim --> SelectContact[Selecionar Contato]
    SearchContact --> SelectContact

    %% Fluxo de Valores e Regras
    SelectContact --> InputAmount[Inserir Valor R$]
    InputAmount --> ValidateLimit{Valor > R$ 5.000,00?}

    ValidateLimit -- Sim --> ErrorLimit[UI: Erro - Limite Diário Excedido]:::error
    ErrorLimit --> InputAmount

    ValidateLimit -- Não --> SelectDate[Selecionar Data no Calendário]

    %% Validação de Datas
    SelectDate --> CheckDate{Data Selecionada}
    CheckDate -- Hoje --> SuggestPix[UI: Sugestão - Mudar para Pix Normal]:::uiState
    CheckDate -- Passado --> ErrorDate[UI: Erro - Data Retroativa Inválida]:::error
    CheckDate -- Futuro --> ReviewScreen[UI: Tela de Revisão dos Dados]

    %% Processamento e Segurança
    ReviewScreen --> ConfirmAction[Botão: Confirmar Agendamento]
    ConfirmAction --> MFA[Desafio de Segurança: Senha/Biometria]

    MFA --> MFA_Check{Autenticado?}
    MFA_Check -- Não --> MFA_Retry[UI: Feedback de Senha Incorreta]:::error
    MFA_Retry --> MFA

    MFA_Check -- Sim --> API_Call[Chamada API: POST /pix/schedule]
    API_Call --> LoadingAPI[UI: Loading Overlay Ativo]:::uiState

    %% Tratamento de Respostas da API
    LoadingAPI --> API_Response{Status API}

    API_Response -- 201 Created --> SuccessScreen[UI: Tela de Comprovante]:::success
    API_Response -- 403 Forbidden --> ErrorBusiness[UI: Erro - Saldo Insuficiente/Regra de Risco]:::error
    API_Response -- 429/500 --> ErrorServer[UI: Erro - Instabilidade no Bacen]:::error
    API_Response -- Timeout --> ErrorTimeout[UI: Feedback - Verificar Extrato em Instantes]:::error

    %% Fluxo de Gerenciamento (Cancelamento)
    SuccessScreen --> ListSchedule[Ir para: Meus Agendamentos]
    ListSchedule --> CheckList{Há agendamentos?}

    CheckList -- Não --> EmptyList[UI: Empty State - Sem Agendamentos]:::uiState
    CheckList -- Sim --> ViewDetails[Ver Detalhes do Agendamento]

    ViewDetails --> CancelAction[Botão: Cancelar Agendamento]
    %% Aqui o Gemini comenteu um erro colocando as chaves e quebrando o desenho
    CancelAction --> API_Cancel[Chamada API: DELETE /pix/schedule/id]

    API_Cancel --> CancelStatus{Status Cancelamento}
    CancelStatus -- 200 OK --> CancelSuccess[UI: Toast - Agendamento Cancelado]:::success
    CancelStatus -- 400 Bad Request --> CancelLocked[UI: Erro - Já em processamento de envio]:::error

    %% Relacionamentos de Erro
    ErrorLimit -.-> InputAmount
    ErrorDate -.-> SelectDate
    ErrorBusiness -.-> ReviewScreen
    ErrorServer -.-> ConfirmAction
    CancelLocked -.-> ListSchedule
```

### UX Writing

Usando agentes de código, é possível ter um especialista responsável pelas mensagens de erro, validações e etc. Que serão exibidas para os usuários

Exemplo:

````md
---
name: UX Writer
description: Lead UX Writer Técnico e Especialista em Internacionalização (i18n) para Sistemas Bancários. Sua tarefa é padronizar mensagens de sistema, garantindo clareza, empatia e orientação à ação.
tools: Read, Glob, Grep, Bash
---

# DIRETRIZES DE TOM E VOZ (STYLE GUIDE)

1. **Sem Culpa (Blameless):**
   - PROIBIDO: "Erro do usuário", "Dado inválido", "Você esqueceu".
   - PERMITIDO: "Não foi possível processar", "Formato não reconhecido".
2. **Resolutivo:**
   - Todo erro deve sugerir o próximo passo (ex: "Tentar novamente", "Verificar conexão").
   - Evite becos sem saída.
3. **Consistência Técnica:**
   - Use "Transferência" (não "Envio").
   - Use "Agendamento" (não "Reserva").
   - Use "Chave Pix" (não "ID").

# FORMATO DE SAÍDA (JSON)

Sempre responda com um objeto JSON estrito, seguindo este schema:

```json
{
  "ERROR_KEY_OR_CODE": {
    "title": "Título curto (máx 40 caracteres)",
    "message": "Explicação do problema + Solução (máx 140 caracteres)",
    "action_label": "Texto do botão (Verbo no imperativo)"
  }
}
```
````

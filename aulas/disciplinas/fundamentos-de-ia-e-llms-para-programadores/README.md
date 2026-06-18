# Fundamentos de IA e LLMs para Programadores

## Projetos

Exemplos práticos desenvolvidos ao longo da disciplina. Cada pasta tem seu próprio `README.md` com contexto e instruções de execução.

| # | Projeto | O que demonstra |
|---|---------|-----------------|
| 01 | [Tensores](./01-tensores/) | Tensores e treino de uma rede neural simples com TensorFlow.js no Node |
| 02 | [Recomendação de E-commerce](./02-ecommerce-recomendations-with-tensorflowjs/) | Treino e recomendação no navegador (Web Worker + TensorFlow.js) |
| 03 | [Duck Hunt IA](./03-duck-hunt-ia/) | Visão computacional: YOLOv5n mira e atira sozinho no jogo |
| 04 | [Web AI](./04-web-ai/) | Prompt API nativa do navegador (LLM on-device com Gemini Nano) |
| 05 | [Playwright MCP](./05-playwright-mcp/) | Geração de testes E2E a partir de prompts via Playwright MCP |
| 06 | [Context7 MCP](./06-ctx7-mcp/) | Geração de código com docs atualizadas (Next.js + Better Auth) |
| 07 | [Neo4j + RAG](./07-neo4j/) | Pipeline de RAG com busca vetorial no Neo4j + LLM via OpenRouter |

## Índice de conceitos

- [Conceitos básicos](#conceitos-básicos) — IA, Machine Learning, Deep Learning
- [Tensores](#tensores)
- [LLM](#llm) — GPT, geração de texto, configurações de `encoding`
  - [Prompts que geram boas respostas](#prompts-que-geram-boas-respostas)
  - [Padrão JSON vs. Padrão TOON](#padrão-json-vs-padrão-toon)
- [IDEs para desenvolvimento usando IA](#ides-para-desenvolvimento-usando-ia)
- [Agentes de IA](#agentes-de-ia)
- [MCPs](#mcps) — Model Context Protocol
- [Modelos abertos e fechados](#modelos-abertos-e-fechados) — open weights, sem censura, Ollama
- [RAG](#rag) — Retrieval-Augmented Generation

## Conceitos básicos

### Inteligência artificial

A forma que se usa para ensinar uma máquina a executar uma tarefa.

### Machine Learning

São algoritmos que aprendem padrões com dados e preveem resultados

### Deep Learning

É uma forma de machine learning que trabalha com mais dados e é mais especializada

> O google disponibiliza uma ferramenta gratuito chamada [Teachable Machine](https://teachablemachine.withgoogle.com/) para ensinar redes neurais de maneira visual e intuitiva, permitindo exportar esses modelos treinados para uma outra aplicação desejada

## Tensores

Um vetor n dimensional de números que representa informações de em um dado em um conjunto de dados.

Normalmente, todos os dados nos tensores são normalizados para valores entre `0` e `1`

## LLM

Sigla para _Large Language Model_. É um modelo de inteligência artificial que utiliza muito quantidade muito grande de dados de texto para treinamento

### GPT

Sigla para _Generative Pre-trained Transformer_:

- **Generative**: A LLM gera textos, token por token.
- **Pre-trained**: A LLM é treinada com uma grande quantidade de dados.
- **Transformer**: A arquitetura da LLM.

#### Processo de gerar textos com LLMs

1. **Tokenização**: Transforma os dados de entrada em tokens (unidades de texto)
2. **Embeddings**: Transforma tokens em vetores, onde cada token vira um vetor numérico (palavras em contextos semelhantes ficam próximas no espaço vetorial e seus embeddings sã o semelhantes)
3. **Transformers processas o contextos**: O transformer analisa os tokens no contexto e analisa quais partes sã o mais relevantes para prever novos tokens (É o cérebro da LLM). Ele analisa todos os tokens de uma fez usando paralelismo.
4. **Attention**: Permite que a LLM foque em partes específicas do texto de entrada, usada principalmente para entender gramática e semântica de um texto.
5. **Probabilidade do próximo token**: O modelo gera uma lista de probabilidades dos próximos tokens possíveis. A decisão depende do método de `encoding` geralmente configurado antes de enviar o prompt
6. **Sampling**: Percorrer a lista de tokens prováveis e escolher um token

#### Configurações de `encoding` recomendadas

- **Temperatura**
  - Código técnico: `0.2` - `0.4` (É preciso de mais precisão)
  - Tarefas comuns: `0.7` - `1.0` (Equilibrio entre precisão e criatividade)
  - Escrever texto: `>1.0` (Mais criatividade)

### Prompts que geram boas respostas

Você necessariamente precisa refinar o que você quer, ou seja, é preciso detalhar o máximo possível. Para que uma LLM responda um cliente de forma satisfatória e seguindo um conjunto de regras, é possível condicionar ela usando um estrutura de prompts.

#### Esqueleto de um bom prompt

1. **Contexto da tarefa**: Aqui é definido a função e o objetivo do agente

- Ex: _"Você é um chatbot de atendimento ao cliente"_

2. **Contexto de tom**: Aqui é definido estilos de escrita, formalidade e empatia

- Ex: _"Matenha o tom amigável, objetivo e empático"_

3. **Dados de antecedentes, documentos e imagens**: Aqui é passado links, documentos, cards, imagens, etc. Sem essas informações, a IA vai buscar de seus dados de treinamento ou dados na internet.
4. **Descrição da tarefa e regras**: Aqui é descrito a tarefa e regras caso o agente precise fazer alguma ação

- Ex: _"Se a tarefa for de atendimento ao cliente, pergunte para o usuário se ele gostaria de falar com um atendente"_
- Ex2: _"Se não entendeu alguma coisa da tarefa, pergunte para mim"_

Para evitar alucionações na I.A. é importante ter os seguintes prompt:

- _"Não invente fatos"_
- _"Se não tiver no contexto, diga que não tem informação"_
- _"Se faltar dado inicial, faça de 1 à 3 perguntas objetivas"_
- _"Se houver ambiguidade, liste as opções e peça pro usuário escolher"_
- _"Se houver documento no bloco 3, baseie-se nele e cite trechos dele"_

5. **Exemplos**: Mostra para a IA um exemplo de como ela deve responder a mensagem

6. **Histórico da conversa**: É passado o histórico da conversa anterior (as vezes é resumido para reduzir tokens)

7. **Pedido do pedido**: Aqui vai a pergunta do cliente para a LLM

8. **Resposta pré-preenchida**: Aqui é definido como será o output da resposta:

- Ex: _"Coloque sua resposta em Markdown"_
- Ex2: _"A resposta deve estar em inglês"_

### Padrão JSON vs. Padrão TOON

Ao invés de usar textos livres como prompts, LLMs podem utiliar uma estrutura que pode ser processada de forma mais fácil por programas. Isso evita:

1. Ambiguidade
2. Alucionação
3. Mais previsível para trabalhar com código
4. Escalabilidade (Prompts viram config não conversas com LLMs)
5. É possível reutilizar o prompt

Para esse tipo de abordagem, é importante ressaltar que esses dados estruturados podem acabar consumindo mais tokens do que texto comum, pois agora as chaves e os caracteres especiais consomem dessas estruturas são tratados como tokens também. Há duas estruturas possíveis para receber essas respostas: TOON e JSON.

#### JSON

Ideial para prompts grandes, pois acabam economizando o total de tokens final

1. Reduz retrabalho
2. Reduz mensagens de correção
3. Evita respostas longas

A LLM não utiliza o JSON como parser real, ele apenas utiliza como "trilho" pois os dados estão mais estruturados

Ex:

```json
{
  "prompt_id": "artigo_blog_001",
  "tarefa": "Escrever um artigo de blog sobre o impacto da Inteligência Artificial no mercado de trabalho.",
  "parametros": {
    "publico_alvo": "Profissionais de negócios e empreendedores",
    "tom_de_voz": "Informativo, profissional e otimista",
    "tamanho_limite": "Entre 500 e 800 palavras",
    "idioma": "Português do Brasil"
  },
  "requisitos": {
    "incluir_introducao": true,
    "incluir_conclusao": true,
    "numero_minimo_subtitulos": 3,
    "palavras_chave": [
      "Inteligência Artificial",
      "Futuro do trabalho",
      "Automação"
    ]
  },
  "formato_saida": "JSON contendo o título, subtítulos e o corpo do texto formatado em Markdown"
}
```

É possível ainda adicionar as seguintes chaves:

- `do_not_invent: true`
- `if_missing_data: "say_you_dont_know"`
- `cite_source_fields: ["context.source"]`
- `allow_assumptions: []`

> Utilize o `zod` ou outra ferramenta para validar o json de saída

#### TOON

Sigla para _Token Oriented Object Notation_. É uma forma de enviar dados estructurados para a LLM de forma que ela gaste menos tokens, pois ela não usa chaves e caracteres especiais como o json. A estrutura é baseada em tags.

Ex:

```toon
[3]{name,url}:
Formação Javascript Expert, "https://example1.com"
Método Testes Automatizados em Javascript, "https://example2.com"
Mastering Node.js Streams, "https://example3.com"
```

> Diferente do JSON, nenhuma chave foi repetida, isso faz com que o TOON consuma menos tokens.

> LLMs foram treinadas com JSON, então um JSON bem estruturado tende a ganhar de um TOON

## IDEs para desenvolvimento usando IA

- [Cursor](https://cursor.com/get-started?utm_source=google_paid&utm_campaign=[Search]%20[Brand]%20[EN]%20[LATAM]%20[Broad]%20[VBB]%20Brand&utm_term=cursor&utm_medium=paid&utm_content=799681120531&cc_platform=google&cc_campaignid=23643850984&cc_adgroupid=192799906046&cc_adid=799681120531&cc_keyword=cursor&cc_matchtype=b&cc_device=c&cc_network=g&cc_placement=&cc_location=9102159&cc_adposition=&gad_source=1&gad_campaignid=23643850984&gbraid=0AAAABAkdGgQJRidmzjbanmFxlPfgEUvAv)
- [VSCode](https://code.visualstudio.com)
- [Windsurf](https://docs.windsurf.com/pt-BR/windsurf/getting-started)

## Agentes de IA

É um sistema que usa LLM como motor de decisão. Um LLM sozinha não executa comandos,não abre arquivos, etc. enquanto um agente evita isso tendo:

1. Objetivo (o que o usuário quer)
2. Plano (como chegar lá)
3. Ações (rodar ferramentas, buscar mais contexto)
4. Observações (ver resultados: logs/testes/erros)
5. Iteração (corrigir e repetir)
6. Entrega final (evidências e relatório final)

> O agente não precisa estar em um editor, mas em qualquer local no computador ou servidor

### Exemplos de possíveis agentes para diferentes contextos

- **Planner**: Só planeja, não edita nada
- **Implementer**: Edita código e roda testes
- **Reviewer**: Analisa, opina sobre código, segurança e boas práticas, não edita nada
- **QA**: Realiza testes unitários e de integração, reportando bugs e melhorias
- **Docs**: Gera ou atualiza documentação com base nas mudanças feitas

## MCPs

Protocolo criado pela antropic cuja sigla significa `Model Context Protocol`. É usado para conectar LLMs a diferentes ferramentas (arquivos, bancos de dados, automações, etc.).

### MCP para escrita de testes

É possível utilizar o `playwright-mcp` para gerar testes automatizados em playwright de forma mais facil.

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--extension"]
    }
  }
}
```

> No claude é preciso utilizar o comando `claude mcp add playwright -- npx -y @playwright/mcp@latest`

### MCP para consultar documentações atualizadas

A ideia é criar um "agente" que consulta a documentação oficial atualizada para responder perguntas, evitando alucinações sobre versões antigas. Normalmente LLMs são treinadas com informações desatualizadas, então é preciso trazer a informação atualizada para elas.

Para isso, será usado o MCP `ctx7`.

```bash
npx ctx7 setup
```

> Siga o passo a passo para concluir o setup do

## Modelos abertos e fechados

### Modelos open weights

São modelos que disponibilizam seu `pesos` do treinamento para ser possível treinar com uma base de dados públicos

### Modelos sem censura

São modelos que não censuram respostas, que permitem falar sobre assuntos polêmicos e até mesmo podem causar problemas legais, então é preciso tomar cuidado com esses modelos. É recomendado apenas para uso pessoal e não corporativo onde clientes podem acessar

Exemplos de prompts de modelos sem censura:

- _"Como é feito um emulador de videogame"_
- _"Crie uma cópia da logo de uma empresa"_
- _"Remova as roupas das pessoas nessas imagens"_
- _"Como criar hack para um jogo"_

### [Ollama](https://ollama.com/)

Funciona como um `Docker` para rodar modelos de LLM abertos.

Esses modelos não são recomendados para produção, apenas em caso de:

- POCs
- Automações locais
- Scripts de produtividade
- Protótipos de agentes de IA
- Estudos de modelos

## RAG

Sigla para `Retrieval-Augmented Generation` é um padrão de arquitetura, onde antes da LLM responder, ela busca informações externas relevantes (docs, pdfs, bancos de dados) e injeta a resposta no contexto.

Diferente do `MCP`, o `RAG` é um método de buscar conhecimento e atribuir a resposta para a LLM. O `MCP` é um canal ótimo para buscar conhecimento para o `RAG` (e.g. `context7`)

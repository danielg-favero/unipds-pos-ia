---
applyTo: "web/**"
---

# Diretrizes de design

## Hierarquia

- Cada tela deve ter um único elemento de maior destaque (título ou ação primária); tudo o resto compete por atenção secundária.
- Use no máximo 3 níveis de peso tipográfico por tela (ex: título, subtítulo, corpo). Não crie variações ad-hoc.
- Ações primárias usam botão preenchido; ações secundárias usam outline ou texto. Nunca mais de uma ação primária visível por contexto.
- Agrupe conteúdo relacionado visualmente (cards, seções) antes de recorrer a divisórias ou bordas.

## Espaçamento em escala

- Use uma escala de espaçamento consistente (ex: 4px base: 4, 8, 12, 16, 24, 32, 48, 64). Não usar valores arbitrários fora da escala.
- Espaçamento entre elementos relacionados deve ser menor que o espaçamento entre grupos não relacionados.
- Mantenha padding interno consistente entre componentes do mesmo tipo (todos os cards com o mesmo padding, por exemplo).

## Estados vazios

- Todo componente que lista dados (tabelas, listas, dashboards) precisa de um estado vazio explícito: mensagem curta explicando o que aparecerá ali e, quando fizer sentido, uma ação para começar.
- Não deixar containers vazios sem feedback visual (sem placeholder, sem mensagem).

## Estados de erro

- Erros devem ser exibidos próximos ao contexto que falhou (inline em formulários, banner no topo de uma seção), nunca apenas em console ou toast genérico para erros que bloqueiam o fluxo.
- Mensagens de erro devem indicar o que aconteceu e, quando possível, o que fazer a seguir. Evitar mensagens técnicas cruas (stack trace, códigos internos) para o usuário final.
- Estados de erro devem ser visualmente distintos de estados normais (cor, ícone), mas sem depender apenas de cor.

## Dark mode

- Todas as cores devem ser definidas como tokens (variáveis), nunca hardcoded, para permitir alternância entre temas claro e escuro.
- Testar contraste em ambos os temas — não assumir que valores que funcionam no claro funcionam automaticamente no escuro.
- Superfícies elevadas (cards, modais) no dark mode devem se diferenciar do fundo por variação de luminosidade, não só por borda.

## Acessibilidade

- Contraste mínimo de texto: 4.5:1 para texto normal, 3:1 para texto grande (WCAG AA).
- Todo elemento interativo (botão, link, campo) deve ser acessível via teclado e ter foco visível.
- Imagens e ícones informativos precisam de texto alternativo; ícones puramente decorativos devem ser ocultados de leitores de tela.
- Formulários: todo campo precisa de label associado (não apenas placeholder).
- Não usar cor como único indicador de estado ou significado (erro, sucesso, obrigatório).

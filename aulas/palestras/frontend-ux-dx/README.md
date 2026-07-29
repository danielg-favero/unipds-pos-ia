# Frontend + UX/DX

Como construir `Frontends` sem `AI Slop` (Frontend com cara de IA).

> Importante entender: Prompt genérico = resultado genérico

## O que fazer

1. Ter a base de um design system (ou alguma lib de componentes prontas)
   - Tokens
   - Cores
   - Espaçamentos
   - Fontes
2. Usar `storybook` para organizar o design system
3. Padronizar os componentes
4. Definir regras para o Claude
   - Agentes
   - Skills
5. Buscar referências
   - Figma + Tokens Studio
   - Dribbble

## Método S.Y.S.T.E.M

| Letra | Princípio              | O que significa                                    |
| :---: | ---------------------- | -------------------------------------------------- |
| **S** | Select a Foundation    | Comece com algo que já exista (ShadcnUI, Tailwind) |
| **Y** | Yield fewer decisions  | Reduza as decisões que a IA precisa tomar          |
| **S** | Specify Semantics      | Use nomes semânticos e padrões de design system    |
| **T** | Teach through examples | Forneça exemplos reais nos prompts                 |
| **E** | Enforce constraints    | Explicite o que a IA deve e não deve fazer         |
| **M** | Measure deviation      | Peça para a IA explicar o que está fazendo         |

## Segurança em aplicações frontend com IA

Geralmente quando fazemos código com IA, muitas vezes não nos preocupamos com segurança, ou nos preocupamos no final do projeto, pois apenas executamos prompts e não revisamos muito o código.

O [`lagune.ai`](https://lagune.ai/) é um projeto open source que ajuda a implementar práticas de segurança em aplicações frontend com IA. Com alguns comandos, são gerados skills para o claude, que fará a revisão de segurança do código gerado pela IA e para as ferramentas que são utilizadas no projeto.

É possível listar vulnerabilidades no React, Vite, Node, etc.

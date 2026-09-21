# Refinamento: Pix Agendado

## analise_de_risco (pontos cegos do requisito)

| #   | Ponto cego                                                                     | Risco                                                            |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1   | Nenhuma **autenticação** na confirmação (PIN, biometria, token)                | Agendamento fraudulento em sessão sequestrada                    |
| 2   | Não diz **quando o valor sai da conta** (na data ou no agendamento)            | Saldo bloqueado ou não, e expectativa errada do usuário          |
| 3   | Não diz o que acontece se **faltar saldo na data**                             | Falha silenciosa do agendamento                                  |
| 4   | Não há **limite de antecedência** (máximo de dias/meses)                       | Agendamentos absurdos, como daqui a 10 anos                      |
| 5   | Não define **fuso horário** nem horário de corte                               | "Hoje" é ambíguo perto da meia-noite                             |
| 6   | Não há **idempotência** no "confirmar"                                         | Duplo clique gera dois agendamentos                              |
| 7   | Não há **prazo para cancelar** (até quando pode?)                              | Cancelar minutos antes da execução gera corrida (race condition) |
| 8   | Não define **recorrência**                                                     | Ambiguidade de escopo (Pix agendado recorrente existe no Bacen)  |
| 9   | Contato: sem regra para **chave inválida, inexistente ou alterada** até a data | Valor enviado para o destinatário errado                         |
| 10  | Sem **notificação** (push/e-mail) de sucesso, falha ou lembrete                | O usuário não sabe o resultado                                   |

## mapeamento_de_estados (UI)

**Tela de agendamento**

- **Inicial:** formulário vazio, botão "Confirmar" desabilitado.
- **Loading:** carregando contatos e saldo (skeleton); botão em loading ao confirmar (bloquear novos cliques).
- **Empty:** usuário sem contatos, com CTA "Adicionar contato / digitar chave".
- **Empty (busca):** nenhum contato encontrado para o termo.
- **Validação inline:**
  - Valor zerado, negativo ou não numérico.
  - Valor acima do limite diário (mostrar o restante disponível).
  - Valor acima do saldo (se houver bloqueio).
  - Data vazia, passada ou igual a hoje (com mensagem e atalho "Fazer Pix agora").
  - Data além do máximo permitido.
- **Confirmação:** resumo (contato, valor, data) e autenticação (PIN/biometria).

**Resultado**

- **Sucesso:** comprovante com ID, data de criação, data agendada, valor, destinatário e botão "Cancelar agendamento".
- **Erro de rede/timeout:** estado _incerto_. Consultar o status antes de deixar retentar.
- **Erro de negócio:** limite excedido, conta bloqueada, chave inválida.
- **Erro de autenticação:** PIN incorreto, tentativas excedidas.
- **Sessão expirada:** redirecionar para login preservando o rascunho.

**Cancelamento**

- Modal de confirmação → loading → sucesso / erro.
- Estado "não cancelável" (já processando ou executado): botão desabilitado com explicação.
- Estado "já cancelado".

**Lista de agendamentos** (necessária para cancelar depois)

- Loading, Empty ("Nenhum Pix agendado"), Error com "Tentar novamente".
- Status por item: `Agendado`, `Processando`, `Executado`, `Falhou`, `Cancelado`.

## cenarios_ocultos

1. **Saldo insuficiente na data:** falha na execução. Definir a notificação, o status `Falhou` e se há nova tentativa.
2. **Data cai em fim de semana ou feriado:** o Pix funciona 24/7, então não há restrição, mas deve estar explícito.
3. **Dois agendamentos somados estouram o limite:** por exemplo, R$ 3.000 + R$ 3.000 na mesma data.
4. **Limite noturno:** o Bacen exige limite reduzido entre 20h e 6h para pessoa física. Verificar a interação.
5. **Meia-noite:** o usuário abre a tela às 23:58 e "amanhã" vira "hoje" ao confirmar. Revalidar no back-end.
6. **Contato apagado ou bloqueado** depois do agendamento.
7. **Conta encerrada ou chave migrada** do destinatário até a data.
8. **Cancelar no dia da execução**, no mesmo instante em que o job roda.
9. **Voltar/atualizar a página** na tela de comprovante (não recriar o agendamento).
10. **Comprovante:** compartilhar, baixar e reabrir depois.
11. **Múltiplos dispositivos:** cancelar em um dispositivo enquanto outro está aberto.
12. **Acessibilidade:** seletor de data acessível por teclado e leitor de tela, valor com máscara e formato pt-BR.
13. **Usuário quer editar o agendamento:** só existe cancelar. Definir se é intencional.

## regras_de_negocio_conflitantes

| Regra                           | Problema                                                                                                              | Proposta                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Limite diário R$ 5.000**      | Diário de qual data? Da **criação** ou da **execução**? Conflita com o item 3 dos cenários                            | Contar na data de execução, revalidando no momento do débito            |
| **"Se for hoje, é Pix normal"** | O texto diz o que fazer, mas não diz se a UI **redireciona automaticamente** ou só bloqueia. Também não define o fuso | Bloquear a data e oferecer atalho. Usar horário de Brasília no back-end |
| **Validação só no front**       | Se as regras só existirem no cliente, é **inseguro**. Limite e data precisam ser aplicados no servidor                | Front valida para UX, back-end é a fonte da verdade                     |
| **Cancelar "depois"**           | Sem prazo nem estado final definido                                                                                   | Permitir até X minutos antes da execução; após isso, desabilitado       |
| **Sucesso → comprovante**       | Um comprovante de **agendamento** não é comprovante de **transferência**. Chamar de "comprovante" pode confundir      | Chamar de "Comprovante de agendamento" e emitir outro na execução       |
| **Limite × Pix normal**         | O Pix normal do mesmo dia também consome o limite de R$ 5.000?                                                        | Confirmar se o limite é compartilhado                                   |

## Perguntas para o PO (bloqueantes)

1. O valor é debitado na criação ou na data?
2. O limite conta na data de criação ou de execução? É compartilhado com o Pix normal?
3. Qual a antecedência máxima e o prazo mínimo para cancelar?
4. Qual a autenticação exigida na confirmação?
5. O que acontece e o que o usuário recebe se faltar saldo na data?
6. Recorrência e edição estão fora do escopo?

Quando as respostas chegarem, posso transformar isso em critérios de aceite (Gherkin) e num checklist de componentes de UI.

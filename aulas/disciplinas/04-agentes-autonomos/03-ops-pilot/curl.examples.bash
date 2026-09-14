# sev3 (baixa)
curl -s localhost:3000/chat -X POST -H 'Content-Type: application/json' -d '{"message":"abra um incidente low para o notification: fila de e-mails atrasada", "userId": "u-42"}' | jq -r '.answer'

# sev2 (alta)
curl -s localhost:3000/chat -X POST -H 'Content-Type: application/json' -d '{"message":"abra um incidente high para o catalog: busca lenta no p95", "userId": "u-42"}' | jq -r '.answer'

# sev1 (crítica)
curl -s localhost:3000/chat -X POST -H 'Content-Type: application/json' -d '{"message":"abra um incidente critical para o checkout: p99 acima de 2s e carrinho falhando", "userId": "u-42"}' | jq -r '.answer'

# listar incidentes
curl -s localhost:3000/chat -X POST -H 'Content-Type: application/json' -d '{"message":"liste os incidentes abertos com severidade de cada um", "userId": "u-42"}' | jq -r '.answer'

# adicionar preferência a um usuário
curl -s localhost:3000/memories -X POST -H 'Content-Type: application/json' -d '{"userId":"u-42", "fact":"Prefere os alertas críticos primeiro"}'

# perguntar com base na preferência
curl -s localhost:3000/chat -X POST -H 'Content-Type: application/json' -d '{"message":"organize meu plantão", "userId": "u-42"}' | jq '{answer, recalledMemories: .metrics.recalledMemories, historyMessages: .metrics.histohistoryMessages}'

curl -s localhost:3000/chat -X POST -H 'Content-Type: application/json' -d '{"message":"gostaria de ver os incidentes abertos com status firing em primeiro e os resolved por último", "userId": "u-42"}' | jq '{answer, recalledMemories: .metrics.recalledMemories, historyMessages: .metrics.histohistoryMessages}'
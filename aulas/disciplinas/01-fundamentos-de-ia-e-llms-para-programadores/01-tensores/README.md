# 01 - Tensores

Primeiro contato prático com **tensores** e **redes neurais** usando [TensorFlow.js](https://www.tensorflow.org/js) no Node.js.

## Contexto

O projeto treina uma pequena rede neural que classifica um cliente em três categorias (`premium`, `medium`, `basic`) a partir de características já tratadas:

- **Idade** normalizada entre `0` e `1`
- **Cor** e **localização** convertidas para **one-hot encoding**

Cada cliente vira um tensor de 7 posições: `[idade, azul, vermelho, verde, São Paulo, Rio, Curitiba]`.

A rede tem:

1. Uma camada de entrada `dense` com 80 neurônios e ativação `relu`
2. Uma camada de saída `dense` com 3 neurônios e ativação `softmax` (probabilidade de cada categoria)

Depois de treinada (100 épocas, otimizador `adam`, loss `categoricalCrossentropy`), o modelo faz uma predição para uma nova pessoa e imprime a probabilidade de cada categoria.

O objetivo é entender, na prática, conceitos como **normalização**, **one-hot encoding**, **camadas densas**, **funções de ativação**, **treino** e **predição**.

## Pré-requisitos

- Node.js 22 (veja o `.tool-versions` da disciplina)

## Como rodar

```bash
npm install
npm run dev
```

O script imprime os tensores de entrada/saída, o log de cada época de treino e, ao final, a predição para a nova pessoa.

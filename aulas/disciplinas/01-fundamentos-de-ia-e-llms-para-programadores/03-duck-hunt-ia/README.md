# 03 - Duck Hunt IA (mira automática com visão computacional)

> Este projeto é um **fork** do clássico [DuckHunt-JS](https://github.com/MattSurabian/DuckHunt-JS) adaptado para a disciplina. A documentação original do jogo está preservada abaixo. Esta seção explica **o que foi adicionado**: uma IA que joga sozinha usando **visão computacional**.

## Contexto da disciplina

O objetivo é demonstrar **inferência de um modelo de detecção de objetos no navegador** com TensorFlow.js. Um modelo **YOLOv5n** (já exportado em `machine-learning/yolov5n_web_model/`) roda em um **Web Worker** e "assiste" ao próprio jogo para mirar e atirar automaticamente.

Como funciona (em `machine-learning/`):

1. A cada 200ms, o frame atual do jogo é capturado do canvas do PixiJS e enviado ao worker (`main.js`).
2. O `worker.js` carrega o modelo YOLOv5n, pré-processa a imagem (redimensiona para 640×640 e normaliza os pixels entre 0 e 1) e roda a inferência.
3. Dentre as classes detectadas, filtra a classe **`kite`** (a "pipa", que representa o pato) acima de um limiar de confiança.
4. Calcula o centro da caixa detectada e usa essa posição para posicionar a mira e disparar (`game.handleClick`).
5. Um HUD (`layout.js`) mostra o score e as predições em tempo real.

Ou seja: a IA não joga por regras codificadas — ela **enxerga** a tela e reage, como um jogador faria.

## Como rodar

```bash
npm install
npm start   # servidor local em http://localhost:8080 (com auto-rebuild)
```

Abra `http://localhost:8080` e observe a IA mirando e atirando sozinha. Para gerar um build manual, use `npm run build`.

> Detalhes adicionais (build de assets de áudio/imagem, lint, etc.) estão na documentação original do jogo abaixo.

---

# DUCK HUNT JS v3.0

[Play the game](https://duckhuntjs.com)

This is an implementation of DuckHunt in Javascript and HTML5. It uses the PixiJS rendering engine, Green Sock Animations, Howler, and Bluebird Promises.

## Rendering
This game supports WebGL and Canvas rendering via the PixiJS rendering engine.

## Audio
This game will attempt to use the WebAudioAPI and fallback to HTML5 Audio if necessary. Audio is loaded and controlled via HowlerJS.

## Tweening
The animations in this game are a combination of PixiJS MovieClips built from sprite images and tweens. Since PixiJS doesn't provide a tweening API, Green Sock was used.

## Game Logic
The flow of this game is managed using Javascript. The main chunks of business logic are implemented as ES6 classes which are transpiled to ES5 using Babel.

## Working With This Repo

 - You must have [nodejs](https://nodejs.org/) installed.
 - Clone the repo into a directory of your choice
 - `cd` into that directory and run `npm install`
 - Use `npm start` to start a local webserver which will make the site available at http://localhost:8080/. Cross origin errors prevent this project from being accessed in the browser with the `file://` protocol. This will also trigger automatic builds and reloads of the page when changes are detected in the `src` directory.
 - If you want to manually cut a build of the application code run `npm run build`
 
## Working With Audio and Visual Assets
This repo ships with committed dist files to make it easy for developers to get up and running. If you really want to get into some leet haxing and change the way
this game looks and sounds then you'll need to work with audio and image sprites. The following tasks make that possible: 

 - To rebuild audio assets use `npm run audio` (there is a hard dependency on [ffmpeg](https://ffmpeg.org/download.html) to run this task)
 - To rebuild image assets use `npm run images` (there is a hard dependency on [texturepacker](https://www.codeandweb.com/texturepacker/download) to run this task)

## Bugs
Please report bugs as [issues](https://github.com/MattSurabian/DuckHunt-JS/issues).

## Contributing
Pull requests are welcome! Please ensure code style and quality compliance with `npm run lint` and include any built files.

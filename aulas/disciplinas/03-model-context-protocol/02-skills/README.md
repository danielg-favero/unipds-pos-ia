# 02 - Skills

Exemplo de instalação e uso de **Agent Skills** com a [Skills CLI](https://skills.sh) (`npx skills`) — pacotes de instruções que um agente carrega sob demanda, em vez de um servidor externo como no [01-multiple-mcp-tools](../01-multiple-mcp-tools/).

## Contexto

Enquanto o projeto anterior conecta o agente a **servidores MCP** (processos externos que expõem ferramentas), aqui o agente ganha capacidades lendo um **arquivo `SKILL.md`** — texto com instruções, comandos prontos e boas práticas sobre um assunto específico. A skill não é código executado por um servidor: é conhecimento que entra no contexto do agente quando a tarefa pedida combina com a descrição da skill, e o próprio agente decide como aplicá-lo (geralmente rodando comandos de shell).

Duas skills foram instaladas neste projeto:

- **[`ffmpeg`](https://github.com/digitalsamba/claude-code-video-toolkit)** — referência de comandos `ffmpeg`/`ffprobe` para conversão, corte, compressão e efeitos em vídeo/áudio.
- **[`find-skills`](https://github.com/vercel-labs/skills)** — ensina o próprio agente a **buscar e instalar** outras skills a partir de um pedido do usuário (ex.: _"existe uma skill para X?"_).

## Estrutura

- `skills-lock.json` — lockfile gerado pela Skills CLI: guarda a origem (`source`), o caminho do `SKILL.md` e o hash de cada skill instalada — o equivalente a um `package-lock.json` para skills.
- `.agents/skills/ffmpeg/` — skill `ffmpeg` instalada no formato do padrão aberto [agent-skills](https://github.com/vercel-labs/skills) (`.agents/skills/<nome>/SKILL.md`), lido por qualquer agente compatível.
- `.claude/skills/find-skills/` — skill `find-skills` instalada na pasta específica do **Claude Code** (`.claude/skills/<nome>/SKILL.md`).
- `video.mp4`, `video_bw.mp4`, `video_bw_flipped.mp4` — vídeo de entrada e as duas saídas geradas ao pedir para o agente aplicar a skill `ffmpeg` (conversão para escala de cinza e depois espelhamento horizontal).

> Duas pastas de skills (`.agents/` e `.claude/`) aparecem de propósito: cada agente/ferramenta procura suas skills em um local próprio. A Skills CLI instala no diretório correspondente à ferramenta escolhida no momento do `npx skills add`.

## Como as skills foram instaladas

```bash
# Skill de referência de comandos ffmpeg
npx skills add digitalsamba/claude-code-video-toolkit@ffmpeg

# Skill para buscar/instalar outras skills
npx skills add vercel-labs/skills@find-skills
```

## Como usar

Com as skills instaladas, basta pedir a tarefa em linguagem natural — o agente identifica que a skill `ffmpeg` se aplica (pela `description` do `SKILL.md`) e monta o comando adequado a partir da referência da skill:

```claude
converta o video.mp4 para escala de cinza e salve como video_bw.mp4
```

```claude
agora pegue o video_bw.mp4, espelhe horizontalmente e salve como video_bw_flipped.mp4
```

Internamente isso vira comandos `ffmpeg` como:

```bash
ffmpeg -i video.mp4 -vf "hue=s=0" video_bw.mp4
ffmpeg -i video_bw.mp4 -vf "hflip" video_bw_flipped.mp4
```

Para descobrir novas skills, a skill `find-skills` entra em ação com pedidos como:

```claude
existe alguma skill para gerar changelog automaticamente?
```

que aciona `npx skills find changelog` e sugere as opções mais confiáveis (por instalações e reputação da fonte) antes de instalar.

## Pré-requisitos

- Node.js (para rodar `npx skills`)
- [FFmpeg](https://ffmpeg.org/download.html) instalado localmente — a skill só documenta os comandos, quem executa é o shell do agente
- Um agente compatível com Agent Skills (ex.: Claude Code)

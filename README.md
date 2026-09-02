# Pauta de provas

Calendário das provas de concursos da magistratura, Ministério Público e
Defensoria, para compartilhar com os amigos.

O calendário é a **união de duas fontes**:

- **Magistratura** vem do [painel de concursos do CNJ][painel] (Resolução 75/2009).
  Você não digita nada: quando o concurso entra no painel, aparece no calendário.
- **A planilha do Google** cobre o resto — MP, Defensoria e magistratura cujo
  edital saiu mas o CNJ ainda não registrou.

Um robô confere o painel três vezes por dia e abre uma issue no repositório
quando encontra novidade ou divergência. Ele **nunca escreve na planilha**.

[painel]: https://paineisanalytics.cnj.jus.br/single/?appid=3cafc47d-286e-4266-8b5e-fdde06ef6254&sheet=ePxgLM&theme=Mix_Theme_Frame&lang=pt-BR&opt=ctxmenu,currsel

---

## No dia a dia

**Magistratura você não digita.** Entra sozinha pelo painel.

**Escreva na planilha** (aba `INSERIR NOVAS DATAS AQUI`) o que o painel não
cobre: MP, Defensoria e magistratura ainda não registrada no CNJ. O site lê a
planilha a cada visita — editou, deu refresh, mudou.

Formatos aceitos na coluna DATA:

| Escrito assim | Vira |
| --- | --- |
| `13/09/2026` | um dia |
| `02 e 03/08/2026` | dois dias no mesmo mês |
| `21 a 26/07/2026` | intervalo no mesmo mês |
| `31/05 e 01/06/2026` | intervalo virando o mês |
| `11/04/2027 e 12/04/2027` | ano repetido nos dois lados |

Linha em formato não reconhecido não some em silêncio: o site mostra um aviso
no topo dizendo qual ficou de fora.

A coluna CONCURSO define a cor e o filtro pela sigla — `TJ…`, `TRF…`, `MP…`,
`DP…`. Quando você lançar a primeira data de Defensoria, o botão "Defensoria"
aparece sozinho nos filtros.

**Feriados nacionais** aparecem no calendário com um ponto ao lado do dia e o
nome no tooltip. São calculados, não listados: Carnaval, Sexta-feira Santa e
Corpus Christi dependem da Páscoa, então uma lista fixa venceria todo ano.
Carnaval e Corpus Christi são ponto facultativo e não feriado por lei, mas
entram porque para quem estuda o efeito é o mesmo.

**O asterisco.** `TJPE*` quer dizer "prova de magistratura que o painel do CNJ
ainda não registrou". É o único sinal de procedência que o site mostra, porque
quase tudo vem do CNJ — marcar a origem do que é normal não informaria nada. MP
e Defensoria nunca recebem asterisco: o painel não cobre essas carreiras.

---

## Quem manda quando as fontes discordam

Para cada órgão e fase o robô monta dois conjuntos de datas — o do CNJ e o da
planilha — e classifica:

| Situação | Como aparece na issue |
| --- | --- |
| CNJ tem data, planilha não tem nada nessa fase | *No painel do CNJ, mas não na planilha* |
| Os dois têm datas e elas não batem | *Conflito: as duas fontes discordam*, com os dois lados |
| Planilha tem data futura, o painel não registrou nenhuma | *Na planilha, ainda não no painel* |
| A sigla não aparece em nenhuma aba do painel | *Concursos que o painel não lista* |

**No calendário, conflito de magistratura resolve a favor do CNJ**: a linha da
planilha sai da tela e vale a data do painel. Isso evita mostrar a mesma prova
duas vezes em datas diferentes, o que confundiria quem só abre o link. Você não
perde a informação — a divergência vai para a issue, que só você vê.

Cada aviso é dado **uma vez só**. Quando a divergência se resolve, o robô a
anuncia por nome em *Resolvido desde a última leitura*, então você tem
confirmação do que entrou em ordem, não só reclamação.

---

## Com que frequência cada coisa é lida

- **O site lê a planilha a cada visita.** Sem cache, sem agendamento.
- **O robô lê tudo 3x ao dia** (6h, 13h e 19h de Brasília; o `cron` do workflow
  está em UTC). É o que atualiza o `dados/cnj.json`, então uma mudança feita
  *pelo CNJ* leva até 8h para refletir no site.

Três disparos em vez de um também cobrem o caso de o cron do GitHub atrasar ou
pular uma execução em horário de pico, o que acontece. Não custa nada:
repositório público tem minutos de Actions ilimitados.

Se o repositório ficar 60 dias sem atividade sua, o GitHub pausa workflows
agendados e manda um e-mail. Um clique na aba Actions reativa.

---

## Publicação

O site é estático — não tem servidor nem banco. Qualquer hospedagem de arquivos
serve, e hoje ele está em duas:

- **GitHub Pages**: https://febichara.github.io/calendario-concursos/
- **Cloudflare Pages**, conectado ao mesmo repositório, publicando a cada push.
  Em *Custom domains* dá para apontar um subdomínio do `cw790.com.br`, que já
  está na conta: fica um link melhor de compartilhar e não custa nada a mais.

Para publicar qualquer alteração:

```bash
git add . && git commit -m "o que mudou" && git push
```

Como o site não tem etapa de build, a configuração na Cloudflare é:

| Campo | Valor |
| --- | --- |
| Framework preset | None |
| Build command | *(vazio)* |
| Build output directory | `/` |

---

## O botão "Reportar erro"

No rodapé há um botão que abre uma caixa para o visitante avisar sobre data
errada ou prova faltando.

Como o site é estático, quem entrega o e-mail é um serviço externo. Está
preparado para o [Web3Forms](https://web3forms.com) — grátis e sem criar conta:
você informa seu e-mail no site deles e recebe uma chave. Cole a chave em
`CHAVE_FORMULARIO`, no topo do `app.js`, e faça commit.

**Enquanto a chave estiver vazia o botão continua funcionando**: em vez de
enviar sozinho, abre o programa de e-mail do visitante com a mensagem já
escrita. Funciona bem no celular; no computador depende de a pessoa ter um
cliente de e-mail configurado. Se o envio pelo Web3Forms falhar por qualquer
motivo, ele também cai nesse caminho — a mensagem não se perde.

O endereço de destino fica no `app.js`, que é público. Ele já aparece no
histórico de commits de qualquer forma, por ser o e-mail de autoria do Git;
configurar a chave do Web3Forms é o jeito de tirá-lo da página.

---

## Rodar na sua máquina

```bash
npm install && npx playwright install chromium
```

```bash
npm run tudo
```

- `npm run planilha` — baixa a planilha para `dados/concursos.json`.
- `npm run cnj` — lê o painel do CNJ com um Chromium headless.
- `npm run vigia` — compara tudo e escreve `relatorio.md`.

Para ver o site localmente, use um servidor estático. Abrir o `index.html` com
duplo clique **não** funciona: o navegador bloqueia a leitura da planilha em
`file://`.

```bash
npx --yes serve .
```

---

## Mapa dos arquivos

| Arquivo | O que faz |
| --- | --- |
| `index.html` | Estrutura, estilos e a caixa de "reportar erro". |
| `app.js` | Lê planilha e `cnj.json`, junta as fontes, desenha calendário e lista. |
| `scripts/config.mjs` | Id da planilha, `gid`, endereço do painel, abas e siglas. |
| `scripts/planilha.mjs` | Baixa a planilha em CSV. |
| `scripts/cnj.mjs` | Lê o painel do CNJ com Playwright. |
| `scripts/datas.mjs` | Interpreta as datas escritas à mão. |
| `scripts/vigia.mjs` | Compara as fontes e escreve o relatório. |
| `scripts/salvar.mjs` | Grava JSON só quando o conteúdo muda. |
| `dados/concursos.json` | Cópia da planilha; o site usa se o Google cair. |
| `dados/cnj.json` | Última leitura do painel; alimenta o site e a comparação. |
| `dados/avisados.json` | Divergências já avisadas, para não repetir. |

O `app.js` repete três constantes do `config.mjs` (`PLANILHA`, `ABA`, `GID`)
porque roda no navegador e não enxerga os módulos. Se trocar de planilha, troque
nos dois lugares.

### Forçar um relatório completo

Para o robô reavaliar todas as divergências como se fossem novas:

```bash
git rm dados/avisados.json && git commit -m "vigia: zerar avisos" && git push
```

---

## Quatro armadilhas que já custaram caro

**Não use o endpoint `gviz` do Google para ler a planilha.** Ele adivinha o tipo
da coluna: como a coluna DATA é quase toda data de verdade, devolve **vazio** nas
células escritas à mão como `02 e 03/08/2026` — e some com todas as 2ªs fases sem
dar erro nenhum. Por isso usamos `/export?format=csv&gid=…`, que entrega o texto
exatamente como está na tela.

**No painel do CNJ, "Preparando" não é uma aba.** As abas de verdade são só
`Em andamento` e `Finalizados` (`li.lui-tab`); "Preparando" é um botão da barra
de seleção. Pedir por ele em `ABAS_CNJ` faz o robô registrar um aviso no
relatório, em vez de ler a tabela errada achando que trocou de aba.

**O Qlik esconde colunas conforme a largura da janela.** O Playwright abre em
1280px por padrão, e nessa largura o painel renderiza só 13 das 16 colunas — as
etapas "4º fim" e "5º" somem do DOM sem erro nenhum, e o robô lê a tabela achando
que está completa. Por isso o `cnj.mjs` força uma janela de 1920px.

**Nunca grave o carimbo de hora sem comparar o conteúdo.** Os arquivos de
`dados/` só são reescritos quando o que está dentro muda (`scripts/salvar.mjs`).
Sem isso, cada uma das três execuções diárias viraria um commit e uma
reconstrução do site à toa — mais de mil commits inúteis por ano.

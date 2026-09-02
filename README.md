# Pauta de provas

Calendário das provas de concursos da magistratura, MP e Defensoria, para
compartilhar com os amigos. O site lê a planilha do Google **ao vivo**, e um robô
confere o painel do CNJ todo dia de manhã e avisa quando aparece novidade.

- **Site**: `index.html` + `app.js`. É estático, não tem servidor nem banco.
- **Fonte dos dados**: a aba `INSERIR NOVAS DATAS AQUI` da planilha. Você edita
  lá, dá refresh no site, mudou. Não precisa republicar nada.
- **Robô**: `.github/workflows/vigia-cnj.yml` roda às 6h (horário de Brasília),
  lê o painel do CNJ e **abre uma issue** quando encontra algo novo. A issue
  chega no seu e-mail. Ele nunca escreve na planilha.

---

## Instalação (uma vez só)

### 1. Criar o repositório

No GitHub, crie um repositório **público** chamado `pauta-concursos`.
Público importa por dois motivos: o GitHub Pages é gratuito só em repositório
público na conta free, e os minutos de Actions também.

Não marque nenhuma opção de inicialização (sem README, sem .gitignore).

### 2. Subir os arquivos

Com o Git instalado, dentro da pasta do projeto:

```bash
git init -b main && git add . && git commit -m "pauta de provas" && git remote add origin https://github.com/SEU-USUARIO/pauta-concursos.git && git push -u origin main
```

Troque `SEU-USUARIO` pelo seu usuário do GitHub.

> Sem Git? Dá para arrastar a pasta inteira em **Add file → Upload files** na
> página do repositório. Arraste a pasta, não os arquivos soltos — assim a
> subpasta `.github/workflows` sobe junto, que é onde mora o robô.

### 3. Liberar o robô a escrever

**Settings → Actions → General → Workflow permissions** → marque
**Read and write permissions** → Save.

Sem isso o robô não consegue abrir a issue nem guardar a leitura do dia.

### 4. Ligar o site

**Settings → Pages → Build and deployment → Source: Deploy from a branch**,
escolha `main` e a pasta `/ (root)` → Save.

Um minuto depois o site está no ar em:

```
https://SEU-USUARIO.github.io/pauta-concursos/
```

Esse é o link para mandar para os amigos.

### 5. Testar o robô agora, sem esperar amanhã

**Actions → Vigia do CNJ → Run workflow**. Na primeira execução ele avisa que é
a primeira leitura e lista o que está fora de sincronia com a planilha. Da
segunda em diante, só fala quando muda alguma coisa.

---

## No dia a dia

**Data nova de MP, Defensoria ou de qualquer concurso**: escreva na planilha,
na aba `INSERIR NOVAS DATAS AQUI`. O site pega sozinho.

Formatos de data que ele entende na coluna DATA:

| Escrito assim | Vira |
| --- | --- |
| `13/09/2026` | um dia |
| `02 e 03/08/2026` | dois dias no mesmo mês |
| `21 a 26/07/2026` | intervalo no mesmo mês |
| `31/05 e 01/06/2026` | intervalo virando o mês |

Se alguma linha estiver num formato que ele não reconhece, o site mostra um
aviso vermelho no topo dizendo exatamente qual linha ficou de fora — em vez de
sumir com ela em silêncio.

A coluna CONCURSO define a cor e o filtro pela sigla: `TJ…`, `TRF…`, `MP…`,
`DP…`. Quando você lançar a primeira data de Defensoria, o botão "Defensoria"
aparece sozinho nos filtros.

**Quando chegar uma issue do robô**: ela diz o que o CNJ tem e a planilha não
(e vice-versa). Você decide o que fazer e ajusta a planilha na mão. Depois é só
fechar a issue. O robô não repete um aviso que já deu — só volta a falar
daquilo se a situação mudar.

---

## Rodar na sua máquina

```bash
npm install && npx playwright install chromium
```

```bash
npm run tudo
```

- `npm run planilha` — baixa a planilha para `dados/concursos.json` (a cópia de
  segurança que o site usa se o Google estiver fora do ar).
- `npm run cnj` — lê o painel do CNJ com um Chromium headless.
- `npm run vigia` — compara tudo e escreve `relatorio.md`.

Para ver o site localmente, qualquer servidor estático serve. Abrir o
`index.html` com duplo clique **não** funciona: o navegador bloqueia a leitura
da planilha em `file://`.

```bash
npx --yes serve .
```

---

## Mexer na configuração

Quase tudo que é específico está em `scripts/config.mjs`: o id da planilha, o
`gid` da aba, o endereço do painel do CNJ, quais abas do painel ler e o
de-para de nome de tribunal para sigla.

O site tem as mesmas três constantes no topo do `app.js` (`PLANILHA`, `ABA`,
`GID`), porque roda no navegador e não enxerga o `config.mjs`. Se trocar a
planilha, troque nos dois lugares.

### Duas armadilhas que já custaram caro

**Não use o endpoint `gviz` do Google para ler a planilha.** Ele adivinha o tipo
da coluna: como a coluna DATA é quase toda data de verdade, ele devolve **vazio**
nas células escritas à mão como `02 e 03/08/2026` — e some com todas as 2ªs
fases sem dar erro nenhum. Por isso aqui usamos `/export?format=csv&gid=…`, que
entrega o texto exatamente como está na tela.

**No painel do CNJ, "Preparando" não é uma aba.** As abas de verdade são só
`Em andamento` e `Finalizados` (`li.lui-tab`); "Preparando" é um botão da barra
de seleção. Pedir por ele em `ABAS_CNJ` faz o robô registrar um aviso no
relatório em vez de ler a tabela errada achando que trocou de aba.

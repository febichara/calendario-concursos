/* Compara a leitura de hoje do painel do CNJ com a de ontem e com a planilha,
   e escreve relatorio.md. Não altera a planilha: só avisa.

   Regra que evita e-mail chato: divergências que já foram avisadas ontem e
   continuam valendo NÃO viram aviso de novo. Só entra no relatório o que é
   novidade em relação à última execução. */
import { readFileSync, writeFileSync, existsSync, rmSync, appendFileSync } from "node:fs";
import { salvarEstavel } from "./salvar.mjs";
import { COLUNAS_DATA, ABA_ATIVA } from "./config.mjs";
import { baixarPlanilha } from "./planilha.mjs";
import { lerData, iso, brasileiro, diasDe, lerFase } from "./datas.mjs";

const vazio = v => !v || v === "-" || String(v).trim() === "";
const HOJE = iso(new Date());

function carregar(caminho, padrao = null) {
  return existsSync(caminho) ? JSON.parse(readFileSync(caminho, "utf8")) : padrao;
}

/* Índice { "TJSP|1": Set(datas ISO) } do que já está na planilha. */
function indexarPlanilha(linhas) {
  const idx = new Map();
  for (const l of linhas) {
    const chave = `${l.concurso}|${lerFase(l.fase)}`;
    if (!idx.has(chave)) idx.set(chave, new Set());
    for (const d of diasDe(l.data)) idx.get(chave).add(d);
  }
  return idx;
}

/* Concursos da aba que tem datas de prova, indexados pelo Id do CNJ. */
function concursosAtivos(cnj) {
  const m = new Map();
  for (const l of (cnj.abas?.[ABA_ATIVA] ?? [])) m.set(l["Id"], l);
  return m;
}

/* Siglas presentes em qualquer aba, inclusive Finalizados. */
function todasAsSiglas(cnj) {
  const s = new Set();
  for (const linhas of Object.values(cnj.abas ?? {})) {
    for (const l of linhas) s.add(l.sigla);
  }
  return s;
}

const novo = carregar("dados/cnj-novo.json");
if (!novo) {
  console.error("dados/cnj-novo.json não existe — rode scripts/cnj.mjs antes.");
  process.exit(1);
}
const antigo = carregar("dados/cnj.json");
/* avisados.json guarda { chave: texto }. É o texto que permite dizer QUAL
   divergência se resolveu, em vez de só contar quantas. Aceita também o formato
   antigo (lista de chaves) para não quebrar sobre um arquivo já gravado. */
const avisadosCru = carregar("dados/avisados.json", {});
const avisadosAntes = Array.isArray(avisadosCru)
  ? Object.fromEntries(avisadosCru.map(k => [k, k]))
  : avisadosCru;

const agora = concursosAtivos(novo);
const antes = antigo ? concursosAtivos(antigo) : null;

/* ---------- 1. o que mudou no painel desde a última leitura ---------- */
const concursosNovos = [];
const datasAlteradas = [];

if (antes) {
  for (const [id, c] of agora) {
    const velho = antes.get(id);
    if (!velho) { concursosNovos.push(c); continue; }
    for (const col of COLUNAS_DATA) {
      /* o painel escreve "-" onde não há data; sem normalizar, "" -> "-" viraria
         uma "alteração" que não aconteceu */
      const a = vazio(velho[col]) ? "" : velho[col].trim();
      const b = vazio(c[col]) ? "" : c[col].trim();
      if (a !== b) datasAlteradas.push({ c, col, de: a || "(vazio)", para: b || "(vazio)" });
    }
  }
  for (const [id, velho] of antes) {
    if (!agora.has(id)) {
      datasAlteradas.push({
        c: velho, col: "situação",
        de: ABA_ATIVA, para: "saiu de “" + ABA_ATIVA + "”"
      });
    }
  }
}

/* ---------- 2. divergências entre o painel e a planilha ---------- */
const planilha = await baixarPlanilha();
const idx = indexarPlanilha(planilha);
const siglasCNJ = todasAsSiglas(novo);

/* Junta, para cada órgão e fase, o que o CNJ diz e o que a planilha diz, e
   compara os dois conjuntos. Comparar conjunto contra conjunto (em vez de data
   contra data) é o que permite distinguir "a planilha não tem isso" de "os dois
   têm, mas discordam" — que são problemas diferentes e pedem ações diferentes. */
const FASES = [
  { fase: 1, cols: ["Prova objetiva"] },
  { fase: 2, cols: ["2º Etapa início", "2º Etapa fim"] }
];

const porOrgaoFase = new Map();
for (const c of agora.values()) {
  for (const { fase, cols } of FASES) {
    const chave = `${c.sigla}|${fase}`;
    if (!porOrgaoFase.has(chave)) {
      porOrgaoFase.set(chave, {
        sigla: c.sigla, fase,
        cnj: new Set(),
        naPlanilha: idx.get(chave) ?? new Set()
      });
    }
    const alvo = porOrgaoFase.get(chave);
    for (const col of cols) {
      if (vazio(c[col])) continue;
      const p = lerData(c[col]);
      if (p) alvo.cnj.add(iso(p.s));
    }
  }
}

const divergencias = [];   // { chave, tipo, texto }
const lista = ds => ds.map(brasileiro).join(", ");

for (const { sigla, fase, cnj, naPlanilha } of porOrgaoFase.values()) {
  /* prova que já passou não é aviso útil */
  const soNoCNJ = [...cnj].filter(d => d >= HOJE && !naPlanilha.has(d)).sort();
  const soNaPlanilha = [...naPlanilha].filter(d => d >= HOJE && !cnj.has(d)).sort();
  if (!soNoCNJ.length && !soNaPlanilha.length) continue;

  if (soNoCNJ.length && soNaPlanilha.length) {
    divergencias.push({
      chave: `conflito|${sigla}|${fase}|${soNoCNJ.join(",")}|${soNaPlanilha.join(",")}`,
      tipo: "conflito",
      texto: `**${sigla}** ${fase}ª fase — CNJ diz ${lista(soNoCNJ)}, ` +
             `sua planilha diz ${lista(soNaPlanilha)}`
    });
  } else if (soNoCNJ.length) {
    divergencias.push({
      chave: `falta|${sigla}|${fase}|${soNoCNJ.join(",")}`,
      tipo: "falta",
      texto: `**${sigla}** ${fase}ª fase — ${lista(soNoCNJ)} (não está na planilha)`
    });
  } else {
    divergencias.push({
      chave: `adiantado|${sigla}|${fase}|${soNaPlanilha.join(",")}`,
      tipo: "adiantado",
      texto: `**${sigla}** ${fase}ª fase — ${lista(soNaPlanilha)} ` +
             `(sua planilha tem, o painel ainda não registrou)`
    });
  }
}

for (const sigla of new Set(planilha.filter(l => /^(TJ|TRF)/.test(l.concurso))
                                    .map(l => l.concurso))) {
  if (siglasCNJ.has(sigla)) continue;
  divergencias.push({
    chave: `semCNJ|${sigla}`, tipo: "semCNJ",
    texto: `**${sigla}** — está na planilha e não aparece em nenhuma aba do painel`
  });
}

/* só o que ainda não tinha sido avisado */
const novasDivergencias = divergencias.filter(d => !(d.chave in avisadosAntes));
const resolvidas = Object.entries(avisadosAntes)
  .filter(([k]) => !divergencias.some(d => d.chave === k))
  .map(([, texto]) => texto);

/* ---------- relatório ---------- */
const partes = [];

if (!antes) {
  partes.push(`Primeira leitura do painel: **${agora.size}** concursos em andamento. ` +
              "A partir de amanhã só aviso o que mudar.");
}

if (concursosNovos.length) {
  partes.push("### Concursos novos no painel\n" + concursosNovos.map(c =>
    `- **${c.sigla}** — ${c["Concurso"]}` +
    (vazio(c["Prova objetiva"]) ? "" : `\n  - objetiva: ${c["Prova objetiva"]}`) +
    (vazio(c["2º Etapa início"]) ? "" : `\n  - 2ª etapa: ${c["2º Etapa início"]}` +
      (vazio(c["2º Etapa fim"]) ? "" : ` a ${c["2º Etapa fim"]}`))
  ).join("\n"));
}

if (datasAlteradas.length) {
  partes.push("### Datas alteradas\n" + datasAlteradas.map(d =>
    `- **${d.c.sigla}** · ${d.col}: \`${d.de}\` → \`${d.para}\``
  ).join("\n"));
}

const SECOES = [
  ["conflito",  "### Conflito: as duas fontes discordam"],
  ["falta",     "### No painel do CNJ, mas não na planilha"],
  ["adiantado", "### Na planilha, ainda não no painel"],
  ["semCNJ",    "### Concursos que o painel não lista"]
];
for (const [tipo, titulo] of SECOES) {
  const ds = novasDivergencias.filter(d => d.tipo === tipo);
  if (ds.length) partes.push(titulo + "\n" + ds.map(d => "- " + d.texto).join("\n"));
}

if (resolvidas.length) {
  partes.push("### Resolvido desde a última leitura\n" +
    resolvidas.map(t => "- " + t).join("\n"));
}

if (novo.avisos?.length) {
  partes.push("### Avisos da leitura\n" + novo.avisos.map(a => `- ${a}`).join("\n"));
}

const mudou = partes.length > 0;
const corpo = mudou
  ? `Leitura de ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.\n\n` +
    partes.join("\n\n") +
    "\n\n---\n_A planilha não foi alterada. Este aviso é só para você conferir._"
  : "Nenhuma novidade no painel do CNJ.";

writeFileSync("relatorio.md", corpo + "\n");
salvarEstavel("dados/avisados.json",
  Object.fromEntries(divergencias
    .sort((a, b) => a.chave.localeCompare(b.chave))
    .map(d => [d.chave, d.texto])));
/* salvarEstavel e não rename: assim o arquivo só muda quando o painel mudou,
   e o robô não abre um commit a cada execução só porque o horário é outro. */
salvarEstavel("dados/cnj.json", novo);
rmSync("dados/cnj-novo.json", { force: true });

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `mudou=${mudou}\n`);
}
console.log(corpo);

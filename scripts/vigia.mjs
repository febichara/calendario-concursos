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
const avisadosAntes = new Set(carregar("dados/avisados.json", []));

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
      const a = (velho[col] ?? "").trim(), b = (c[col] ?? "").trim();
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

const divergencias = [];   // { chave, tipo, texto }

for (const c of agora.values()) {
  const s = c.sigla;
  const conferir = [
    { fase: 1, cols: ["Prova objetiva"] },
    { fase: 2, cols: ["2º Etapa início", "2º Etapa fim"] }
  ];
  for (const { fase, cols } of conferir) {
    const naPlanilha = idx.get(`${s}|${fase}`) ?? new Set();
    for (const col of cols) {
      if (vazio(c[col])) continue;
      const p = lerData(c[col]);
      if (!p) continue;
      const dia = iso(p.s);
      if (naPlanilha.has(dia)) continue;
      if (dia < HOJE) continue;   // prova que já aconteceu não é aviso útil
      const chave = `falta|${s}|${fase}|${dia}`;
      if (divergencias.some(d => d.chave === chave)) continue;  // painel repete o mesmo concurso
      divergencias.push({
        chave, tipo: "falta",
        texto: `**${s}** ${fase}ª fase — ${brasileiro(dia)} (${col})`
      });
    }
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
const novasDivergencias = divergencias.filter(d => !avisadosAntes.has(d.chave));
const resolvidas = [...avisadosAntes].filter(
  k => !divergencias.some(d => d.chave === k));

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

const faltas = novasDivergencias.filter(d => d.tipo === "falta");
if (faltas.length) {
  partes.push("### No painel do CNJ, mas não na planilha\n" +
    faltas.map(d => "- " + d.texto).join("\n"));
}

const semCNJ = novasDivergencias.filter(d => d.tipo === "semCNJ");
if (semCNJ.length) {
  partes.push("### Na planilha, mas não no painel\n" +
    semCNJ.map(d => "- " + d.texto).join("\n"));
}

if (novo.avisos?.length) {
  partes.push("### Avisos da leitura\n" + novo.avisos.map(a => `- ${a}`).join("\n"));
}

const mudou = partes.length > 0;
const corpo = mudou
  ? `Leitura de ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.\n\n` +
    partes.join("\n\n") +
    (resolvidas.length ? `\n\n_Resolvidas desde a última leitura: ${resolvidas.length}._` : "") +
    "\n\n---\n_A planilha não foi alterada. Este aviso é só para você conferir._"
  : "Nenhuma novidade no painel do CNJ.";

writeFileSync("relatorio.md", corpo + "\n");
salvarEstavel("dados/avisados.json", divergencias.map(d => d.chave).sort());
/* salvarEstavel e não rename: assim o arquivo só muda quando o painel mudou,
   e o robô não abre um commit a cada execução só porque o horário é outro. */
salvarEstavel("dados/cnj.json", novo);
rmSync("dados/cnj-novo.json", { force: true });

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `mudou=${mudou}\n`);
}
console.log(corpo);

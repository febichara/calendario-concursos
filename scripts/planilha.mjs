/* Baixa a aba de entrada da planilha e guarda uma cópia em dados/concursos.json.
   O site lê a planilha ao vivo; essa cópia é só o plano B de quando o Google
   estiver fora do ar. */
import { writeFileSync, mkdirSync } from "node:fs";
import { CSV_URL } from "./config.mjs";

export function lerCSV(texto) {
  const linhas = [];
  let campo = "", linha = [], dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentro) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentro = false;
      } else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/* A aba tem duas linhas de cabeçalho ("CALENDARIO DE CONCURSOS" e depois
   DATA/CONCURSO/FASE/DETALHE). Achamos a linha de títulos pelo texto e lemos as
   colunas pela posição do título — assim, mover uma coluna não quebra nada. */
export function extrairLinhas(grade) {
  let h = -1;
  for (let i = 0; i < Math.min(grade.length, 10); i++) {
    if (grade[i].some(c => /^CONCURSO$/i.test(String(c || "").trim()))) { h = i; break; }
  }
  const cab = h >= 0 ? grade[h].map(c => String(c || "").trim().toUpperCase()) : [];
  const col = (nome, padrao) => {
    const i = cab.indexOf(nome);
    return i >= 0 ? i : padrao;
  };
  const iData = col("DATA", 0), iConc = col("CONCURSO", 1);
  const iFase = col("FASE", 2), iDet = col("DETALHE", 3);

  return grade.slice(h + 1)
    .map(c => ({
      data: (c[iData] || "").trim(),
      concurso: (c[iConc] || "").trim().toUpperCase(),
      fase: (c[iFase] || "").trim(),
      detalhe: (c[iDet] || "").trim()
    }))
    .filter(l => l.concurso);
}

export async function baixarPlanilha() {
  const r = await fetch(CSV_URL, { redirect: "follow" });
  if (!r.ok) throw new Error(`planilha respondeu HTTP ${r.status}`);
  return extrairLinhas(lerCSV(await r.text()));
}

if (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith("planilha.mjs")) {
  const linhas = await baixarPlanilha();
  mkdirSync("dados", { recursive: true });
  writeFileSync("dados/concursos.json",
    JSON.stringify({ atualizadoEm: new Date().toISOString(), linhas }, null, 2) + "\n");
  console.log(`planilha: ${linhas.length} linhas salvas em dados/concursos.json`);
}

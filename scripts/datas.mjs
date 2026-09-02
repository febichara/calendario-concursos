/* Leitura das datas escritas à mão na planilha.
   Aceita "15/06/2025", "02 e 03/08/2026", "21 a 26/07/2026" e "31/05 e 01/06/2026". */

export function lerData(bruto) {
  const t = String(bruto || "").replace(/ /g, " ").trim().toLowerCase();
  if (!t || t === "-") return null;
  let m;

  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return { s: d, e: d }; }

  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); return { s: d, e: d }; }

  m = t.match(/^(\d{1,2})\/(\d{1,2})\s*(?:e|a|at[ée]|à|-|–)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const ano = +m[5], mi = +m[2] - 1, mf = +m[4] - 1;
    return { s: new Date(mi > mf ? ano - 1 : ano, mi, +m[1]), e: new Date(ano, mf, +m[3]) };
  }

  m = t.match(/^(\d{1,2})\s*(?:e|a|at[ée]|à|-|–)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return { s: new Date(+m[4], +m[3] - 1, +m[1]), e: new Date(+m[4], +m[3] - 1, +m[2]) };
  }
  return null;
}

export function iso(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function brasileiro(isoStr) {
  const [a, m, d] = isoStr.split("-");
  return `${d}/${m}/${a}`;
}

/* Todos os dias cobertos por uma data da planilha, em ISO. */
export function diasDe(bruto) {
  const p = lerData(bruto);
  if (!p) return [];
  const dias = [];
  for (let c = new Date(p.s); c <= p.e; c.setDate(c.getDate() + 1)) dias.push(iso(c));
  return dias;
}

export function lerFase(bruto) {
  const m = String(bruto || "").match(/(\d)/);
  return m ? +m[1] : 1;
}

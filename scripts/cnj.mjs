/* Lê o painel de concursos da magistratura do CNJ (Qlik Sense) com um navegador
   headless e grava dados/cnj-novo.json.

   O painel é um Qlik: os dados chegam por WebSocket e viram uma <table> comum.
   Por isso o navegador é necessário — não dá pra puxar com um fetch. */
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { PAINEL_CNJ, ABAS_CNJ, sigla } from "./config.mjs";

/* O painel é um Qlik pesado: baixa uma centena de arquivos JS e só então abre o
   WebSocket que traz os dados. Num runner frio do GitHub isso passa de 60s com
   alguma frequência, e o CNJ também tem seus momentos ruins. Daí a espera larga
   e as tentativas: falha transitória não deve virar e-mail de erro. */
const ESPERA = 90000;
const TENTATIVAS = 3;
const PAUSA_ENTRE_TENTATIVAS = 10000;

/* Roda dentro da página: lê a tabela visível. */
function extrairTabela() {
  const cab = [...document.querySelectorAll("th, .qv-st-header-cell")]
    .map(e => (e.innerText || "").trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const linhas = [...document.querySelectorAll("tr.qv-st-data-row")].map(tr =>
    [...tr.querySelectorAll("td")].map(td => (td.innerText || "").trim())
  );
  return { cab, linhas };
}

/* As abas são <li class="lui-tab" role="tab">. Devolve false quando a aba pedida
   não existe, para nunca lermos a tabela errada achando que trocou. */
async function abrirAba(page, nome) {
  const aba = page.locator("li.lui-tab").filter({ hasText: nome }).first();
  if (!(await aba.count())) return false;

  if ((await aba.getAttribute("aria-selected")) !== "true") {
    await aba.click();
    await page.waitForFunction(
      txt => [...document.querySelectorAll("li.lui-tab")].some(
        li => li.innerText.trim() === txt && li.getAttribute("aria-selected") === "true"),
      nome, { timeout: 20000 }
    );
    await page.waitForTimeout(2000);
  }
  return true;
}

/* O Qlik pagina a tabela; clica em "Carregar mais" até acabar. */
async function carregarTudo(page) {
  for (let i = 0; i < 60; i++) {
    const mais = page.locator('button:text-is("Carregar mais")').first();
    if (!(await mais.count()) || !(await mais.isVisible().catch(() => false))) break;
    const antes = await page.locator("tr.qv-st-data-row").count();
    await mais.click().catch(() => {});
    await page.waitForTimeout(1500);
    const depois = await page.locator("tr.qv-st-data-row").count();
    if (depois <= antes) break;
  }
}

export async function lerPainel() {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      return await umaLeitura();
    } catch (erro) {
      ultimoErro = erro;
      console.error(`CNJ · tentativa ${tentativa}/${TENTATIVAS} falhou: ${erro.message}`);
      if (tentativa < TENTATIVAS) {
        await new Promise(r => setTimeout(r, PAUSA_ENTRE_TENTATIVAS));
      }
    }
  }
  throw ultimoErro;
}

async function umaLeitura() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: "pt-BR" });
  const resultado = { atualizadoEm: new Date().toISOString(), abas: {}, avisos: [] };

  try {
    await page.goto(PAINEL_CNJ, { waitUntil: "domcontentloaded", timeout: ESPERA });
    await page.waitForSelector("tr.qv-st-data-row", { timeout: ESPERA });

    for (const aba of ABAS_CNJ) {
      if (!(await abrirAba(page, aba))) {
        resultado.avisos.push(`aba "${aba}" não existe mais no painel — nada lido dela`);
        continue;
      }
      await carregarTudo(page);
      const { cab, linhas } = await page.evaluate(extrairTabela);
      if (!cab.length) throw new Error(`aba "${aba}": cabeçalho vazio — o painel mudou de layout?`);

      resultado.abas[aba] = linhas.map(cels => {
        const o = {};
        cab.forEach((nome, i) => { o[nome] = (cels[i] ?? "").trim(); });
        o.sigla = sigla(o["Tribunal"]);
        return o;
      }).filter(o => o["Id"]);
    }
  } finally {
    await browser.close();
  }
  return resultado;
}

if (process.argv[1]?.endsWith("cnj.mjs")) {
  const dados = await lerPainel();
  mkdirSync("dados", { recursive: true });
  writeFileSync("dados/cnj-novo.json", JSON.stringify(dados, null, 2) + "\n");
  for (const [aba, linhas] of Object.entries(dados.abas)) {
    console.log(`CNJ · ${aba}: ${linhas.length} concursos`);
  }
}

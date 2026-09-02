/* Tudo que é específico do seu caso mora aqui. */

export const PLANILHA = "1aMhXaeukV-sJWfH2LT-Y5zoBEbB7pwbV2ZTMwOBwDFs";
export const ABA = "INSERIR NOVAS DATAS AQUI";
/* gid da aba acima. Para descobrir o de outra aba, abra-a no navegador e copie
   o número que aparece depois de "#gid=" na barra de endereço. */
export const GID = "65530308";

/* Usamos /export e não /gviz de propósito. O gviz adivinha o tipo da coluna:
   como a coluna DATA é quase toda data, ele devolve VAZIO nas células escritas
   à mão ("02 e 03/08/2026") — e sumiria com todas as 2ªs fases. O /export
   entrega exatamente o texto que está na tela. */
export const CSV_URL =
  `https://docs.google.com/spreadsheets/d/${PLANILHA}/export?format=csv&gid=${GID}`;

export const PAINEL_CNJ =
  "https://paineisanalytics.cnj.jus.br/single/?appid=3cafc47d-286e-4266-8b5e-fdde06ef6254" +
  "&sheet=ePxgLM&theme=Mix_Theme_Frame&lang=pt-BR&opt=ctxmenu,currsel";

/* O painel tem duas abas de verdade (li.lui-tab): "Em andamento" e "Finalizados".
   Atenção: "Preparando" aparece na tela mas é um botão da barra de seleção,
   não uma aba; pedir por ele aqui só geraria um aviso no relatório. */
export const ABAS_CNJ = ["Em andamento", "Finalizados"];

/* Só desta aba saem datas de prova. "Finalizados" é lida apenas para sabermos
   que o concurso existe — assim um TJ que já terminou não vira alarme falso
   de "está na planilha e sumiu do CNJ". */
export const ABA_ATIVA = "Em andamento";

/* Colunas do painel que representam datas de prova. A ordem importa: é a ordem
   em que as etapas aparecem no calendário. */
export const COLUNAS_DATA = [
  "Prova objetiva",
  "2º Etapa início",
  "2º Etapa fim",
  "3º Etapa início",
  "3º Etapa fim",
  "4º Etapa início",
  "4º Etapa fim"
];

const UF = {
  "acre": "AC", "alagoas": "AL", "amapá": "AP", "amazonas": "AM", "bahia": "BA",
  "ceará": "CE", "distrito federal": "DF", "espírito santo": "ES", "goiás": "GO",
  "maranhão": "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", "pará": "PA", "paraíba": "PB", "paraná": "PR",
  "pernambuco": "PE", "piauí": "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", "rondônia": "RO",
  "roraima": "RR", "santa catarina": "SC", "são paulo": "SP", "sergipe": "SE",
  "tocantins": "TO"
};

/* "Tribunal de Justiça do Estado de São Paulo" -> "TJSP"
   "Tribunal Regional Federal da 1ª Região"     -> "TRF1"        */
export function sigla(tribunal) {
  const t = String(tribunal || "").trim();
  const trf = t.match(/Regional Federal da (\d+)/i);
  if (trf) return "TRF" + trf[1];

  const baixo = t.toLowerCase();
  if (/tribunal de justi[çc]a/.test(baixo)) {
    if (/militar/.test(baixo)) {
      for (const [nome, uf] of Object.entries(UF)) {
        if (baixo.includes(nome)) return "TJM" + uf;
      }
    }
    let achado = "", achadoUF = "";
    for (const [nome, uf] of Object.entries(UF)) {
      if (baixo.includes(nome) && nome.length > achado.length) { achado = nome; achadoUF = uf; }
    }
    if (achadoUF) return "TJ" + achadoUF;
  }
  return t;
}

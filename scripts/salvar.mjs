import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/* Grava o JSON só se o conteúdo mudou de verdade, ignorando o carimbo de hora.

   Sem isso, toda execução reescreveria o arquivo apenas porque o horário é
   outro, e o robô abriria um commit novo a cada rodada — enchendo o histórico
   e reconstruindo o site sem motivo. Devolve true quando gravou. */
export function salvarEstavel(caminho, dado, campoHora = "atualizadoEm") {
  mkdirSync(dirname(caminho), { recursive: true });

  const semHora = d => {
    if (Array.isArray(d) || d === null || typeof d !== "object") return JSON.stringify(d);
    const copia = { ...d };
    delete copia[campoHora];
    return JSON.stringify(copia);
  };

  if (existsSync(caminho)) {
    try {
      if (semHora(JSON.parse(readFileSync(caminho, "utf8"))) === semHora(dado)) return false;
    } catch {
      /* arquivo corrompido: reescreve */
    }
  }
  writeFileSync(caminho, JSON.stringify(dado, null, 2) + "\n");
  return true;
}

/* Pauta de provas — lê a planilha do Google ao vivo e desenha o calendário.
   Se a planilha estiver fora do ar, cai na cópia em dados/concursos.json,
   que o robô do GitHub Actions atualiza todo dia. */
(function () {
  "use strict";

  var PLANILHA = "1aMhXaeukV-sJWfH2LT-Y5zoBEbB7pwbV2ZTMwOBwDFs";
  var ABA = "INSERIR NOVAS DATAS AQUI";
  var GID = "65530308";
  /* /export e não /gviz: o gviz adivinha o tipo da coluna e devolve vazio nas
     datas escritas à mão ("02 e 03/08/2026"), sumindo com todas as 2ªs fases. */
  var CSV = "https://docs.google.com/spreadsheets/d/" + PLANILHA +
            "/export?format=csv&gid=" + GID;
  var COPIA = "dados/concursos.json";
  /* Leitura do painel do CNJ que o robô guarda no repositório. Serve para
     marcar quais provas de magistratura ainda não constam lá. */
  var CNJ = "dados/cnj.json";
  var COLUNAS_CNJ = ["Prova objetiva", "2º Etapa início", "2º Etapa fim",
                     "3º Etapa início", "3º Etapa fim",
                     "4º Etapa início", "4º Etapa fim"];

  /* Formulário de "reportar erro". O site é estático, então quem entrega o
     e-mail é um serviço externo: o Web3Forms, que é grátis e não exige conta —
     você informa seu e-mail em https://web3forms.com e recebe a chave por lá.
     Cole a chave aqui. Enquanto ela estiver vazia, o botão continua funcionando:
     abre o programa de e-mail do visitante com a mensagem já escrita. */
  var CHAVE_FORMULARIO = "";
  var DESTINO = ["felipevlbichara", "gmail.com"].join("@");
  var ASSUNTO = "Pauta de provas — recado do site";

  var MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  var MESL = ["janeiro","fevereiro","março","abril","maio","junho",
              "julho","agosto","setembro","outubro","novembro","dezembro"];
  var DIAS = ["domingo","segunda-feira","terça-feira","quarta-feira",
              "quinta-feira","sexta-feira","sábado"];
  var SEM = ["dom","seg","ter","qua","qui","sex","sáb"];
  var DAY = 86400000;

  var ROTULO = {
    TJ: "Tribunais de Justiça",
    TRF: "TRFs",
    MP: "Ministério Público",
    DP: "Defensoria",
    OUTRO: "Outros"
  };

  var agora = new Date();
  var HOJE = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  /* ---------------- leitura da planilha ---------------- */

  function lerCSV(texto) {
    var linhas = [], campo = "", linha = [], dentro = false;
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
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

  /* Aceita "15/06/2025", "02 e 03/08/2026", "21 a 26/07/2026",
     "31/05 e 01/06/2026" e ISO "2026-08-16". */
  function lerData(bruto) {
    var t = String(bruto || "").replace(/ /g, " ").trim().toLowerCase();
    if (!t) return null;
    var m;

    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) { var d1 = new Date(+m[1], +m[2] - 1, +m[3]); return { s: d1, e: d1 }; }

    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) { var d2 = new Date(+m[3], +m[2] - 1, +m[1]); return { s: d2, e: d2 }; }

    /* 11/04/2027 e 12/04/2027 — ano repetido nos dois lados */
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:e|a|at[ée]|à|-|–)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      return { s: new Date(+m[3], +m[2] - 1, +m[1]), e: new Date(+m[6], +m[5] - 1, +m[4]) };
    }

    /* 31/05 e 01/06/2026 — atravessa o mês */
    m = t.match(/^(\d{1,2})\/(\d{1,2})\s*(?:e|a|at[ée]|à|-|–)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      var ano = +m[5], mi = +m[2] - 1, mf = +m[4] - 1;
      var ini = new Date(mi > mf ? ano - 1 : ano, mi, +m[1]);
      return { s: ini, e: new Date(ano, mf, +m[3]) };
    }

    /* 02 e 03/08/2026 · 21 a 26/07/2026 — mesmo mês */
    m = t.match(/^(\d{1,2})\s*(?:e|a|at[ée]|à|-|–)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      return {
        s: new Date(+m[4], +m[3] - 1, +m[1]),
        e: new Date(+m[4], +m[3] - 1, +m[2])
      };
    }
    return null;
  }

  function lerFase(bruto) {
    var m = String(bruto || "").match(/(\d)/);
    return m ? +m[1] : 1;
  }

  /* ---------------- feriados nacionais ----------------
     Calculados, não listados: Carnaval, Sexta-feira Santa e Corpus Christi
     dependem da Páscoa, então qualquer lista fixa venceria no ano seguinte.
     Carnaval e Corpus Christi são ponto facultativo, não feriado por lei, mas
     entram porque para quem estuda o efeito é o mesmo. */
  function pascoa(ano) {
    var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mes = Math.floor((h + l - 7 * m + 114) / 31);
    var dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  }

  var CACHE_FERIADOS = {};
  function feriados(ano) {
    if (CACHE_FERIADOS[ano]) return CACHE_FERIADOS[ano];
    var f = {};
    function por(data, nome) {
      f[data.getFullYear() + "." + data.getMonth() + "." + data.getDate()] = nome;
    }
    [[0, 1, "Confraternização Universal"], [3, 21, "Tiradentes"],
     [4, 1, "Dia do Trabalho"], [8, 7, "Independência"],
     [9, 12, "Nossa Senhora Aparecida"], [10, 2, "Finados"],
     [10, 15, "Proclamação da República"], [11, 25, "Natal"]
    ].forEach(function (x) { por(new Date(ano, x[0], x[1]), x[2]); });

    /* nacional só a partir da Lei 14.759/2023 */
    if (ano >= 2024) por(new Date(ano, 10, 20), "Consciência Negra");

    var p = pascoa(ano);
    function desde(n) { return new Date(ano, p.getMonth(), p.getDate() + n); }
    por(desde(-48), "Carnaval");
    por(desde(-47), "Carnaval");
    por(desde(-2), "Sexta-feira Santa");
    por(desde(60), "Corpus Christi");

    CACHE_FERIADOS[ano] = f;
    return f;
  }

  function isoDe(d) {
    function p(n) { return String(n).padStart(2, "0"); }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /* { "TJPE|2026-09-27": true } com todas as datas de prova que o painel do CNJ
     conhece. Devolve null quando não deu para ler o arquivo — nesse caso
     ninguém é marcado, porque marcar todo mundo seria pior que não marcar. */
  function indexarCNJ(cnj) {
    if (!cnj || !cnj.abas) return null;
    var set = {};
    Object.keys(cnj.abas).forEach(function (aba) {
      (cnj.abas[aba] || []).forEach(function (c) {
        COLUNAS_CNJ.forEach(function (col) {
          var p = lerData(c[col]);
          if (p) set[c.sigla + "|" + isoDe(p.s)] = true;
        });
      });
    });
    return set;
  }

  /* Só magistratura entra na conferência: o painel do CNJ não cobre MP nem
     Defensoria, então marcá-los seria alarme falso garantido. */
  function marcarCNJ(itens, set) {
    if (!set) return;
    itens.forEach(function (i) {
      if (i.tipo !== "TJ" && i.tipo !== "TRF") return;
      var achou = false;
      for (var c = new Date(i.s.getTime()); c <= i.e && !achou;
           c = new Date(c.getFullYear(), c.getMonth(), c.getDate() + 1)) {
        if (set[i.o + "|" + isoDe(c)]) achou = true;
      }
      i.foraDoCNJ = !achou;
    });
  }

  function classificar(org) {
    if (/^TRF/i.test(org)) return "TRF";
    if (/^MP/i.test(org)) return "MP";
    if (/^DP/i.test(org)) return "DP";
    if (/^TJ/i.test(org)) return "TJ";
    return "OUTRO";
  }

  function criarItem(org, fase, detalhe, s, e) {
    return {
      o: org, f: fase, d: detalhe, s: s, e: e,
      multi: s.getTime() !== e.getTime(),
      tipo: classificar(org),
      dias: Math.round((s - HOJE) / DAY),
      status: e < HOJE ? "past" : (s <= HOJE ? "now" : "next")
    };
  }

  function ordenar(itens) {
    return itens.sort(function (a, b) { return (a.s - b.s) || a.o.localeCompare(b.o); });
  }

  /* linhas cruas -> itens prontos; devolve também o que não deu pra entender */
  function montar(linhas) {
    var itens = [], recusadas = [];
    linhas.forEach(function (l) {
      var org = String(l.concurso || "").trim().toUpperCase();
      if (!org) return;
      var per = lerData(l.data);
      if (!per) { recusadas.push((l.data || "(vazio)") + " — " + org); return; }
      itens.push(criarItem(org, lerFase(l.fase), String(l.detalhe || "").trim(),
                           per.s, per.e));
    });
    return { itens: ordenar(itens), recusadas: recusadas };
  }

  /* Provas de magistratura direto do painel do CNJ. Só a aba de concursos em
     andamento, e só 1ª e 2ª fase — que é o que a planilha acompanha. */
  function itensDoCNJ(cnj) {
    if (!cnj || !cnj.abas) return [];
    var itens = [];
    (cnj.abas["Em andamento"] || []).forEach(function (c) {
      var p1 = lerData(c["Prova objetiva"]);
      if (p1) itens.push(criarItem(c.sigla, 1, "", p1.s, p1.s));
      var ini = lerData(c["2º Etapa início"]);
      if (ini) {
        var fim = lerData(c["2º Etapa fim"]);
        itens.push(criarItem(c.sigla, 2, "", ini.s, fim ? fim.s : ini.s));
      }
    });
    return itens;
  }

  /* Para magistratura o painel do CNJ é a fonte boa: se ele já cobre aquele
     órgão e fase, a linha da planilha sai do calendário e vale a data dele.
     Evita mostrar a mesma prova duas vezes quando as datas divergem — a
     divergência não some, é avisada por issue, que só o dono do repositório vê.

     A planilha continua mandando no que o painel não cobre (magistratura ainda
     não registrada, como o TJPE) e nas outras carreiras. */
  function juntar(daPlanilha, doCnj) {
    var cobertoPeloCNJ = {};
    doCnj.forEach(function (i) { cobertoPeloCNJ[i.o + "|" + i.f] = true; });

    var ficam = daPlanilha.filter(function (i) {
      var magistratura = i.tipo === "TJ" || i.tipo === "TRF";
      return !(magistratura && cobertoPeloCNJ[i.o + "|" + i.f]);
    });

    /* o painel repete o mesmo concurso com Ids diferentes */
    var visto = {}, extras = [];
    doCnj.forEach(function (i) {
      var chave = i.o + "|" + isoDe(i.s);
      if (visto[chave]) return;
      visto[chave] = true;
      extras.push(i);
    });

    return {
      itens: ordenar(ficam.concat(extras)),
      doCNJ: extras.length,
      substituidas: daPlanilha.length - ficam.length
    };
  }

  /* A aba tem duas linhas de cabeçalho. Achamos a linha de títulos pelo texto e
     lemos cada coluna pela posição do título, não por índice fixo. */
  function extrairLinhas(grade) {
    var h = -1;
    for (var i = 0; i < Math.min(grade.length, 10); i++) {
      var achou = grade[i].some(function (c) {
        return /^CONCURSO$/i.test(String(c || "").trim());
      });
      if (achou) { h = i; break; }
    }
    var cab = h >= 0 ? grade[h].map(function (c) {
      return String(c || "").trim().toUpperCase();
    }) : [];
    function col(nome, padrao) {
      var i = cab.indexOf(nome);
      return i >= 0 ? i : padrao;
    }
    var iData = col("DATA", 0), iConc = col("CONCURSO", 1);
    var iFase = col("FASE", 2), iDet = col("DETALHE", 3);

    return grade.slice(h + 1).map(function (c) {
      return {
        data: (c[iData] || "").trim(),
        concurso: (c[iConc] || "").trim().toUpperCase(),
        fase: (c[iFase] || "").trim(),
        detalhe: (c[iDet] || "").trim()
      };
    }).filter(function (l) { return l.concurso; });
  }

  function daPlanilha() {
    return fetch(CSV, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (txt) {
      return { origem: "planilha", linhas: extrairLinhas(lerCSV(txt)) };
    });
  }

  function doCNJ() {
    return fetch(CNJ, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).catch(function () { return null; });
  }

  function daCopia() {
    return fetch(COPIA, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      return { origem: "copia", quando: j.atualizadoEm, linhas: j.linhas || [] };
    });
  }

  /* ---------------- textos ---------------- */

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function quando(it) {
    if (it.status === "past") return "realizado";
    if (it.status === "now") return "acontecendo";
    if (it.dias === 0) return "é hoje";
    if (it.dias === 1) return "amanhã";
    return "em " + it.dias + " dias";
  }
  function dataLonga(it) {
    if (!it.multi) {
      return DIAS[it.s.getDay()] + ", " + it.s.getDate() + " de " +
             MESL[it.s.getMonth()] + " de " + it.s.getFullYear();
    }
    if (it.s.getMonth() === it.e.getMonth()) {
      return it.s.getDate() + " a " + it.e.getDate() + " de " +
             MESL[it.s.getMonth()] + " de " + it.s.getFullYear();
    }
    return it.s.getDate() + " de " + MESL[it.s.getMonth()] + " a " +
           it.e.getDate() + " de " + MESL[it.e.getMonth()] + " de " + it.e.getFullYear();
  }
  function faseTag(f) { return '<span class="fase f' + f + '">' + f + "ª fase</span>"; }

  var AVISO_CNJ = "Ainda não consta no painel do CNJ";
  function nomeOrg(i) {
    return esc(i.o) + (i.foraDoCNJ
      ? '<span class="semcnj" title="' + AVISO_CNJ + '">*</span>' : "");
  }

  /* ---------------- desenho ---------------- */

  function iniciar(dados, cnj) {
    var pronto = montar(dados.linhas);
    var setCNJ = indexarCNJ(cnj);
    /* o asterisco é conferido só nas linhas da planilha: o que vem do painel,
       por definição, está no painel */
    marcarCNJ(pronto.itens, setCNJ);
    var juncao = juntar(pronto.itens, itensDoCNJ(cnj));
    var items = juncao.itens;

    var hero = document.getElementById("hero");
    var pauta = document.getElementById("pauta");
    var aviso = document.getElementById("aviso");
    var elStats = document.getElementById("stats");
    var elTipos = document.getElementById("tipos");
    var sel = document.getElementById("org");
    var past = document.getElementById("past");
    var legend = document.getElementById("legend");

    if (!items.length) {
      hero.innerHTML = '<div><p class="hero-label">Pauta</p>' +
        '<h2 class="hero-org">Nenhuma data na planilha</h2></div>';
      pauta.innerHTML = '<p class="empty">A aba “' + esc(ABA) + '” está vazia.</p>';
      return;
    }

    if (pronto.recusadas.length) {
      aviso.classList.remove("is-off");
      aviso.textContent = pronto.recusadas.length +
        (pronto.recusadas.length > 1 ? " linhas da planilha não foram entendidas e ficaram de fora: "
                                     : " linha da planilha não foi entendida e ficou de fora: ") +
        pronto.recusadas.join("; ") + ".";
    }

    /* próxima prova */
    var futuros = items.filter(function (i) { return i.status !== "past"; });
    if (futuros.length) {
      var n = futuros[0];
      var seq = futuros.slice(1, 4).map(function (i) {
        return "<span><b>" + nomeOrg(i) + "</b> " + i.f + "ª · " +
               i.s.getDate() + "/" + MES[i.s.getMonth()] + "</span>";
      }).join("");
      var num = n.status === "now" ? "agora" : (n.dias === 0 ? "hoje" : n.dias);
      var unit = (n.status === "now" || n.dias === 0) ? "em andamento" : (n.dias === 1 ? "dia" : "dias");
      hero.innerHTML =
        '<div class="hero-count"><span class="hero-num">' + num + '</span>' +
        '<span class="hero-unit">' + unit + "</span></div>" +
        '<div><p class="hero-label">Próxima prova</p>' +
        '<h2 class="hero-org">' + nomeOrg(n) + " " + faseTag(n.f) + "</h2>" +
        (n.d ? '<p class="hero-det">' + esc(n.d) + "</p>" : "") +
        '<p class="hero-when">' + dataLonga(n) + "</p>" +
        (seq ? '<div class="hero-next">' + seq + "</div>" : "") + "</div>";
    } else {
      hero.innerHTML = '<div><p class="hero-label">Pauta</p>' +
        '<h2 class="hero-org">Nenhuma prova futura</h2>' +
        '<p class="hero-when">Hora de acrescentar as próximas datas na planilha.</p></div>';
    }

    var d90 = futuros.filter(function (i) { return i.dias <= 90; }).length;
    var vistos = {}, nOrg = 0;
    futuros.forEach(function (i) { if (!vistos[i.o]) { vistos[i.o] = 1; nOrg++; } });
    elStats.innerHTML =
      '<div class="stat"><b>' + futuros.length + "</b><span>provas pela frente</span></div>" +
      '<div class="stat"><b>' + d90 + "</b><span>nos próximos 90 dias</span></div>" +
      '<div class="stat"><b>' + nOrg + "</b><span>órgãos em disputa</span></div>";
    elStats.hidden = false;

    /* filtros montados a partir do que existe na planilha */
    var tipos = [];
    items.forEach(function (i) { if (tipos.indexOf(i.tipo) < 0) tipos.push(i.tipo); });
    tipos.sort();
    elTipos.innerHTML = '<button type="button" class="chip is-on" data-tipo="all">Tudo</button>' +
      tipos.map(function (t) {
        return '<button type="button" class="chip" data-tipo="' + t + '">' +
               esc(ROTULO[t] || t) + "</button>";
      }).join("");

    var orgs = [];
    items.forEach(function (i) { if (orgs.indexOf(i.o) < 0) orgs.push(i.o); });
    orgs.sort();
    sel.innerHTML = '<option value="all">Todos os órgãos</option>' +
      orgs.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("");

    document.getElementById("viewbar").hidden = false;
    document.getElementById("filters").hidden = false;
    /* a legenda do asterisco só faz sentido se conseguimos ler o painel */
    document.getElementById("legenda-cnj").hidden = !setCNJ;

    /* estado */
    var state = { view: "cal", tipo: "all", fase: "all", org: "all", past: false };
    try {
      var raw = localStorage.getItem("pauta.v2");
      if (raw) {
        var sv = JSON.parse(raw);
        if (sv && typeof sv === "object") {
          state.view = sv.view === "lista" ? "lista" : "cal";
          state.tipo = sv.tipo || "all"; state.fase = sv.fase || "all";
          state.org = sv.org || "all"; state.past = !!sv.past;
        }
      }
    } catch (err) {}
    function salvar() {
      try { localStorage.setItem("pauta.v2", JSON.stringify(state)); } catch (err) {}
    }

    var chips = [].slice.call(document.querySelectorAll(".chip"));
    var views = [].slice.call(document.querySelectorAll(".seg button"));

    function sincronizar() {
      if (tipos.indexOf(state.tipo) < 0 && state.tipo !== "all") state.tipo = "all";
      chips.forEach(function (c) {
        var on = (c.getAttribute("data-tipo") && c.getAttribute("data-tipo") === state.tipo) ||
                 (c.getAttribute("data-fase") && c.getAttribute("data-fase") === state.fase);
        c.classList.toggle("is-on", !!on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      views.forEach(function (b) {
        var on = b.getAttribute("data-view") === state.view;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      legend.classList.toggle("is-off", state.view !== "cal");
      if (state.org !== "all" && orgs.indexOf(state.org) < 0) state.org = "all";
      sel.value = state.org;
      past.checked = state.past;
    }

    function filtrar() {
      return items.filter(function (i) {
        if (!state.past && i.status === "past") return false;
        if (state.tipo !== "all" && i.tipo !== state.tipo) return false;
        if (state.fase !== "all" && String(i.f) !== state.fase) return false;
        if (state.org !== "all" && i.o !== state.org) return false;
        return true;
      });
    }

    function renderLista(lista) {
      var html = "", chave = null;
      lista.forEach(function (i) {
        var k = i.s.getFullYear() + "-" + i.s.getMonth();
        if (k !== chave) {
          if (chave !== null) html += "</div></section>";
          chave = k;
          html += '<section class="month"><div class="month-tag"><b>' + MESL[i.s.getMonth()] +
                  "</b>" + i.s.getFullYear() + '</div><div class="month-list">';
        }
        var dia = i.multi ? (i.s.getDate() + "–" + i.e.getDate()) : String(i.s.getDate());
        var mo = (i.multi && i.s.getMonth() !== i.e.getMonth())
          ? MES[i.s.getMonth()] + "–" + MES[i.e.getMonth()] : MES[i.s.getMonth()];
        var cls = "ev" + (i.status === "past" ? " is-past" : "") +
                  (i.status === "now" ? " is-now" : "") +
                  (i.status === "next" && i.dias <= 30 ? " is-soon" : "");
        html += '<article class="' + cls + '">' +
          '<div class="ev-date"><span class="ev-day">' + dia + '</span>' +
          '<span class="ev-mo">' + mo + "</span></div>" +
          '<div><p class="ev-org">' + nomeOrg(i) + " " + faseTag(i.f) + "</p>" +
          (i.d ? '<p class="ev-det">' + esc(i.d) + "</p>" : "") + "</div>" +
          '<div class="ev-when">' + quando(i) + "</div></article>";
      });
      return html + "</div></section>";
    }

    function mapaDias(lista) {
      var m = {};
      lista.forEach(function (i) {
        var c = new Date(i.s.getTime());
        while (c <= i.e) {
          var k = c.getFullYear() + "." + c.getMonth() + "." + c.getDate();
          if (!m[k]) m[k] = [];
          m[k].push(i);
          c = new Date(c.getFullYear(), c.getMonth(), c.getDate() + 1);
        }
      });
      return m;
    }

    function renderCal(lista) {
      var mapa = mapaDias(lista);
      var ini = lista[0].s, fim = lista[0].e;
      lista.forEach(function (i) { if (i.e > fim) fim = i.e; });

      var primeiroMes = ini.getFullYear() * 12 + ini.getMonth();
      var mesAtual = HOJE.getFullYear() * 12 + HOJE.getMonth();
      var atual = state.past ? primeiroMes : Math.min(primeiroMes, mesAtual);
      var limite = fim.getFullYear() * 12 + fim.getMonth();
      var html = '<div class="cals">', guarda = 0;

      while (atual <= limite && guarda++ < 60) {
        var yy = Math.floor(atual / 12), mm = atual % 12;
        var totalDias = new Date(yy, mm + 1, 0).getDate();
        var offset = new Date(yy, mm, 1).getDay();
        var fer = feriados(yy);
        var noMes = 0, celulas = "";

        for (var p = 0; p < offset; p++) celulas += '<div class="d pad"></div>';
        for (var dd = 1; dd <= totalDias; dd++) {
          var data = new Date(yy, mm, dd);
          var evs = mapa[yy + "." + mm + "." + dd] || [];
          noMes += evs.length;
          var wd = data.getDay();
          var feriado = fer[yy + "." + mm + "." + dd];
          var cls = "d";
          if (wd === 0 || wd === 6 || feriado) cls += " wknd";
          if (feriado) cls += " feriado";
          if (evs.length) cls += " busy";
          if (data < HOJE) cls += " gone";
          if (data.getTime() === HOJE.getTime()) cls += " today";
          var marcas = "";
          evs.forEach(function (i) {
            var titulo = i.o + " — " + i.f + "ª fase" + (i.d ? " (" + i.d + ")" : "") +
                         (i.foraDoCNJ ? " · " + AVISO_CNJ.toLowerCase() : "");
            marcas += '<span class="ec e' + i.f + '" title="' + esc(titulo) + '">' +
                      esc(i.o) + (i.foraDoCNJ ? "*" : "") + "</span>";
          });
          celulas += '<div class="' + cls + '"' +
            (feriado ? ' title="' + esc(feriado) + '"' : "") +
            '><span class="dn">' + dd + "</span>" + marcas + "</div>";
        }

        html += '<section class="cal"><h3 class="cal-h">' + MESL[mm] + " <em>" + yy + "</em>" +
          (noMes ? "<u>" + noMes + (noMes > 1 ? " provas" : " prova") + "</u>" : "") + "</h3>" +
          '<div class="wk">' + SEM.map(function (s) { return "<span>" + s + "</span>"; }).join("") +
          '</div><div class="grid">' + celulas + "</div></section>";
        atual++;
      }
      return html + "</div>";
    }

    function render() {
      var lista = filtrar();
      pauta.innerHTML = lista.length
        ? (state.view === "cal" ? renderCal(lista) : renderLista(lista))
        : '<p class="empty">Nenhuma prova com esses filtros.</p>';
    }

    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        var t = c.getAttribute("data-tipo"), f = c.getAttribute("data-fase");
        if (t) state.tipo = t;
        if (f) state.fase = f;
        sincronizar(); render(); salvar();
      });
    });
    views.forEach(function (b) {
      b.addEventListener("click", function () {
        state.view = b.getAttribute("data-view");
        sincronizar(); render(); salvar();
      });
    });
    sel.addEventListener("change", function () { state.org = sel.value; render(); salvar(); });
    past.addEventListener("change", function () { state.past = past.checked; render(); salvar(); });

    var fonte = document.getElementById("fonte");
    if (dados.origem === "planilha") {
      fonte.innerHTML = "Magistratura vem do <b>painel do CNJ</b>" +
        (cnj && cnj.atualizadoEm
          ? " (lido em " + new Date(cnj.atualizadoEm).toLocaleDateString("pt-BR") + ")"
          : "") +
        "; a <b>planilha</b> entra ao vivo com o que falta lá e com as outras carreiras.";
    } else {
      var q = dados.quando ? new Date(dados.quando) : null;
      fonte.innerHTML = "A planilha não respondeu; mostrando a cópia de <b>" +
        (q ? q.toLocaleDateString("pt-BR") : "data desconhecida") + "</b>.";
    }

    sincronizar();
    render();
  }

  /* ---------------- reportar erro ---------------- */

  function ligarReporte() {
    var caixa = document.getElementById("reporte");
    var form = document.getElementById("formReporte");
    var recado = document.getElementById("recadoReporte");
    var enviar = document.getElementById("enviarReporte");
    if (!caixa || !form) return;

    function avisar(texto, ruim) {
      recado.textContent = texto;
      recado.classList.toggle("ruim", !!ruim);
    }

    document.getElementById("abrirReporte").addEventListener("click", function () {
      avisar("");
      form.reset();
      caixa.showModal();
      document.getElementById("mensagem").focus();
    });
    document.getElementById("fecharReporte").addEventListener("click", function () {
      caixa.close();
    });

    /* Sem chave configurada: monta um e-mail com o texto e deixa o visitante
       enviar pelo programa dele. Não é tão bom, mas nunca perde a mensagem. */
    function porEmail(dados) {
      var corpo = dados.mensagem +
        "\n\n---\n" + (dados.quem ? "De: " + dados.quem + "\n" : "") +
        (dados.contato ? "Responder para: " + dados.contato + "\n" : "");
      window.location.href = "mailto:" + DESTINO +
        "?subject=" + encodeURIComponent(ASSUNTO) +
        "&body=" + encodeURIComponent(corpo);
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var dados = {
        mensagem: document.getElementById("mensagem").value.trim(),
        quem: document.getElementById("quem").value.trim(),
        contato: document.getElementById("contato").value.trim()
      };
      if (!dados.mensagem) { avisar("Escreva a mensagem antes de enviar.", true); return; }

      if (!CHAVE_FORMULARIO) {
        porEmail(dados);
        caixa.close();
        return;
      }

      enviar.disabled = true;
      avisar("Enviando…");
      fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: CHAVE_FORMULARIO,
          subject: ASSUNTO,
          from_name: dados.quem || "Visitante do site",
          replyto: dados.contato || undefined,
          message: dados.mensagem
        })
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (res) {
        if (!res.success) throw new Error(res.message || "recusado");
        avisar("Recebido. Obrigado!");
        setTimeout(function () { caixa.close(); }, 1200);
      }).catch(function () {
        avisar("Não consegui enviar daqui. Abrindo seu e-mail…", true);
        setTimeout(function () { porEmail(dados); caixa.close(); }, 1200);
      }).then(function () { enviar.disabled = false; });
    });
  }

  ligarReporte();

  Promise.all([
    daPlanilha().catch(function () { return daCopia(); }),
    doCNJ()
  ]).then(function (r) { iniciar(r[0], r[1]); }).catch(function (e) {
    document.getElementById("hero").innerHTML =
      '<div><p class="hero-label">Erro</p><h2 class="hero-org">Não consegui ler as datas</h2>' +
      '<p class="hero-when">Nem a planilha nem a cópia local responderam.</p></div>';
    document.getElementById("pauta").innerHTML =
      '<p class="empty">' + esc(e && e.message ? e.message : e) + "</p>";
  });
})();

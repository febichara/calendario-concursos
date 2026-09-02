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

  function classificar(org) {
    if (/^TRF/i.test(org)) return "TRF";
    if (/^MP/i.test(org)) return "MP";
    if (/^DP/i.test(org)) return "DP";
    if (/^TJ/i.test(org)) return "TJ";
    return "OUTRO";
  }

  /* linhas cruas -> itens prontos; devolve também o que não deu pra entender */
  function montar(linhas) {
    var itens = [], recusadas = [];
    linhas.forEach(function (l) {
      var org = String(l.concurso || "").trim().toUpperCase();
      if (!org) return;
      var per = lerData(l.data);
      if (!per) { recusadas.push((l.data || "(vazio)") + " — " + org); return; }
      var dias = Math.round((per.s - HOJE) / DAY);
      itens.push({
        o: org,
        f: lerFase(l.fase),
        d: String(l.detalhe || "").trim(),
        s: per.s,
        e: per.e,
        multi: per.s.getTime() !== per.e.getTime(),
        tipo: classificar(org),
        dias: dias,
        status: per.e < HOJE ? "past" : (per.s <= HOJE ? "now" : "next")
      });
    });
    itens.sort(function (a, b) { return (a.s - b.s) || a.o.localeCompare(b.o); });
    return { itens: itens, recusadas: recusadas };
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

  /* ---------------- desenho ---------------- */

  function iniciar(dados) {
    var pronto = montar(dados.linhas);
    var items = pronto.itens;

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
        return "<span><b>" + esc(i.o) + "</b> " + i.f + "ª · " +
               i.s.getDate() + "/" + MES[i.s.getMonth()] + "</span>";
      }).join("");
      var num = n.status === "now" ? "agora" : (n.dias === 0 ? "hoje" : n.dias);
      var unit = (n.status === "now" || n.dias === 0) ? "em andamento" : (n.dias === 1 ? "dia" : "dias");
      hero.innerHTML =
        '<div class="hero-count"><span class="hero-num">' + num + '</span>' +
        '<span class="hero-unit">' + unit + "</span></div>" +
        '<div><p class="hero-label">Próxima prova</p>' +
        '<h2 class="hero-org">' + esc(n.o) + " " + faseTag(n.f) + "</h2>" +
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
          '<div><p class="ev-org">' + esc(i.o) + " " + faseTag(i.f) + "</p>" +
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
        var noMes = 0, celulas = "";

        for (var p = 0; p < offset; p++) celulas += '<div class="d pad"></div>';
        for (var dd = 1; dd <= totalDias; dd++) {
          var data = new Date(yy, mm, dd);
          var evs = mapa[yy + "." + mm + "." + dd] || [];
          noMes += evs.length;
          var wd = data.getDay();
          var cls = "d";
          if (wd === 0 || wd === 6) cls += " wknd";
          if (evs.length) cls += " busy";
          if (data < HOJE) cls += " gone";
          if (data.getTime() === HOJE.getTime()) cls += " today";
          var marcas = "";
          evs.forEach(function (i) {
            var titulo = i.o + " — " + i.f + "ª fase" + (i.d ? " (" + i.d + ")" : "");
            marcas += '<span class="ec e' + i.f + '" title="' + esc(titulo) + '">' +
                      esc(i.o) + "</span>";
          });
          celulas += '<div class="' + cls + '"><span class="dn">' + dd + "</span>" + marcas + "</div>";
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
      fonte.innerHTML = "Lendo a planilha <b>ao vivo</b> — editou lá, aparece aqui no próximo refresh.";
    } else {
      var q = dados.quando ? new Date(dados.quando) : null;
      fonte.innerHTML = "A planilha não respondeu; mostrando a cópia de <b>" +
        (q ? q.toLocaleDateString("pt-BR") : "data desconhecida") + "</b>.";
    }

    sincronizar();
    render();
  }

  daPlanilha().catch(function () { return daCopia(); }).then(iniciar).catch(function (e) {
    document.getElementById("hero").innerHTML =
      '<div><p class="hero-label">Erro</p><h2 class="hero-org">Não consegui ler as datas</h2>' +
      '<p class="hero-when">Nem a planilha nem a cópia local responderam.</p></div>';
    document.getElementById("pauta").innerHTML =
      '<p class="empty">' + esc(e && e.message ? e.message : e) + "</p>";
  });
})();

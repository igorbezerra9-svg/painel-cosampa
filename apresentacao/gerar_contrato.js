/* Apresentação "CONTRATO MULTISERVIÇOS SUL" (gestão de contrato, Enel Ceará): por processo
   (Emergencial, Comercial Carro, Comercial Moto) e por métrica (turnos/dia, faturamento,
   produtividade, ticket médio), mês a mês, por cidade + Sul, com a caixa de Insights escrita
   a partir dos números. Mesmas contas do painel (e do deck de controle de turnos):
     turnos/dia = média de turnos trabalhados nos dias com escala (Sul = soma das 3 cidades)
     faturamento = soma de valor_total
     produtividade = OS ÷ turnos trabalhados
     ticket médio = faturamento ÷ OS
   Fora de propósito (não vêm da planilha de faturamento): TMA e Rejeitadas. */
(function (root) {
  "use strict";

  var MES_CAP = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  var MES_MIN = MES_CAP.map(function (m) { return m.toLowerCase(); });
  var PRIMEIRO_MES = "2026-01";
  var PRIMEIRO_MES_ANT = "2025-05";   // o GPM só tem faturamento a partir de maio/2025
  var COR_ANO_ANT = "14A39A";          // mesmo verde-água do painel
  // "dia fraco" = dia com menos da metade dos turnos do dia típico do mês (mediana). Pega domingo e
  // feriado em que quase ninguém trabalha, que puxam a média mensal pra baixo.
  var LIMITE_DIA_FRACO = 0.5;
  var CIDADES = [
    { chave: "CS", nome: "Campos Sales", curto: "CS", cor: "EC6B35" },
    { chave: "JN", nome: "Juazeiro do Norte", curto: "JN", cor: "2979D8" },
    { chave: "ML", nome: "Milagres", curto: "ML", cor: "3E9444" }
  ];
  var SUL = { chave: "Sul", nome: "Sul", curto: "Sul", cor: "8556C8" };
  var PROCESSOS = [
    { dict: "Emergencial", nome: "Emergencial", ordem: ["turnos", "fat", "prod", "ticket"], tituloTurnos: "Abertura de Turnos" },
    { dict: "Comercial", nome: "Comercial (Carro)", ordem: ["fat", "turnos", "prod", "ticket"], tituloTurnos: "Turnos" },
    { dict: "Comercial Moto", nome: "Comercial (Moto)", ordem: ["fat", "turnos", "prod", "ticket"], tituloTurnos: "Turnos" }
  ];

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function iso(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function brData(s) { return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4); }
  function nomeMes(mk) { return MES_CAP[+mk.slice(5, 7) - 1]; }
  function nomeMesMin(mk) { return MES_MIN[+mk.slice(5, 7) - 1]; }
  function mesAnterior(d) { return d.getMonth() === 0 ? (d.getFullYear() - 1) + "-12" : d.getFullYear() + "-" + pad2(d.getMonth()); }

  // ---------- formatação pt-BR ----------
  function nf(v, casas) { return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
  function fInt(v) { return nf(Math.round(v), 0); }
  function fMi(v) { return v >= 1e6 ? "R$ " + nf(v / 1e6, 1) + " mi" : v >= 1e3 ? "R$ " + nf(v / 1e3, 0) + " mil" : "R$ " + nf(v, 0); }
  function fBRL2(v) { return "R$ " + nf(v, 2); }
  function fDec2(v) { return nf(v, 2); }
  function pctAbs(x) { return Math.round(Math.abs(x) * 100) + "%"; }
  function pctSig(x) { return (x < 0 ? "-" : "+") + pctAbs(x); }
  function varPct(a, b) { return b ? (a - b) / b : null; }

  var METRICAS = {
    turnos: { nome: "Turnos", fmt: fInt, fmtLabel: "0", unidade: "turnos/dia" },
    fat: { nome: "Faturamento", fmt: fMi, fmtLabel: '[>=1000000]"R$ "0.0,," mi";[>=1000]"R$ "0," mil";"R$ "0', unidade: "" },
    prod: { nome: "Produtividade", fmt: fDec2, fmtLabel: "0.00", unidade: "OS/turno" },
    ticket: { nome: "Ticket Médio", fmt: fBRL2, fmtLabel: '"R$ "0.00', unidade: "" }
  };

  // ---------- cálculo ----------
  function calcular(ctx) {
    var rows = ctx.rows, D = ctx.dicts, hoje = ctx.hoje || new Date();
    var ontem = iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1));
    var mesAtual = hoje.getFullYear() + "-" + pad2(hoje.getMonth() + 1);
    var alvo = ctx.mes || mesAnterior(hoje);
    var parcial = alvo === mesAtual;                         // mês corrente: vai só até ontem
    var limite = parcial ? ontem : alvo + "-31";

    var idxProc = {}; PROCESSOS.forEach(function (p) { idxProc[D.processo.indexOf(p.dict)] = p; });
    var idxCid = {}; CIDADES.forEach(function (c) { idxCid[D.centro.indexOf(c.nome)] = c.chave; });

    var comparar = !!ctx.compararAno, alvoAnt = (+alvo.slice(0, 4) - 1) + alvo.slice(4);
    var limiteAnt = parcial ? (+limite.slice(0, 4) - 1) + limite.slice(4) : alvoAnt + "-31";   // mês parcial: 2025 só até o mesmo dia
    var mesesSet = {}, mesesAntSet = {}, acc = {};
    PROCESSOS.forEach(function (p) { acc[p.dict] = {}; [SUL].concat(CIDADES).forEach(function (c) { acc[p.dict][c.chave] = {}; }); });

    for (var i = 0; i < rows.date.length; i++) {
      var dt = rows.date[i], mk = dt.slice(0, 7);
      var ant = comparar && mk >= PRIMEIRO_MES_ANT && mk < PRIMEIRO_MES;
      if ((mk < PRIMEIRO_MES && !ant) || dt > limite || (ant && mk === alvoAnt && dt > limiteAnt)) continue;
      var p = idxProc[rows.proc[i]], cid = idxCid[rows.centro[i]];
      if (!p || !cid || ctx.isExcluido(i)) continue;
      var t = ctx.isTrabalhou(i), f = ctx.isFaltou(i);
      if (ant) mesesAntSet[mk] = true; else mesesSet[mk] = true;
      [cid, "Sul"].forEach(function (k) {
        var m = acc[p.dict][k][mk] || (acc[p.dict][k][mk] = { val: 0, qtd: 0, den: 0, dias: {} });
        m.val += rows.valor[i]; m.qtd += rows.qtd[i];
        if (t) m.den++;
        if (t || f) { var d = m.dias[dt] || (m.dias[dt] = { esc: 0, trab: 0 }); d.esc++; if (t) d.trab++; }
      });
    }
    var meses = Object.keys(mesesSet).sort();
    if (!meses.length || meses[meses.length - 1] !== alvo) throw new Error("Sem dados de " + nomeMes(alvo) + " " + alvo.slice(0, 4) + " para montar o contrato");
    // comparação: só os meses de 2026 que têm o mesmo mês em 2025 (a partir de maio)
    var anoAnterior = function (mk) { return (+mk.slice(0, 4) - 1) + mk.slice(4); };
    var meses25 = [];
    if (comparar) {
      meses = meses.filter(function (mk) { return mesesAntSet[anoAnterior(mk)]; });
      if (!meses.length || meses[meses.length - 1] !== alvo) throw new Error("Não há " + nomeMes(alvo) + " de " + alvoAnt.slice(0, 4) + " para comparar (o GPM só tem dados a partir de maio/2025)");
      meses25 = meses.map(anoAnterior);
    }

    var fracos = {};
    PROCESSOS.forEach(function (p) {
      fracos[p.dict] = {};
      meses.concat(meses25).forEach(function (mk) {
        var m = acc[p.dict].Sul[mk]; if (!m) return;
        var ds = Object.keys(m.dias).filter(function (x) { return m.dias[x].esc > 0; });
        var v = ds.map(function (x) { return m.dias[x].trab; }).sort(function (a, b) { return a - b; });
        var med = v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0;
        var lista = ds.filter(function (x) { return m.dias[x].trab < med * LIMITE_DIA_FRACO; }).sort()
          .map(function (x) { return { dt: x, trab: m.dias[x].trab }; });
        var set = {}; lista.forEach(function (l) { set[l.dt] = true; });
        fracos[p.dict][mk] = { set: set, lista: lista, tipico: med };
      });
    });

    function montarSeries(lista) {
    var series = {};
    PROCESSOS.forEach(function (p) {
      series[p.dict] = {};
      [SUL].concat(CIDADES).forEach(function (c) {
        var s = { turnos: [], fat: [], prod: [], ticket: [] };
        lista.forEach(function (mk) {
          var m = acc[p.dict][c.chave][mk] || { val: 0, qtd: 0, den: 0, dias: {} };
          var fr = fracos[p.dict][mk];
          var dias = Object.keys(m.dias).filter(function (x) { return m.dias[x].esc > 0 && !(ctx.somenteDiasNormais && fr && fr.set[x]); });
          s.turnos.push(dias.length ? dias.reduce(function (a, x) { return a + m.dias[x].trab; }, 0) / dias.length : 0);
          s.fat.push(m.val);
          s.prod.push(m.den ? m.qtd / m.den : 0);
          s.ticket.push(m.qtd ? m.val / m.qtd : 0);
        });
        series[p.dict][c.chave] = s;
      });
    });
    return series;
    }
    var series = montarSeries(meses);
    return { meses: meses, alvo: alvo, parcial: parcial, fimTxt: parcial ? brData(ontem) : "", series: series, fracos: fracos, somenteDiasNormais: !!ctx.somenteDiasNormais,
      comp: comparar, meses25: meses25, serie25: comparar ? montarSeries(meses25) : null, mesesTodos: meses25.concat(meses), emitidoEm: brData(iso(hoje)) };
  }

  var DIA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  // Lista os dias fracos de um processo/mês e, em cada um, quem trabalhou. ctx: rows, dicts,
  // isTrabalhou, isFaltou, isExcluido (as mesmas funções do painel).
  function diasFracosDetalhe(ctx, procDict, mk) {
    var rows = ctx.rows, D = ctx.dicts, pIdx = D.processo.indexOf(procDict), cenIdx = {};
    CIDADES.forEach(function (c) { cenIdx[D.centro.indexOf(c.nome)] = c.curto; });
    var por = {};
    for (var i = 0; i < rows.date.length; i++) {
      var dt = rows.date[i];
      if (dt.slice(0, 7) !== mk || rows.proc[i] !== pIdx || !cenIdx[rows.centro[i]] || ctx.isExcluido(i)) continue;
      var t = ctx.isTrabalhou(i), f = ctx.isFaltou(i);
      if (!t && !f) continue;
      var d = por[dt] || (por[dt] = { dt: dt, trab: 0, faltaram: 0, equipes: [] });
      if (t) { d.trab++; d.equipes.push({ equipe: D.equipe[rows.equipe[i]], centro: cenIdx[rows.centro[i]], qtd: rows.qtd[i], valor: rows.valor[i] }); } else d.faltaram++;
    }
    var dias = Object.keys(por).sort(), v = dias.map(function (x) { return por[x].trab; }).sort(function (a, b) { return a - b; });
    var med = v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0, lim = med * LIMITE_DIA_FRACO;
    var fracos = dias.filter(function (x) { return por[x].trab < lim; }).map(function (x) {
      var d = por[x], dd = new Date(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10));
      d.dow = DIA_SEMANA[dd.getDay()]; d.equipes.sort(function (a, b) { return a.equipe.localeCompare(b.equipe, "pt-BR"); }); return d;
    });
    return { tipico: med, limite: lim, diasNoMes: dias.length, fracos: fracos };
  }

  // ---------- insights (texto montado só com os números) ----------
  function ext(arr) {
    var mx = 0, mn = 0; arr.forEach(function (v, i) { if (v > arr[mx]) mx = i; if (v < arr[mn]) mn = i; });
    return { max: mx, min: mn };
  }
  function ranking(S, met) {
    return CIDADES.map(function (c) { return { c: c, v: S[c.chave][met][S[c.chave][met].length - 1], ant: S[c.chave][met].length > 1 ? S[c.chave][met][S[c.chave][met].length - 2] : null }; })
      .sort(function (a, b) { return b.v - a.v; });
  }
  function insights(res, proc, met) {
    var S = res.series[proc.dict], n = res.meses.length, cur = n - 1, prev = n > 1 ? n - 2 : null;
    var mes = nomeMes(res.meses[cur]) + (res.parcial ? " (parcial)" : ""), mesAnt = prev != null ? nomeMesMin(res.meses[prev]) : "";
    var M = METRICAS[met], sul = S.Sul[met], v = sul[cur], vp = prev != null ? sul[prev] : null, e = ext(sul);
    var vr = vp != null ? varPct(v, vp) : null, rk = ranking(S, met);
    var b = [];
    function L(t) { return { t: t, k: "lead" }; } function B(t) { return { t: t, k: "bold" }; } function T(t) { return { t: t, k: "" }; }
    var DOANO = res.comp ? "do período" : "do ano";

    if (met === "turnos") {
      var tot = rk.reduce(function (a, r) { return a + r.v; }, 0);
      b.push([L(mes + " | Sul: "), B(fInt(v) + " turnos/dia"), T(". " + rk.map(function (r) { return r.c.curto + " " + fInt(r.v) + " (" + Math.round(r.v / tot * 100) + "%)"; }).join(", ") + ".")]);
      if (vr != null) {
        var t2 = (Math.abs(vr) < 0.01 ? "estável vs " + mesAnt + " (" + fInt(vp) + ")" : (vr < 0 ? "queda de " : "alta de ") + pctAbs(vr) + " vs " + mesAnt + " (" + fInt(vp) + ")");
        if (e.max !== cur) t2 += " e de " + pctAbs(varPct(v, sul[e.max])) + " vs o pico de " + nomeMesMin(res.meses[e.max]) + " (" + fInt(sul[e.max]) + ")"; else t2 += " — maior nível " + DOANO;
        var seq = 0; for (var k = cur; k > 0 && Math.round(sul[k]) < Math.round(sul[k - 1]); k--) seq++;
        if (seq >= 3) t2 += " — retração contínua desde " + nomeMesMin(res.meses[cur - seq + 1]);
        b.push([L("Tendência: "), T(t2)]);
      }
      var qd = rk.filter(function (r) { return r.ant && varPct(r.v, r.ant) <= -0.10; }).sort(function (a, c) { return varPct(a.v, a.ant) - varPct(c.v, c.ant); })[0];
      if (qd) b.push([L("Atenção: "), T(qd.c.curto + " cai " + pctAbs(varPct(qd.v, qd.ant)) + " vs " + mesAnt + " (" + nf(qd.ant, 1) + " para " + nf(qd.v, 1) + " turnos/dia).")]);
    } else if (met === "fat") {
      b.push([L(mes + " | Sul: "), B(fMi(v)), T(". " + rk.map(function (r, i) { return r.c.curto + " " + fMi(r.v) + (i === 0 ? " (" + Math.round(r.v / v * 100) + "%)" : ""); }).join(", ") + ".")]);
      if (vr != null) {
        var t3 = pctSig(vr) + " vs " + mesAnt + " (" + fMi(vp) + ")";
        if (e.min === cur) t3 += " e menor patamar " + DOANO + " — pico foi " + nomeMesMin(res.meses[e.max]) + ", com " + fMi(sul[e.max]);
        else if (e.max === cur) t3 += " e maior patamar " + DOANO;
        else t3 += "; pico " + DOANO + " em " + nomeMesMin(res.meses[e.max]) + " (" + fMi(sul[e.max]) + ")";
        b.push([L("Tendência: "), T(t3 + ".")]);
        var qf = rk.filter(function (r) { return r.ant && varPct(r.v, r.ant) <= -0.10; }).sort(function (a, c) { return varPct(a.v, a.ant) - varPct(c.v, c.ant); })[0];
        if (qf) b.push([L("Atenção: "), T(qf.c.curto + " caiu " + pctAbs(varPct(qf.v, qf.ant)) + " vs " + mesAnt + " (" + fMi(qf.ant) + " para " + fMi(qf.v) + "), a maior retração relativa do Sul.")]);
        else if (rk.every(function (r) { return r.ant && r.v >= r.ant; })) b.push([L("Leitura: "), T("as três cidades avançaram vs " + mesAnt + ".")]);
      }
    } else if (met === "prod") {
      var sufixo = vp == null ? "." : e.max === cur ? " — melhor marca " + DOANO + " (" + mesAnt + ": " + fDec2(vp) + ")." : e.min === cur ? " — menor marca " + DOANO + " (" + mesAnt + ": " + fDec2(vp) + ")." : " (" + mesAnt + ": " + fDec2(vp) + ", " + pctSig(vr) + ").";
      b.push([L(mes + " | Sul: "), B(fDec2(v) + " OS/turno"), T(sufixo)]);
      var dest = rk.map(function (r, i) {
        if (i === 0) return r.c.curto + " " + fDec2(r.v) + " lidera";
        var vv = r.ant ? varPct(r.v, r.ant) : null;
        return r.c.curto + " " + fDec2(r.v) + (vv == null || Math.abs(vv) < 0.01 ? " estável" : vv > 0 ? " avança " + pctAbs(vv) + " vs " + mesAnt : " recua " + pctAbs(vv) + " vs " + mesAnt);
      });
      b.push([L("Destaques: "), T(dest.join("; ") + ".")]);
      var tu = S.Sul.turnos, vt = prev != null ? varPct(tu[cur], tu[prev]) : null;
      if (vt != null && vr != null && Math.abs(vt) >= 0.01) {
        var leit = vt < 0 && vr > 0 ? "menos turnos com mais OS por turno — o ganho de eficiência compensa parte da queda de volume."
          : vt < 0 && vr <= 0 ? "menos turnos e menos OS por turno — pressão simultânea de volume e eficiência."
          : vt > 0 && vr > 0 ? "mais turnos e mais OS por turno — crescimento de volume com ganho de eficiência."
          : "mais turnos, mas menos OS por turno — a eficiência diluiu com o aumento de escala.";
        b.push([L("Leitura: "), T(leit)]);
      }
    } else {
      var sf = vp == null ? "." : e.min === cur ? " — menor ticket " + DOANO + " (" + mesAnt + ": " + fBRL2(vp) + ", " + pctSig(vr) + ")." : e.max === cur ? " — maior ticket " + DOANO + " (" + mesAnt + ": " + fBRL2(vp) + ", " + pctSig(vr) + ")." : " (" + mesAnt + ": " + fBRL2(vp) + ", " + pctSig(vr) + ").";
      b.push([L(mes + " | Sul: "), B(fBRL2(v)), T(sf)]);
      b.push([L("Cidades: "), T(rk[0].c.curto + " " + fBRL2(rk[0].v) + " é o maior; " + rk[1].c.curto + " " + fBRL2(rk[1].v) + "; " + rk[2].c.curto + " " + fBRL2(rk[2].v) + ", o menor do Sul.")]);
      var comAnt = rk.filter(function (r) { return r.ant; });
      if (comAnt.length === 3 && comAnt.every(function (r) { return r.v < r.ant; })) b.push([L("Atenção: "), T("as três cidades recuaram vs " + mesAnt + " — mix de serviços puxa o faturamento para baixo.")]);
      else if (comAnt.length === 3 && comAnt.every(function (r) { return r.v > r.ant; })) b.push([L("Leitura: "), T("as três cidades avançaram vs " + mesAnt + " — mix de serviços favorece o faturamento.")]);
      else if (comAnt.length === 3) {
        var pior = comAnt.slice().sort(function (a, c) { return varPct(a.v, a.ant) - varPct(c.v, c.ant); })[0];
        if (varPct(pior.v, pior.ant) <= -0.08) b.push([L("Atenção: "), T(pior.c.curto + " " + pctSig(varPct(pior.v, pior.ant)) + " vs " + mesAnt + " — verificar composição dos serviços atendidos.")]);
      }
    }
    if (res.comp) {
      // comparação com 2025: duas linhas de leitura + esta, pra caixa não estourar
      b = b.slice(0, 2);
      var S5 = res.serie25[proc.dict], soma = met === "fat";
      var agg = function (arr) { var t = arr.reduce(function (a, x) { return a + x; }, 0); return soma ? t : t / arr.length; };
      var v5 = S5.Sul[met][cur], vr5 = varPct(v, v5), a1 = agg(sul), a5 = agg(S5.Sul[met]), ar5 = varPct(a1, a5);
      var cid = CIDADES.map(function (c) { var q = varPct(S[c.chave][met][cur], S5[c.chave][met][cur]); return c.curto + " " + (q == null ? "—" : pctSig(q)); });
      var per = res.meses.length > 1 ? nomeMesMin(res.meses[0]).slice(0, 3) + "–" + nomeMesMin(res.meses[cur]).slice(0, 3) : nomeMesMin(res.meses[0]);
      b.push([L("Vs 2025: "), T(nomeMesMin(res.meses[cur]) + " " + M.fmt(v) + " contra " + M.fmt(v5) + (vr5 == null ? "" : " (" + pctSig(vr5) + ")") +
        (res.parcial ? ", mesmos dias de 2025" : "") + "; " + per + " " + (soma ? "acumulado " : "média ") + (ar5 == null ? "—" : pctSig(ar5)) + ". Cidades: " + cid.join(", ") + ".")]);
    }
    return b;
  }

  // ---------- slides ----------
  function cabecalho(pptx, s, titulo, rotuloEsq) {
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.53, w: 5.6, h: 0.5, fill: { color: "000000" }, line: { color: "000000", width: 0 } });
    s.addText(rotuloEsq, { x: 0, y: 0.53, w: 5.6, h: 0.5, fontFace: "Calibri", fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
    s.addShape(pptx.ShapeType.rect, { x: 13.6, y: 0, w: 6.4, h: 1.2, fill: { color: "3B3B3B" }, line: { color: "3B3B3B", width: 0 } });
    s.addText(titulo, { x: 13.6, y: 0.1, w: 6.4, h: 0.6, fontFace: "Calibri", fontSize: 24, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, fit: "shrink" });
    s.addText("Multiserviços Sul", { x: 13.6, y: 0.68, w: 6.4, h: 0.45, fontFace: "Calibri", fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
  }

  function slideMetrica(pptx, res, proc, met, img) {
    var S = res.series[proc.dict], M = METRICAS[met];
    var titulo = (met === "turnos" ? proc.tituloTurnos : M.nome) + (proc.dict === "Emergencial" ? " - Emergencial" : " – " + proc.nome);
    var s = pptx.addSlide();
    s.addImage(img("bg_dados.png", { x: -0.06, y: -0.06, w: 20.12, h: 11.37 }));
    cabecalho(pptx, s, titulo, (res.comp ? "2026 vs 2025" : "Mensal") + (res.parcial ? " · até " + res.fimTxt.slice(0, 5) : ""));
    var labels = res.meses.map(nomeMesMin);
    var grade = [[CIDADES[0], 0.4, 1.3], [CIDADES[1], 10.3, 1.3], [CIDADES[2], 0.4, 4.75], [SUL, 10.3, 4.75]];
    grade.forEach(function (g) {
      var c = g[0], x = g[1], y = g[2], vals = S[c.chave][met], v25 = res.comp ? res.serie25[proc.dict][c.chave][met] : [], mx = Math.max.apply(null, vals.concat(v25).concat([1]));
      var arred = function (q) { return Math.round(q * 100) / 100; };
      s.addText(c.nome, { x: x + 0.1, y: y, w: 8, h: 0.4, fontFace: "Calibri", fontSize: 16, bold: true, color: "262626", margin: 0 });
      var dadosGraf = res.comp ? [{ name: "2025", labels: labels, values: v25.map(arred) }, { name: "2026", labels: labels, values: vals.map(arred) }]
        : [{ name: M.nome, labels: labels, values: vals.map(arred) }];
      s.addChart(pptx.charts.BAR, dadosGraf, {
        x: x, y: y + 0.35, w: 9.3, h: 3.05, barDir: "col", barGapWidthPct: res.comp ? 40 : 55, chartColors: res.comp ? [COR_ANO_ANT, c.cor] : [c.cor],
        showLegend: !!res.comp, legendPos: "t", legendFontSize: 11, legendColor: "404040",
        valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: mx * 1.22, valGridLine: { style: "none" }, catGridLine: { style: "none" },
        catAxisLabelFontSize: 11, catAxisLabelColor: "808080", catAxisLineShow: false,
        showValue: true, dataLabelFontSize: res.comp ? (met === "fat" ? 9 : 10) : 11, dataLabelFontBold: true, dataLabelColor: "404040", dataLabelPosition: "outEnd", dataLabelFormatCode: M.fmtLabel
      });
    });
    // caixa de Insights
    s.addShape(pptx.ShapeType.roundRect, { x: 0.42, y: 8.5, w: 19.16, h: 2.2, rectRadius: 0.12, fill: { color: "F3F9F4" }, line: { color: "2E7D32", width: 1 } });
    var tituloIns = "Insights — " + (met === "turnos" ? proc.tituloTurnos : M.nome) + " " + (proc.dict === "Emergencial" ? "Emergencial" : proc.nome.replace(/[()]/g, "").replace("Comercial ", "Comercial ")) + " (" + nomeMes(res.alvo) + ")";
    var runs = [{ text: tituloIns, options: { fontSize: 19, bold: true, color: "1B5E20", breakLine: true, paraSpaceAfter: 6 } }];
    insights(res, proc, met).forEach(function (bl) {
      bl.forEach(function (p, i) {
        var o = { fontSize: 17, color: p.k === "lead" ? "1B5E20" : "262626", bold: p.k === "lead" || p.k === "bold" };
        if (i === 0) { o.bullet = true; o.indentLevel = 0; }
        if (i === bl.length - 1) o.breakLine = true;
        runs.push({ text: p.t, options: o });
      });
    });
    if (met === "turnos" && res.somenteDiasNormais) {
      var fr = res.fracos[proc.dict], porMes = res.meses.map(function (mk) { var l = fr[mk] ? fr[mk].lista : []; return l.length ? nomeMesMin(mk).slice(0, 3) + ": " + l.length + (l.length === 1 ? " dia" : " dias") : null; }).filter(Boolean);
      s.addText("Média de turnos só com dias de operação normal (exclui dias com menos da metade do movimento típico do mês, como domingos e feriados)." + (porMes.length ? " Dias fora da conta — " + porMes.join(" · ") + ". Lista no anexo." : " Nenhum dia fora da conta neste processo."),
        { x: 0.45, y: 10.78, w: 19.1, h: 0.4, fontFace: "Calibri", fontSize: 11, italic: true, color: "6B6B6B", margin: 0, valign: "top" });
    }
    s.addText(runs, { x: 0.75, y: 8.62, w: 18.5, h: 2.0, fontFace: "Calibri", valign: "top", margin: 0, lineSpacingMultiple: 1.12 });
  }

  function slideCapa(pptx, res, img) {
    var s = pptx.addSlide();
    s.addImage(img("bg_capa.png", { x: 0, y: 0, w: 20, h: 11.25 }));
    s.addText("CONTRATO MULTISERVIÇOS SUL", { x: 1.4, y: 4.9, w: 17.5, h: 1.9, fontFace: "Calibri", fontSize: 80, bold: true, color: "1E1E1E", valign: "middle", margin: 0 });
    s.addText([
      { text: "GESTÃO DE CONTRATO", options: { breakLine: true } },
      { text: "ENEL CEARÁ", options: { breakLine: true } },
      { text: res.emitidoEm, options: {} }
    ], { x: 1.55, y: 6.8, w: 12, h: 2.7, fontFace: "Calibri Light", fontSize: 40, color: "A6A6A6", valign: "top", margin: 0, lineSpacingMultiple: 1.15 });
  }
  function slideAnexo(pptx, res, img) {
    var s = pptx.addSlide();
    s.addImage(img("bg_dados.png", { x: -0.06, y: -0.06, w: 20.12, h: 11.37 }));
    cabecalho(pptx, s, "Anexo — dias fora da média de turnos", "Só dias normais");
    var cab = function (t) { return { text: t, options: { bold: true, color: "FFFFFF", fill: { color: "1F5C99" }, align: "center" } }; };
    var linhas = [[cab("Processo"), cab("Mês"), cab("Dias fora da média (turnos trabalhados no dia)")]];
    PROCESSOS.forEach(function (p) {
      res.mesesTodos.forEach(function (mk) {
        var fr = res.fracos[p.dict][mk]; if (!fr || !fr.lista.length) return;
        var zebra = linhas.length % 2 ? "EEF2F9" : "FFFFFF";
        linhas.push([{ text: p.nome, options: { fill: { color: zebra } } }, { text: nomeMes(mk) + (res.comp ? " " + mk.slice(0, 4) : ""), options: { fill: { color: zebra } } },
          { text: fr.lista.map(function (l) { return l.dt.slice(8, 10) + "/" + l.dt.slice(5, 7) + " (" + l.trab + ")"; }).join(" · "), options: { fill: { color: zebra } } }]);
      });
    });
    if (linhas.length === 1) linhas.push([{ text: "—" }, { text: "—" }, { text: "Nenhum dia de baixa operação no período." }]);
    var fonte = linhas.length > 26 ? 10 : linhas.length > 18 ? 11 : 13;
    s.addTable(linhas, { x: 0.5, y: 1.5, w: 19, colW: [3.2, 2.3, 13.5], fontFace: "Calibri", fontSize: fonte, color: "262626", valign: "middle", margin: [0.03, 0.08, 0.03, 0.08], border: { type: "solid", pt: 0.5, color: "D0D0D0" } });
    s.addText("Critério: dia fraco = menos da metade dos turnos trabalhados do dia típico (mediana) do mês, somando Campos Sales, Juazeiro e Milagres. O número entre parênteses é o total de turnos trabalhados no Sul naquele dia.",
      { x: 0.5, y: 10.55, w: 19, h: 0.5, fontFace: "Calibri", fontSize: 11, italic: true, color: "6B6B6B", margin: 0 });
  }
  function slideImagem(pptx, arquivo, img) { var s = pptx.addSlide(); s.addImage(img(arquivo, { x: 0, y: 0, w: 20, h: 11.25 })); }

  function nomeArquivo(res) { return "CONTRATO SUL " + nomeMes(res.alvo).toUpperCase() + " " + res.alvo.slice(0, 4) + (res.parcial ? " (ate " + res.fimTxt.slice(0, 5).replace("/", "-") + ")" : "") + (res.comp ? " (comparativo 2025)" : "") + ".pptx"; }

  function gerar(ctx) {
    var res = calcular(ctx), base = ctx.assetBase || "";
    var img = function (n, pos) {
      var o = ctx.imagemData ? { data: ctx.imagemData(n) } : { path: base + "img/" + n };
      Object.keys(pos).forEach(function (k) { o[k] = pos[k]; });
      return o;
    };
    var pptx = new ctx.PptxGenJS();
    pptx.defineLayout({ name: "COSAMPA_16x9", width: 20, height: 11.25 }); pptx.layout = "COSAMPA_16x9";
    pptx.title = "Contrato Multiserviços Sul – " + nomeMes(res.alvo) + " " + res.alvo.slice(0, 4); pptx.company = "Grupo Cosampa";

    slideCapa(pptx, res, img);
    slideImagem(pptx, "missao.png", img);
    slideImagem(pptx, "valores.jpg", img);
    PROCESSOS.forEach(function (p) { p.ordem.forEach(function (m) { slideMetrica(pptx, res, p, m, img); }); });
    if (res.somenteDiasNormais) slideAnexo(pptx, res, img);
    slideImagem(pptx, "fim.png", img);

    return pptx.write({ outputType: "arraybuffer" }).then(function (buf) { return { arrayBuffer: buf, nomeArquivo: nomeArquivo(res), resumo: res }; });
  }

  root.PainelApresentacao = root.PainelApresentacao || {};
  root.PainelApresentacao.gerarContrato = gerar;
  root.PainelApresentacao.calcularContrato = calcular;
  root.PainelApresentacao.diasFracosContrato = diasFracosDetalhe;
  root.PainelApresentacao.insightsContrato = insights;
})(typeof window !== "undefined" ? window : globalThis);

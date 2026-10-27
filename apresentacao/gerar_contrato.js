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

    var mesesSet = {}, acc = {};
    PROCESSOS.forEach(function (p) { acc[p.dict] = {}; [SUL].concat(CIDADES).forEach(function (c) { acc[p.dict][c.chave] = {}; }); });

    for (var i = 0; i < rows.date.length; i++) {
      var dt = rows.date[i], mk = dt.slice(0, 7);
      if (mk < PRIMEIRO_MES || dt > limite) continue;
      var p = idxProc[rows.proc[i]], cid = idxCid[rows.centro[i]];
      if (!p || !cid || ctx.isExcluido(i)) continue;
      var t = ctx.isTrabalhou(i), f = ctx.isFaltou(i);
      mesesSet[mk] = true;
      [cid, "Sul"].forEach(function (k) {
        var m = acc[p.dict][k][mk] || (acc[p.dict][k][mk] = { val: 0, qtd: 0, den: 0, dias: {} });
        m.val += rows.valor[i]; m.qtd += rows.qtd[i];
        if (t) m.den++;
        if (t || f) { var d = m.dias[dt] || (m.dias[dt] = { esc: 0, trab: 0 }); d.esc++; if (t) d.trab++; }
      });
    }
    var meses = Object.keys(mesesSet).sort();
    if (!meses.length || meses[meses.length - 1] !== alvo) throw new Error("Sem dados de " + nomeMes(alvo) + " " + alvo.slice(0, 4) + " para montar o contrato");

    var series = {};
    PROCESSOS.forEach(function (p) {
      series[p.dict] = {};
      [SUL].concat(CIDADES).forEach(function (c) {
        var s = { turnos: [], fat: [], prod: [], ticket: [] };
        meses.forEach(function (mk) {
          var m = acc[p.dict][c.chave][mk] || { val: 0, qtd: 0, den: 0, dias: {} };
          var dias = Object.keys(m.dias).filter(function (x) { return m.dias[x].esc > 0; });
          s.turnos.push(dias.length ? dias.reduce(function (a, x) { return a + m.dias[x].trab; }, 0) / dias.length : 0);
          s.fat.push(m.val);
          s.prod.push(m.den ? m.qtd / m.den : 0);
          s.ticket.push(m.qtd ? m.val / m.qtd : 0);
        });
        series[p.dict][c.chave] = s;
      });
    });
    return { meses: meses, alvo: alvo, parcial: parcial, fimTxt: parcial ? brData(ontem) : "", series: series, emitidoEm: brData(iso(hoje)) };
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

    if (met === "turnos") {
      var tot = rk.reduce(function (a, r) { return a + r.v; }, 0);
      b.push([L(mes + " | Sul: "), B(fInt(v) + " turnos/dia"), T(". " + rk.map(function (r) { return r.c.curto + " " + fInt(r.v) + " (" + Math.round(r.v / tot * 100) + "%)"; }).join(", ") + ".")]);
      if (vr != null) {
        var t2 = (Math.abs(vr) < 0.01 ? "estável vs " + mesAnt + " (" + fInt(vp) + ")" : (vr < 0 ? "queda de " : "alta de ") + pctAbs(vr) + " vs " + mesAnt + " (" + fInt(vp) + ")");
        if (e.max !== cur) t2 += " e de " + pctAbs(varPct(v, sul[e.max])) + " vs o pico de " + nomeMesMin(res.meses[e.max]) + " (" + fInt(sul[e.max]) + ")"; else t2 += " — maior nível do ano";
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
        if (e.min === cur) t3 += " e menor patamar do ano — pico foi " + nomeMesMin(res.meses[e.max]) + ", com " + fMi(sul[e.max]);
        else if (e.max === cur) t3 += " e maior patamar do ano";
        else t3 += "; pico do ano em " + nomeMesMin(res.meses[e.max]) + " (" + fMi(sul[e.max]) + ")";
        b.push([L("Tendência: "), T(t3 + ".")]);
        var qf = rk.filter(function (r) { return r.ant && varPct(r.v, r.ant) <= -0.10; }).sort(function (a, c) { return varPct(a.v, a.ant) - varPct(c.v, c.ant); })[0];
        if (qf) b.push([L("Atenção: "), T(qf.c.curto + " caiu " + pctAbs(varPct(qf.v, qf.ant)) + " vs " + mesAnt + " (" + fMi(qf.ant) + " para " + fMi(qf.v) + "), a maior retração relativa do Sul.")]);
        else if (rk.every(function (r) { return r.ant && r.v >= r.ant; })) b.push([L("Leitura: "), T("as três cidades avançaram vs " + mesAnt + ".")]);
      }
    } else if (met === "prod") {
      var sufixo = vp == null ? "." : e.max === cur ? " — melhor marca do ano (" + mesAnt + ": " + fDec2(vp) + ")." : e.min === cur ? " — menor marca do ano (" + mesAnt + ": " + fDec2(vp) + ")." : " (" + mesAnt + ": " + fDec2(vp) + ", " + pctSig(vr) + ").";
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
      var sf = vp == null ? "." : e.min === cur ? " — menor ticket do ano (" + mesAnt + ": " + fBRL2(vp) + ", " + pctSig(vr) + ")." : e.max === cur ? " — maior ticket do ano (" + mesAnt + ": " + fBRL2(vp) + ", " + pctSig(vr) + ")." : " (" + mesAnt + ": " + fBRL2(vp) + ", " + pctSig(vr) + ").";
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
    cabecalho(pptx, s, titulo, res.parcial ? "Mensal · até " + res.fimTxt.slice(0, 5) : "Mensal");
    var labels = res.meses.map(nomeMesMin);
    var grade = [[CIDADES[0], 0.4, 1.3], [CIDADES[1], 10.3, 1.3], [CIDADES[2], 0.4, 4.75], [SUL, 10.3, 4.75]];
    grade.forEach(function (g) {
      var c = g[0], x = g[1], y = g[2], vals = S[c.chave][met], mx = Math.max.apply(null, vals.concat([1]));
      s.addText(c.nome, { x: x + 0.1, y: y, w: 8, h: 0.4, fontFace: "Calibri", fontSize: 16, bold: true, color: "262626", margin: 0 });
      s.addChart(pptx.charts.BAR, [{ name: M.nome, labels: labels, values: vals.map(function (q) { return Math.round(q * 100) / 100; }) }], {
        x: x, y: y + 0.35, w: 9.3, h: 3.05, barDir: "col", barGapWidthPct: 55, chartColors: [c.cor], showLegend: false,
        valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: mx * 1.22, valGridLine: { style: "none" }, catGridLine: { style: "none" },
        catAxisLabelFontSize: 11, catAxisLabelColor: "808080", catAxisLineShow: false,
        showValue: true, dataLabelFontSize: 11, dataLabelFontBold: true, dataLabelColor: "404040", dataLabelPosition: "outEnd", dataLabelFormatCode: M.fmtLabel
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
  function slideImagem(pptx, arquivo, img) { var s = pptx.addSlide(); s.addImage(img(arquivo, { x: 0, y: 0, w: 20, h: 11.25 })); }

  function nomeArquivo(res) { return "CONTRATO SUL " + nomeMes(res.alvo).toUpperCase() + " " + res.alvo.slice(0, 4) + (res.parcial ? " (ate " + res.fimTxt.slice(0, 5).replace("/", "-") + ")" : "") + ".pptx"; }

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
    slideImagem(pptx, "fim.png", img);

    return pptx.write({ outputType: "arraybuffer" }).then(function (buf) { return { arrayBuffer: buf, nomeArquivo: nomeArquivo(res), resumo: res }; });
  }

  root.PainelApresentacao = root.PainelApresentacao || {};
  root.PainelApresentacao.gerarContrato = gerar;
  root.PainelApresentacao.calcularContrato = calcular;
  root.PainelApresentacao.insightsContrato = insights;
})(typeof window !== "undefined" ? window : globalThis);

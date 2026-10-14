/* Gera a apresentação "Controle de Turnos" (Emergencial, Multiserviços Sul) a partir
   dos dados do painel. Carregado sob demanda pelo botão de download, junto com o
   pptxgen.bundle.js. As contas são as mesmas do painel (escalado = trabalhou + faltou,
   AAT = trabalhado ÷ escalado), pra o slide nunca divergir do que se vê na tela. */
(function (root) {
  "use strict";

  var PROCESSO = "Emergencial";
  var CENTROS = ["Campos Sales", "Juazeiro do Norte", "Milagres"];
  var MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  var COR = {
    barra: "EC6B35", linha: "F5A800", caixa: "3B3B3B", kpi: "FFC000", azul: "1F5C99", azulClaro: "E9ECF5",
    seg: "F2B2A0", sab: "E87530", dom: "C0592A", cinza: "7A7A7A", tracejado: "4A7EBB"
  };
  var PALETA_PIZZA = ["4F81BD", "C0504D", "9BBB59", "8064A2", "4BACC6", "F79646", "2C4D75", "772C2A", "5F7530", "4D3B62", "276A7C", "B65708"];
  var MAX_MOTIVOS = 10;

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function iso(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function brData(isoDia) { return isoDia.slice(8, 10) + "/" + isoDia.slice(5, 7) + "/" + isoDia.slice(0, 4); }
  function diaSemana(isoDia) { return new Date(+isoDia.slice(0, 4), +isoDia.slice(5, 7) - 1, +isoDia.slice(8, 10)).getDay(); }
  function ultimoDiaDoMes(isoDia) { return new Date(+isoDia.slice(0, 4), +isoDia.slice(5, 7), 0).getDate(); }
  function fmt2(v) { return v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtPct(v) { return v == null ? "—" : (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%"; }
  function media(arr) { return arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : null; }
  function curto(txt, n) { return txt.length > n ? txt.slice(0, n - 1).trim() + "…" : txt; }

  // ---------- cálculo ----------
  function calcular(ctx) {
    var rows = ctx.rows, D = ctx.dicts;
    var procIdx = D.processo.indexOf(PROCESSO);
    if (procIdx < 0) throw new Error('Processo "' + PROCESSO + '" não existe no dado');
    var nomeCentro = {};
    CENTROS.forEach(function (n) { var i = D.centro.indexOf(n); if (i >= 0) nomeCentro[i] = n; });

    var ultimoNoDado = "";
    for (var k = 0; k < rows.date.length; k++) if (rows.date[k] > ultimoNoDado) ultimoNoDado = rows.date[k];
    var hoje = ctx.hoje || new Date();
    var fim = iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1));
    if (ultimoNoDado && ultimoNoDado < fim) fim = ultimoNoDado;
    var mes = fim.slice(0, 7), inicio = mes + "-01";

    var porCentro = {}, motivos = {};
    CENTROS.forEach(function (n) { porCentro[n] = {}; motivos[n] = {}; });

    for (var i = 0; i < rows.date.length; i++) {
      var dt = rows.date[i];
      if (dt < inicio || dt > fim || rows.proc[i] !== procIdx) continue;
      var c = nomeCentro[rows.centro[i]];
      if (!c || ctx.isExcluido(i)) continue;
      var t = ctx.isTrabalhou(i), f = ctx.isFaltou(i);
      if (!t && !f) continue;
      var d = porCentro[c][dt] || (porCentro[c][dt] = { esc: 0, trab: 0 });
      d.esc++;
      if (t) d.trab++;
      if (f) {
        var m = rows.motivo && rows.motivo[i] >= 0 ? (D.motivo[rows.motivo[i]] || "").trim() : "";
        m = m || "(SEM MOTIVO PREENCHIDO)";
        motivos[c][m] = (motivos[c][m] || 0) + 1;
      }
    }

    var sul = {};
    CENTROS.forEach(function (c2) {
      Object.keys(porCentro[c2]).forEach(function (dt2) {
        var s = sul[dt2] || (sul[dt2] = { esc: 0, trab: 0 });
        s.esc += porCentro[c2][dt2].esc; s.trab += porCentro[c2][dt2].trab;
      });
    });
    var motivosSul = {};
    CENTROS.forEach(function (c3) { Object.keys(motivos[c3]).forEach(function (m2) { motivosSul[m2] = (motivosSul[m2] || 0) + motivos[c3][m2]; }); });

    var dias = Object.keys(sul).sort();
    if (!dias.length) throw new Error("Sem turnos de " + PROCESSO + " entre " + brData(inicio) + " e " + brData(fim));

    function resumo(diasMap) {
      var ds = Object.keys(diasMap).sort();
      var esc = ds.reduce(function (s, x) { return s + diasMap[x].esc; }, 0), trab = ds.reduce(function (s, x) { return s + diasMap[x].trab; }, 0);
      function mediaTipo(fn) { return media(ds.filter(function (x) { return fn(diaSemana(x)); }).map(function (x) { return diasMap[x].trab; })); }
      return {
        prevista: media(ds.map(function (x) { return diasMap[x].esc; })),
        realizada: media(ds.map(function (x) { return diasMap[x].trab; })),
        aat: esc ? trab / esc : null,
        segSex: mediaTipo(function (w) { return w >= 1 && w <= 5; }),
        sab: mediaTipo(function (w) { return w === 6; }),
        dom: mediaTipo(function (w) { return w === 0; })
      };
    }
    function serie(diasMap) {
      return {
        esc: dias.map(function (dt3) { return diasMap[dt3] ? diasMap[dt3].esc : 0; }),
        trab: dias.map(function (dt3) { return diasMap[dt3] ? diasMap[dt3].trab : 0; })
      };
    }
    function listaMotivos(mapa) {
      var l = Object.keys(mapa).map(function (k2) { return { motivo: k2, n: mapa[k2] }; })
        .sort(function (a, b) { return b.n - a.n || a.motivo.localeCompare(b.motivo, "pt-BR"); });
      var total = l.reduce(function (s, x) { return s + x.n; }, 0);
      if (l.length > MAX_MOTIVOS) {
        var resto = l.slice(MAX_MOTIVOS - 1);
        l = l.slice(0, MAX_MOTIVOS - 1);
        l.push({ motivo: "OUTROS (" + resto.length + " motivos)", n: resto.reduce(function (s, x) { return s + x.n; }, 0) });
      }
      return { itens: l, total: total };
    }

    var blocos = [{ nome: "Multiserviços Sul", chave: "Sul", resumo: resumo(sul), serie: serie(sul) }];
    CENTROS.forEach(function (c4) { blocos.push({ nome: c4, chave: c4, resumo: resumo(porCentro[c4]), serie: serie(porCentro[c4]) }); });

    var faltasPorCentro = CENTROS.map(function (c5) { return { motivo: c5.toUpperCase(), n: listaMotivos(motivos[c5]).total }; });

    return {
      inicio: inicio, fim: fim, mes: mes, dias: dias, blocos: blocos,
      motivos: CENTROS.map(function (c6) { return { centro: c6, dados: listaMotivos(motivos[c6]) }; }),
      motivosSul: listaMotivos(motivosSul), faltasPorCentro: faltasPorCentro,
      mesCompleto: +fim.slice(8, 10) === ultimoDiaDoMes(fim),
      mesNome: MESES[+mes.slice(5, 7) - 1], ano: mes.slice(0, 4),
      emitidoEm: brData(iso(hoje)), fonteEm: ctx.geradoEm || ""
    };
  }

  // ---------- slides ----------
  function periodoTexto(r) {
    var base = r.mesNome + " " + r.ano;
    return r.mesCompleto ? base : base + " · " + r.inicio.slice(8, 10) + " a " + r.fim.slice(8, 10) + "/" + r.fim.slice(5, 7);
  }

  function slideTurnos(pptx, r, bloco, todos, img) {
    var s = pptx.addSlide();
    s.addImage(img("bg_dados.png", { x: -0.06, y: -0.06, w: 20.12, h: 11.37 }));

    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.53, w: 5.6, h: 0.5, fill: { color: "000000" }, line: { color: "000000", width: 0 } });
    s.addText(periodoTexto(r), { x: 0, y: 0.53, w: 5.6, h: 0.5, fontFace: "Calibri", fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });

    s.addShape(pptx.ShapeType.rect, { x: 13.6, y: 0, w: 6.4, h: 1.2, fill: { color: COR.caixa }, line: { color: COR.caixa, width: 0 } });
    s.addText("Média de Turnos por dia - Emergencial", { x: 13.6, y: 0.1, w: 6.4, h: 0.6, fontFace: "Calibri", fontSize: 24, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
    s.addText(bloco.nome, { x: 13.6, y: 0.68, w: 6.4, h: 0.45, fontFace: "Calibri", fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });

    var labels = r.dias.map(function (dt) { return String(+dt.slice(8, 10)); });
    var maxY = Math.max.apply(null, bloco.serie.esc.concat([1]));
    s.addChart([
      { type: pptx.charts.BAR, data: [{ name: "Turnos realizados", labels: labels, values: bloco.serie.trab }], options: { chartColors: [COR.barra], barGapWidthPct: 30 } },
      { type: pptx.charts.LINE, data: [{ name: "Turnos previstos", labels: labels, values: bloco.serie.esc }], options: { chartColors: [COR.linha], lineSize: 3, lineDataSymbol: "circle", lineDataSymbolSize: 8 } }
    ], {
      x: 0.3, y: 1.3, w: 19.4, h: 4.4, showLegend: false, valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: Math.ceil(maxY * 1.2),
      valGridLine: { color: "E3E3E3", size: 0.75 }, catGridLine: { style: "none" }, catAxisLabelFontSize: 12, catAxisLabelColor: "7A7A7A", catAxisLineShow: false,
      showValue: true, dataLabelFontSize: 13, dataLabelFontBold: true, dataLabelColor: "000000", dataLabelFormatCode: "0"
    });

    var rs = bloco.resumo;
    var cab = function (t) { return { text: t, options: { bold: true, fill: { color: COR.kpi }, color: "000000", align: "center", valign: "middle", fontSize: 12 } }; };
    var val = function (t) { return { text: t, options: { fill: { color: "FFFFFF" }, color: "000000", align: "center", valign: "middle", fontSize: 13 } }; };
    s.addTable([[cab("Média Prevista"), cab("Média Realizada"), cab("AAT%")], [val(fmt2(rs.prevista)), val(fmt2(rs.realizada)), val(fmtPct(rs.aat))]],
      { x: 0.48, y: 5.78, w: 3.9, colW: [1.3, 1.3, 1.3], rowH: [0.55, 0.38], fontFace: "Calibri", border: { type: "solid", pt: 0.5, color: "D0D0D0" }, margin: 0.04 });

    s.addShape(pptx.ShapeType.line, { x: 0, y: 6.85, w: 20, h: 0, line: { color: COR.tracejado, width: 1, dashType: "dash" } });

    s.addText("Aderência de Turnos - Seg - Sex / Sáb / Dom", { x: 2.2, y: 7.05, w: 15.6, h: 0.4, fontFace: "Calibri", fontSize: 18, bold: true, color: "262626", align: "center", valign: "middle", margin: 0 });
    var cats = CENTROS.concat(["Sul"]);
    var blocoDe = function (chave) { return todos.filter(function (b) { return b.chave === chave; })[0].resumo; };
    var serieTipo = function (campo) { return cats.map(function (c) { return blocoDe(c)[campo]; }); };
    s.addChart(pptx.charts.BAR, [
      { name: "EC Média Turnos Seg-Sex", labels: cats, values: serieTipo("segSex") },
      { name: "EC Média Turnos Sábado", labels: cats, values: serieTipo("sab") },
      { name: "EC Média Turnos Domingo", labels: cats, values: serieTipo("dom") }
    ], {
      x: 2.2, y: 7.45, w: 15.6, h: 3.35, barDir: "col", barGrouping: "clustered", barGapWidthPct: 60, chartColors: [COR.seg, COR.sab, COR.dom],
      showLegend: true, legendPos: "b", legendFontSize: 11, legendColor: "404040", valAxisHidden: true, valAxisMinVal: 0, valGridLine: { style: "none" },
      catAxisLabelFontSize: 12, catAxisLabelColor: "262626", showValue: true, dataLabelFontSize: 12, dataLabelColor: "262626", dataLabelPosition: "outEnd", dataLabelFormatCode: "0.0"
    });

    var fonte = "Fonte: Painel Cosampa" + (r.fonteEm ? " · dados de " + r.fonteEm : "") + " · Emergencial · " + brData(r.inicio) + " a " + brData(r.fim);
    s.addText(fonte, { x: 0.3, y: 10.85, w: 14, h: 0.3, fontFace: "Calibri", fontSize: 10, color: COR.cinza, margin: 0 });
    return s;
  }

  function tabelaMotivos(pptx, s, titulo, bloco, x, y, rowH, fonte) {
    var cab = function (t, al) { return { text: t, options: { bold: true, color: "FFFFFF", fill: { color: COR.azul }, align: al || "center" } }; };
    var linhas = [[cab(titulo.toUpperCase()), cab("QUANTIDADE"), cab("%")]];
    bloco.itens.forEach(function (it, idx) {
      var fill = { color: idx % 2 ? "FFFFFF" : COR.azulClaro };
      linhas.push([
        { text: it.motivo, options: { fill: fill, align: "center" } },
        { text: String(it.n), options: { fill: fill, align: "center" } },
        { text: Math.round(it.n / bloco.total * 100) + "%", options: { fill: fill, align: "center" } }
      ]);
    });
    linhas.push([
      { text: "", options: { fill: { color: "FFFFFF" } } },
      { text: String(bloco.total), options: { bold: true, color: "FFFFFF", fill: { color: COR.azul }, align: "center" } },
      { text: "100%", options: { bold: true, color: "FFFFFF", fill: { color: COR.azul }, align: "center" } }
    ]);
    s.addTable(linhas, { x: x, y: y, w: 7.2, colW: [4.8, 1.3, 1.1], rowH: rowH, fontFace: "Calibri", fontSize: fonte, color: "000000", valign: "middle", margin: [0, 0.06, 0, 0.06], border: { type: "none" } });
  }

  function pizza(pptx, s, titulo, bloco, x, y, w, h) {
    var itens = bloco.itens;
    if (!itens.length) { s.addText(titulo + "\nsem faltas no período", { x: x, y: y, w: w, h: h, fontFace: "Calibri", fontSize: 14, color: COR.cinza, align: "center", valign: "middle" }); return; }
    s.addChart(pptx.charts.PIE, [{ name: titulo, labels: itens.map(function (i) { return curto(i.motivo, 34); }), values: itens.map(function (i) { return i.n; }) }], {
      x: x, y: y, w: w, h: h, chartColors: PALETA_PIZZA.slice(0, Math.max(itens.length, 1)), showTitle: true, title: titulo, titleFontSize: 18, titleColor: "262626", titleFontFace: "Calibri",
      showLegend: true, legendPos: "r", legendFontSize: 9, legendColor: "404040", showPercent: true, showValue: false, dataLabelFontSize: 10, dataLabelColor: "FFFFFF", dataLabelFontBold: true,
      dataLabelPosition: "inEnd", showLeaderLines: false
    });
  }

  function slideMotivos(pptx, r, img) {
    var s = pptx.addSlide();
    s.addImage(img("bg_capa.png", { x: 0, y: 0, w: 20, h: 11.25 }));
    s.addText("Motivos de falta de turno - Emergencial · " + periodoTexto(r), { x: 0.25, y: 0.25, w: 13, h: 0.6, fontFace: "Calibri", fontSize: 24, bold: true, color: "262626", margin: 0 });

    var linhasTotais = r.motivos.reduce(function (s2, m) { return s2 + (m.dados.itens.length ? m.dados.itens.length + 2 : 0); }, 0);
    var disponivel = 9.3 - (r.motivos.length - 1) * 0.3;
    var rowH = Math.min(0.32, disponivel / Math.max(linhasTotais, 1));
    var fonte = Math.max(8, Math.min(12, Math.round(rowH * 38)));
    var y = 1.15;
    r.motivos.forEach(function (m) {
      if (!m.dados.itens.length) return;
      tabelaMotivos(pptx, s, m.centro, m.dados, 0.25, y, rowH, fonte);
      y += (m.dados.itens.length + 2) * rowH + 0.3;
    });

    pizza(pptx, s, "Campos Sales", r.motivos[0].dados, 7.76, 1.0, 6.0, 3.6);
    pizza(pptx, s, "Milagres", r.motivos[2].dados, 13.7, 1.0, 6.2, 3.6);
    pizza(pptx, s, "Juazeiro do Norte", r.motivos[1].dados, 7.76, 4.8, 7.2, 4.6);
    var porCentro = { itens: r.faltasPorCentro.filter(function (x) { return x.n > 0; }).map(function (x) { return { motivo: x.motivo, n: x.n }; }) };
    pizza(pptx, s, "Multiserviços Sul", porCentro, 14.8, 4.8, 5.0, 3.8);
    return s;
  }

  function slideCapa(pptx, r, img) {
    var s = pptx.addSlide();
    s.addImage(img("bg_capa.png", { x: 0, y: 0, w: 20, h: 11.25 }));
    s.addText([
      { text: "MULTISERVIÇOS SUL", options: { fontSize: 72, bold: true, color: "000000", breakLine: true } },
      { text: " ", options: { fontSize: 30, breakLine: true } },
      { text: "CONTROLE DE TURNOS – " + r.mesNome + " " + r.ano, options: { fontSize: 48, bold: true, color: "000000", breakLine: true } },
      { text: "Emergencial · " + (r.mesCompleto ? "mês fechado" : "de " + brData(r.inicio).slice(0, 5) + " a " + brData(r.fim).slice(0, 5)), options: { fontSize: 28, color: "404040", paraSpaceBefore: 10, breakLine: true } },
      { text: " ", options: { fontSize: 24, breakLine: true } },
      { text: r.emitidoEm, options: { fontSize: 40, bold: true, color: "808080" } }
    ], { x: 1.08, y: 2.6, w: 17.8, h: 6.6, fontFace: "Arial", valign: "top", margin: 0 });
    return s;
  }

  function slideImagem(pptx, arquivo, img) {
    var s = pptx.addSlide();
    s.addImage(img(arquivo, { x: 0, y: 0, w: 20, h: 11.25 }));
    return s;
  }

  // PowerPoint não aceita a mesma posição de rótulo pras barras e pra linha, e a
  // biblioteca só deixa escolher uma pros dois -- então ajusto no XML: número
  // branco dentro da barra e o da linha acima do ponto
  function ajustarRotulos(xml) {
    if (xml.indexOf("<c:barChart>") < 0 || xml.indexOf("<c:lineChart>") < 0) return xml;
    function mexe(bloco, pos, cor) {
      return bloco.replace(/<c:dLbls>[\s\S]*?<\/c:dLbls>/g, function (d) {
        d = d.replace("<c:showLegendKey", '<c:dLblPos val="' + pos + '"/><c:showLegendKey');
        if (cor) d = d.replace(/(<a:defRPr[^>]*>\s*<a:solidFill>\s*<a:srgbClr val=")[0-9A-Fa-f]{6}/, "$1" + cor);
        return d;
      });
    }
    xml = xml.replace(/<c:barChart>[\s\S]*?<\/c:barChart>/, function (b) { return mexe(b, "inEnd", "FFFFFF"); });
    xml = xml.replace(/<c:lineChart>[\s\S]*?<\/c:lineChart>/, function (b) { return mexe(b, "t", null); });
    return xml;
  }

  function nomeArquivo(r) {
    var base = r.mesCompleto ? "Fechamento " + r.mesNome + " " + r.ano : r.mesNome + " " + r.ano + " (até " + r.fim.slice(8, 10) + "-" + r.fim.slice(5, 7) + ")";
    return "Abertura de turnos " + base + "_Multiserviços Sul.pptx";
  }

  function gerar(ctx) {
    var r = calcular(ctx);
    var base = ctx.assetBase || "";
    // no navegador a imagem vem por URL; no teste em Node, por base64 (imagemData)
    var img = function (n, pos) {
      var o = ctx.imagemData ? { data: ctx.imagemData(n) } : { path: base + "img/" + n };
      Object.keys(pos).forEach(function (k) { o[k] = pos[k]; });
      return o;
    };
    var pptx = new ctx.PptxGenJS();
    pptx.defineLayout({ name: "COSAMPA_16x9", width: 20, height: 11.25 });
    pptx.layout = "COSAMPA_16x9";
    pptx.title = "Controle de Turnos – " + r.mesNome + " " + r.ano;
    pptx.company = "Grupo Cosampa";

    slideCapa(pptx, r, img);
    slideImagem(pptx, "missao.png", img);
    slideImagem(pptx, "valores.jpg", img);
    r.blocos.forEach(function (b) { slideTurnos(pptx, r, b, r.blocos, img); });
    slideMotivos(pptx, r, img);
    slideImagem(pptx, "fim.png", img);

    return pptx.write({ outputType: "arraybuffer" }).then(function (buf) {
      return ctx.JSZip.loadAsync(buf);
    }).then(function (zip) {
      var alvos = Object.keys(zip.files).filter(function (n) { return /^ppt\/charts\/chart\d+\.xml$/.test(n); });
      return Promise.all(alvos.map(function (n) {
        return zip.file(n).async("string").then(function (xml) { zip.file(n, ajustarRotulos(xml)); });
      })).then(function () { return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }); });
    }).then(function (buf) {
      return { arrayBuffer: buf, nomeArquivo: nomeArquivo(r), resumo: r };
    });
  }

  root.PainelApresentacao = { gerar: gerar, calcular: calcular };
})(typeof window !== "undefined" ? window : globalThis);

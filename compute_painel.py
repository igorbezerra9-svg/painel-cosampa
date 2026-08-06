"""Reads the published Google Sheets CSVs and regenerates index.html from template.html.
Dumps row-level (columnar, dictionary-encoded) data so the page can filter and
recompute client-side, like Power BI slicers.
Run standalone: python compute_painel.py
"""
import json
import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd

BRASILIA = ZoneInfo("America/Sao_Paulo")

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "template.html")
OUTPUT = os.path.join(HERE, "index.html")
# Os dados saem num arquivo próprio, buscado pelo navegador em vez de embutido
# no index.html. Assim publicar a página (etapa que trava no GitHub Pages) só é
# necessário quando o template muda -- dado novo não depende de publicação.
DADOS = os.path.join(HERE, "dados.json")

# published "File > Share > Publish to web" CSV links, one per sheet tab
_PUB_ID = "2PACX-1vQBw3K_VdQ7nlyT69EG_DTTKlBj4V_6RYGNPMIRmCA2pRVu9GbWGu8GPYbxT6cieuS1SvLu1hm5O7L7"
OBRAS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/%s/pub?gid=2013581159&single=true&output=csv" % _PUB_ID
EC_CSV_URL = "https://docs.google.com/spreadsheets/d/e/%s/pub?gid=520154810&single=true&output=csv" % _PUB_ID

CENTRO_COL = "Centro de Serviço"


class Dict:
    """String -> small int code, built incrementally."""
    def __init__(self):
        self.values = []
        self.index = {}

    def code(self, v):
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return -1
        v = str(v)
        if v not in self.index:
            self.index[v] = len(self.values)
            self.values.append(v)
        return self.index[v]


def to_num(series):
    """Handles both plain '2.00' style numbers and Google Sheets' localized
    '98.757,75' (dot thousands, comma decimal) export for the same columns."""
    def parse(v):
        if pd.isna(v):
            return 0.0
        s = str(v).strip()
        if s == "" or s == "-":
            return 0.0
        if "," in s:
            s = s.replace(".", "").replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return 0.0
    return series.apply(parse)


def col_ci(df, name):
    """Case-insensitive column lookup — Google Sheets export changed the
    capitalization of a couple of headers (e.g. produtividade -> Produtividade)."""
    for c in df.columns:
        if c.strip().lower() == name.lower():
            return df[c]
    return pd.Series([None] * len(df))


def transform_ec(df, sup, centro, proc, equipe):
    df = df.copy()
    df["data"] = pd.to_datetime(df["data"], dayfirst=True, errors="coerce")
    df = df.dropna(subset=["data"])
    df["valor_total"] = to_num(df["valor_total"])
    df["meta_valor"] = to_num(df["meta_valor"])
    df["qtd_serv"] = to_num(df["qtd_serv"])
    df["meta_qtd"] = to_num(df["meta_qtd"])
    df["produtividade"] = to_num(col_ci(df, "produtividade"))
    # the model also carries a duplicate "Sul" copy of every row (a virtual
    # "combined" member) — we never materialize that here at all. Rows with a
    # blank Centro de Serviço are kept (they show up in unfiltered totals, same
    # as the report, and simply drop out once a specific centro is filtered).

    return {
        "date": df["data"].dt.strftime("%Y-%m-%d").tolist(),
        "sup": [sup.code(v) for v in df.get("Supervisor")],
        "centro": [centro.code(v) for v in df.get(CENTRO_COL)],
        "proc": [proc.code(v) for v in df.get("Processo")],
        "equipe": [equipe.code(v) for v in df.get("equipe")],
        "valor": df["valor_total"].round(2).tolist(),
        "meta": df["meta_valor"].round(2).tolist(),
        "qtd": df["qtd_serv"].round(2).tolist(),
        "metaQtd": df["meta_qtd"].round(2).tolist(),
        "prod": df["produtividade"].round(0).astype(int).tolist(),
    }


def transform_obras(df, sup, centro, proc, equipe):
    df = df.copy()
    df["dia_interv"] = pd.to_datetime(df["dia_interv"], dayfirst=True, errors="coerce")
    df = df.dropna(subset=["dia_interv"])
    df["valor_total"] = to_num(df["valor_total"])
    df["meta_valor"] = to_num(df["meta_valor"])
    df["qtd_serv"] = to_num(df["qtd_serv"])
    df["meta_qtd"] = to_num(df["meta_qtd"])

    def status_code(r):
        if r["valor_total"] > 0:
            return 0  # Trabalhou
        if r["valor_total"] == 0 and r["meta_valor"] > 0:
            return 1  # Faltou
        if r["valor_total"] == 0 and r["meta_valor"] == 0:
            return 2  # Folga
        return -1

    return {
        "date": df["dia_interv"].dt.strftime("%Y-%m-%d").tolist(),
        "sup": [sup.code(v) for v in df.get("Supervisor")],
        "centro": [centro.code(v) for v in df.get(CENTRO_COL)],
        "proc": [proc.code(v) for v in df.get("Processo")],
        "equipe": [equipe.code(v) for v in df.get("des_equipe_fis")],
        "valor": df["valor_total"].round(2).tolist(),
        "meta": df["meta_valor"].round(2).tolist(),
        "qtd": df["qtd_serv"].round(2).tolist(),
        "metaQtd": df["meta_qtd"].round(2).tolist(),
        "status": [status_code(r) for _, r in df.iterrows()],
    }


_CARIMBO_RE = re.compile(r'"generated":"[^"]*","sourceModified":"[^"]*"')


def mudou(caminho, conteudo_novo, ignorar_carimbo=False):
    """True se o arquivo no disco difere do conteúdo recém-gerado.

    Com ignorar_carimbo=True, desconsidera "generated"/"sourceModified", que
    recebem a hora da execução e portanto mudariam SEMPRE. Sem isso o guard
    "Nada para publicar" do update.yml nunca disparava: cada execução virava um
    commit mesmo sem dado novo -- ~72 publicações por dia à toa, que foi o que
    saturou a fila do GitHub Pages em 06/08.
    """
    if not os.path.exists(caminho):
        return True
    with open(caminho, "r", encoding="utf-8") as f:
        atual = f.read()
    if ignorar_carimbo:
        return _CARIMBO_RE.sub("", atual) != _CARIMBO_RE.sub("", conteudo_novo)
    return atual != conteudo_novo


def main():
    ec_raw = pd.read_csv(EC_CSV_URL)
    ob_raw = pd.read_csv(OBRAS_CSV_URL)

    sup, centro, proc, equipe = Dict(), Dict(), Dict(), Dict()
    ec = transform_ec(ec_raw, sup, centro, proc, equipe)

    obSup, obCentro, obProc, obEquipe = Dict(), Dict(), Dict(), Dict()
    ob = transform_obras(ob_raw, obSup, obCentro, obProc, obEquipe)

    now = datetime.now(BRASILIA).strftime("%d/%m/%Y %H:%M")
    data = {
        "generated": now,
        "sourceModified": now,
        "dicts": {"supervisor": sup.values, "centro": centro.values, "processo": proc.values, "equipe": equipe.values},
        "ec": ec,
        "obDicts": {"supervisor": obSup.values, "centro": obCentro.values, "processo": obProc.values, "equipe": obEquipe.values},
        "ob": ob,
    }

    with open(TEMPLATE, "r", encoding="utf-8") as f:
        html = f.read()

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    escritos = []

    # o index.html não carrega mais dado dentro, então só muda quando eu mexo
    # no template -- por isso a comparação aqui é direta, sem carimbo nenhum
    if mudou(OUTPUT, html):
        with open(OUTPUT, "w", encoding="utf-8") as f:
            f.write(html)
        escritos.append("index.html")

    # já o dados.json carrega o carimbo de hora, que muda a cada execução
    if mudou(DADOS, payload, ignorar_carimbo=True):
        with open(DADOS, "w", encoding="utf-8") as f:
            f.write(payload)
        escritos.append("dados.json")

    if not escritos:
        print("Sem mudança — nada a publicar.")
        return

    print("OK -> " + ", ".join(escritos))
    print("rows: ec=%d ob=%d  bytes=%d" % (len(ec["date"]), len(ob["date"]), len(payload)))
    print("ec dims: supervisor=%d centro=%d processo=%d equipe=%d" % (
        len(sup.values), len(centro.values), len(proc.values), len(equipe.values)))
    print("ob dims: supervisor=%d centro=%d processo=%d equipe=%d" % (
        len(obSup.values), len(obCentro.values), len(obProc.values), len(obEquipe.values)))


if __name__ == "__main__":
    main()

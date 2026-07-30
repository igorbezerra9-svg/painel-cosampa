"""Reads Faturamento.xlsx and regenerates painel.html from template.html.
Dumps row-level (columnar, dictionary-encoded) EC data so the page can filter and
recompute client-side, like Power BI slicers.
Run standalone: python compute_painel.py
"""
import json
import os
import re
from datetime import datetime

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "Faturamento.xlsx")
TEMPLATE = os.path.join(HERE, "template.html")
OUTPUT = os.path.join(HERE, "index.html")

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
    return pd.to_numeric(series, errors="coerce").fillna(0)


def transform_ec(df, sup, centro, proc, equipe):
    df = df.dropna(subset=["data"]).copy()
    df["data"] = pd.to_datetime(df["data"])
    df["valor_total"] = to_num(df["valor_total"])
    df["meta_valor"] = to_num(df["meta_valor"])
    df["qtd_serv"] = to_num(df["qtd_serv"])
    df["meta_qtd"] = to_num(df["meta_qtd"])
    df["produtividade"] = to_num(df.get("produtividade"))
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
    df = df.dropna(subset=["dia_interv"]).copy()
    df["dia_interv"] = pd.to_datetime(df["dia_interv"])
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


def main():
    xl = pd.ExcelFile(SRC)
    ec_raw = pd.read_excel(xl, sheet_name="Emergencial_Comercial")
    ob_raw = pd.read_excel(xl, sheet_name="Obras")

    sup, centro, proc, equipe = Dict(), Dict(), Dict(), Dict()
    ec = transform_ec(ec_raw, sup, centro, proc, equipe)

    obSup, obCentro, obProc, obEquipe = Dict(), Dict(), Dict(), Dict()
    ob = transform_obras(ob_raw, obSup, obCentro, obProc, obEquipe)

    data = {
        "generated": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "sourceModified": datetime.fromtimestamp(os.path.getmtime(SRC)).strftime("%d/%m/%Y %H:%M"),
        "dicts": {"supervisor": sup.values, "centro": centro.values, "processo": proc.values, "equipe": equipe.values},
        "ec": ec,
        "obDicts": {"supervisor": obSup.values, "centro": obCentro.values, "processo": obProc.values, "equipe": obEquipe.values},
        "ob": ob,
    }

    with open(TEMPLATE, "r", encoding="utf-8") as f:
        html = f.read()

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    html = re.sub(r"/\*__DATA_JSON__\*/.*?/\*__END_DATA_JSON__\*/", lambda m: payload, html, flags=re.S)

    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(html)

    print("OK ->", OUTPUT)
    print("rows: ec=%d ob=%d  bytes=%d" % (len(ec["date"]), len(ob["date"]), len(payload)))
    print("ec dims: supervisor=%d centro=%d processo=%d equipe=%d" % (
        len(sup.values), len(centro.values), len(proc.values), len(equipe.values)))
    print("ob dims: supervisor=%d centro=%d processo=%d equipe=%d" % (
        len(obSup.values), len(obCentro.values), len(obProc.values), len(obEquipe.values)))


if __name__ == "__main__":
    main()

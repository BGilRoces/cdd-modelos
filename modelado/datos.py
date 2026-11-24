import hashlib
import json
import sqlite3

import numpy as np
import pandas as pd

from . import config as cfg


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def verificar_hashes():
    manifiesto_mart = json.loads((cfg.MART.parent / "manifest.json").read_text(encoding="utf-8"))
    manifiesto_feat = json.loads((cfg.FEATURES.parent / "manifest.json").read_text(encoding="utf-8"))
    controles = [
        (cfg.MART, manifiesto_mart["sqlite_sha256"]),
        (cfg.FEATURES, manifiesto_feat["sqlite_sha256"]),
    ]
    for ruta, esperado in controles:
        real = sha256(ruta)
        if real != esperado:
            raise ValueError(f"El hash de {ruta.name} no coincide con su manifiesto")
    return {ruta.name: esperado for ruta, esperado in controles}


def _leer(ruta, consulta):
    con = sqlite3.connect(ruta.resolve().as_uri() + "?mode=ro", uri=True)
    try:
        return pd.read_sql_query(consulta, con)
    finally:
        con.close()


def columnas_comerciales():
    comerciales = []
    for prefijo in ("requested_", "offered_", "matched_"):
        comerciales += [prefijo + f for f in cfg.FAMILIAS]
    comerciales += [
        "anchor_useful_text_chars",
        "requested_family_count", "offered_family_count", "matched_family_count",
        "request_family_detected", "request_family_not_detected",
        "offer_family_detected", "offer_family_not_detected",
        "request_text_available", "has_matching_family",
        "has_unmatched_request", "has_additional_offer",
    ]
    return comerciales


def bloques_de_variables(columnas=None):
    f = cfg.FAMILIAS
    bloques = {
        "Operativas": list(cfg.OPERATIVAS),
        "Familia pedida": ["requested_" + x for x in f] + [
            "requested_family_count", "request_family_detected", "request_family_not_detected"],
        "Familia ofrecida": ["offered_" + x for x in f] + [
            "offered_family_count", "offer_family_detected", "offer_family_not_detected",
            "has_additional_offer"],
        "Coincidencia": ["matched_" + x for x in f] + [
            "matched_family_count", "has_matching_family", "has_unmatched_request"],
        "Texto del ancla": ["anchor_useful_text_chars", "request_text_available"],
    }
    if columnas is None:
        return bloques
    columnas = set(columnas)
    recortados = {n: [c for c in cs if c in columnas] for n, cs in bloques.items()}
    return {n: cs for n, cs in recortados.items() if cs}


def grupos_de_variables():
    operativas = list(cfg.OPERATIVAS)
    completo = operativas + columnas_comerciales()
    sin_largo = [c for c in completo if c not in cfg.LARGO_DE_TEXTO]
    return {
        "operativas": operativas,
        "completo": completo,
        "operativas_sin_largo": [c for c in operativas if c in sin_largo],
        "completo_sin_largo": sin_largo,
    }


def cargar_episodios():
    feats = _leer(cfg.FEATURES, """
        select episode_key, anchor_at, available_through, feature_version, features_json
        from episode_features_v3""")
    mart = _leer(cfg.MART, """
        select e.episode_key, e.session_key, e.anchor_at as anchor_mart, e.horizon_end,
               o.label_status, o.human_replied_24h, o.customer_returned_24h, s.contact_key, s.origin_key
        from fact_episode e
        join fact_episode_outcome o on o.episode_key = e.episode_key
        join fact_session s on s.session_key = e.session_key""")
    df = feats.merge(mart, on="episode_key", how="inner", validate="one_to_one")
    if len(df) != len(feats):
        raise ValueError("Hay episodios con features que no existen en el mart")
    matriz = pd.DataFrame([json.loads(t) for t in df.pop("features_json")])
    return df, matriz


def validar(df, matriz):
    problemas = []
    if df.episode_key.duplicated().any():
        problemas.append("episode_key repetido")
    if (df.anchor_at != df.anchor_mart).any():
        problemas.append("anchor_at distinto entre features y mart")
    if (df.feature_version != cfg.VERSION_FEATURES).any():
        problemas.append("versión de features inesperada")
    if (pd.to_datetime(df.available_through) > pd.to_datetime(df.anchor_at)).any():
        problemas.append("hay features disponibles después del ancla")
    esperadas = set(grupos_de_variables()["completo"])
    if set(matriz.columns) != esperadas or len(matriz.columns) != 58:
        faltan = sorted(esperadas - set(matriz.columns))
        sobran = sorted(set(matriz.columns) - esperadas)
        problemas.append(f"esquema de 58 variables distinto (faltan {faltan}, sobran {sobran})")
    elif not np.isfinite(matriz.to_numpy(dtype=float)).all():
        problemas.append("hay valores no finitos")
    if problemas:
        raise ValueError("; ".join(problemas))


def cohorte_madura(df, matriz):
    marca = (df.label_status == "mature") & df.human_replied_24h.notna()
    df = df.loc[marca].reset_index(drop=True)
    matriz = matriz.loc[marca.to_numpy()].reset_index(drop=True)
    if len(df) != cfg.COHORTE:
        raise ValueError(f"La cohorte madura tiene {len(df)} episodios, se esperaban {cfg.COHORTE}")
    for col in ("anchor_at", "horizon_end"):
        df[col] = pd.to_datetime(df[col])
    df["human_replied_24h"] = df.human_replied_24h.astype(int)
    df["customer_returned_24h"] = df.customer_returned_24h.astype(int)
    return df, matriz


def cargar_mensajes():
    return _leer(cfg.MART, """
        select session_key, event_at_utc, direction, message_type, human_author
        from fact_message where session_key is not null""")


def indicadores_atencion(episodios, mensajes):
    """Atención humana observada en las 24 h posteriores al ancla.

    Se usa sólo para evaluar el ranking; nunca entra como variable del modelo.
    """
    m = mensajes.merge(
        episodios[["episode_key", "session_key", "anchor_at", "horizon_end"]], on="session_key"
    )
    hora = pd.to_datetime(m.event_at_utc, utc=True).dt.tz_localize(None)
    m["hora_local"] = hora + pd.Timedelta(hours=cfg.DESFASE_LOCAL_HORAS)
    humano = (
        (m.direction == "outbound")
        & (m.human_author == 1)
        & (m.hora_local > m.anchor_at)
        & (m.hora_local <= m.horizon_end)
    )
    m = m.loc[humano].assign(adjunto=lambda x: x.message_type.isin(cfg.TIPOS_ADJUNTO).astype(int))
    por_episodio = m.groupby("episode_key").agg(
        mensajes_humanos=("adjunto", "size"), adjuntos_humanos=("adjunto", "sum")
    )
    out = episodios[["episode_key"]].merge(
        por_episodio, left_on="episode_key", right_index=True, how="left"
    )
    out[["mensajes_humanos", "adjuntos_humanos"]] = (
        out[["mensajes_humanos", "adjuntos_humanos"]].fillna(0).astype(int)
    )
    out["con_adjuntos"] = (out.adjuntos_humanos > 0).astype(int)
    return out.set_index("episode_key")

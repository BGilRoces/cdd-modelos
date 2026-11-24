import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score

from . import config as cfg

# Productos que la empresa impulsa con publicidad y deriva a atención humana.
IMPULSADOS = ("ambos", "chalecos")
ORIGENES_ANUNCIO = ("ad_observed", "ad_inferred_business_rule")


def es_impulsado(matriz):
    """Chats donde se pidió u ofreció alguno de los productos impulsados."""
    columnas = [f"{rol}_{p}" for rol in ("requested", "offered") for p in IMPULSADOS]
    return (matriz[columnas] > 0).any(axis=1)


def metricas_por_segmento(y, score, impulsado):
    y = np.asarray(y)
    score = np.asarray(score)
    impulsado = np.asarray(impulsado, dtype=bool)
    filas = []
    for nombre, marca in (("todos", np.ones(len(y), bool)), ("impulsados", impulsado), ("resto", ~impulsado)):
        yy, ss = y[marca], score[marca]
        dos_clases = len(np.unique(yy)) == 2
        filas.append({
            "segmento": nombre,
            "chats": int(marca.sum()),
            "con_humano": int(yy.sum()),
            "prevalencia": float(yy.mean()),
            "average_precision": average_precision_score(yy, ss) if dos_clases else np.nan,
            "roc_auc": roc_auc_score(yy, ss) if dos_clases else np.nan,
        })
    return filas


def evolucion_mensual(df, matriz):
    """Volumen, anuncios, mezcla de productos y respuesta humana por mes del ancla."""
    mes = df.anchor_at.dt.to_period("M").astype(str)
    anuncio = df.origin_key.isin(ORIGENES_ANUNCIO)
    duracion = matriz.prefix_duration_seconds
    tabla = pd.DataFrame({
        "chats": mes.value_counts().sort_index(),
        "con_anuncio": anuncio.groupby(mes).mean(),
        "con_humano": df.human_replied_24h.groupby(mes).mean(),
        "pide_ambos": (matriz.requested_ambos > 0).groupby(mes).mean(),
        "pide_broches": (matriz.requested_broches > 0).groupby(mes).mean(),
        "duracion_mediana_s": duracion.groupby(mes).median(),
        "duracion_hasta_7_5s": (duracion <= 7.5).groupby(mes).mean(),
    })
    tabla.index.name = "mes"
    return tabla.reset_index()


def composicion_entrenamiento(df, particion):
    """Parte de cada mes dentro de cada partición."""
    mes = df.anchor_at.dt.to_period("M").astype(str).rename("mes")
    return pd.crosstab(mes, particion.rename("particion"))


# Niveles de la cola de prioridad: posición en el ranking, no probabilidad (los puntajes no están calibrados).
NIVELES = (("Alta", 0.0, 0.3), ("Media", 0.3, 0.5), ("Baja", 0.5, 0.7), ("Base", 0.7, 1.0))


def niveles_de_prioridad(y, score, niveles=NIVELES):
    """Cuántos chats de cada nivel terminan con una persona, según su posición en el ranking."""
    y = np.asarray(y)
    score = np.asarray(score)
    azar = np.random.default_rng(cfg.SEMILLA).permutation(len(y))
    orden = np.lexsort((azar, -score))
    posicion = np.empty(len(y))
    posicion[orden] = np.arange(len(y)) / len(y)
    total = y.sum()
    filas = []
    for nombre, desde, hasta in niveles:
        marca = (posicion >= desde) & (posicion < hasta)
        k = int(y[marca].sum())
        filas.append({
            "nivel": nombre, "desde": desde, "hasta": hasta, "chats": int(marca.sum()),
            "con_persona": k, "tasa": k / marca.sum(),
            "parte_de_los_con_persona": k / total,
        })
    return pd.DataFrame(filas)

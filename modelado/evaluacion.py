import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    accuracy_score, average_precision_score, brier_score_loss, confusion_matrix,
    f1_score, precision_score, recall_score, roc_auc_score,
)

from . import config as cfg


def metricas(y, score, umbral=cfg.UMBRAL):
    y = np.asarray(y)
    score = np.asarray(score)
    pred = (score >= umbral).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    dos_clases = len(np.unique(y)) == 2
    return {
        "n": int(len(y)),
        "prevalencia": float(y.mean()),
        "umbral": float(umbral),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
        "accuracy": accuracy_score(y, pred),
        "precision": precision_score(y, pred, zero_division=0),
        "recall": recall_score(y, pred, zero_division=0),
        "f1": f1_score(y, pred, zero_division=0),
        "average_precision": average_precision_score(y, score) if dos_clases else np.nan,
        "roc_auc": roc_auc_score(y, score) if dos_clases else np.nan,
        "brier": brier_score_loss(y, score),
    }


def umbral_por_f1(y, score):
    candidatos = np.unique(np.quantile(score, np.linspace(0.02, 0.98, 97)))
    mejor, mejor_f1 = cfg.UMBRAL, -1.0
    for u in candidatos:
        f1 = f1_score(y, (score >= u).astype(int), zero_division=0)
        if f1 > mejor_f1:
            mejor, mejor_f1 = float(u), f1
    return mejor


def intervalo_por_contacto(y, score, contactos, estadistico, repeticiones=cfg.REPETICIONES_BOOTSTRAP):
    """Bootstrap que remuestrea contactos completos, no episodios sueltos."""
    y = np.asarray(y)
    score = np.asarray(score)
    codigos, _ = pd.factorize(np.asarray(contactos))
    indices = [np.flatnonzero(codigos == i) for i in range(codigos.max() + 1)]
    azar = np.random.default_rng(cfg.SEMILLA)
    valores = []
    for _ in range(repeticiones):
        elegidos = azar.integers(0, len(indices), len(indices))
        fila = np.concatenate([indices[i] for i in elegidos])
        if len(np.unique(y[fila])) < 2:
            continue
        valores.append(estadistico(y[fila], score[fila]))
    return tuple(np.percentile(valores, [2.5, 97.5]))


def diferencia_por_contacto(y, score_a, score_b, contactos, estadistico,
                            repeticiones=cfg.REPETICIONES_BOOTSTRAP):
    """Diferencia a - b de una métrica, con intervalo que remuestrea contactos."""
    y = np.asarray(y)
    score_a = np.asarray(score_a)
    score_b = np.asarray(score_b)
    codigos, _ = pd.factorize(np.asarray(contactos))
    indices = [np.flatnonzero(codigos == i) for i in range(codigos.max() + 1)]
    azar = np.random.default_rng(cfg.SEMILLA)
    diferencias = []
    for _ in range(repeticiones):
        fila = np.concatenate([indices[i] for i in azar.integers(0, len(indices), len(indices))])
        if len(np.unique(y[fila])) < 2:
            continue
        diferencias.append(estadistico(y[fila], score_a[fila]) - estadistico(y[fila], score_b[fila]))
    observada = estadistico(y, score_a) - estadistico(y, score_b)
    return observada, *np.percentile(diferencias, [2.5, 97.5])


def importancia_por_bloque(modelo, x, y, bloques, estadistico, repeticiones=20):
    """Caída de la métrica al permutar juntas todas las columnas de un bloque."""
    azar = np.random.default_rng(cfg.SEMILLA)
    base = estadistico(y, modelo.predict_proba(x)[:, 1])
    caidas = {}
    for nombre, columnas in bloques.items():
        valores = []
        for _ in range(repeticiones):
            copia = x.copy()
            copia[columnas] = x[columnas].to_numpy()[azar.permutation(len(x))]
            valores.append(base - estadistico(y, modelo.predict_proba(copia)[:, 1]))
        caidas[nombre] = float(np.mean(valores))
    return pd.Series(caidas)


def primer_episodio_por_contacto(df):
    return df.sort_values("anchor_at").groupby("contact_key").head(1).index


def curva_calibracion(y, score, bandas=10):
    observado, predicho = calibration_curve(y, score, n_bins=bandas, strategy="quantile")
    return pd.DataFrame({"predicho": predicho, "observado": observado})


def ranking_vs_atencion(score, atencion, y, grupos=5):
    """Compara el ranking del modelo con la atención humana realmente observada."""
    azar = np.random.default_rng(cfg.SEMILLA).permutation(len(score))
    orden = np.lexsort((azar, -np.asarray(score)))
    posicion = np.empty(len(score), dtype=int)
    posicion[orden] = np.arange(len(score))
    tramo = pd.Series(posicion * grupos // len(score), name="tramo")
    t = atencion.reset_index(drop=True).assign(respondido=np.asarray(y), tramo=tramo)
    resumen = t.groupby("tramo").agg(
        episodios=("respondido", "size"),
        tasa_respuesta=("respondido", "mean"),
        mensajes_humanos=("mensajes_humanos", "mean"),
        con_adjuntos=("con_adjuntos", "mean"),
    )
    resumen.index = [f"Q{i + 1}" for i in resumen.index]
    rho = pd.Series(score).corr(t.mensajes_humanos, method="spearman")
    return resumen, float(rho)

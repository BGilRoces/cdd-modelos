"""Arma presentacion/presentacion.html: un único archivo que corre offline.

Reentrena con la configuración elegida, exporta los modelos a JSON y los incrusta
junto con los resultados agregados. No incluye filas de episodios.
"""
import argparse
import ast
import json
from pathlib import Path

import numpy as np
import pandas as pd

from . import config as cfg
from . import datos, evaluacion, modelos, particiones

GRUPO = "completo_sin_largo"
PRESENTACION = cfg.RAIZ / "presentacion"
ETIQUETAS = {
    "prefix_messages": "Mensajes hasta la respuesta del bot",
    "prefix_inbound": "Mensajes del cliente",
    "prefix_bot_messages": "Mensajes del bot",
    "prefix_duration_seconds": "Duración hasta la respuesta del bot (segundos)",
    "hour": "Hora",
    "weekday": "Día de la semana",
    "business_hours": "Dentro del horario de atención",
    "inbound_text_messages": "Mensajes de texto del cliente",
    "inbound_nontext_messages": "Fotos o audios del cliente",
    "requested_family_count": "Cantidad de familias pedidas",
    "offered_family_count": "Cantidad de familias ofrecidas",
    "matched_family_count": "Cantidad de familias que coinciden",
    "request_family_detected": "Se detectó qué pidió",
    "request_family_not_detected": "No se detectó qué pidió",
    "offer_family_detected": "Se detectó qué ofreció el bot",
    "offer_family_not_detected": "No se detectó qué ofreció el bot",
    "request_text_available": "Hay texto del cliente",
    "has_matching_family": "El bot ofreció algo de lo pedido",
    "has_unmatched_request": "Pidió algo que el bot no ofreció",
    "has_additional_offer": "El bot ofreció algo no pedido",
}
NOMBRES_FAMILIAS = {
    "abrojos": "Abrojos", "ambos": "Ambos", "botones": "Botones", "broches": "Broches",
    "chalecos": "Chalecos", "cierres": "Cierres", "cintas": "Cintas", "elasticos": "Elásticos",
    "entretelas": "Entretelas", "etiquetas": "Etiquetas", "hilos": "Hilos", "telas": "Telas",
}
for _f, _n in NOMBRES_FAMILIAS.items():
    ETIQUETAS[f"requested_{_f}"] = f"Pidió {_n.lower()}"
    ETIQUETAS[f"offered_{_f}"] = f"El bot ofreció {_n.lower()}"
    ETIQUETAS[f"matched_{_f}"] = f"Pidió y se le ofreció {_n.lower()}"


def _valor(texto):
    try:
        return ast.literal_eval(texto)
    except (ValueError, SyntaxError):
        return texto


def _redondear(valores, decimales=6):
    return [round(float(v), decimales) for v in valores]


def exportar_arbol(arbol, con_muestras=False):
    a = arbol.tree_
    conteo = a.value[:, 0, :]
    prob = conteo[:, 1] / conteo.sum(axis=1)
    hoja = a.feature < 0
    salida = {
        "f": [int(-1 if h else f) for f, h in zip(a.feature, hoja)],
        "t": _redondear(np.where(hoja, 0.0, a.threshold)),
        "l": [int(v) for v in a.children_left],
        "r": [int(v) for v in a.children_right],
        "p": _redondear(np.where(hoja, prob, 0.0)),
    }
    if con_muestras:
        salida["n"] = [int(v) for v in a.n_node_samples]
        salida["pn"] = _redondear(prob)
    return salida


def exportar_mlp(pipeline):
    escala = pipeline.named_steps["escala"]
    red = pipeline.named_steps["red"]
    return {
        "media": _redondear(escala.mean_, 10),
        "escala": _redondear(escala.scale_, 10),
        "pesos": [[_redondear(fila, 10) for fila in w] for w in red.coefs_],
        "sesgos": [_redondear(b, 10) for b in red.intercepts_],
    }


def entrenar_elegidos(df, matriz, columnas, configuracion):
    mascara = {p: (df.particion == p).to_numpy() for p in ("train", "test")}
    y = df.human_replied_24h.to_numpy()
    ajustados = {}
    for nombre in modelos.NOMBRES:
        parametros = {k: _valor(v) for k, v in configuracion["configuraciones_elegidas"][f"{GRUPO}/{nombre}"].items()}
        modelo = modelos.crear(nombre, **parametros)
        ajustados[nombre] = modelo.fit(matriz.loc[mascara["train"], columnas], y[mascara["train"]])
    return ajustados, mascara, y


def verificar_contra_resultados(ajustados, matriz, columnas, mascara, y, salida):
    metricas = pd.read_csv(salida / "metricas.csv")
    base = metricas[(metricas.grupo == GRUPO) & (metricas.particion == "test") & (metricas.umbral_tipo == "fijo")]
    from sklearn.metrics import average_precision_score
    for nombre, modelo in ajustados.items():
        ap = average_precision_score(y[mascara["test"]], modelo.predict_proba(matriz.loc[mascara["test"], columnas])[:, 1])
        esperado = float(base[base.modelo == nombre].average_precision.iloc[0])
        if abs(ap - esperado) > 1e-6:
            raise ValueError(f"{nombre}: la Average Precision reentrenada ({ap:.6f}) no coincide con resultados/ ({esperado:.6f})")


def exportar_modelos(df, matriz, columnas, ajustados, mascara):
    test_x = matriz.loc[mascara["test"], columnas]
    cuantiles = {n: _redondear(np.quantile(m.predict_proba(test_x)[:, 1], np.linspace(0, 1, 101)), 5)
                 for n, m in ajustados.items()}
    dummy = ajustados["dummy"].predict_proba(test_x.iloc[:1])[0, 1]
    granularidad = {}
    for nombre in ("arbol", "bosque", "mlp"):
        frecuencias = pd.Series(ajustados[nombre].predict_proba(test_x)[:, 1]).round(6).value_counts()
        granularidad[nombre] = {"distintos": int(len(frecuencias)),
                                "mayor_empate": round(float(frecuencias.iloc[0] / len(test_x)), 4)}
    return {
        "granularidad": granularidad,
        "dummy": {"p": round(float(dummy), 6)},
        "arbol": exportar_arbol(ajustados["arbol"], con_muestras=True),
        "bosque": [exportar_arbol(a) for a in ajustados["bosque"].estimators_],
        "mlp": exportar_mlp(ajustados["mlp"]),
        "cuantiles_test": cuantiles,
    }


def resultados_agregados(df, matriz, salida):
    y = df.human_replied_24h
    familias = []
    for f in cfg.FAMILIAS:
        pidio = matriz[f"requested_{f}"] > 0
        familias.append({"id": f, "nombre": NOMBRES_FAMILIAS[f], "episodios": int(pidio.sum()),
                         "tasa": round(float(y[pidio].mean()), 4) if pidio.any() else None})
    largo = []
    for valor, cant in matriz.inbound_text_chars.value_counts().head(3).items():
        marca = matriz.inbound_text_chars == valor
        pedidos = {f: float((matriz.loc[marca, f"requested_{f}"] > 0).mean()) for f in cfg.FAMILIAS}
        familia = max(pedidos, key=pedidos.get)
        largo.append({"caracteres": int(valor), "episodios": int(cant),
                      "porcentaje": round(float(cant) / len(df), 4), "tasa": round(float(y[marca].mean()), 4),
                      "familia": NOMBRES_FAMILIAS[familia], "parte_familia": round(pedidos[familia], 4)})
    metricas = pd.read_csv(salida / "metricas.csv")
    prueba = metricas[(metricas.particion == "test") & (metricas.umbral_tipo == "fijo")]
    intervalos = pd.read_csv(salida / "intervalos_test.csv")
    tabla = {}
    for grupo in ("operativas", "operativas_sin_largo", "completo", "completo_sin_largo"):
        tabla[grupo] = {}
        for _, f in prueba[prueba.grupo == grupo].iterrows():
            i = intervalos[(intervalos.grupo == grupo) & (intervalos.modelo == f.modelo) & (intervalos.metrica == "average_precision")]
            tabla[grupo][f.modelo] = {
                "ap": round(f.average_precision, 4), "roc": round(f.roc_auc, 4), "accuracy": round(f.accuracy, 4),
                "precision": round(f.precision, 4), "recall": round(f.recall, 4), "f1": round(f.f1, 4),
                "brier": round(f.brier, 4), "tn": int(f.tn), "fp": int(f.fp), "fn": int(f.fn), "tp": int(f.tp),
                "ic_bajo": round(float(i.ic95_bajo.iloc[0]), 4), "ic_alto": round(float(i.ic95_alto.iloc[0]), 4),
            }
    top = pd.read_csv(salida / "cobertura_top_k_test.csv")
    top = {m: g.drop(columns="modelo").round(4).to_dict("records") for m, g in top.groupby("modelo")
           if m.startswith(GRUPO)}
    tramos = pd.read_csv(salida / "atencion_por_tramo_test.csv")
    tramos = {m: {"filas": g.drop(columns=["modelo", "spearman"]).round(4).to_dict("records"),
                  "spearman": round(float(g.spearman.iloc[0]), 3) if g.spearman.notna().any() else None}
              for m, g in tramos.groupby("modelo") if m.startswith(GRUPO)}
    diferencias = pd.read_csv(salida / "diferencias_entre_modelos_test.csv").round(4).to_dict("records")
    aporte = pd.read_csv(salida / "aporte_comerciales_test.csv").round(4).to_dict("records")
    bloques = pd.read_csv(salida / "importancia_bloques.csv")
    bloques = bloques[bloques.grupo == GRUPO][["bloque", "caida_ap"]].round(4).to_dict("records")
    mensual = {p: {"episodios": int((df.particion == p).sum()), "positivos": round(float(y[df.particion == p].mean()), 4)}
               for p in ("train", "validation", "test")}
    mensual["purgado"] = {"episodios": int((df.particion == "purgado").sum()), "positivos": None}
    seg = pd.read_csv(salida / "segmentos_test.csv")
    seg = seg[seg.grupo == GRUPO]
    segmentos_ = {m: g.set_index("segmento")[["chats", "con_humano", "prevalencia", "average_precision", "roc_auc"]]
                  .round(4).to_dict("index") for m, g in seg.groupby("modelo")}
    top_resto = pd.read_csv(salida / "cobertura_top_k_resto_test.csv")
    top_resto = top_resto[top_resto.modelo == GRUPO + "/bosque"].drop(columns="modelo").round(4).to_dict("records")
    meses = pd.read_csv(salida / "evolucion_mensual.csv").round(4).to_dict("records")
    niv = pd.read_csv(salida / "niveles_prioridad.csv")
    niv = niv[(niv.grupo == GRUPO) & (niv.modelo == "bosque")]
    niveles = {p: g.drop(columns=["grupo", "modelo", "particion"]).round(4).to_dict("records") for p, g in niv.groupby("particion")}
    composicion = pd.read_csv(salida / "composicion_por_mes.csv").to_dict("records")
    return {
        "segmentos": segmentos_, "niveles": niveles, "top_k_resto": top_resto, "meses": meses, "composicion": composicion,
        "familias": familias, "largo_texto": largo, "metricas": tabla, "top_k": top, "tramos": tramos,
        "diferencias": diferencias, "aporte": aporte, "bloques": bloques, "particiones": mensual,
        "embudo": {"mensajes_fuente": 47403, "mensajes": 35294, "contactos": 3712, "sesiones": 4570,
                   "episodios": 3982, "maduros": len(df), "con_humano": int(y.sum()), "sin_humano": int((1 - y).sum())},
    }


def construir(salida=cfg.SALIDA, destino=None):
    configuracion = json.loads((salida / "configuracion.json").read_text(encoding="utf-8"))
    df, matriz = datos.cargar_episodios()
    datos.validar(df, matriz)
    df, matriz = datos.cohorte_madura(df, matriz)
    df["particion"] = particiones.asignar(df.anchor_at, df.horizon_end)
    columnas = datos.grupos_de_variables()[GRUPO]

    ajustados, mascara, y = entrenar_elegidos(df, matriz, columnas, configuracion)
    verificar_contra_resultados(ajustados, matriz, columnas, mascara, y, salida)

    payload = {
        "version": configuracion["feature_version"],
        "columnas": columnas,
        "etiquetas": {c: ETIQUETAS.get(c, c) for c in columnas},
        "binarias": [c for c in columnas if set(np.unique(matriz[c])) <= {0, 1}],
        "familias_ids": cfg.FAMILIAS,
        "familias_nombres": [NOMBRES_FAMILIAS[f] for f in cfg.FAMILIAS],
        "modelos": exportar_modelos(df, matriz, columnas, ajustados, mascara),
        "resultados": resultados_agregados(df, matriz, salida),
        "complejidad": {k.split("/")[1]: v for k, v in configuracion["complejidad"].items() if k.startswith(GRUPO)},
    }
    texto = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    partes = {nombre: (PRESENTACION / nombre).read_text(encoding="utf-8")
              for nombre in ("plantilla.html", "estilos.css", "motor.js", "app.js")}
    html = (partes["plantilla.html"]
            .replace("/*{{CSS}}*/", partes["estilos.css"])
            .replace("/*{{MOTOR}}*/", partes["motor.js"])
            .replace("/*{{APP}}*/", partes["app.js"])
            .replace("/*{{DATOS}}*/", "const DATOS=" + texto + ";"))
    destino = destino or PRESENTACION / "presentacion.html"
    destino.write_text(html, encoding="utf-8")
    return destino, payload, ajustados, matriz[columnas], df


def principal(argv=None):
    parser = argparse.ArgumentParser(prog="python -m modelado.presentacion")
    parser.add_argument("--salida", type=Path, default=cfg.SALIDA, help="carpeta con los resultados de la corrida")
    args = parser.parse_args(argv)
    destino, *_ = construir(args.salida)
    print(f"Presentación en {destino} ({destino.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    principal()

import argparse
import json
import platform
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.metrics import average_precision_score, roc_auc_score

from . import config as cfg
from . import datos, entrenamiento, evaluacion, graficos, modelos, particiones

PARTICIONES = ("train", "validation", "test")


def _guardar_csv(tabla, ruta, indice=False):
    tabla.to_csv(ruta, index=indice, float_format="%.6f")


def _preparar():
    hashes = datos.verificar_hashes()
    df, matriz = datos.cargar_episodios()
    datos.validar(df, matriz)
    df, matriz = datos.cohorte_madura(df, matriz)
    df["particion"] = particiones.asignar(df.anchor_at, df.horizon_end)
    particiones.verificar_conteos(df.particion)
    atencion = datos.indicadores_atencion(df, datos.cargar_mensajes())
    return hashes, df, matriz, atencion


def correr(salida):
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "figuras").mkdir(exist_ok=True)
    (salida / "local").mkdir(exist_ok=True)

    print("Cargando y validando datos")
    hashes, df, matriz, atencion = _preparar()
    y = df.human_replied_24h.to_numpy()
    mascara = {p: (df.particion == p).to_numpy() for p in PARTICIONES}
    grupos = datos.grupos_de_variables()

    ensayos, elegidas, scores, ajustados, complejidades = [], {}, {}, {}, {}
    for grupo, columnas in grupos.items():
        x = matriz[columnas]
        for nombre in modelos.NOMBRES:
            print(f"Buscando {nombre} / {grupo}")
            tabla, parametros = entrenamiento.buscar(
                nombre, x[mascara["train"]], y[mascara["train"]],
                x[mascara["validation"]], y[mascara["validation"]],
            )
            ensayos += [{"grupo": grupo, **{k: v for k, v in e.items() if k != "_parametros"}} for e in tabla]
            modelo = entrenamiento.ajustar(nombre, parametros, x[mascara["train"]], y[mascara["train"]])
            elegidas[(grupo, nombre)] = {k: str(v) for k, v in parametros.items()}
            complejidades[(grupo, nombre)] = modelos.complejidad(nombre, modelo)
            ajustados[(grupo, nombre)] = modelo
            scores[(grupo, nombre)] = {p: modelo.predict_proba(x[mascara[p]])[:, 1] for p in PARTICIONES}

    umbrales = {
        f"{g}/{n}": evaluacion.umbral_por_f1(y[mascara["validation"]], s["validation"])
        for (g, n), s in scores.items()
    }
    (salida / "umbrales_validation.json").write_text(json.dumps(umbrales, indent=2), encoding="utf-8")

    filas = []
    for (grupo, nombre), s in scores.items():
        for particion in PARTICIONES:
            for tipo, umbral in (("fijo", cfg.UMBRAL), ("validation", umbrales[f"{grupo}/{nombre}"])):
                filas.append({
                    "grupo": grupo, "modelo": nombre, "particion": particion, "umbral_tipo": tipo,
                    **evaluacion.metricas(y[mascara[particion]], s[particion], umbral),
                })
    metricas = pd.DataFrame(filas)

    test = df[mascara["test"]].reset_index(drop=True)
    y_test = y[mascara["test"]]
    intervalos, sensibilidad, calibraciones, tramos = [], [], {}, {}
    primeros = evaluacion.primer_episodio_por_contacto(test)
    atencion_test = atencion.loc[test.episode_key].reset_index(drop=True)
    for (grupo, nombre), s in scores.items():
        st = s["test"]
        for metrica, funcion in (("average_precision", average_precision_score), ("roc_auc", roc_auc_score)):
            bajo, alto = evaluacion.intervalo_por_contacto(y_test, st, test.contact_key, funcion)
            intervalos.append({"grupo": grupo, "modelo": nombre, "metrica": metrica,
                               "valor": funcion(y_test, st), "ic95_bajo": bajo, "ic95_alto": alto})
        sensibilidad.append({
            "grupo": grupo, "modelo": nombre, "episodios": len(primeros),
            "average_precision": average_precision_score(y_test[primeros], st[primeros]),
            "roc_auc": roc_auc_score(y_test[primeros], st[primeros]),
        })
        calibraciones[(grupo, nombre)] = evaluacion.curva_calibracion(y_test, st)
        tabla, rho = evaluacion.ranking_vs_atencion(st, atencion_test, y_test)
        tramos[(grupo, nombre)] = (tabla, rho)

    ranking = metricas[(metricas.particion == "validation") & (metricas.umbral_tipo == "fijo") & (metricas.modelo != "dummy")]
    lideres = {g: ranking[ranking.grupo == g].sort_values("average_precision").iloc[-1].modelo for g in grupos}

    lider = lideres["completo"]
    bloques = evaluacion.importancia_por_bloque(
        ajustados[("completo", lider)], matriz.loc[mascara["validation"], grupos["completo"]],
        y[mascara["validation"]], datos.bloques_de_variables(), average_precision_score,
    )

    aporte = []
    for nombre in modelos.NOMBRES:
        if nombre == "dummy":
            continue
        d, bajo, alto = evaluacion.diferencia_por_contacto(
            y_test, scores[("completo", nombre)]["test"], scores[("operativas", nombre)]["test"],
            test.contact_key, average_precision_score,
        )
        aporte.append({"modelo": nombre, "diferencia": d, "ic95_bajo": bajo, "ic95_alto": alto})
    aporte = pd.DataFrame(aporte)

    _guardar_csv(pd.DataFrame(ensayos), salida / "busqueda.csv")
    _guardar_csv(metricas, salida / "metricas.csv")
    _guardar_csv(pd.DataFrame(intervalos), salida / "intervalos_test.csv")
    _guardar_csv(pd.DataFrame(sensibilidad), salida / "sensibilidad_contactos.csv")
    _guardar_csv(
        pd.concat({f"{g}/{n}": c for (g, n), c in calibraciones.items()}, names=["modelo", "banda"]).reset_index(),
        salida / "calibracion_test.csv",
    )
    _guardar_csv(
        pd.concat({f"{g}/{n}": t.assign(spearman=rho) for (g, n), (t, rho) in tramos.items()},
                  names=["modelo", "tramo"]).reset_index(),
        salida / "atencion_por_tramo_test.csv",
    )
    _guardar_csv(bloques.rename("caida_ap").rename_axis("bloque").reset_index(), salida / "importancia_bloques.csv")
    _guardar_csv(aporte, salida / "aporte_comerciales_test.csv")

    graficos.comparacion_ap(metricas, salida / "figuras" / "01_average_precision.png")
    graficos.curvas(y_test, scores, salida / "figuras" / "02_curvas_precision_recall.png", "pr")
    graficos.curvas(y_test, scores, salida / "figuras" / "03_curvas_roc.png", "roc")
    graficos.matrices_confusion(metricas, salida / "figuras" / "04_matrices_confusion.png")
    graficos.calibracion(calibraciones, salida / "figuras" / "05_calibracion.png")
    graficos.atencion_por_tramo(tramos, salida / "figuras" / "06_atencion_por_tramo.png")
    graficos.importancia(bloques, lider, salida / "figuras" / "07_importancia_bloques.png")
    graficos.diferencia_grupos(aporte, salida / "figuras" / "08_aporte_comerciales.png")

    predicciones = df[["episode_key", "particion"]].copy()
    for (g, n), s in scores.items():
        col = np.full(len(df), np.nan)
        for p in PARTICIONES:
            col[mascara[p]] = s[p]
        predicciones[f"{g}_{n}"] = col
    predicciones.to_csv(salida / "local" / "predicciones.csv.gz", index=False)

    configuracion = {
        "feature_version": cfg.VERSION_FEATURES,
        "semilla": cfg.SEMILLA,
        "umbral_fijo": cfg.UMBRAL,
        "particiones": particiones.conteos(df.particion),
        "huella_particiones": particiones.huella(df.episode_key, df.particion),
        "prevalencia": {p: float(y[mascara[p]].mean()) for p in PARTICIONES},
        "hashes_datos": hashes,
        "lideres_validation": lideres,
        "configuraciones_elegidas": {f"{g}/{n}": v for (g, n), v in elegidas.items()},
        "complejidad": {f"{g}/{n}": v for (g, n), v in complejidades.items()},
        "presupuesto_busqueda": {n: len(g) for n, g in modelos.GRILLAS.items()},
        "librerias": {"python": platform.python_version(), "scikit-learn": sklearn.__version__,
                      "pandas": pd.__version__, "numpy": np.__version__},
    }
    (salida / "configuracion.json").write_text(json.dumps(configuracion, indent=2, ensure_ascii=False), encoding="utf-8")
    print("Listo. Resultados en", salida)


def principal(argv=None):
    parser = argparse.ArgumentParser(prog="python -m modelado", description=__doc__)
    parser.add_argument("--salida", type=Path, default=cfg.SALIDA, help="carpeta de resultados")
    args = parser.parse_args(argv)
    correr(args.salida)
    return 0


if __name__ == "__main__":
    sys.exit(principal())

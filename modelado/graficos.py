import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import precision_recall_curve, roc_curve

from .modelos import NOMBRES

COLORES = {"dummy": "#8c8c8c", "arbol": "#2f6db5", "bosque": "#2a9d6f", "mlp": "#d9822b"}
TITULOS_GRUPO = {"operativas": "10 variables operativas", "completo": "58 variables (operativas + comerciales)"}

plt.rcParams.update({
    "font.size": 13, "axes.titlesize": 15, "axes.labelsize": 13,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.alpha": 0.25, "figure.dpi": 100, "savefig.dpi": 160,
})


def _guardar(fig, ruta):
    fig.tight_layout()
    fig.savefig(ruta, bbox_inches="tight")
    plt.close(fig)


def comparacion_ap(metricas, ruta):
    base = metricas[metricas.umbral_tipo == "fijo"]
    fig, ejes = plt.subplots(1, 2, figsize=(13, 5), sharey=True)
    for eje, particion in zip(ejes, ("validation", "test")):
        datos = base[base.particion == particion]
        ancho = 0.2
        for i, nombre in enumerate(NOMBRES):
            filas = datos[datos.modelo == nombre].set_index("grupo").reindex(["operativas", "completo"])
            posiciones = np.arange(2) + (i - 1.5) * ancho
            barras = eje.bar(posiciones, filas.average_precision, ancho, color=COLORES[nombre], label=NOMBRES[nombre])
            eje.bar_label(barras, fmt="%.2f", fontsize=10, padding=2)
        eje.set_xticks(range(2), ["10 operativas", "58 variables"])
        eje.set_title({"validation": "Validation (septiembre)", "test": "Test retrospectivo (octubre)"}[particion])
        eje.set_ylim(0.4, 1.0)
    ejes[0].set_ylabel("Average Precision")
    ejes[0].legend(loc="upper center", bbox_to_anchor=(1.05, -0.08), ncol=4, frameon=False)
    _guardar(fig, ruta)


def curvas(y, scores, ruta, tipo):
    fig, ejes = plt.subplots(1, 2, figsize=(13, 5.5))
    for eje, grupo in zip(ejes, ("operativas", "completo")):
        for nombre in NOMBRES:
            s = scores[(grupo, nombre)]["test"]
            if tipo == "pr":
                p, r, _ = precision_recall_curve(y, s)
                eje.plot(r, p, color=COLORES[nombre], label=NOMBRES[nombre], lw=2)
                eje.set_xlabel("Recall")
                eje.set_ylabel("Precision")
            else:
                fpr, tpr, _ = roc_curve(y, s)
                eje.plot(fpr, tpr, color=COLORES[nombre], label=NOMBRES[nombre], lw=2)
                eje.set_xlabel("Falsos positivos (tasa)")
                eje.set_ylabel("Verdaderos positivos (tasa)")
        if tipo == "roc":
            eje.plot([0, 1], [0, 1], color="#bbbbbb", lw=1, ls="--")
        eje.set_title(TITULOS_GRUPO[grupo])
    ejes[0].legend(frameon=False)
    _guardar(fig, ruta)


def matrices_confusion(metricas, ruta):
    base = metricas[(metricas.umbral_tipo == "fijo") & (metricas.particion == "test")]
    fig, ejes = plt.subplots(2, 4, figsize=(16, 8))
    for fila, grupo in enumerate(("operativas", "completo")):
        for col, nombre in enumerate(NOMBRES):
            r = base[(base.grupo == grupo) & (base.modelo == nombre)].iloc[0]
            m = np.array([[r.tn, r.fp], [r.fn, r.tp]])
            eje = ejes[fila, col]
            eje.imshow(m, cmap="Blues")
            for (i, j), v in np.ndenumerate(m):
                eje.text(j, i, f"{v}", ha="center", va="center", fontsize=16,
                         color="white" if v > m.max() / 2 else "black")
            eje.set_xticks([0, 1], ["Sin humano", "Con humano"])
            eje.set_yticks([0, 1], ["Sin humano", "Con humano"], rotation=90, va="center")
            eje.grid(False)
            eje.set_title(f"{NOMBRES[nombre]} · {'10 var.' if grupo == 'operativas' else '58 var.'}")
            if col == 0:
                eje.set_ylabel("Real")
            if fila == 1:
                eje.set_xlabel("Predicho")
    _guardar(fig, ruta)


def calibracion(curvas_calibracion, ruta):
    fig, ejes = plt.subplots(1, 2, figsize=(12, 5.5), sharey=True)
    for eje, grupo in zip(ejes, ("operativas", "completo")):
        eje.plot([0, 1], [0, 1], color="#bbbbbb", ls="--", lw=1)
        for nombre in ("arbol", "bosque", "mlp"):
            c = curvas_calibracion[(grupo, nombre)]
            eje.plot(c.predicho, c.observado, marker="o", color=COLORES[nombre], label=NOMBRES[nombre], lw=2)
        eje.set_title(TITULOS_GRUPO[grupo])
        eje.set_xlabel("Probabilidad predicha")
    ejes[0].set_ylabel("Proporción observada con respuesta humana")
    ejes[0].legend(frameon=False)
    _guardar(fig, ruta)


def atencion_por_tramo(tablas, ruta, grupo="completo"):
    fig, ejes = plt.subplots(1, 2, figsize=(13, 5.2))
    metricas = [("mensajes_humanos", "Mensajes humanos por chat (promedio)"),
                ("con_adjuntos", "Chats con foto/documento de una persona")]
    for eje, (col, titulo) in zip(ejes, metricas):
        for nombre in NOMBRES:
            tabla = tablas[(grupo, nombre)][0]
            eje.plot(tabla.index, tabla[col], marker="o", color=COLORES[nombre], label=NOMBRES[nombre], lw=2)
        eje.set_title(titulo)
        eje.set_xlabel("Tramo del ranking (Q1 = mayor puntaje)")
    ejes[1].yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
    ejes[0].legend(frameon=False)
    _guardar(fig, ruta)


def importancia(bloques, nombre, ruta):
    fig, eje = plt.subplots(figsize=(9, 5))
    serie = bloques.sort_values()
    eje.barh(serie.index, serie.values, color=COLORES[nombre])
    eje.set_title(f"{NOMBRES[nombre]} con 58 variables: aporte de cada bloque")
    eje.set_xlabel("Caída de Average Precision al permutar el bloque (validation)")
    _guardar(fig, ruta)


def diferencia_grupos(tabla, ruta):
    fig, eje = plt.subplots(figsize=(9, 5))
    y = np.arange(len(tabla))
    eje.errorbar(
        tabla.diferencia, y,
        xerr=[tabla.diferencia - tabla.ic95_bajo, tabla.ic95_alto - tabla.diferencia],
        fmt="o", color="#222222", ecolor="#888888", capsize=5, lw=2, ms=8,
    )
    eje.axvline(0, color="#bbbbbb", lw=1)
    eje.set_yticks(y, [NOMBRES[m] for m in tabla.modelo])
    eje.set_xlabel("Average Precision con 58 variables menos con 10 (test)")
    eje.set_title("Aporte de las señales comerciales, con intervalo al 95 %")
    _guardar(fig, ruta)

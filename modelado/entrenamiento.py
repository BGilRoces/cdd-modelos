import warnings

from sklearn.exceptions import ConvergenceWarning
from sklearn.metrics import average_precision_score

from . import modelos


def _texto(parametros):
    return {k: str(v) for k, v in parametros.items()}


def buscar(nombre, x_train, y_train, x_val, y_val):
    """Elige la configuración con mayor Average Precision en validation.

    Ante un empate gana la primera de la grilla, que está ordenada de menor a mayor complejidad.
    """
    ensayos = []
    for parametros in modelos.GRILLAS[nombre]:
        with warnings.catch_warnings(record=True) as avisos:
            warnings.simplefilter("always")
            modelo = modelos.crear(nombre, **parametros).fit(x_train, y_train)
        score = modelo.predict_proba(x_val)[:, 1]
        ensayos.append({
            "modelo": nombre,
            **_texto(parametros),
            "ap_validation": average_precision_score(y_val, score),
            "convergio": not any(issubclass(a.category, ConvergenceWarning) for a in avisos),
            "_parametros": parametros,
        })
    mejor = max(range(len(ensayos)), key=lambda i: (round(ensayos[i]["ap_validation"], 8), -i))
    return ensayos, ensayos[mejor]["_parametros"]


def ajustar(nombre, parametros, x_train, y_train):
    return modelos.crear(nombre, **parametros).fit(x_train, y_train)

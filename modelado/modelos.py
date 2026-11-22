from sklearn.dummy import DummyClassifier
from sklearn.model_selection import ParameterGrid
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier

from . import config as cfg

NOMBRES = {"dummy": "Dummy", "arbol": "Árbol", "bosque": "Bosque", "mlp": "MLP"}

GRILLAS = {
    "dummy": [{}],
    "arbol": list(ParameterGrid({
        "max_depth": [3, 4, 5, 6, 8, 10, None],
        "min_samples_leaf": [1, 5, 10, 25, 50],
        "criterion": ["gini", "entropy"],
    })),
    "bosque": list(ParameterGrid({
        "n_estimators": [300],
        "max_depth": [6, 10, None],
        "min_samples_leaf": [1, 5, 15],
        "max_features": ["sqrt", 0.3],
    })),
    "mlp": list(ParameterGrid({
        "hidden_layer_sizes": [(16,), (32,), (64, 32)],
        "alpha": [1e-4, 1e-2, 1.0],
        "learning_rate_init": [1e-3, 1e-2],
    })),
}


def crear(nombre, **parametros):
    if nombre == "dummy":
        return DummyClassifier(strategy="prior")
    if nombre == "arbol":
        return DecisionTreeClassifier(random_state=cfg.SEMILLA, **parametros)
    if nombre == "bosque":
        return RandomForestClassifier(random_state=cfg.SEMILLA, n_jobs=-1, **parametros)
    if nombre == "mlp":
        red = MLPClassifier(
            random_state=cfg.SEMILLA, early_stopping=False, max_iter=1000, **parametros
        )
        return Pipeline([("escala", StandardScaler()), ("red", red)])
    raise ValueError(f"Modelo desconocido: {nombre}")


def complejidad(nombre, modelo):
    if nombre == "arbol":
        return {"profundidad": int(modelo.get_depth()), "hojas": int(modelo.get_n_leaves())}
    if nombre == "bosque":
        hojas = sum(a.get_n_leaves() for a in modelo.estimators_)
        return {"arboles": len(modelo.estimators_), "hojas_totales": int(hojas)}
    if nombre == "mlp":
        red = modelo.named_steps["red"]
        pesos = sum(w.size for w in red.coefs_) + sum(b.size for b in red.intercepts_)
        return {"parametros": int(pesos), "iteraciones": int(red.n_iter_)}
    return {}

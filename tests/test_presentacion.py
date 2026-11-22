import unittest

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from modelado import presentacion


def predecir_arbol(a, x):
    i = 0
    while a["f"][i] >= 0:
        i = a["l"][i] if x[a["f"][i]] <= a["t"][i] else a["r"][i]
    return a["p"][i]


def predecir_mlp(m, x):
    h = (np.asarray(x) - np.asarray(m["media"])) / np.asarray(m["escala"])
    capas = len(m["pesos"])
    for c in range(capas):
        h = h @ np.asarray(m["pesos"][c]) + np.asarray(m["sesgos"][c])
        if c < capas - 1:
            h = np.maximum(h, 0)
    return float(1 / (1 + np.exp(-h[0])))


class ExportacionDeModelos(unittest.TestCase):
    def setUp(self):
        azar = np.random.default_rng(5)
        self.x = azar.integers(0, 6, size=(400, 7)).astype(float)
        self.y = ((self.x[:, 0] + self.x[:, 3] + azar.normal(0, 1, 400)) > 5).astype(int)

    def test_arbol_exportado_predice_igual(self):
        modelo = DecisionTreeClassifier(max_depth=5, random_state=1).fit(self.x, self.y)
        a = presentacion.exportar_arbol(modelo, con_muestras=True)
        esperado = modelo.predict_proba(self.x)[:, 1]
        obtenido = [predecir_arbol(a, fila) for fila in self.x]
        np.testing.assert_allclose(obtenido, esperado, atol=1e-5)
        self.assertEqual(a["n"][0], len(self.x))

    def test_bosque_exportado_predice_igual(self):
        modelo = RandomForestClassifier(n_estimators=15, max_depth=4, random_state=1).fit(self.x, self.y)
        arboles = [presentacion.exportar_arbol(t) for t in modelo.estimators_]
        esperado = modelo.predict_proba(self.x)[:, 1]
        obtenido = [np.mean([predecir_arbol(a, fila) for a in arboles]) for fila in self.x]
        np.testing.assert_allclose(obtenido, esperado, atol=1e-5)

    def test_mlp_exportado_predice_igual(self):
        pipeline = Pipeline([("escala", StandardScaler()),
                             ("red", MLPClassifier(hidden_layer_sizes=(8, 4), max_iter=500, random_state=1))])
        pipeline.fit(self.x, self.y)
        m = presentacion.exportar_mlp(pipeline)
        esperado = pipeline.predict_proba(self.x)[:, 1]
        obtenido = [predecir_mlp(m, fila) for fila in self.x]
        np.testing.assert_allclose(obtenido, esperado, atol=1e-6)

    def test_las_hojas_no_tienen_variable(self):
        modelo = DecisionTreeClassifier(max_depth=3, random_state=1).fit(self.x, self.y)
        a = presentacion.exportar_arbol(modelo)
        hojas = [i for i, f in enumerate(a["f"]) if f < 0]
        self.assertTrue(all(a["l"][i] == -1 and a["r"][i] == -1 for i in hojas))


class Etiquetas(unittest.TestCase):
    def test_hay_etiqueta_para_cada_familia_y_rol(self):
        for familia in presentacion.NOMBRES_FAMILIAS:
            for prefijo in ("requested_", "offered_", "matched_"):
                self.assertIn(prefijo + familia, presentacion.ETIQUETAS)


if __name__ == "__main__":
    unittest.main()

import unittest

import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from modelado import config as cfg
from modelado import entrenamiento, modelos


class Definicion(unittest.TestCase):
    def test_dummy_usa_la_proporcion_de_la_clase(self):
        m = modelos.crear("dummy")
        self.assertIsInstance(m, DummyClassifier)
        self.assertEqual(m.strategy, "prior")

    def test_mlp_escala_dentro_del_pipeline_y_no_usa_early_stopping(self):
        m = modelos.crear("mlp", hidden_layer_sizes=(8,))
        self.assertIsInstance(m, Pipeline)
        self.assertIsInstance(m.named_steps["escala"], StandardScaler)
        red = m.named_steps["red"]
        self.assertIsInstance(red, MLPClassifier)
        self.assertFalse(red.early_stopping)
        self.assertEqual(red.random_state, cfg.SEMILLA)

    def test_arbol_y_bosque_comparten_semilla_y_no_escalan(self):
        for nombre in ("arbol", "bosque"):
            m = modelos.crear(nombre)
            self.assertEqual(m.random_state, cfg.SEMILLA)
            self.assertNotIsInstance(m, Pipeline)

    def test_modelo_desconocido_falla(self):
        with self.assertRaises(ValueError):
            modelos.crear("regresion")

    def test_cada_modelo_tiene_su_grilla(self):
        self.assertEqual(set(modelos.GRILLAS), set(modelos.NOMBRES))


class Busqueda(unittest.TestCase):
    def setUp(self):
        azar = np.random.default_rng(3)
        self.x = azar.random((300, 4))
        self.y = (self.x[:, 0] + 0.2 * azar.random(300) > 0.6).astype(int)

    def test_devuelve_un_ensayo_por_configuracion_y_la_mejor(self):
        ensayos, mejor = entrenamiento.buscar(
            "arbol", self.x[:200], self.y[:200], self.x[200:], self.y[200:])
        self.assertEqual(len(ensayos), len(modelos.GRILLAS["arbol"]))
        mayor = max(e["ap_validation"] for e in ensayos)
        elegido = [e for e in ensayos if e["_parametros"] == mejor][0]
        self.assertEqual(elegido["ap_validation"], mayor)

    def test_dos_ajustes_dan_el_mismo_resultado(self):
        a = entrenamiento.ajustar("bosque", {"n_estimators": 20}, self.x, self.y)
        b = entrenamiento.ajustar("bosque", {"n_estimators": 20}, self.x, self.y)
        np.testing.assert_array_equal(a.predict_proba(self.x), b.predict_proba(self.x))


if __name__ == "__main__":
    unittest.main()

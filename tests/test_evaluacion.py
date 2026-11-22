import unittest

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

from modelado import evaluacion


class Metricas(unittest.TestCase):
    def test_matriz_y_tasas(self):
        y = [1, 1, 1, 0, 0, 0, 0, 1]
        score = [0.9, 0.8, 0.2, 0.1, 0.6, 0.3, 0.4, 0.7]
        m = evaluacion.metricas(y, score, 0.5)
        self.assertEqual((m["tn"], m["fp"], m["fn"], m["tp"]), (3, 1, 1, 3))
        self.assertAlmostEqual(m["precision"], 0.75)
        self.assertAlmostEqual(m["recall"], 0.75)
        self.assertAlmostEqual(m["f1"], 0.75)
        self.assertAlmostEqual(m["accuracy"], 0.75)

    def test_una_sola_clase_no_define_auc(self):
        m = evaluacion.metricas([1, 1, 1], [0.2, 0.9, 0.7])
        self.assertTrue(np.isnan(m["roc_auc"]))
        self.assertTrue(np.isnan(m["average_precision"]))

    def test_sin_predicciones_positivas_no_falla(self):
        m = evaluacion.metricas([1, 0, 1, 0], [0.1, 0.2, 0.3, 0.4], 0.5)
        self.assertEqual(m["precision"], 0.0)
        self.assertEqual(m["recall"], 0.0)

    def test_umbral_por_f1_queda_dentro_del_rango(self):
        azar = np.random.default_rng(0)
        y = azar.integers(0, 2, 300)
        score = np.clip(y * 0.3 + azar.random(300) * 0.7, 0, 1)
        u = evaluacion.umbral_por_f1(y, score)
        self.assertGreaterEqual(u, score.min())
        self.assertLessEqual(u, score.max())


class Incertidumbre(unittest.TestCase):
    def setUp(self):
        azar = np.random.default_rng(1)
        self.contactos = np.repeat(np.arange(120), 4)
        self.y = azar.integers(0, 2, 480)
        self.score = np.clip(self.y * 0.4 + azar.random(480) * 0.6, 0, 1)

    def test_intervalo_contiene_el_valor_observado(self):
        bajo, alto = evaluacion.intervalo_por_contacto(
            self.y, self.score, self.contactos, average_precision_score, repeticiones=200)
        valor = average_precision_score(self.y, self.score)
        self.assertLess(bajo, valor)
        self.assertGreater(alto, valor)

    def test_es_reproducible(self):
        a = evaluacion.intervalo_por_contacto(
            self.y, self.score, self.contactos, average_precision_score, repeticiones=50)
        b = evaluacion.intervalo_por_contacto(
            self.y, self.score, self.contactos, average_precision_score, repeticiones=50)
        self.assertEqual(a, b)

    def test_diferencia_de_un_modelo_consigo_mismo_es_cero(self):
        d, bajo, alto = evaluacion.diferencia_por_contacto(
            self.y, self.score, self.score, self.contactos, average_precision_score, repeticiones=50)
        self.assertEqual((d, bajo, alto), (0.0, 0.0, 0.0))


class RankingVsAtencion(unittest.TestCase):
    def test_un_buen_ranking_ordena_la_atencion(self):
        n = 100
        score = np.linspace(1, 0, n)
        atencion = pd.DataFrame({
            "mensajes_humanos": np.linspace(10, 0, n).round(),
            "con_adjuntos": (np.linspace(1, 0, n) > 0.5).astype(int),
        })
        y = (score > 0.5).astype(int)
        tabla, rho = evaluacion.ranking_vs_atencion(score, atencion, y)
        self.assertEqual(list(tabla.index), ["Q1", "Q2", "Q3", "Q4", "Q5"])
        self.assertTrue(tabla.mensajes_humanos.is_monotonic_decreasing)
        self.assertGreater(rho, 0.95)

    def test_un_puntaje_constante_reparte_parejo(self):
        n = 100
        atencion = pd.DataFrame({"mensajes_humanos": np.arange(n) % 5, "con_adjuntos": np.zeros(n, int)})
        tabla, _ = evaluacion.ranking_vs_atencion(np.full(n, 0.5), atencion, np.ones(n, int))
        self.assertEqual(tabla.episodios.tolist(), [20] * 5)


class CoberturaTopK(unittest.TestCase):
    def test_un_ranking_perfecto_cubre_todo_con_precision_total(self):
        y = np.array([1] * 20 + [0] * 80)
        score = np.where(y == 1, 0.9, 0.1)
        tabla = evaluacion.cobertura_top_k(y, score, fracciones=(0.1, 0.2))
        self.assertEqual(tabla.precision.tolist(), [1.0, 1.0])
        self.assertAlmostEqual(tabla.cobertura.iloc[1], 1.0)
        self.assertAlmostEqual(tabla.cobertura.iloc[0], 0.5)
        self.assertAlmostEqual(tabla.mejora_sobre_azar.iloc[0], 5.0)

    def test_un_puntaje_constante_no_mejora_el_azar(self):
        y = np.array([1, 0] * 200)
        tabla = evaluacion.cobertura_top_k(y, np.full(400, 0.5), fracciones=(0.5,))
        self.assertAlmostEqual(tabla.mejora_sobre_azar.iloc[0], 1.0, delta=0.15)


class ImportanciaPorBloque(unittest.TestCase):
    def test_permutar_una_variable_informativa_baja_la_metrica(self):
        azar = np.random.default_rng(2)
        x = pd.DataFrame({"util": azar.random(400), "ruido": azar.random(400)})
        y = (x.util > 0.5).astype(int).to_numpy()

        class Modelo:
            def predict_proba(self, datos):
                p = datos.util.to_numpy()
                return np.column_stack([1 - p, p])

        caidas = evaluacion.importancia_por_bloque(
            Modelo(), x, y, {"util": ["util"], "ruido": ["ruido"]}, average_precision_score, repeticiones=5)
        self.assertGreater(caidas["util"], 0.2)
        self.assertAlmostEqual(caidas["ruido"], 0.0, places=6)


if __name__ == "__main__":
    unittest.main()

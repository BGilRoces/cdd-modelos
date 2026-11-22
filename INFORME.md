# Resultados de la comparación de modelos

Corrida del 22/11/2026 sobre los 3.981 episodios maduros del snapshot del 01/11. Todas las cifras salen de `resultados/` y se reproducen con `python -m modelado`.

## Particiones

| Partición | Episodios | Con respuesta humana |
|---|---|---|
| Train (antes de septiembre) | 1.635 | 53,2 % |
| Validation (septiembre) | 1.165 | 62,1 % |
| Test (octubre) | 1.042 | 49,0 % |
| Purgados | 139 | — |

La proporción de respuestas humanas cambia entre meses. Con el umbral de 0,5 todos los modelos tienden a predecir "con humano" de más (recall alto, precision cerca de 0,70). Por eso la comparación principal usa Average Precision, que no depende del umbral.

## Comparación en test (octubre)

Con las 58 variables:

| Modelo | Average Precision (IC 95 %) | ROC-AUC | Precision | Recall | F1 | Brier |
|---|---|---|---|---|---|---|
| Dummy | 0,490 (0,460–0,521) | 0,500 | 0,490 | 1,000 | 0,658 | 0,252 |
| Árbol | 0,855 (0,825–0,884) | 0,885 | 0,663 | 0,955 | 0,783 | 0,168 |
| Bosque | 0,878 (0,842–0,909) | 0,898 | 0,699 | 0,937 | 0,801 | 0,155 |
| MLP | 0,842 (0,805–0,881) | 0,868 | 0,702 | 0,918 | 0,796 | 0,175 |

Con solo las 10 variables operativas: árbol 0,810, bosque 0,845 y MLP 0,640 de Average Precision. Los intervalos remuestrean contactos completos, no episodios sueltos. Precision, recall y F1 son con umbral 0,5; con el umbral elegido en validation los F1 de árbol, bosque y MLP quedan prácticamente empatados (0,795 a 0,800, ver `metricas.csv`), así que esa métrica no desempata entre ellos.

## ¿Las señales comerciales mejoran la predicción?

Sí, de forma modesta pero consistente. Diferencia de Average Precision entre usar las 58 variables y las 10 operativas, en test:

| Modelo | Diferencia | IC 95 % |
|---|---|---|
| Árbol | +0,045 | 0,023 a 0,071 |
| Bosque | +0,033 | 0,015 a 0,053 |
| MLP | +0,202 | 0,159 a 0,246 |

Para árbol y bosque el intervalo no incluye el cero. El valor del MLP está inflado porque su versión con 10 variables rinde mal (0,64): conviene no usarlo como evidencia del aporte.

En el bosque con 58 variables, permutar el bloque de familia ofrecida (0,036) o el de familia pedida (0,034) baja más la métrica que el bloque operativo (0,007). Esta lectura es aproximada: los bloques tienen información repetida entre sí.

## ¿El ranking ordena por atención real?

Se dividió el test en cinco tramos según el puntaje del modelo. En el bosque con 58 variables:

| Tramo | Con respuesta humana | Mensajes humanos (prom.) | Con foto o documento |
|---|---|---|---|
| Q1 (mayor puntaje) | 92,8 % | 4,1 | 91,9 % |
| Q3 | 45,0 % | 3,2 | 38,3 % |
| Q5 (menor puntaje) | 4,8 % | 0,2 | 1,0 % |

La correlación de Spearman entre puntaje y cantidad de mensajes humanos es 0,62 (árbol 0,60, MLP 0,57). El Dummy queda plano, como corresponde. Los chats con puntaje alto no solo reciben respuesta: reciben más atención. Esto describe conducta histórica, no necesidad.

## Modelo recomendado

**Random forest con las 58 variables.** Fue el mejor en validation (0,947) y en test (0,878), el mejor calibrado (Brier 0,155) y el más estable al quitar contactos repetidos (0,896 usando un solo episodio por contacto). Frente al árbol gana 0,023 de Average Precision (IC 0,005 a 0,040) y frente al MLP 0,036 (IC 0,003 a 0,066): diferencias pequeñas y con intervalos que apenas dejan afuera el cero.

El costo es la complejidad: 300 árboles contra un árbol único de 41 hojas y profundidad 6. Como las diferencias son chicas, el árbol queda como alternativa defendible si el grupo prioriza explicar las reglas a la gerencia. El protocolo pide preferir el modelo más simple cuando el desempeño es parecido; la decisión final es del grupo.

## Limitaciones

- La etiqueta mide si una persona respondió, no si el chat lo necesitaba.
- El test es retrospectivo (octubre ya había sido inspeccionado) y cubre un solo mes.
- Con 10 variables, la más influyente es el largo del texto entrante; parte del desempeño se explica por cómo escribe el cliente y no por lo comercial.
- No se calibró: se reporta Brier y la curva de calibración (`figuras/05_calibracion.png`), pero los puntajes no son probabilidades confiables sin recalibrar.
- El MLP usa solo escalado, como fija el protocolo, y es sensible a variables con colas largas como la duración del prefijo.

## Archivos de resultados

| Archivo | Contenido |
|---|---|
| `metricas.csv` | todas las métricas por modelo, grupo, partición y umbral |
| `intervalos_test.csv` | Average Precision y ROC-AUC con intervalos por contacto |
| `aporte_comerciales_test.csv` | diferencia entre 58 y 10 variables |
| `atencion_por_tramo_test.csv` | ranking contra atención humana observada |
| `sensibilidad_contactos.csv` | test con un episodio por contacto |
| `busqueda.csv` | las 107 configuraciones probadas por grupo |
| `configuracion.json` | configuraciones elegidas, particiones, hashes, versiones |
| `figuras/` | gráficos 01 a 08 |

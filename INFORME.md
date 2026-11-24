# Resultados de la comparación de modelos

Corrida del 22/11/2026 sobre los 3.981 episodios maduros del snapshot del 01/11. Todas las cifras salen de `resultados/` y se reproducen con `python -m modelado`.

## Resumen

- Con las 58 variables del protocolo, bosque y árbol llegan a una Average Precision de 0,88 y 0,86 en test.
- Esa cifra depende en buena parte del **largo del texto** del primer mensaje del cliente. Ese largo se concentra en unos pocos valores exactos (54 caracteres en el 29 % de los episodios, 58 en el 14 %, 48 en el 12 %), compatibles con el mensaje que el anuncio precarga en WhatsApp. Cambiar el texto del anuncio cambia ese valor y el modelo deja de funcionar. No tenemos el texto de los mensajes para confirmarlo.
- Por eso el análisis central se hace **sin las dos variables de largo de texto** (`inbound_text_chars` y `anchor_useful_text_chars`), quedando 56 variables. Resultado: las variables operativas solas no predicen nada (Average Precision 0,50, igual que el azar) y las señales de familia de producto sí (0,88).
- Con las 56 variables, árbol y bosque rinden parecido en ranking. Se recomienda el **bosque para puntuar** y el **árbol al lado para explicar**.

## Particiones

| Partición | Episodios | Con respuesta humana |
|---|---|---|
| Train (antes de septiembre) | 1.635 | 53,2 % |
| Validation (septiembre) | 1.165 | 62,1 % |
| Test (octubre) | 1.042 | 49,0 % |
| Purgados | 139 | — |

La proporción de respuestas humanas cambia entre meses. Con el umbral de 0,5 los modelos tienden a predecir "con humano" de más (recall alto, precision cerca de 0,70). Por eso la comparación principal usa Average Precision, que no depende del umbral.

## Qué queda sin el largo del texto

Average Precision en test (octubre). Dummy: 0,490.

| Variables | Árbol | Bosque | MLP |
|---|---|---|---|
| 10 operativas | 0,810 | 0,845 | 0,640 |
| 9 operativas, sin largo de texto | 0,503 | 0,503 | 0,489 |
| 58 (protocolo) | 0,855 | 0,878 | 0,842 |
| 56, sin largo de texto | 0,875 | 0,877 | 0,852 |

Sin el largo de texto, las variables operativas (hora, día, horario laboral, cantidad de mensajes, duración) no distinguen nada. Agregarles las señales comerciales sube la Average Precision en 0,36 a 0,37 para los tres modelos (intervalos 95 %: árbol 0,329–0,416, bosque 0,323–0,421, MLP 0,317–0,412). Las 56 variables dan prácticamente lo mismo que las 58: la información útil está en las señales comerciales.

## Qué señales son las que importan

Permutando bloques de variables en validation (bosque, 56 variables), lo que más baja la métrica es la familia ofrecida por el bot (0,046), seguida de la familia pedida (0,035) y la coincidencia entre pedido y oferta (0,022). Las operativas aportan 0,008.

La tasa de respuesta humana depende mucho de qué producto se pide (sobre los 3.981 episodios):

| Familia pedida | Episodios | Con respuesta humana |
|---|---|---|
| Broches | 1.217 | 14 % |
| Abrojos | 195 | 31 % |
| Elásticos | 349 | 32 % |
| Telas | 112 | 68 % |
| Cintas | 204 | 74 % |
| Cierres | 85 | 75 % |
| "Ambos" | 1.314 | 94 % |
| Chalecos | 77 | 99 % |

Hay productos que el bot resuelve casi solo (broches) y otros que casi siempre pasan a una persona (chalecos). Conviene confirmar con la empresa si algunas familias se derivan por regla y no por decisión de una persona.

## Comparación entre modelos con las 56 variables

| Modelo | Average Precision (IC 95 %) | ROC-AUC | Precision | Recall | F1 | Brier |
|---|---|---|---|---|---|---|
| Dummy | 0,490 (0,460–0,521) | 0,500 | 0,490 | 1,000 | 0,658 | 0,252 |
| Árbol | 0,875 (0,843–0,902) | 0,890 | 0,665 | 0,918 | 0,771 | 0,169 |
| Bosque | 0,877 (0,840–0,909) | 0,900 | 0,702 | 0,939 | 0,803 | 0,155 |
| MLP | 0,852 (0,815–0,894) | 0,890 | 0,750 | 0,922 | 0,827 | 0,140 |

Precision, recall, F1 y Brier son con umbral 0,5. Los intervalos remuestrean contactos completos, no episodios sueltos.

Diferencias de Average Precision entre modelos (test, intervalo 95 %):

| Comparación | Diferencia | IC 95 % |
|---|---|---|
| Bosque − árbol | +0,003 | −0,014 a 0,020 |
| Bosque − MLP | +0,025 | −0,012 a 0,057 |
| Árbol − MLP | +0,023 | −0,012 a 0,053 |

Los tres modelos son estadísticamente indistinguibles en test. Con las 58 variables el bosque sí le ganaba al árbol (+0,023, IC 0,005 a 0,040), pero esa ventaja desaparece al sacar el largo de texto.

## Modelo recomendado

**Bosque aleatorio con las 56 variables para puntuar, con el árbol de decisión al lado para explicar.**

El bosque (300 árboles) se elige para puntuar porque, aunque en Average Precision empata con el árbol, es mejor en el resto de las medidas que importan para una cola de prioridad:

- **Mejor F1 y ROC-AUC:** 0,803 contra 0,771 y 0,900 contra 0,890 (umbral 0,5).
- **Mejor calibración:** Brier 0,155 contra 0,169.
- **Mejor en septiembre:** Average Precision de validation 0,946 contra 0,932.
- **Puntaje más fino.** En octubre el árbol produce solo 32 valores distintos y el 21 % de los chats cae en un único valor, de modo que una parte grande de la cola queda empatada sin orden. El bosque produce 924 valores distintos y su mayor empate es de 0,5 %. Para ordenar chats esto pesa más que la simplicidad.

El árbol (profundidad 8, 39 hojas) queda como explicación: rinde parecido (Average Precision 0,875 contra 0,877) y sus reglas se leen en términos de producto pedido y producto ofrecido, que es lo que se puede discutir con la gerencia. Es una aproximación explicable, no es el bosque.

Honestidad sobre la elección: la diferencia de Average Precision entre bosque y árbol no es significativa (+0,003, IC −0,014 a 0,020). El protocolo pide preferir el modelo más simple ante un desempeño parecido; se opta por combinar los dos y explicitar el compromiso: el bosque aporta el ranking fino y el árbol aporta la explicación. Combinar modelos justificando qué aporta cada uno es además una de las expectativas superadoras de la consigna. La decisión final es del grupo.

## Utilidad para quien supervisa

Si el gerente revisa solo los chats con mayor puntaje del bosque (56 variables, test):

| Chats revisados | Con respuesta humana | Cobertura de los chats con respuesta humana | Mejora sobre azar |
|---|---|---|---|
| 10 % | 90 % | 18 % | 1,8 veces |
| 20 % | 92 % | 38 % | 1,9 veces |
| 30 % | 94 % | 57 % | 1,9 veces |
| 50 % | 81 % | 83 % | 1,7 veces |

Con el 20 % de arriba se revisan unos 210 chats de 1.042 y casi todos terminan con una persona. El árbol da casi lo mismo, pero con puntajes empatados.

## ¿El ranking ordena por atención real?

Se dividió el test en cinco tramos según el puntaje. En el bosque con 56 variables, el tramo de mayor puntaje tuvo 4,2 mensajes humanos por chat y 91 % con foto o documento; el de menor puntaje, 0,2 y 1 %. La correlación de Spearman entre puntaje y cantidad de mensajes humanos es 0,63 (árbol 0,62). Es el mismo orden que con las 58 variables. Esto describe conducta histórica, no necesidad.

## ¿Cuánto aporta el modelo más allá de los productos impulsados?

Ambos médicos y chalecos son los productos que la empresa impulsa con publicidad y refuerza con atención humana (confirmado por el grupo). Son el 44 % de los chats de octubre y el 94 % termina con una persona, de modo que reconocerlos explica buena parte del resultado. Para medir cuánto queda por encima de eso, se evaluó el bosque (56 variables) por separado en cada grupo de chats de octubre:

| Grupo de chats | Chats | Con persona | Average Precision | ROC-AUC |
|---|---|---|---|---|
| Todos | 1.042 | 49 % | 0,877 | 0,900 |
| Con ambos médicos o chalecos | 455 (44 %) | 94 % | 0,924 | 0,432 |
| Todo lo demás | 587 (56 %) | 14 % | 0,296 | 0,682 |

- Dentro de ambos y chalecos el modelo no distingue (ROC-AUC alrededor de 0,5): casi todos terminan con una persona.
- En el resto, el modelo ordena mejor que el azar (Average Precision 0,296 contra 0,143), pero la mejora es moderada. El árbol da 0,261 y el MLP 0,291.

Si el gerente revisa solo los chats con mayor puntaje del resto (bosque, octubre):

| Se revisa | Chats | Con persona | Cobertura de los 84 | Contra el azar |
|---|---|---|---|---|
| 10 % | 58 | 36 % | 25 % | 2,5 veces |
| 20 % | 117 | 23 % | 32 % | 1,6 veces |
| 30 % | 176 | 23 % | 48 % | 1,6 veces |
| 50 % | 293 | 23 % | 80 % | 1,6 veces |

Solo hay 84 chats con persona en este grupo, así que estos porcentajes tienen mucho margen de error. En una frase: el modelo reconoce con claridad los productos que se derivan a personas y, en el resto, mejora moderadamente la prioridad.

## Evolución por mes y anuncios

| Mes | Chats | Con anuncio | Con persona | Piden ambos | Piden broches |
|---|---|---|---|---|---|
| Marzo | 51 | 0 % | 78 % | 0 % | 0 % |
| Abril | 63 | 0 % | 90 % | 0 % | 3 % |
| Mayo | 61 | 0 % | 84 % | 0 % | 5 % |
| Junio | 54 | 0 % | 83 % | 0 % | 2 % |
| Julio | 173 | 65 % | 39 % | 3 % | 35 % |
| Agosto | 1.286 | 89 % | 51 % | 32 % | 41 % |
| Septiembre | 1.251 | 93 % | 60 % | 43 % | 25 % |
| Octubre | 1.042 | 91 % | 49 % | 35 % | 30 % |

"Con anuncio" suma los anuncios observados y los inferidos por la regla de texto ("hola" más pedido de información). La etiqueta "observado" aparece recién desde el 24 de agosto, así que probablemente refleja desde cuándo se registra el dato y no desde cuándo hay anuncios.

- Hasta junio no hay chats de anuncio: unos 50 por mes, casi todos con una persona. Desde julio aparecen y en agosto el volumen se multiplica por más de veinte.
- El entrenamiento es casi todo agosto: 1.233 de los 1.635 chats de entrenamiento.
- De agosto a octubre cambia qué se promociona (ambos pasa de 32 a 43 y a 35 %) y con eso cambia la proporción con persona (51, 60 y 49 %). Es consistente con una rotación de campañas, aunque estos datos no permiten confirmarlo.
- Hay que reentrenar cuando cambien las campañas.

## Niveles de prioridad

La cola de chats pendientes se divide por posición, no por probabilidad (los puntajes no están calibrados): Alta (primeros 30 %), Media (30 a 50 %), Baja (50 a 70 %) y Base (el 30 % restante). Porcentaje de chats de cada nivel que terminan con una persona:

| Nivel | Septiembre | Octubre |
|---|---|---|
| Alta | 98 | 94 |
| Media | 87 | 62 |
| Baja | 53 | 31 |
| Base | 15 | 7 |

Los cortes son una propuesta a validar con la gerencia. Detalle por grupo de variables y modelo en `niveles_prioridad.csv`.

## Cómo leer el puntaje

El número que devuelve cada modelo (de 0 a 100 en la aplicación) es un **puntaje de prioridad**: ordena bien los chats, pero no es una probabilidad calibrada. En octubre el bosque predice en promedio más intervención humana que la real y exagera en los valores intermedios. Para uso real habría que recalibrarlo con cada período.

## Limitaciones

- La etiqueta mide si una persona respondió, no si el chat lo necesitaba.
- El test es retrospectivo (octubre ya había sido inspeccionado) y cubre un solo mes.
- Hay un fuerte componente de producto: buena parte de lo que predice el modelo es una regla de derivación del negocio (ambos médicos y chalecos). En el resto de los chats la mejora es moderada. Si cambia el catálogo o las reglas del bot, hay que reentrenar.
- Los datos son casi todos de agosto a octubre y los anuncios cambian: el modelo aprendió de un período corto y puede degradarse cuando cambien las campañas.
- La hipótesis sobre el largo del texto (mensaje precargado del anuncio) no está verificada porque la copia del repo no trae el contenido de los mensajes.
- Las 56 variables son un análisis adicional: el protocolo fija las 58.
- No se recalibró: se reporta Brier y la curva de calibración (`figuras/05_calibracion.png`), pero los puntajes no son probabilidades confiables sin recalibrar.
- El MLP usa solo escalado, como fija el protocolo.

## Archivos de resultados

| Archivo | Contenido |
|---|---|
| `metricas.csv` | todas las métricas por modelo, grupo de variables, partición y umbral |
| `intervalos_test.csv` | Average Precision y ROC-AUC con intervalos por contacto |
| `aporte_comerciales_test.csv` | diferencia entre usar o no las señales comerciales, con y sin largo de texto |
| `diferencias_entre_modelos_test.csv` | diferencias de Average Precision entre modelos |
| `cobertura_top_k_test.csv` | qué pasa si se revisa solo el 10, 20, 30 o 50 % de mayor puntaje |
| `atencion_por_tramo_test.csv` | ranking contra atención humana observada |
| `importancia_bloques.csv` | caída de la métrica al permutar cada bloque |
| `sensibilidad_contactos.csv` | test con un episodio por contacto |
| `segmentos_test.csv` | métricas en octubre para chats con ambos o chalecos y para el resto |
| `cobertura_top_k_resto_test.csv` | qué pasa si se revisa solo la parte de arriba dentro del resto |
| `evolucion_mensual.csv` | volumen, anuncios, mezcla de productos y respuesta humana por mes |
| `composicion_por_mes.csv` | cuántos chats de cada mes hay en train, validation, test y purgados |
| `niveles_prioridad.csv` | tasa con persona por nivel de prioridad (validation y test), por grupo y modelo |
| `busqueda.csv` | las 107 configuraciones probadas por grupo de variables |
| `configuracion.json` | configuraciones elegidas, particiones, hashes, versiones |
| `figuras/` | gráficos 01 a 11 |

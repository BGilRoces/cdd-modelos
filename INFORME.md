# Resultados de la comparación de modelos — Telar S.A

Corrida del 24/11/2026 sobre los 3.811 episodios maduros con cobertura de atención del snapshot del 01/11 del caso presentado como Telar S.A. Todas las cifras salen de `resultados/` y se reproducen con `python -m modelado`.

## Resumen

- Con las 58 variables del protocolo, bosque, árbol y MLP llegan a una Average Precision de 0,88, 0,87 y 0,86 en test.
- Esa cifra depende en parte del **largo del texto** del primer mensaje del cliente. Ese largo se concentra en unos pocos valores exactos (54 caracteres en el 30 % de los episodios, 58 en el 14 %, 48 en el 11 %), compatibles con el mensaje que el anuncio precarga en WhatsApp. Cambiar el texto del anuncio cambia ese valor y el modelo deja de funcionar. No tenemos el texto de los mensajes para confirmarlo.
- Por eso el análisis central se hace **sin las dos variables de largo de texto** (`inbound_text_chars` y `anchor_useful_text_chars`), quedando 56 variables. Resultado: las variables operativas solas no predicen nada (Average Precision 0,49, igual que el azar) y las señales de familia de producto sí (0,89).
- Antes de modelar se descartan **170 episodios (4,3 %) cuya ventana de 24 horas no tuvo ninguna hora de atención humana**, porque su etiqueta "sin persona" no significa que no la necesitaran. Ver la sección *Cobertura de atención*.
- Con las 56 variables, los tres modelos rinden parecido en ranking. Se recomienda el **bosque para puntuar** y el **árbol al lado para explicar**.

## Cobertura de atención

La etiqueta `human_replied_24h` vale como "el chat necesitaba a una persona" solo si en esas 24 horas había alguien atendiendo. Si no lo había, el 0 es un dato faltante, no un "no".

El horario del equipo se infiere de los 10.572 mensajes salientes de personas del propio export: una celda (día, hora) está activa si hubo mensajes humanos en al menos 15 fechas distintas, y una fecha cuenta como día de atención si tuvo al menos 5 mensajes humanos. Las personas escriben solo de lunes a viernes, aproximadamente de 8 a 18 h, y hay 25 días hábiles sin actividad (feriados u otros cierres).

Se descartan los episodios cuya ventana de 24 horas no contiene ninguna hora activa:

| | Episodios |
|---|---|
| Descartados | 170 de 3.981 (4,3 %) |
| De sábado | 93 |
| De viernes, después de las 18 h | 68 |
| Domingo y feriados | 9 |
| Con persona entre los descartados | 10 (5,9 %) |
| En train / validation / test | 153 / 7 / 10 |

Con solo una hora de cobertura la tasa de respuesta humana ya es 53 %, igual que el resto (57 %); solo el cero total está contaminado. Los descartados se concentran en train (9,4 % de ese conjunto), así que el sesgo afectaba sobre todo al entrenamiento. Una prueba exploratoria con el bosque y las 56 variables mostró el efecto: entrenado con esos chats, el puntaje medio de los chats de octubre bajaba de 0,64 a 0,34 si se los suponía llegando un sábado a las 22 h; sin esos chats, el puntaje queda en 0,64 en cualquier día.

El filtro se aplica en `datos.cohorte_con_cobertura` y se documenta en `resultados/sin_cobertura.csv`. Es un desvío del protocolo del grupo, que fija los conteos de partición. El horario real del equipo habría que confirmarlo con la empresa.

## Particiones

| Partición | Episodios | Con respuesta humana |
|---|---|---|
| Train (antes de septiembre) | 1.482 | 58,0 % |
| Validation (septiembre) | 1.158 | 62,4 % |
| Test (octubre) | 1.032 | 49,5 % |
| Purgados | 139 | — |

La proporción de respuestas humanas cambia entre meses. Con el umbral de 0,5 los modelos tienden a predecir "con humano" de más (recall alto, precision cerca de 0,70). Por eso la comparación principal usa Average Precision, que no depende del umbral.

## Qué queda sin el largo del texto

Average Precision en test (octubre). Dummy: 0,495.

| Variables | Árbol | Bosque | MLP |
|---|---|---|---|
| 10 operativas | 0,829 | 0,844 | 0,681 |
| 9 operativas, sin largo de texto | 0,488 | 0,494 | 0,487 |
| 58 (protocolo) | 0,867 | 0,884 | 0,859 |
| 56, sin largo de texto | 0,869 | 0,887 | 0,870 |

Sin el largo de texto, las variables operativas (hora, día, horario laboral, cantidad de mensajes, duración) no distinguen nada. Agregarles las señales comerciales sube la Average Precision en 0,38 a 0,39 para los tres modelos (intervalos 95 %: árbol 0,343–0,419, bosque 0,346–0,440, MLP 0,340–0,428). Las 56 variables dan prácticamente lo mismo que las 58: la información útil está en las señales comerciales.

## Qué señales son las que importan

Permutando bloques de variables en validation (bosque, 56 variables), lo que más baja la métrica es la familia ofrecida por el bot (0,039), seguida de la familia pedida (0,030) y la coincidencia entre pedido y oferta (0,016). Las operativas aportan 0,009.

La tasa de respuesta humana depende mucho de qué producto se pide (sobre los 3.811 episodios):

| Familia pedida | Episodios | Con respuesta humana |
|---|---|---|
| Broches | 1.146 | 15 % |
| Abrojos | 185 | 33 % |
| Elásticos | 343 | 33 % |
| Telas | 103 | 70 % |
| Cintas | 199 | 75 % |
| Cierres | 84 | 76 % |
| "Ambos" | 1.287 | 96 % |
| Chalecos | 77 | 99 % |

Hay productos que el bot resuelve casi solo (broches) y otros que casi siempre pasan a una persona (chalecos). Conviene confirmar con la empresa si algunas familias se derivan por regla y no por decisión de una persona.

## Comparación entre modelos con las 56 variables

| Modelo | Average Precision (IC 95 %) | ROC-AUC | Precision | Recall | F1 | Brier |
|---|---|---|---|---|---|---|
| Dummy | 0,495 (0,465–0,526) | 0,500 | 0,495 | 1,000 | 0,662 | 0,257 |
| Árbol | 0,869 (0,841–0,895) | 0,888 | 0,670 | 0,951 | 0,786 | 0,170 |
| Bosque | 0,887 (0,853–0,919) | 0,905 | 0,699 | 0,949 | 0,805 | 0,155 |
| MLP | 0,870 (0,834–0,903) | 0,885 | 0,681 | 0,945 | 0,792 | 0,173 |

Precision, recall, F1 y Brier son con umbral 0,5. Los intervalos remuestrean contactos completos, no episodios sueltos.

Diferencias de Average Precision entre modelos (test, intervalo 95 %):

| Comparación | Diferencia | IC 95 % |
|---|---|---|
| Bosque − árbol | +0,018 | −0,000 a 0,036 |
| Bosque − MLP | +0,017 | −0,008 a 0,045 |
| Árbol − MLP | −0,001 | −0,028 a 0,025 |

Los tres modelos son estadísticamente indistinguibles en test; la ventaja del bosque sobre el árbol queda justo en el borde del intervalo.

## Modelo recomendado

**Bosque aleatorio con las 56 variables para puntuar, con el árbol de decisión al lado para explicar.**

El bosque (300 árboles) se elige para puntuar porque, aunque en Average Precision no hay una diferencia clara, es el mejor en todas las medidas que importan para una cola de prioridad:

- **Mejor ranking:** Average Precision 0,887 y ROC-AUC 0,905, contra 0,869 y 0,888 del árbol y 0,870 y 0,885 del MLP.
- **Mejor F1:** 0,805 contra 0,786 y 0,792 (umbral 0,5).
- **Mejor calibración:** Brier 0,155 contra 0,170 y 0,173.
- **Mejor en septiembre:** Average Precision de validation 0,951 contra 0,928 (árbol) y 0,945 (MLP).
- **Puntaje más fino.** En octubre el árbol produce solo 16 valores distintos y el 19 % de los chats cae en un único valor, de modo que una parte grande de la cola queda empatada sin orden. El bosque produce 833 valores distintos y su mayor empate es de 0,9 %. Para ordenar chats esto pesa más que la simplicidad.

El árbol (profundidad 5, 16 hojas) queda como explicación: rinde parecido (Average Precision 0,869 contra 0,887) y sus reglas se leen en términos de producto pedido y producto ofrecido, que es lo que se puede discutir con la gerencia. Es una aproximación explicable, no es el bosque.

El MLP no se descartó por rendir peor en ranking de forma significativa, sino porque no mejora ninguna de las medidas y no se puede explicar.

Honestidad sobre la elección: la diferencia de Average Precision entre bosque y árbol (+0,018, IC −0,000 a 0,036) y entre bosque y MLP (+0,017, IC −0,008 a 0,045) no es significativa. El protocolo pide preferir el modelo más simple ante un desempeño parecido; se opta por combinar los dos y explicitar el compromiso: el bosque aporta el ranking fino y el árbol aporta la explicación. Combinar modelos justificando qué aporta cada uno es además una de las expectativas superadoras de la consigna. La decisión final es del grupo.

## Utilidad para quien supervisa

Si el gerente revisa solo los chats con mayor puntaje del bosque (56 variables, test):

| Chats revisados | Con respuesta humana | Cobertura de los chats con respuesta humana | Mejora sobre azar |
|---|---|---|---|
| 10 % | 91 % | 18 % | 1,8 veces |
| 20 % | 94 % | 38 % | 1,9 veces |
| 30 % | 94 % | 57 % | 1,9 veces |
| 50 % | 84 % | 84 % | 1,7 veces |

Con el 20 % de arriba se revisan unos 206 chats de 1.032 y casi todos terminan con una persona.

## ¿El ranking ordena por atención real?

Se dividió el test en cinco tramos según el puntaje. En el bosque con 56 variables, el tramo de mayor puntaje tuvo 4,1 mensajes humanos por chat y 94 % con foto o documento; el de menor puntaje, 0,2 y 1 %. La correlación de Spearman entre puntaje y cantidad de mensajes humanos es 0,63 (árbol 0,60). Esto describe conducta histórica, no necesidad.

## ¿Cuánto aporta el modelo más allá de los productos impulsados?

Ambos médicos y chalecos son los productos que la empresa impulsa con publicidad y refuerza con atención humana (confirmado por el grupo). Son el 44 % de los chats de octubre y el 95 % termina con una persona, de modo que reconocerlos explica buena parte del resultado. Para medir cuánto queda por encima de eso, se evaluó el bosque (56 variables) por separado en cada grupo de chats de octubre:

| Grupo de chats | Chats | Con persona | Average Precision | ROC-AUC |
|---|---|---|---|---|
| Todos | 1.032 | 50 % | 0,887 | 0,905 |
| Con ambos médicos o chalecos | 451 (44 %) | 95 % | 0,930 | 0,390 |
| Todo lo demás | 581 (56 %) | 14 % | 0,293 | 0,681 |

- Dentro de ambos y chalecos el modelo no distingue (ROC-AUC 0,39, incluso por debajo del azar): casi todos terminan con una persona.
- En el resto, el modelo ordena mejor que el azar (Average Precision 0,293 contra 0,145), pero la mejora es moderada. El árbol da 0,215 y el MLP 0,240.

Si el gerente revisa solo los chats con mayor puntaje del resto (bosque, octubre):

| Se revisa | Chats | Con persona | Cobertura de los 84 | Contra el azar |
|---|---|---|---|---|
| 10 % | 58 | 40 % | 27 % | 2,7 veces |
| 20 % | 116 | 25 % | 35 % | 1,7 veces |
| 30 % | 174 | 21 % | 44 % | 1,5 veces |
| 50 % | 290 | 24 % | 82 % | 1,6 veces |

Solo hay 84 chats con persona en este grupo, así que estos porcentajes tienen mucho margen de error. En una frase: el modelo reconoce con claridad los productos que se derivan a personas y, en el resto, mejora moderadamente la prioridad.

## Evolución por mes y anuncios

| Mes | Chats | Con anuncio | Con persona | Piden ambos | Piden broches |
|---|---|---|---|---|---|
| Marzo | 49 | 0 % | 82 % | 0 % | 0 % |
| Abril | 56 | 0 % | 96 % | 0 % | 4 % |
| Mayo | 56 | 0 % | 91 % | 0 % | 5 % |
| Junio | 51 | 0 % | 82 % | 0 % | 2 % |
| Julio | 163 | 67 % | 39 % | 4 % | 36 % |
| Agosto | 1.160 | 89 % | 56 % | 34 % | 40 % |
| Septiembre | 1.244 | 93 % | 61 % | 43 % | 25 % |
| Octubre | 1.032 | 92 % | 50 % | 35 % | 30 % |

"Con anuncio" suma los anuncios observados y los inferidos por la regla de texto ("hola" más pedido de información). La etiqueta "observado" aparece recién desde el 24 de agosto, así que probablemente refleja desde cuándo se registra el dato y no desde cuándo hay anuncios.

- Hasta junio no hay chats de anuncio: unos 50 por mes, casi todos con una persona. Desde julio aparecen y en agosto el volumen se multiplica por más de veinte.
- El entrenamiento es casi todo agosto: 1.107 de los 1.482 chats de entrenamiento.
- De agosto a octubre cambia qué se promociona (ambos pasa de 34 a 43 y a 35 %) y con eso cambia la proporción con persona (56, 61 y 50 %). Es consistente con una rotación de campañas, aunque estos datos no permiten confirmarlo.
- Hay que reentrenar cuando cambien las campañas.

## Niveles de prioridad

La cola de chats pendientes se divide por posición, no por probabilidad (los puntajes no están calibrados): Alta (primeros 30 %), Media (30 a 50 %), Baja (50 a 70 %) y Base (el 30 % restante). Porcentaje de chats de cada nivel que terminan con una persona:

| Nivel | Septiembre | Octubre |
|---|---|---|
| Alta | 98 | 93 |
| Media | 91 | 69 |
| Baja | 51 | 31 |
| Base | 15 | 5 |

Los cortes son una propuesta a validar con la gerencia. Detalle por grupo de variables y modelo en `niveles_prioridad.csv`.

## Cómo leer el puntaje

El número que devuelve cada modelo (de 0 a 100 en la aplicación) es un **puntaje de prioridad**: ordena bien los chats, pero no es una probabilidad calibrada. El bosque promedia las estimaciones de sus 300 árboles; en octubre exagera en los valores intermedios (por ejemplo predice 0,30 en una banda donde la tasa observada es 0,03) y solo coincide con la realidad en el extremo alto. Para uso real habría que recalibrarlo con cada período.

## Limitaciones

- La etiqueta mide si una persona respondió, no si el chat lo necesitaba. Se corrige solo en parte descartando los chats sin cobertura de atención; fuera de eso, que un chat no haya recibido persona no prueba que no la necesitara.
- El horario del equipo se infiere de los mensajes del export, no es el horario real. Los días y horas siguen entrando como variables del modelo y pueden reflejar disponibilidad del equipo.
- El test es retrospectivo (octubre ya había sido inspeccionado) y cubre un solo mes.
- Hay un fuerte componente de producto: buena parte de lo que predice el modelo es una regla de derivación del negocio (ambos médicos y chalecos). En el resto de los chats la mejora es moderada. Si cambia el catálogo o las reglas del bot, hay que reentrenar.
- Los datos son casi todos de agosto a octubre y los anuncios cambian: el modelo aprendió de un período corto y puede degradarse cuando cambien las campañas.
- La hipótesis sobre el largo del texto (mensaje precargado del anuncio) no está verificada porque la copia del repo no trae el contenido de los mensajes.
- Las 56 variables son un análisis adicional y el filtro de cobertura modifica los conteos de partición: el protocolo fija las 58 variables y los conteos originales.
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
| `sin_cobertura.csv` | episodios descartados por no tener atención humana en sus 24 horas, por partición y día |
| `busqueda.csv` | las 107 configuraciones probadas por grupo de variables |
| `configuracion.json` | configuraciones elegidas, particiones, hashes, versiones, criterio de cobertura |
| `figuras/` | gráficos 01 a 11 |

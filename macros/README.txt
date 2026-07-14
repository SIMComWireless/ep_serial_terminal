Carpeta de macros para la consola AT.

Estructura: una subcarpeta por módulo. El nombre debe coincidir con el id del módulo
en el selector (a76xx, a7672sa, sim7600, sim7600e/g/a/ce, a7600, sim7080, sim7070, sim7022).
La subcarpeta "common" sirve para macros 3GPP que andan en cualquier módulo.
Cada archivo .txt es una macro.

Formato:
  - un comando AT por línea
  - líneas que empiezan con #   -> comentarios
  - @500                        -> espera 500 ms
  - ^Z / ^[                     -> Ctrl-Z / ESC
  - \r / \n / \t                -> CR / LF / TAB

En la consola: grupo "Macros" (arriba a la izquierda) -> Load folder… -> elegí ESTA carpeta.
La subcarpeta del módulo enfocado aparece arriba y resaltada.

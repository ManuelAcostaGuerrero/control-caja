# Control Caja

Aplicación independiente, mobile-first, para controlar el dinero físico de caja fuerte por empresa y dejar cada retiro completamente rendido. Está preparada para integrarse posteriormente con Sagva System.

## Versión inicial 0.1.0

- Saldo físico por empresa.
- Ingresos y retiros.
- Destino/local por retiro (por ejemplo Gastrobar).
- Responsable y concepto previsto.
- Pago de factura con número opcional; si falta queda como factura pendiente.
- Monto retirado distinto del monto real de factura y control de vuelto pendiente.
- Varias facturas/boletas vinculadas a un mismo retiro.
- Vuelto ligado al retiro original.
- Estados: rendición pendiente, factura pendiente, vuelto pendiente, diferencia y completo.
- Catálogos administrables de empresas, locales, tipos de gasto y categorías.
- Interfaz responsive para computador y celular.
- Historial sin borrado de movimientos en esta primera versión.

## Uso local en Windows

Carpeta recomendada: `C:\Users\Admin\Documents\Codex\control-caja`.

1. Clonar `https://github.com/ManuelAcostaGuerrero/control-caja.git`.
2. Ejecutar `Preparar.bat` una sola vez.
3. Ejecutar `Iniciar.bat`.
4. Abrir `http://localhost:5174`.

Para actualizar se mantiene el mismo criterio de los otros proyectos: cambios integrados en `main`, respaldo previo, sin reset/stash forzado, avance `fast-forward`, pruebas y compilación. Puede usarse el flujo manual `Detener.bat` → `Actualizar.bat` → `Iniciar.bat`; si se ejecuta `Actualizar.bat` con Control Caja iniciado, el script reinicia únicamente sus procesos cuando todas las validaciones terminan correctamente.

## Puertos

- Pantalla: `5174`
- API: `4100`

Se escogieron puertos propios para no interferir con otros proyectos locales.

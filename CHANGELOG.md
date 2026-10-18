# Changelog

## 0.4.0 — 2026-10-18

- Los montos se formatean con separadores de miles mientras se escriben, por ejemplo `1.250.000`.
- Ingreso simplificado con botones rápidos: Caja, Vuelto y Otro.
- Caja permite registrar un rango de fechas opcional (desde/hasta) y queda identificado como motivo Caja en el historial.
- Vuelto se vincula al movimiento original y admite múltiples devoluciones parciales hasta completar la diferencia.
- Los vueltos nuevos quedan registrados como movimientos de ingreso trazables.
- Un administrador local puede registrar un ingreso o retiro en otro local de la misma empresa sin obtener acceso al historial de ese local.
- Dashboard, historial y detalle de movimientos quedan limitados a los locales visibles del usuario; el dueño/administrador del sistema conserva visión global.
- Para seleccionar un vuelto, el usuario solo ve pendientes de sus locales visibles o movimientos creados por él mismo en otro local.
- Se mantiene la separación entre locales permitidos para consulta y locales disponibles para registrar una operación puntual.

## 0.3.0 — 2026-10-18

- Catálogos de locales, tipos de gasto y categorías permiten editar, activar/desactivar y eliminar.
- La eliminación se bloquea si el elemento está en uso.
- El aviso inicial no expone movimientos; el administrador puede elegir “Ver movimientos” y abrir directamente cada Movimiento #ID.
- Desde el movimiento, el administrador del sistema puede corregir local, tipo de gasto y categoría.
- Las facturas/rendiciones permiten corregir tipo y categoría desde el detalle.
- Auditoría administrativa de creación, modificación, activación/desactivación y eliminación de catálogos, con usuario y fecha.
- Nueva pestaña Auditoría en Configuración.
- Se corrigió la alineación del formulario Agregar en Categorías, tanto en computador como celular.
- Los selectores Gasto y Factura muestran iconos diferenciados.
- `package-lock.json` permanece ignorado localmente para no bloquear `Actualizar.bat` cuando npm lo genere.

## 0.2.0 — 2026-10-18

- Inicio de sesión básico con usuario y clave.
- Usuario inicial de pruebas `admin / admin`.
- Roles separados: administrador del sistema, administrador local y usuario.
- Gestión administrativa de usuarios, permisos de ingreso/retiro y locales autorizados.
- Local por defecto configurable o selección obligatoria por usuario.
- Eliminado el campo manual Responsable: cada movimiento guarda automáticamente el usuario de sesión.
- Registro móvil simplificado: Retiro > Gasto o Factura.
- Factura con número opcional y proveedor seleccionable desde ventana emergente.
- Catálogo administrable de proveedores.
- Factura con Monto exacto o Con vuelto.
- Limpieza controlada de movimientos de prueba conservando configuraciones.
- Se agrega DISTRIBUIDORA al catálogo de locales cuando no existe.
- Instalación npm configurada para no generar package-lock local que bloquee futuras actualizaciones.

## 0.1.0 — 2026-10-18

- Base independiente de Control Caja preparada para futura integración con Sagva System.
- Dashboard con saldo, pendientes y últimos movimientos.
- Registro de ingresos y retiros por empresa/local.
- Pago de facturas con número opcional y estado de factura pendiente.
- Rendición de varios documentos por retiro.
- Registro de vuelto asociado a la salida original.
- Tipos de gasto y categorías configurables.
- Interfaz responsive para computador y celular.
- SQLite local y scripts Windows `Preparar`, `Iniciar`, `Detener`, `Estado`, `Respaldar` y `Actualizar`.
- Actualización manual controlada con respaldo, fast-forward, pruebas y compilación.

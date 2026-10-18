# Control Caja

Aplicación independiente, mobile-first, para controlar el dinero físico de caja fuerte y posteriormente integrarlo con Sagva System.

## Versión 0.4.0

El registro se simplificó para uso rápido desde celular:

- El movimiento inicia como **Retiro**.
- Se selecciona el **local**. Cada usuario puede tener un local por defecto o estar obligado a elegirlo.
- No existe un campo manual de responsable: el movimiento queda ligado automáticamente al usuario de la sesión.
- En un retiro se elige rápidamente entre **Gasto** y **Factura**.
- Gasto: comentario obligatorio y clasificación opcional.
- Factura: número opcional, proveedor desde una lista y opción **Monto exacto** o **Con vuelto**.
- Si falta el número de factura queda pendiente para completarlo.
- Si la factura es con vuelto, el monto real puede informarse en el momento o después.
- Los vueltos quedan ligados al retiro original y pueden registrarse en varios abonos parciales.
- En **Ingreso** existen accesos rápidos para **Caja**, **Vuelto** y **Otro**.
- Caja admite fechas Desde/Hasta opcionales y queda identificado como motivo Caja en el historial.
- Los montos muestran separadores de miles mientras se escriben.
- Se pueden registrar varias facturas/boletas en una misma rendición.

## Usuarios

Hay tres roles:

- **Administrador del sistema**: administra usuarios, permisos, locales, catálogos y datos de prueba.
- **Administrador local**: ve únicamente los movimientos de sus locales permitidos. Puede registrar una operación puntual en otro local de la misma empresa sin obtener acceso a su historial y puede administrar proveedores.
- **Usuario**: registra movimientos según los permisos que le asigne el administrador.

El administrador del sistema define por usuario:

- locales permitidos;
- local por defecto o selección obligatoria;
- permiso para retirar;
- permiso para ingresar dinero;
- rol y estado del usuario.

Acceso inicial de pruebas:

- Usuario: `admin`
- Clave: `admin`

La seguridad avanzada (biometría/huella, autenticación móvil más fuerte, etc.) se implementará posteriormente.

## Proveedores

Al seleccionar **Factura**, el campo Proveedor abre una ventana de búsqueda/selección. Los administradores pueden agregar proveedores al catálogo sin recargar el formulario.

## Datos de prueba

El administrador del sistema dispone de **Configuración > Pruebas > Limpiar datos de prueba**. La acción elimina movimientos, facturas, rendiciones y vueltos, pero conserva usuarios, proveedores, locales, tipos y categorías.

## Uso local en Windows

Carpeta recomendada: `C:\Users\Admin\Documents\Codex\control-caja`.

Primera instalación:

```bat
cd /d C:\Users\Admin\Documents\Codex
git clone https://github.com/ManuelAcostaGuerrero/control-caja.git
cd control-caja
Preparar.bat
Iniciar.bat
```

Actualizaciones posteriores:

```bat
cd /d C:\Users\Admin\Documents\Codex\control-caja
Actualizar.bat
```

Abrir: `http://localhost:5174`.

Puertos: pantalla `5174`, API `4100`.

### Catálogos y auditoría

Los administradores del sistema pueden editar, desactivar o eliminar locales, tipos de gasto y categorías. Si un elemento está en uso, la eliminación se bloquea y se puede abrir la lista de movimientos relacionados para corregirlos. Los cambios administrativos quedan registrados en la pestaña Auditoría con usuario y fecha.

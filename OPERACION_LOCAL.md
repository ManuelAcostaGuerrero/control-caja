# Operación local — Control Caja

Repositorio: `ManuelAcostaGuerrero/control-caja`, rama `main`.
Carpeta local recomendada: `C:\Users\Admin\Documents\Codex\control-caja`.

## Archivos rápidos

- `Preparar.bat`: instala dependencias si faltan, crea `.env` desde ejemplos y compila la pantalla. No sobrescribe configuración existente.
- `Iniciar.bat`: inicia solamente Control Caja y verifica API/pantalla.
- `Detener.bat`: detiene únicamente los procesos registrados por este proyecto.
- `Estado.bat`: muestra puertos, procesos propios, configuración y estado Git.
- `Respaldar.bat`: genera un respaldo manual.
- `Actualizar.bat`: respalda, descarga `origin/main`, exige avance fast-forward, instala dependencias, valida, prueba y compila. Si el sistema estaba activo, lo reinicia solo al terminar correctamente.

## Reglas de actualización

1. La instalación local debe estar en rama `main` y sin cambios sin confirmar.
2. `origin` debe apuntar a `https://github.com/ManuelAcostaGuerrero/control-caja.git`.
3. Nunca se hace `reset --hard`, stash automático ni descarte de cambios locales.
4. Antes de instalar una actualización se crea un respaldo en `.local/backups/`.
5. Los servicios ajenos en puertos `4100` o `5174` nunca se detienen automáticamente.
6. La actualización solo usa `merge --ff-only` desde `origin/main`.
7. Después de instalar código se ejecutan validación, pruebas y build.
8. Ante error, se detiene el proceso de actualización y queda registro en `.local/*.log`.

## Datos

SQLite: `data/control-caja.db` (ignorado por Git).
Configuración privada: `server/.env` y `client/.env` (ignorados por Git).
Respaldos: `.local/backups/<fecha-id>/`.

El respaldo SQLite se realiza con `VACUUM INTO` y luego se valida con `PRAGMA integrity_check`. También se copian los archivos `.env` existentes y se registra el commit instalado.

## Modelo funcional inicial

Un retiro representa dinero físico que sale de la caja fuerte. Después puede recibir una o varias rendiciones (facturas, boletas u otros documentos) y uno o varios registros de vuelto. El sistema compara el dinero entregado contra documentos + vuelto para determinar si el retiro está completo o pendiente.

No se eliminan movimientos financieros desde la interfaz. Los catálogos administrativos se desactivan para conservar referencias históricas.


## Usuarios y acceso — 0.2.0

La primera migración 0.2.0 crea un administrador del sistema si todavía no existe ningún usuario:

- usuario: `admin`
- clave: `admin`

Este acceso es temporal para pruebas. El administrador del sistema crea usuarios y administradores locales desde Configuración > Usuarios. Cada usuario puede tener varios locales permitidos, un local por defecto o la obligación de elegirlo en cada movimiento.

Los movimientos nuevos guardan el usuario de sesión automáticamente. El campo Responsable ya no se solicita manualmente.

## Limpieza antes de producción

Configuración > Pruebas permite borrar todos los movimientos, documentos y vueltos de prueba. Exige escribir exactamente `LIMPIAR PRUEBAS`. No borra usuarios, locales, proveedores, categorías ni tipos de gasto.

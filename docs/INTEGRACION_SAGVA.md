# Integración futura con Sagva System

Control Caja se mantiene independiente en la primera etapa. La integración futura deberá cruzar empresa, local/destino, proveedor, número de factura, monto y fecha.

Campos que deben preservarse al integrar:

- Identificador propio de movimiento.
- Empresa y local/destino.
- Tipo y categoría de gasto.
- Número de factura/documento y proveedor.
- Monto retirado, monto rendido y vuelto.
- Responsable y creador del registro.
- Fecha/hora.

La integración no debe convertir Sagva en la fuente del saldo físico. Control Caja seguirá siendo la fuente de los movimientos reales de caja fuerte, mientras Sagva aportará la comprobación comercial/contable y las referencias de facturas/proveedores/productos.

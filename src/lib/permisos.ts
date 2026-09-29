// Módulos de la app y el permiso que hace falta para verlos.
// La lista de permisos por rol vive en la tabla permisos_rol; aquí solo se decide qué enseñar.

export type Rol = "dueno" | "encargado" | "empleado" | "gestoria";

export const NOMBRE_ROL: Record<Rol, string> = {
  dueno: "Dueño",
  encargado: "Encargado",
  empleado: "Empleado",
  gestoria: "Gestoría",
};

export type Modulo = {
  clave: string;
  nombre: string;
  descripcion: string;
  permisoVer: string;
};

export const MODULOS: Modulo[] = [
  {
    clave: "ventas",
    nombre: "Ventas",
    descripcion: "Cierre de caja diario y evolución de ventas.",
    permisoVer: "ventas.ver",
  },
  {
    clave: "inventario",
    nombre: "Inventario",
    descripcion: "Stock, mínimos y recuentos desde el móvil.",
    permisoVer: "inventario.ver",
  },
  {
    clave: "gastos",
    nombre: "Gastos",
    descripcion: "Proveedores y gastos por categoría.",
    permisoVer: "gastos.ver",
  },
  {
    clave: "facturas",
    nombre: "Facturas recibidas",
    descripcion: "Facturas de proveedores y su estado de pago.",
    permisoVer: "facturas.ver",
  },
  {
    clave: "margenes",
    nombre: "Márgenes",
    descripcion: "Coste y precio de cada producto.",
    permisoVer: "margenes.ver",
  },
];

export function buscarModulo(clave: string): Modulo | undefined {
  return MODULOS.find((modulo) => modulo.clave === clave);
}

// Módulos que ve un usuario: los que su negocio tiene activos y su rol permite.
export function modulosVisibles(permisos: Set<string>, activos: string[]): Modulo[] {
  return MODULOS.filter(
    (modulo) => activos.includes(modulo.clave) && permisos.has(modulo.permisoVer),
  );
}

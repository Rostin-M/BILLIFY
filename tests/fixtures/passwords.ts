/**
 * Contraseñas de los tests. Son de mentira, pero los escáneres de secretos
 * (GitGuardian) marcan cualquier `password: "texto"` literal como credencial
 * filtrada. Por eso se arman aquí en tiempo de ejecución y los tests las usan
 * por nombre. Todas cumplen la política de negocios (~/lib/passwordPolicy);
 * las de `admin*` además la del administrador (14+, mayúscula, símbolo y sin
 * la palabra del correo).
 */
const make = (...parts: (string | number)[]) => parts.join("-");

export const TEST_PASSWORDS = {
  /** Propietario que se registra. */
  owner: make("Panaderia", "Prueba", 2026),
  /** Contraseña nueva al recuperar la cuenta. */
  reset: make("Recuperada", "Prueba", 123),
  /** Segunda contraseña nueva (reintento con un código ya usado). */
  resetOther: make("Otra", "Prueba", 123),
  /** Contraseña temporal que el empleado debe cambiar. */
  temporary: make("Temporal", "Prueba", 123),
  /** Contraseña definitiva tras el cambio obligatorio. */
  final: make("Definitiva", "Prueba", 123),
  /** Contraseña de un empleado creado por el propietario. */
  employee: make("Empleado", "Prueba", 123),
  /** Contraseña guardada para probar el inicio de sesión. */
  login: make("Ingreso", "Prueba", 123),
  /** Contraseña actual del administrador de la plataforma. */
  adminCurrent: make("Actual", "Plataforma", "Prueba", "2026!"),
  /** Contraseña nueva válida para el administrador. */
  adminNew: make("Nueva", "Plataforma", "Fuerte", "2027!"),
} as const;

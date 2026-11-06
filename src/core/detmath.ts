/**
 * Engine-independent trigonometry for the simulation (ARCHITECTURE.md: "replay = re-simulation", bit-identical).
 *
 * `Math.sin`, `Math.cos` and `Math.pow` are not bit-identical across JavaScript engines, nor across versions of one
 * engine: measured on 200,000 arguments in 0–12 rad, Node 22 (V8 12.4) and Chromium 141 disagree in the last bit for
 * 3.4 % of `Math.sin` and `Math.cos` results, and for 8–10 % of `x ** y` / `Math.pow` results for every exponent but
 * 2 and 0.5 (the same battle then played differently in the browser and in Node). `+ − × ÷` and `Math.sqrt` are
 * exactly rounded by IEEE 754 on every engine (and JavaScript never fuses a multiply-add), so the functions here use
 * nothing else: the argument reduction and kernels of fdlibm / musl (`__rem_pio2` medium case with all three
 * Cody–Waite rounds, `__sin`, `__cos`; Sun Microsystems, freely redistributable), accurate to under 1 ulp.
 *
 * The other transcendental functions the simulation uses (`Math.atan2`, `Math.acos`, `Math.hypot`, `Math.exp`,
 * `Math.log`, `Math.log2`, `Math.cbrt`) are V8's own fdlibm ports and gave identical results on both builds; the
 * determinism lint (`tests/lint.test.ts`) keeps `Math.sin`, `Math.cos`, `Math.pow` and `**` with an exponent other
 * than 2 out of the simulation-affecting directories.
 */

const PIO4 = 0.7853981633974483;
const INVPIO2 = 6.36619772367581382433e-1;
/** pi/2 split for Cody–Waite reduction: each `PIO2_n` has 33 significant bits, so `n × PIO2_n` is exact for |n| < 2^20. */
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21;
const PIO2_3T = 8.47842766036889956997e-32;
/** 1.5 × 2^52: adding and subtracting it rounds a double to the nearest integer (ties to even). */
const TOINT = 6755399441055744;
/** Beyond this the medium reduction loses exactness; the argument is first brought into range with `%` (exact). */
const MEDIUM_LIMIT = 1.6e6;
const TWO_PI = 6.283185307179586;

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

/** sin(x + y) on [−π/4, π/4], y the tail of the reduced argument (musl `__sin`). */
function kSin(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

/** cos(x + y) on [−π/4, π/4] (musl `__cos`). */
function kCos(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const one = 1 - hz;
  return one + (((1 - one) - hz) + (z * r - x * y));
}

/** Reduced argument: x = n·π/2 + (y0 + y1), |y0| ≤ ~π/4; returns n mod 4 (0..3). Shared scratch, single-threaded. */
let y0 = 0;
let y1 = 0;
function remPio2(xIn: number): number {
  let x = xIn;
  if (!(Math.abs(x) < MEDIUM_LIMIT)) x = x % TWO_PI;
  const fn = x * INVPIO2 + TOINT - TOINT;
  // First round, good to 85 bits (x − fn·PIO2_1 is exact); the second (118 bits) only when it cancels more than 16
  // bits, the third (151 bits) only when that cancels more than 49 — then each subtraction below is exact (fdlibm's
  // exponent tests, written as magnitude comparisons).
  const ax = Math.abs(x);
  let r = x - fn * PIO2_1;
  let w = fn * PIO2_1T;
  y0 = r - w;
  if (Math.abs(y0) * 65536 < ax) {
    let t = r;
    w = fn * PIO2_2;
    r = t - w;
    w = fn * PIO2_2T - ((t - r) - w);
    y0 = r - w;
    if (Math.abs(y0) * 562949953421312 < ax) {
      t = r;
      w = fn * PIO2_3;
      r = t - w;
      w = fn * PIO2_3T - ((t - r) - w);
      y0 = r - w;
    }
  }
  y1 = (r - y0) - w;
  const q = fn % 4;
  return q < 0 ? q + 4 : q;
}

/** Deterministic sine (bit-identical on every engine). */
export function dsin(x: number): number {
  if (Math.abs(x) <= PIO4) return kSin(x, 0);
  if (!Number.isFinite(x)) return NaN;
  switch (remPio2(x)) {
    case 0:
      return kSin(y0, y1);
    case 1:
      return kCos(y0, y1);
    case 2:
      return -kSin(y0, y1);
    default:
      return -kCos(y0, y1);
  }
}

/** Deterministic cosine (bit-identical on every engine). */
export function dcos(x: number): number {
  if (Math.abs(x) <= PIO4) return kCos(x, 0);
  if (!Number.isFinite(x)) return NaN;
  switch (remPio2(x)) {
    case 0:
      return kCos(y0, y1);
    case 1:
      return -kSin(y0, y1);
    case 2:
      return -kCos(y0, y1);
    default:
      return kSin(y0, y1);
  }
}

/**
 * Deterministic x^y for x > 0 through `Math.exp` and `Math.log` (V8's fdlibm ports, identical across the builds
 * measured; `Math.pow` and `**` are not). Integer powers are better written out as products.
 */
export function dpow(x: number, y: number): number {
  if (x === 0) return y > 0 ? 0 : y === 0 ? 1 : Infinity;
  if (y === 0) return 1;
  return Math.exp(y * Math.log(x));
}

/**
 * Debug-math helpers emitted into generated C when CodeGenerationOptions.debugMath
 * is enabled: safe divide/mod with block names, plus RK4 isfinite macros.
 */

/** Epsilon for "~zero" denominator checks (absolute). */
export const OBLIQ_DEBUG_MATH_EPS = '1e-15'

/**
 * Preamble for generated .c when debugMath is on.
 * Requires stdio.h, math.h, stdlib.h (abort).
 */
export function generateDebugMathPreamble(): string {
  return `/* --- OBLIQ_DEBUG_MATH: safe div/mod + RK4 finite checks --- */
#ifndef OBLIQ_DEBUG_MATH
#define OBLIQ_DEBUG_MATH 1
#endif
#ifndef OBLIQ_DEBUG_MATH_EPS
#define OBLIQ_DEBUG_MATH_EPS ${OBLIQ_DEBUG_MATH_EPS}
#endif

static inline void obliq_math_abort(double t, const char *block, const char *what, double a, double b) {
    fprintf(stderr,
            "OBLIQ_DEBUG_MATH t=%.17g block=\\"%s\\": %s (a=%.17g b=%.17g)\\n",
            t, block ? block : "?", what ? what : "math error", a, b);
    fflush(stderr);
    abort();
}

/** Safe divide: abort if den ~0 or either operand non-finite. */
static inline double obliq_safe_div(double num, double den, const char *block, double t) {
    if (!isfinite(num) || !isfinite(den) || !(fabs(den) > OBLIQ_DEBUG_MATH_EPS)) {
        obliq_math_abort(t, block, "divide by zero or non-finite operand", num, den);
    }
    return num / den;
}

/** Safe remainder (C % semantics via fmod): abort if den ~0. */
static inline double obliq_safe_mod(double num, double den, const char *block, double t) {
    if (!isfinite(num) || !isfinite(den) || !(fabs(den) > OBLIQ_DEBUG_MATH_EPS)) {
        obliq_math_abort(t, block, "remainder/mod by zero or non-finite operand", num, den);
    }
    return fmod(num, den);
}

#define OBLIQ_CHECK_FINITE(val, stage, t, field) do { \\
    double _obliq_v_ = (double)(val); \\
    if (!isfinite(_obliq_v_)) { \\
        fprintf(stderr, \\
                "OBLIQ_DEBUG_MATH t=%.17g RK4 stage=%s field=%s value=%.17g\\n", \\
                (t), (stage), (field), _obliq_v_); \\
        fflush(stderr); \\
        abort(); \\
    } \\
} while (0)

`
}

/**
 * Escape a block name for use as a C string literal.
 */
export function cStringLiteral(name: string): string {
  return JSON.stringify(name || '?')
}

/**
 * Emit an obliq_safe_div call.
 */
export function emitSafeDiv(
  numExpr: string,
  denExpr: string,
  blockName: string,
  timeExpr: string = 'model->time'
): string {
  return `obliq_safe_div((${numExpr}), (${denExpr}), ${cStringLiteral(blockName)}, ${timeExpr})`
}

/**
 * Emit an obliq_safe_mod / fmod call.
 */
export function emitSafeMod(
  numExpr: string,
  denExpr: string,
  blockName: string,
  timeExpr: string = 'model->time'
): string {
  return `obliq_safe_mod((${numExpr}), (${denExpr}), ${cStringLiteral(blockName)}, ${timeExpr})`
}

/**
 * Simple "Hello World" test for Emscripten compilation
 * This tests basic C to WebAssembly compilation
 */

#include <stdio.h>
#include <math.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

/**
 * Simple addition function exported to WebAssembly
 */
EMSCRIPTEN_KEEPALIVE
double add(double a, double b) {
    return a + b;
}

/**
 * Simple multiplication function exported to WebAssembly
 */
EMSCRIPTEN_KEEPALIVE
double multiply(double a, double b) {
    return a * b;
}

/**
 * Test math library function (sin)
 */
EMSCRIPTEN_KEEPALIVE
double compute_sin(double x) {
    return sin(x);
}

/**
 * Main function for testing compilation
 */
int main() {
    printf("Hello from WebAssembly!\n");
    printf("2 + 3 = %.2f\n", add(2.0, 3.0));
    printf("2 * 3 = %.2f\n", multiply(2.0, 3.0));
    printf("sin(0) = %.2f\n", compute_sin(0.0));
    return 0;
}

#include <emscripten/emscripten.h>
#include "lz4.h"

EMSCRIPTEN_KEEPALIVE
size_t wasm_lz4_compress_bound(size_t input_size) {
    return lz4_compress_bound(input_size);
}

EMSCRIPTEN_KEEPALIVE
size_t wasm_lz4_compress(const uint8_t* input, size_t input_size, uint8_t* output, size_t output_size) {
    return lz4_compress(input, input_size, output, output_size);
}

EMSCRIPTEN_KEEPALIVE
size_t wasm_lz4_decompress(const uint8_t* input, size_t input_size, uint8_t* output, size_t output_size) {
    return lz4_decompress(input, input_size, output, output_size);
}

EMSCRIPTEN_KEEPALIVE
size_t wasm_lz4_block_header_size() {
    return lz4_block_header_size();
}

EMSCRIPTEN_KEEPALIVE
size_t wasm_lz4_end_marker_size() {
    return lz4_end_marker_size();
}

EMSCRIPTEN_KEEPALIVE
size_t wasm_lz4_write_block_header(uint8_t* output, size_t uncompressed_size, size_t compressed_size) {
    return lz4_write_block_header(output, uncompressed_size, compressed_size);
}

EMSCRIPTEN_KEEPALIVE
size_t wasm_lz4_write_end_marker(uint8_t* output) {
    return lz4_write_end_marker(output);
}

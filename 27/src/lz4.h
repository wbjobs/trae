#ifndef LZ4_H
#define LZ4_H

#include <stdint.h>
#include <stddef.h>

#define LZ4_MAGIC_BLOCK 0x4B434C42
#define LZ4_MAGIC_END   0x42444E45

#ifdef __cplusplus
extern "C" {
#endif

size_t lz4_compress(const uint8_t* input, size_t input_size, uint8_t* output, size_t output_size);

size_t lz4_decompress(const uint8_t* input, size_t input_size, uint8_t* output, size_t output_size);

size_t lz4_compress_bound(size_t input_size);

size_t lz4_write_block_header(uint8_t* output, size_t uncompressed_size, size_t compressed_size);

size_t lz4_write_end_marker(uint8_t* output);

size_t lz4_read_block_header(const uint8_t* input, size_t input_size, size_t* uncompressed_size, size_t* compressed_size, size_t* header_size);

int lz4_is_end_marker(const uint8_t* input, size_t input_size);

size_t lz4_block_header_size(void);

size_t lz4_end_marker_size(void);

#ifdef __cplusplus
}
#endif

#endif

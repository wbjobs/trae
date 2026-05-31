#include "lz4.h"
#include <string.h>

#define HASH_TABLE_SIZE 65536
#define MIN_MATCH 4
#define MAX_DISTANCE 65535

typedef struct {
    int16_t table[HASH_TABLE_SIZE];
} HashTable;

static inline uint32_t hash4(const uint8_t* p) {
    uint32_t v = ((uint32_t)p[0]) | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
    return (v * 2654435761u) >> 16;
}

static inline void init_hash_table(HashTable* ht) {
    memset(ht->table, 0xFF, sizeof(ht->table));
}

static inline uint8_t* write_varint(uint8_t* dst, size_t value) {
    while (value >= 15) {
        *dst++ = 0xF0 | (value & 0x0F);
        value -= 15;
        while (value >= 255) {
            *dst++ = 0xFF;
            value -= 255;
        }
        *dst++ = (uint8_t)value;
        return dst;
    }
    *dst++ = (uint8_t)(value << 4);
    return dst;
}

static inline size_t read_varint(const uint8_t** src, size_t max) {
    size_t value = **src >> 4;
    if (value == 15) {
        uint8_t next;
        do {
            (*src)++;
            if ((size_t)(*src - (const uint8_t*)0) >= max) break;
            next = **src;
            value += next;
        } while (next == 0xFF);
    }
    return value;
}

size_t lz4_compress_bound(size_t input_size) {
    return input_size + (input_size / 255) + 16;
}

size_t lz4_compress(const uint8_t* input, size_t input_size, uint8_t* output, size_t output_size) {
    if (input_size < MIN_MATCH) {
        if (output_size < input_size + 1) return 0;
        output[0] = (uint8_t)(input_size << 4);
        memcpy(output + 1, input, input_size);
        return input_size + 1;
    }

    HashTable ht;
    init_hash_table(&ht);

    const uint8_t* ip = input;
    const uint8_t* iend = input + input_size;
    const uint8_t* anchor = ip;

    uint8_t* op = output;
    uint8_t* oend = output + output_size;

    while (ip < iend - MIN_MATCH) {
        uint32_t h = hash4(ip);
        int16_t cached = ht.table[h];
        ht.table[h] = (int16_t)(ip - input);

        if (cached == -1 || (int16_t)(ip - input) - cached > MAX_DISTANCE) {
            ip++;
            continue;
        }

        const uint8_t* match_start = input + cached;

        if (memcmp(match_start, ip, MIN_MATCH) != 0) {
            ip++;
            continue;
        }

        size_t literal_len = ip - anchor;
        size_t match_len = MIN_MATCH;

        while (ip + match_len < iend && match_start + match_len < ip &&
               match_start[match_len] == ip[match_len]) {
            match_len++;
        }

        if (op + 2 + literal_len + 2 > oend) return 0;

        uint8_t token = (uint8_t)(literal_len < 15 ? literal_len << 4 : 0xF0);
        token |= (uint8_t)(match_len - MIN_MATCH < 15 ? match_len - MIN_MATCH : 0x0F);
        *op++ = token;

        if (literal_len >= 15) {
            size_t v = literal_len - 15;
            while (v >= 255) {
                if (op >= oend) return 0;
                *op++ = 0xFF;
                v -= 255;
            }
            if (op >= oend) return 0;
            *op++ = (uint8_t)v;
        }

        if (literal_len > 0) {
            if (op + literal_len > oend) return 0;
            memcpy(op, anchor, literal_len);
            op += literal_len;
        }

        uint16_t offset = (uint16_t)(ip - match_start);
        if (op + 2 > oend) return 0;
        *op++ = (uint8_t)(offset & 0xFF);
        *op++ = (uint8_t)(offset >> 8);

        if (match_len - MIN_MATCH >= 15) {
            size_t v = match_len - MIN_MATCH - 15;
            while (v >= 255) {
                if (op >= oend) return 0;
                *op++ = 0xFF;
                v -= 255;
            }
            if (op >= oend) return 0;
            *op++ = (uint8_t)v;
        }

        ip += match_len;
        anchor = ip;
    }

    size_t literal_len = iend - anchor;
    if (op + 1 + literal_len > oend) return 0;

    if (literal_len < 15) {
        *op++ = (uint8_t)(literal_len << 4);
    } else {
        *op++ = 0xF0;
        size_t v = literal_len - 15;
        while (v >= 255) {
            if (op >= oend) return 0;
            *op++ = 0xFF;
            v -= 255;
        }
        if (op >= oend) return 0;
        *op++ = (uint8_t)v;
    }

    if (literal_len > 0) {
        memcpy(op, anchor, literal_len);
        op += literal_len;
    }

    return (size_t)(op - output);
}

size_t lz4_decompress(const uint8_t* input, size_t input_size, uint8_t* output, size_t output_size) {
    const uint8_t* ip = input;
    const uint8_t* iend = input + input_size;
    uint8_t* op = output;
    uint8_t* oend = output + output_size;

    while (ip < iend) {
        if (ip >= iend) return 0;
        uint8_t token = *ip++;

        size_t literal_len = token >> 4;
        if (literal_len == 15) {
            uint8_t next;
            do {
                if (ip >= iend) return 0;
                next = *ip++;
                literal_len += next;
            } while (next == 0xFF);
        }

        if (literal_len > 0) {
            if (ip + literal_len > iend || op + literal_len > oend) return 0;
            memcpy(op, ip, literal_len);
            op += literal_len;
            ip += literal_len;
        }

        if (ip >= iend) break;

        if (ip + 1 >= iend) return 0;
        uint16_t offset = (uint16_t)ip[0] | ((uint16_t)ip[1] << 8);
        ip += 2;

        size_t match_len = (token & 0x0F) + MIN_MATCH;
        if (match_len == 15 + MIN_MATCH) {
            uint8_t next;
            do {
                if (ip >= iend) return 0;
                next = *ip++;
                match_len += next;
            } while (next == 0xFF);
        }

        if (offset == 0 || offset > (size_t)(op - output)) return 0;
        if (op + match_len > oend) return 0;

        uint8_t* match_src = op - offset;
        if (offset == 1) {
            uint8_t v = match_src[0];
            memset(op, v, match_len);
        } else if (offset >= match_len) {
            memcpy(op, match_src, match_len);
        } else {
            for (size_t i = 0; i < match_len; i++) {
                op[i] = match_src[i];
            }
        }
        op += match_len;
    }

    return (size_t)(op - output);
}

size_t lz4_block_header_size(void) {
    return 12;
}

size_t lz4_end_marker_size(void) {
    return 4;
}

size_t lz4_write_block_header(uint8_t* output, size_t uncompressed_size, size_t compressed_size) {
    output[0] = (uint8_t)(LZ4_MAGIC_BLOCK & 0xFF);
    output[1] = (uint8_t)((LZ4_MAGIC_BLOCK >> 8) & 0xFF);
    output[2] = (uint8_t)((LZ4_MAGIC_BLOCK >> 16) & 0xFF);
    output[3] = (uint8_t)((LZ4_MAGIC_BLOCK >> 24) & 0xFF);

    output[4] = (uint8_t)(uncompressed_size & 0xFF);
    output[5] = (uint8_t)((uncompressed_size >> 8) & 0xFF);
    output[6] = (uint8_t)((uncompressed_size >> 16) & 0xFF);
    output[7] = (uint8_t)((uncompressed_size >> 24) & 0xFF);

    output[8] = (uint8_t)(compressed_size & 0xFF);
    output[9] = (uint8_t)((compressed_size >> 8) & 0xFF);
    output[10] = (uint8_t)((compressed_size >> 16) & 0xFF);
    output[11] = (uint8_t)((compressed_size >> 24) & 0xFF);

    return 12;
}

size_t lz4_write_end_marker(uint8_t* output) {
    output[0] = (uint8_t)(LZ4_MAGIC_END & 0xFF);
    output[1] = (uint8_t)((LZ4_MAGIC_END >> 8) & 0xFF);
    output[2] = (uint8_t)((LZ4_MAGIC_END >> 16) & 0xFF);
    output[3] = (uint8_t)((LZ4_MAGIC_END >> 24) & 0xFF);
    return 4;
}

size_t lz4_read_block_header(const uint8_t* input, size_t input_size, size_t* uncompressed_size, size_t* compressed_size, size_t* header_size) {
    if (input_size < 12) return 0;

    uint32_t magic = ((uint32_t)input[0]) | ((uint32_t)input[1] << 8) | ((uint32_t)input[2] << 16) | ((uint32_t)input[3] << 24);
    
    if (magic == LZ4_MAGIC_END) {
        *header_size = 4;
        return 0;
    }

    if (magic != LZ4_MAGIC_BLOCK) return 0;

    *uncompressed_size = ((uint32_t)input[4]) | ((uint32_t)input[5] << 8) | ((uint32_t)input[6] << 16) | ((uint32_t)input[7] << 24);
    *compressed_size = ((uint32_t)input[8]) | ((uint32_t)input[9] << 8) | ((uint32_t)input[10] << 16) | ((uint32_t)input[11] << 24);
    *header_size = 12;

    return 1;
}

int lz4_is_end_marker(const uint8_t* input, size_t input_size) {
    if (input_size < 4) return 0;
    uint32_t magic = ((uint32_t)input[0]) | ((uint32_t)input[1] << 8) | ((uint32_t)input[2] << 16) | ((uint32_t)input[3] << 24);
    return magic == LZ4_MAGIC_END;
}

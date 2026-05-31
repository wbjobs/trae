CC = emcc
CFLAGS = -O3 -s WASM=1
EXPORTED_FUNCS = -s EXPORTED_FUNCTIONS="['_matmul', '_matmul_optimized', '_matmul_tiled', '_create_matrix', '_free_matrix', '_random_matrix', '_zero_matrix']"
EXPORTED_METHODS = -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'getValue', 'setValue', 'HEAPF32']"
MEMORY = -s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=256MB -s INITIAL_MEMORY=64MB -s STACK_SIZE=5MB
SAFARI_COMPAT = -s ASSERTIONS=0 -s DISABLE_EXCEPTION_CATCHING=1 -s FILESYSTEM=0 \
	-s ENVIRONMENT='web' -s MODULARIZE=1 -s EXPORT_ES6=0 \
	-s WASM_BIGINT=0 -s SIMD=0 -s BULK_MEMORY=0 -s MUTABLE_GLOBALS=0 \
	-s SIGN_EXT=0 -s SATURATE_FLOAT_TO_INT=0

SAFARI_MAX_COMPAT = -s ALLOW_MEMORY_GROWTH=0 -s INITIAL_MEMORY=134217728 \
	-s MAXIMUM_MEMORY=134217728 -s STACK_SIZE=5242880 \
	-s THREADS=0 -s WASM_WORKERS=0 -s EXCEPTION_DEBUG=0 \
	-s DEMANGLE_SUPPORT=0 -s RESERVED_FUNCTION_POINTERS=0 \
	-s LEGACY_VM_SUPPORT=1 -s STRICT=1 --no-entry

TARGET = ../frontend/matmul.js
SAFARI_TARGET = ../frontend/matmul_safari.js

all: $(TARGET)

$(TARGET): matmul.cpp
	$(CC) $(CFLAGS) $(EXPORTED_FUNCS) $(EXPORTED_METHODS) $(MEMORY) $(SAFARI_COMPAT) matmul.cpp -o $(TARGET)

safari: matmul.cpp
	$(CC) -O2 $(CFLAGS) $(EXPORTED_FUNCS) $(EXPORTED_METHODS) $(SAFARI_COMPAT) $(SAFARI_MAX_COMPAT) matmul.cpp -o $(SAFARI_TARGET)
	@echo ""
	@echo "Safari build complete!"
	@echo "To use: rename matmul_safari.js -> matmul.js and matmul_safari.wasm -> matmul.wasm"

clean:
	rm -f $(TARGET) ../frontend/matmul.wasm $(SAFARI_TARGET) ../frontend/matmul_safari.wasm

.PHONY: all safari clean

@echo off
echo Building WASM module with Safari compatibility...
emcc matmul.cpp -O3 ^
  -s WASM=1 ^
  -s EXPORTED_FUNCTIONS="['_matmul', '_matmul_optimized', '_matmul_tiled', '_create_matrix', '_free_matrix', '_random_matrix', '_zero_matrix']" ^
  -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'getValue', 'setValue', 'HEAPF32']" ^
  -s ALLOW_MEMORY_GROWTH=1 ^
  -s MAXIMUM_MEMORY=256MB ^
  -s INITIAL_MEMORY=64MB ^
  -s STACK_SIZE=5MB ^
  -s ASSERTIONS=0 ^
  -s DISABLE_EXCEPTION_CATCHING=1 ^
  -s FILESYSTEM=0 ^
  -s ENVIRONMENT='web' ^
  -s MODULARIZE=1 ^
  -s EXPORT_ES6=0 ^
  -s WASM_BIGINT=0 ^
  -s SIMD=0 ^
  -s BULK_MEMORY=0 ^
  -s MUTABLE_GLOBALS=0 ^
  -s SIGN_EXT=0 ^
  -s SATURATE_FLOAT_TO_INT=0 ^
  -o ../frontend/matmul.js
echo Build complete!
echo Note: For Safari compatibility, ensure you are using the generated files.

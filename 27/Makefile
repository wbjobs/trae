EMCC = emcc
CFLAGS = -O3 -Wall -Wextra
SRCDIR = src
BUILDDIR = build

all: $(BUILDDIR)/lz4.js $(BUILDDIR)/lz4.wasm

$(BUILDDIR):
	mkdir -p $(BUILDDIR)

$(BUILDDIR)/lz4.js: $(SRCDIR)/lz4.c $(SRCDIR)/lz4_wasm.c | $(BUILDDIR)
	$(EMCC) $(CFLAGS) \
		-s EXPORTED_FUNCTIONS='["_malloc","_free","_wasm_lz4_compress","_wasm_lz4_decompress","_wasm_lz4_compress_bound"]' \
		-s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue","UTF8ToString"]' \
		-s MODULARIZE=1 \
		-s EXPORT_NAME=LZ4Module \
		-s ALLOW_MEMORY_GROWTH=1 \
		-s INITIAL_MEMORY=16777216 \
		-o $@ $^

clean:
	rm -rf $(BUILDDIR)

.PHONY: all clean

#include "raylib.h"

#include <array>
#include <string>
#include <cstring>
#include <cstdio>
#include <algorithm>
#include <stack>
#include <vector>
#include <functional>

#ifdef PLATFORM_WASM
#include <emscripten.h>
#endif

static constexpr int CANVAS_W = 256;
static constexpr int CANVAS_H = 256;
static constexpr int MAX_LAYERS = 3;
static constexpr int PALETTE_SIZE = 16;
static constexpr int MAX_HISTORY = 100;
static constexpr int MAX_FRAMES = 24;
static constexpr size_t LAYER_BYTES = (size_t)CANVAS_W * CANVAS_H * 4;
static constexpr size_t STATE_BYTES = LAYER_BYTES * MAX_LAYERS;

static const std::array<Color, PALETTE_SIZE> DEFAULT_PALETTE = {
    Color{  0,  0,  0,255},
    Color{ 34, 32, 52,255},
    Color{ 69, 40, 60,255},
    Color{102, 57, 49,255},
    Color{143, 86, 59,255},
    Color{223,113, 38,255},
    Color{217,160,102,255},
    Color{238,191,143,255},
    Color{182, 49, 49,255},
    Color{200, 95, 95,255},
    Color{ 52,133, 64,255},
    Color{105,208,112,255},
    Color{ 90,105,136,255},
    Color{106,155,195,255},
    Color{153,229,255,255},
    Color{255,255,255,255},
};

enum ToolId {
    TOOL_PENCIL = 0,
    TOOL_ERASER,
    TOOL_EYEDROPPER,
    TOOL_FILL,
    TOOL_COUNT
};

static const char* TOOL_NAMES[TOOL_COUNT] = {
    "Pencil", "Eraser", "Eyedropper", "Fill"
};

struct Layer {
    std::vector<unsigned char> data;
    bool visible = true;
    float opacity = 1.0f;
    std::string name;
    Texture2D texture{};

    Layer() = default;
    Layer(const std::string& n) : name(n) {
        data.resize(CANVAS_W * CANVAS_H * 4, 0);
    }
};

class HistoryBuffer {
public:
    HistoryBuffer() {
        for (int i = 0; i < MAX_HISTORY; ++i) {
            undoSlots[i] = new unsigned char[STATE_BYTES];
            redoSlots[i] = new unsigned char[STATE_BYTES];
        }
    }
    ~HistoryBuffer() {
        for (int i = 0; i < MAX_HISTORY; ++i) {
            delete[] undoSlots[i];
            delete[] redoSlots[i];
        }
    }
    HistoryBuffer(const HistoryBuffer&) = delete;
    HistoryBuffer& operator=(const HistoryBuffer&) = delete;

    void pushUndo(const std::array<Layer, MAX_LAYERS>& layers) {
        if (undoCount >= MAX_HISTORY) {
            std::memmove(undoSlots[0], undoSlots[1],
                         STATE_BYTES * (MAX_HISTORY - 1));
            undoCount = MAX_HISTORY - 1;
        }
        serialize(layers, undoSlots[undoCount++]);
        redoCount = 0;
    }
    bool canUndo() const { return undoCount > 0; }
    bool canRedo() const { return redoCount > 0; }

    void undo(std::array<Layer, MAX_LAYERS>& layers) {
        if (undoCount <= 0) return;
        serialize(layers, redoSlots[redoCount++]);
        --undoCount;
        deserialize(undoSlots[undoCount], layers);
    }
    void redo(std::array<Layer, MAX_LAYERS>& layers) {
        if (redoCount <= 0) return;
        serialize(layers, undoSlots[undoCount++]);
        --redoCount;
        deserialize(redoSlots[redoCount], layers);
    }
    void clear() { undoCount = 0; redoCount = 0; }

private:
    static void serialize(const std::array<Layer, MAX_LAYERS>& layers, unsigned char* dst) {
        for (int i = 0; i < MAX_LAYERS; ++i)
            std::memcpy(dst + i * LAYER_BYTES, layers[i].data.data(), LAYER_BYTES);
    }
    static void deserialize(const unsigned char* src, std::array<Layer, MAX_LAYERS>& layers) {
        for (int i = 0; i < MAX_LAYERS; ++i)
            std::memcpy(layers[i].data.data(), src + i * LAYER_BYTES, LAYER_BYTES);
    }
    unsigned char* undoSlots[MAX_HISTORY] = {};
    unsigned char* redoSlots[MAX_HISTORY] = {};
    int undoCount = 0;
    int redoCount = 0;
};

class BitWriter {
public:
    void write(int code, int bits) {
        for (int i = 0; i < bits; ++i) {
            bitBuf |= ((code >> i) & 1) << bitPos;
            if (++bitPos == 8) {
                bytes.push_back(bitBuf);
                bitBuf = 0;
                bitPos = 0;
            }
        }
    }
    void flush() {
        if (bitPos > 0) {
            bytes.push_back(bitBuf);
            bitBuf = 0;
            bitPos = 0;
        }
    }
    std::vector<unsigned char> bytes;
private:
    unsigned char bitBuf = 0;
    int bitPos = 0;
};

static std::vector<unsigned char> lzwCompress(const unsigned char* data, int len, int minCodeSize) {
    BitWriter bw;
    int clearCode = 1 << minCodeSize;
    int endCode = clearCode + 1;
    int codeSize = minCodeSize + 1;
    int nextCode = endCode + 1;
    static const int MAX_DICT = 4096;
    struct DictEntry { int prefix; unsigned char suffix; };
    DictEntry dict[MAX_DICT];
    int dictCount = 0;

    auto resetDict = [&]() {
        dictCount = 0;
        for (int i = 0; i < clearCode; ++i) {
            dict[dictCount].prefix = -1;
            dict[dictCount].suffix = (unsigned char)i;
            dictCount++;
        }
        nextCode = endCode + 1;
        codeSize = minCodeSize + 1;
    };

    auto dictLookup = [&](int prefix, unsigned char suffix) -> int {
        for (int i = 0; i < dictCount; ++i) {
            if (dict[i].prefix == prefix && dict[i].suffix == suffix) return i;
        }
        return -1;
    };

    resetDict();
    bw.write(clearCode, codeSize);
    int currentSeq = data[0];

    for (int i = 1; i < len; ++i) {
        unsigned char c = data[i];
        int found = dictLookup(currentSeq, c);
        if (found >= 0) {
            currentSeq = found;
        } else {
            bw.write(currentSeq, codeSize);
            if (nextCode < MAX_DICT) {
                dict[dictCount].prefix = currentSeq;
                dict[dictCount].suffix = c;
                dictCount++;
                nextCode++;
                if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
            } else {
                bw.write(clearCode, codeSize);
                resetDict();
            }
            currentSeq = c;
        }
    }
    bw.write(currentSeq, codeSize);
    bw.write(endCode, codeSize);
    bw.flush();
    return bw.bytes;
}

static std::vector<unsigned char> encodeGIF(
    const std::vector<unsigned char*>& framePixels,
    int frameCount,
    const std::array<Color, PALETTE_SIZE>& palette,
    int fps)
{
    std::vector<unsigned char> gif;
    auto push = [&](unsigned char b) { gif.push_back(b); };
    auto push16 = [&](int v) { push(v & 0xFF); push((v >> 8) & 0xFF); };

    push('G'); push('I'); push('F'); push('8'); push('9'); push('a');
    push16(CANVAS_W);
    push16(CANVAS_H);
    push(0xF0 | 3);
    push(0);
    push(0);
    for (int i = 0; i < PALETTE_SIZE; ++i) {
        push(palette[i].r); push(palette[i].g); push(palette[i].b);
    }
    push(0x21); push(0xFF); push(0x0B);
    const char* ns = "NETSCAPE2.0";
    for (int i = 0; i < 11; ++i) push((unsigned char)ns[i]);
    push(0x03); push(0x01); push16(0); push(0x00);

    int delay = std::max(1, 100 / std::max(1, fps));

    for (int f = 0; f < frameCount; ++f) {
        push(0x21); push(0xF9); push(0x04);
        push(0x00);
        push16(delay);
        push(0x00);
        push(0x00);
        push(0x2C);
        push16(0); push16(0);
        push16(CANVAS_W); push16(CANVAS_H);
        push(0x00);

        int pixelCount = CANVAS_W * CANVAS_H;
        std::vector<unsigned char> indices(pixelCount);
        const unsigned char* src = framePixels[f];
        for (int i = 0; i < pixelCount; ++i) {
            int r = src[i*4], g = src[i*4+1], b = src[i*4+2], a = src[i*4+3];
            if (a == 0) { indices[i] = 0; continue; }
            int bestIdx = 0, bestDist = 1000000;
            for (int p = 0; p < PALETTE_SIZE; ++p) {
                int dr = r - palette[p].r;
                int dg = g - palette[p].g;
                int db = b - palette[p].b;
                int d = dr*dr + dg*dg + db*db;
                if (d < bestDist) { bestDist = d; bestIdx = p; }
            }
            indices[i] = (unsigned char)bestIdx;
        }

        std::vector<unsigned char> compressed = lzwCompress(indices.data(), pixelCount, 4);
        push(4);

        int pos = 0;
        while (pos < (int)compressed.size()) {
            int chunk = std::min(255, (int)compressed.size() - pos);
            push((unsigned char)chunk);
            for (int i = 0; i < chunk; ++i) push(compressed[pos + i]);
            pos += chunk;
        }
        push(0x00);
    }
    push(0x3B);
    return gif;
}

static unsigned int crc32Table[256] = {};
static bool crc32Initialized = false;

static void initCRC32() {
    if (crc32Initialized) return;
    for (unsigned int i = 0; i < 256; ++i) {
        unsigned int c = i;
        for (int j = 0; j < 8; ++j)
            c = (c & 1) ? (0xEDB88320 ^ (c >> 1)) : (c >> 1);
        crc32Table[i] = c;
    }
    crc32Initialized = true;
}

static unsigned int calcCRC32(const unsigned char* data, int len) {
    initCRC32();
    unsigned int crc = 0xFFFFFFFF;
    for (int i = 0; i < len; ++i)
        crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
    return crc ^ 0xFFFFFFFF;
}

static void appendChunk(std::vector<unsigned char>& out, const char* type,
                        const unsigned char* data, int len) {
    out.push_back((len >> 24) & 0xFF);
    out.push_back((len >> 16) & 0xFF);
    out.push_back((len >> 8) & 0xFF);
    out.push_back(len & 0xFF);
    int crcStart = (int)out.size();
    for (int i = 0; i < 4; ++i) out.push_back((unsigned char)type[i]);
    for (int i = 0; i < len; ++i) out.push_back(data[i]);
    unsigned int crc = calcCRC32(out.data() + crcStart, 4 + len);
    out.push_back((crc >> 24) & 0xFF);
    out.push_back((crc >> 16) & 0xFF);
    out.push_back((crc >> 8) & 0xFF);
    out.push_back(crc & 0xFF);
}

static void appendU32(std::vector<unsigned char>& v, unsigned int val) {
    v.push_back((val >> 24) & 0xFF);
    v.push_back((val >> 16) & 0xFF);
    v.push_back((val >> 8) & 0xFF);
    v.push_back(val & 0xFF);
}
static void appendU16(std::vector<unsigned char>& v, unsigned short val) {
    v.push_back((val >> 8) & 0xFF);
    v.push_back(val & 0xFF);
}

static std::vector<unsigned char> deflateUncompressed(const unsigned char* data, int len) {
    std::vector<unsigned char> out;
    int pos = 0;
    const int MAX_BLOCK = 65535;
    while (pos < len) {
        int chunk = std::min(MAX_BLOCK, len - pos);
        bool last = (pos + chunk >= len);
        out.push_back(last ? 0x01 : 0x00);
        out.push_back(chunk & 0xFF);
        out.push_back((chunk >> 8) & 0xFF);
        out.push_back((~chunk) & 0xFF);
        out.push_back(((~chunk) >> 8) & 0xFF);
        for (int i = 0; i < chunk; ++i) out.push_back(data[pos + i]);
        pos += chunk;
    }
    return out;
}

static unsigned int adler32(const unsigned char* data, int len) {
    unsigned int a = 1, b = 0;
    for (int i = 0; i < len; ++i) {
        a = (a + data[i]) % 65521;
        b = (b + a) % 65521;
    }
    return (b << 16) | a;
}

static std::vector<unsigned char> makeZlib(const unsigned char* raw, int rawLen) {
    std::vector<unsigned char> zlib;
    zlib.push_back(0x78);
    zlib.push_back(0x01);
    std::vector<unsigned char> deflated = deflateUncompressed(raw, rawLen);
    for (auto b : deflated) zlib.push_back(b);
    unsigned int adler = adler32(raw, rawLen);
    zlib.push_back((adler >> 24) & 0xFF);
    zlib.push_back((adler >> 16) & 0xFF);
    zlib.push_back((adler >> 8) & 0xFF);
    zlib.push_back(adler & 0xFF);
    return zlib;
}

static std::vector<unsigned char> buildFilteredScanlines(const unsigned char* rgba) {
    std::vector<unsigned char> out;
    out.resize(CANVAS_H * (1 + CANVAS_W * 4));
    for (int y = 0; y < CANVAS_H; ++y) {
        out[y * (1 + CANVAS_W * 4)] = 0;
        std::memcpy(out.data() + y * (1 + CANVAS_W * 4) + 1,
                    rgba + y * CANVAS_W * 4,
                    CANVAS_W * 4);
    }
    return out;
}

static std::vector<unsigned char> encodeAPNG(
    const std::vector<unsigned char*>& framePixels,
    int frameCount,
    int fps)
{
    std::vector<unsigned char> apng;
    unsigned char sig[] = {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    for (int i = 0; i < 8; ++i) apng.push_back(sig[i]);

    unsigned char ihdr[13];
    ihdr[0] = (CANVAS_W >> 24) & 0xFF; ihdr[1] = (CANVAS_W >> 16) & 0xFF;
    ihdr[2] = (CANVAS_W >> 8) & 0xFF;  ihdr[3] = CANVAS_W & 0xFF;
    ihdr[4] = (CANVAS_H >> 24) & 0xFF; ihdr[5] = (CANVAS_H >> 16) & 0xFF;
    ihdr[6] = (CANVAS_H >> 8) & 0xFF;  ihdr[7] = CANVAS_H & 0xFF;
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    appendChunk(apng, "IHDR", ihdr, 13);

    unsigned char actl[8];
    actl[0] = (frameCount >> 24) & 0xFF; actl[1] = (frameCount >> 16) & 0xFF;
    actl[2] = (frameCount >> 8) & 0xFF;  actl[3] = frameCount & 0xFF;
    actl[4] = 0; actl[5] = 0; actl[6] = 0; actl[7] = 0;
    appendChunk(apng, "acTL", actl, 8);

    int seq = 0;
    unsigned short num = (unsigned short)std::max(1, fps);
    unsigned short den = 1;

    for (int f = 0; f < frameCount; ++f) {
        std::vector<unsigned char> fctl;
        appendU32(fctl, seq++);
        appendU32(fctl, CANVAS_W);
        appendU32(fctl, CANVAS_H);
        appendU32(fctl, 0);
        appendU32(fctl, 0);
        appendU16(fctl, num);
        appendU16(fctl, den);
        fctl.push_back(0);
        fctl.push_back(0);
        appendChunk(apng, "fcTL", fctl.data(), (int)fctl.size());

        std::vector<unsigned char> filtered = buildFilteredScanlines(framePixels[f]);
        std::vector<unsigned char> zdata = makeZlib(filtered.data(), (int)filtered.size());

        if (f == 0) {
            appendChunk(apng, "IDAT", zdata.data(), (int)zdata.size());
        } else {
            std::vector<unsigned char> fdat;
            appendU32(fdat, seq++);
            for (auto b : zdata) fdat.push_back(b);
            appendChunk(apng, "fdAT", fdat.data(), (int)fdat.size());
        }
    }

    appendChunk(apng, "IEND", nullptr, 0);
    return apng;
}

struct PixelBoard {
    std::array<Layer, MAX_LAYERS> layers;
    int activeLayer = 0;
    std::array<Color, PALETTE_SIZE> palette;
    int currentColor = 0;
    int brushSize = 1;
    ToolId currentTool = TOOL_PENCIL;

    RenderTexture2D composited;
    bool dirtyComposite = true;

    Vector2 lastDrawPos = {-1, -1};
    bool drawing = false;

    unsigned char* frameData;
    int frameCount = 1;
    int currentFrame = 0;

    bool playing = false;
    int fps = 8;
    float playTimer = 0;
    bool onionSkin = false;

    HistoryBuffer history;

    PixelBoard() {
        for (int i = 0; i < MAX_LAYERS; ++i) {
            layers[i] = Layer("Layer " + std::to_string(i + 1));
            Image img = GenImageColor(CANVAS_W, CANVAS_H, BLANK);
            layers[i].texture = LoadTextureFromImage(img);
            UnloadImage(img);
        }
        layers[0].visible = true;
        palette = DEFAULT_PALETTE;
        composited = LoadRenderTexture(CANVAS_W, CANVAS_H);
        frameData = new unsigned char[STATE_BYTES * MAX_FRAMES];
        std::memset(frameData, 0, STATE_BYTES * MAX_FRAMES);
        saveCurrentToFrame(0);
    }

    ~PixelBoard() {
        for (auto& l : layers) UnloadTexture(l.texture);
        UnloadRenderTexture(composited);
        delete[] frameData;
    }
    PixelBoard(const PixelBoard&) = delete;
    PixelBoard& operator=(const PixelBoard&) = delete;

    Layer& active() { return layers[activeLayer]; }

    void saveCurrentToFrame(int idx) {
        for (int i = 0; i < MAX_LAYERS; ++i)
            std::memcpy(frameData + idx * STATE_BYTES + i * LAYER_BYTES,
                        layers[i].data.data(), LAYER_BYTES);
    }

    void loadFrameToCurrent(int idx) {
        for (int i = 0; i < MAX_LAYERS; ++i)
            std::memcpy(layers[i].data.data(),
                        frameData + idx * STATE_BYTES + i * LAYER_BYTES,
                        LAYER_BYTES);
        syncAllTextures();
        dirtyComposite = true;
    }

    void switchToFrame(int idx) {
        if (idx < 0 || idx >= frameCount) return;
        saveCurrentToFrame(currentFrame);
        currentFrame = idx;
        loadFrameToCurrent(idx);
        history.clear();
    }

    bool addFrame() {
        if (frameCount >= MAX_FRAMES) return false;
        saveCurrentToFrame(currentFrame);
        currentFrame = frameCount;
        std::memcpy(frameData + currentFrame * STATE_BYTES,
                    frameData + (currentFrame - 1) * STATE_BYTES, STATE_BYTES);
        loadFrameToCurrent(currentFrame);
        frameCount++;
        history.clear();
        return true;
    }

    bool addBlankFrame() {
        if (frameCount >= MAX_FRAMES) return false;
        saveCurrentToFrame(currentFrame);
        currentFrame = frameCount;
        std::memset(frameData + currentFrame * STATE_BYTES, 0, STATE_BYTES);
        loadFrameToCurrent(currentFrame);
        frameCount++;
        history.clear();
        return true;
    }

    bool deleteFrame() {
        if (frameCount <= 1) return false;
        for (int i = currentFrame; i < frameCount - 1; ++i)
            std::memcpy(frameData + i * STATE_BYTES,
                        frameData + (i + 1) * STATE_BYTES, STATE_BYTES);
        frameCount--;
        if (currentFrame >= frameCount) currentFrame = frameCount - 1;
        loadFrameToCurrent(currentFrame);
        history.clear();
        return true;
    }

    bool duplicateFrame() {
        if (frameCount >= MAX_FRAMES) return false;
        saveCurrentToFrame(currentFrame);
        for (int i = frameCount; i > currentFrame + 1; --i)
            std::memcpy(frameData + i * STATE_BYTES,
                        frameData + (i - 1) * STATE_BYTES, STATE_BYTES);
        currentFrame++;
        std::memcpy(frameData + currentFrame * STATE_BYTES,
                    frameData + (currentFrame - 1) * STATE_BYTES, STATE_BYTES);
        frameCount++;
        loadFrameToCurrent(currentFrame);
        history.clear();
        return true;
    }

    void pushUndo() { history.pushUndo(layers); }

    void undo() {
        if (!history.canUndo()) return;
        history.undo(layers);
        syncAllTextures();
        dirtyComposite = true;
    }
    void redo() {
        if (!history.canRedo()) return;
        history.redo(layers);
        syncAllTextures();
        dirtyComposite = true;
    }

    void syncAllTextures() {
        for (int i = 0; i < MAX_LAYERS; ++i)
            UpdateTexture(layers[i].texture, layers[i].data.data());
    }

    void setPixel(int x, int y, Color c) {
        if (x < 0 || x >= CANVAS_W || y < 0 || y >= CANVAS_H) return;
        Layer& l = active();
        int idx = (y * CANVAS_W + x) * 4;
        l.data[idx + 0] = c.r; l.data[idx + 1] = c.g;
        l.data[idx + 2] = c.b; l.data[idx + 3] = c.a;
    }

    Color getPixel(int layerIdx, int x, int y) const {
        if (x < 0 || x >= CANVAS_W || y < 0 || y >= CANVAS_H) return BLANK;
        const Layer& l = layers[layerIdx];
        int idx = (y * CANVAS_W + x) * 4;
        return Color{ l.data[idx], l.data[idx+1], l.data[idx+2], l.data[idx+3] };
    }

    void syncActiveTexture() {
        UpdateTexture(active().texture, active().data.data());
        dirtyComposite = true;
    }

    void refreshComposite() {
        BeginTextureMode(composited);
        ClearBackground(BLANK);

        if (onionSkin && currentFrame > 0 && !playing) {
            for (int i = 0; i < MAX_LAYERS; ++i) {
                if (!layers[i].visible) continue;
                Image img = GenImageColor(CANVAS_W, CANVAS_H, BLANK);
                std::memcpy(img.data,
                            frameData + (currentFrame - 1) * STATE_BYTES + i * LAYER_BYTES,
                            LAYER_BYTES);
                Texture2D t = LoadTextureFromImage(img);
                Color tint = WHITE;
                tint.a = (unsigned char)(255 * 0.25f * layers[i].opacity);
                Rectangle srcR = { 0, 0, (float)CANVAS_W, -(float)CANVAS_H };
                DrawTexturePro(t, srcR, {0, 0, (float)CANVAS_W, (float)CANVAS_H}, {0,0}, 0, tint);
                UnloadTexture(t);
                UnloadImage(img);
            }
        }

        Rectangle srcR = { 0, 0, (float)CANVAS_W, -(float)CANVAS_H };
        for (int i = 0; i < MAX_LAYERS; ++i) {
            if (!layers[i].visible) continue;
            Color tint = WHITE;
            tint.a = (unsigned char)(255.0f * layers[i].opacity);
            DrawTexturePro(layers[i].texture, srcR, {0, 0, (float)CANVAS_W, (float)CANVAS_H}, {0,0}, 0, tint);
        }
        EndTextureMode();
        dirtyComposite = false;
    }

    void paintAt(int cx, int cy) {
        Color c = currentTool == TOOL_ERASER ? BLANK : palette[currentColor];
        int r = brushSize / 2;
        for (int dy = -r; dy <= r; ++dy)
            for (int dx = -r; dx <= r; ++dx)
                setPixel(cx + dx, cy + dy, c);
    }

    void paintLine(int x0, int y0, int x1, int y1) {
        int dx = std::abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        int dy = -std::abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        int err = dx + dy;
        while (true) {
            paintAt(x0, y0);
            if (x0 == x1 && y0 == y1) break;
            int e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }

    void floodFill(int sx, int sy) {
        Layer& l = active();
        Color target = getPixel(activeLayer, sx, sy);
        Color rep = currentTool == TOOL_ERASER ? BLANK : palette[currentColor];
        if (target.r == rep.r && target.g == rep.g && target.b == rep.b && target.a == rep.a) return;

        std::stack<std::pair<int,int>> st;
        st.push({sx, sy});
        auto same = [&](int x, int y) {
            if (x < 0 || x >= CANVAS_W || y < 0 || y >= CANVAS_H) return false;
            int idx = (y * CANVAS_W + x) * 4;
            return l.data[idx] == target.r && l.data[idx+1] == target.g &&
                   l.data[idx+2] == target.b && l.data[idx+3] == target.a;
        };
        auto setPx = [&](int x, int y) {
            int idx = (y * CANVAS_W + x) * 4;
            l.data[idx] = rep.r; l.data[idx+1] = rep.g;
            l.data[idx+2] = rep.b; l.data[idx+3] = rep.a;
        };
        while (!st.empty()) {
            auto [x, y] = st.top(); st.pop();
            if (!same(x, y)) continue;
            setPx(x, y);
            st.push({x+1, y}); st.push({x-1, y});
            st.push({x, y+1}); st.push({x, y-1});
        }
    }

    void pickColor(int x, int y) {
        for (int i = MAX_LAYERS - 1; i >= 0; --i) {
            if (!layers[i].visible) continue;
            Color c = getPixel(i, x, y);
            if (c.a == 0) continue;
            for (int p = 0; p < PALETTE_SIZE; ++p) {
                if (palette[p].r == c.r && palette[p].g == c.g &&
                    palette[p].b == c.b && palette[p].a == c.a) {
                    currentColor = p; return;
                }
            }
            palette[currentColor] = c; return;
        }
    }

    void clearActive() {
        pushUndo();
        std::fill(active().data.begin(), active().data.end(), 0);
        syncActiveTexture();
    }

    void compositeFramePixels(int frameIdx, unsigned char* out) const {
        std::memset(out, 0, LAYER_BYTES);
        for (int y = 0; y < CANVAS_H; ++y) {
            for (int x = 0; x < CANVAS_W; ++x) {
                int di = (y * CANVAS_W + x) * 4;
                int dr = 0, dg = 0, db = 0, da = 0;
                for (int li = 0; li < MAX_LAYERS; ++li) {
                    if (!layers[li].visible) continue;
                    const unsigned char* sp = frameData + frameIdx * STATE_BYTES + li * LAYER_BYTES + di;
                    int sr = sp[0], sg = sp[1], sb = sp[2];
                    int sa = (int)(sp[3] * layers[li].opacity);
                    if (sa <= 0) continue;
                    if (da == 0) {
                        dr = sr; dg = sg; db = sb; da = sa;
                    } else {
                        int outA = sa + da - (sa * da) / 255;
                        if (outA <= 0) { dr = 0; dg = 0; db = 0; da = 0; continue; }
                        int invSa = 255 - sa;
                        int outR = (sr * sa + dr * invSa * da / 255) / outA;
                        int outG = (sg * sa + dg * invSa * da / 255) / outA;
                        int outB = (sb * sa + db * invSa * da / 255) / outA;
                        dr = outR; dg = outG; db = outB; da = outA;
                    }
                }
                out[di] = (unsigned char)dr;
                out[di+1] = (unsigned char)dg;
                out[di+2] = (unsigned char)db;
                out[di+3] = (unsigned char)da;
            }
        }
    }
};

static PixelBoard* g_board = nullptr;

static void exportFile(const std::string& filename,
                       const unsigned char* data, int dataSize) {
#ifdef PLATFORM_WASM
    EM_ASM({
        var data = new Uint8Array(HEAPU8.buffer, $0, $1);
        var blob = new Blob([data], {type: 'application/octet-stream'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = UTF8ToString($2);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(url); }, 100);
    }, data, dataSize, filename.c_str());
#else
    SaveFileData(filename.c_str(), data, dataSize);
#endif
}

static void exportGIF(const std::string& filename) {
    if (!g_board) return;
    PixelBoard& b = *g_board;
    b.saveCurrentToFrame(b.currentFrame);
    std::vector<unsigned char*> framePtrs;
    std::vector<std::vector<unsigned char>> frameStorage(b.frameCount);
    for (int f = 0; f < b.frameCount; ++f) {
        frameStorage[f].resize(LAYER_BYTES);
        b.compositeFramePixels(f, frameStorage[f].data());
        framePtrs.push_back(frameStorage[f].data());
    }
    std::vector<unsigned char> gif = encodeGIF(framePtrs, b.frameCount, b.palette, b.fps);
    exportFile(filename, gif.data(), (int)gif.size());
}

static void exportAPNG(const std::string& filename) {
    if (!g_board) return;
    PixelBoard& b = *g_board;
    b.saveCurrentToFrame(b.currentFrame);
    std::vector<unsigned char*> framePtrs;
    std::vector<std::vector<unsigned char>> frameStorage(b.frameCount);
    for (int f = 0; f < b.frameCount; ++f) {
        frameStorage[f].resize(LAYER_BYTES);
        b.compositeFramePixels(f, frameStorage[f].data());
        framePtrs.push_back(frameStorage[f].data());
    }
    std::vector<unsigned char> apng = encodeAPNG(framePtrs, b.frameCount, b.fps);
    exportFile(filename, apng.data(), (int)apng.size());
}

static void exportPNG(const std::string& filename) {
    if (!g_board) return;
    PixelBoard& b = *g_board;
    b.saveCurrentToFrame(b.currentFrame);
    std::vector<unsigned char> flat(LAYER_BYTES);
    b.compositeFramePixels(b.currentFrame, flat.data());
    Image img = GenImageColor(CANVAS_W, CANVAS_H, BLANK);
    std::memcpy(img.data, flat.data(), LAYER_BYTES);
#ifdef PLATFORM_WASM
    int dataSize = 0;
    unsigned char* pngData = ExportImageToMemory(img, ".png", &dataSize);
    if (pngData) { exportFile(filename, pngData, dataSize); MemFree(pngData); }
#else
    ExportImage(img, filename.c_str());
#endif
    UnloadImage(img);
}

struct UIState { Rectangle canvasRect; };

static void updateInput(PixelBoard& b) {
    bool shift = IsKeyDown(KEY_LEFT_SHIFT) || IsKeyDown(KEY_RIGHT_SHIFT);
    bool ctrl  = IsKeyDown(KEY_LEFT_CONTROL) || IsKeyDown(KEY_RIGHT_CONTROL);
    if (IsKeyPressed(KEY_ONE))   { if (shift) b.activeLayer = 0; else b.brushSize = 1; }
    if (IsKeyPressed(KEY_TWO))   { if (shift) b.activeLayer = 1; else b.brushSize = 3; }
    if (IsKeyPressed(KEY_THREE)) { if (shift) b.activeLayer = 2; else b.brushSize = 5; }
    if (IsKeyPressed(KEY_B)) b.currentTool = TOOL_PENCIL;
    if (IsKeyPressed(KEY_E)) b.currentTool = TOOL_ERASER;
    if (IsKeyPressed(KEY_I)) b.currentTool = TOOL_EYEDROPPER;
    if (IsKeyPressed(KEY_G)) b.currentTool = TOOL_FILL;
    if (IsKeyPressed(KEY_C)) b.clearActive();
    if (ctrl && IsKeyPressed(KEY_Z)) b.undo();
    if (ctrl && (IsKeyPressed(KEY_Y) || (shift && IsKeyPressed(KEY_Z)))) b.redo();
    if (IsKeyPressed(KEY_SPACE)) b.playing = !b.playing;
    if (IsKeyPressed(KEY_LEFT) && !b.playing && b.currentFrame > 0)
        b.switchToFrame(b.currentFrame - 1);
    if (IsKeyPressed(KEY_RIGHT) && !b.playing && b.currentFrame < b.frameCount - 1)
        b.switchToFrame(b.currentFrame + 1);
    if (IsKeyPressed(KEY_N) && !b.playing) b.addBlankFrame();
    if (IsKeyPressed(KEY_D) && !b.playing) b.duplicateFrame();
    if (IsKeyPressed(KEY_DELETE) && !b.playing) b.deleteFrame();
}

static bool pointInRect(Vector2 p, Rectangle r) {
    return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
}

static void drawUI(PixelBoard& b, UIState& ui) {
    const int panelW = 240;
    const int bottomH = 66;
    const int screenH = GetScreenHeight();
    const int screenW = GetScreenWidth();
    const int canvasAreaW = screenW - panelW;
    const int canvasAreaH = screenH - bottomH;
    const int canvasScale = std::max(1, std::min(std::max(1, canvasAreaW / CANVAS_W),
                                                  std::max(1, canvasAreaH / CANVAS_H)));
    const int drawW = CANVAS_W * canvasScale;
    const int drawH = CANVAS_H * canvasScale;
    const int canvasX = (canvasAreaW - drawW) / 2;
    const int canvasY = (canvasAreaH - drawH) / 2;
    ui.canvasRect = { (float)canvasX, (float)canvasY, (float)drawW, (float)drawH };

    DrawRectangle(0, 0, canvasAreaW, canvasAreaH, (Color){30,30,30,255});
    DrawRectangle(canvasAreaW, 0, panelW, screenH, (Color){40,40,40,255});
    DrawRectangle(0, canvasAreaH, screenW, bottomH, (Color){35,35,35,255});

    DrawRectangleLines(ui.canvasRect.x - 2, ui.canvasRect.y - 2,
                       ui.canvasRect.width + 4, ui.canvasRect.height + 4, GRAY);

    if (b.playing) {
        b.playTimer += GetFrameTime();
        float frameDur = 1.0f / (float)std::max(1, b.fps);
        while (b.playTimer >= frameDur) {
            b.playTimer -= frameDur;
            b.currentFrame = (b.currentFrame + 1) % b.frameCount;
            b.loadFrameToCurrent(b.currentFrame);
        }
    }

    if (b.dirtyComposite) b.refreshComposite();

    Rectangle srcR = { 0, 0, (float)CANVAS_W, -(float)CANVAS_H };
    DrawTexturePro(b.composited.texture, srcR, ui.canvasRect, {0,0}, 0, WHITE);

    char frameInfo[64];
    std::snprintf(frameInfo, sizeof(frameInfo), "Frame %d/%d", b.currentFrame + 1, b.frameCount);
    DrawText(frameInfo, 10, 10, 14, WHITE);
    if (b.playing) DrawText(">> Playing", 10, 30, 12, Color{100,255,100,255});

    Vector2 mouse = GetMousePosition();
    bool onCanvas = pointInRect(mouse, ui.canvasRect);

    auto canvasToPixel = [&](Vector2 m) -> Vector2 {
        return { (m.x - ui.canvasRect.x) / canvasScale, (m.y - ui.canvasRect.y) / canvasScale };
    };

    if (!b.playing) {
        if (onCanvas) {
            Vector2 px = canvasToPixel(mouse);
            int cx = (int)px.x, cy = (int)px.y;
            int r = b.brushSize / 2;
            Rectangle cursor = {
                ui.canvasRect.x + (cx - r) * canvasScale,
                ui.canvasRect.y + (cy - r) * canvasScale,
                b.brushSize * canvasScale,
                b.brushSize * canvasScale
            };
            DrawRectangleLinesEx(cursor, 1, Color{255,255,255,200});
        }

        if (onCanvas && IsMouseButtonPressed(MOUSE_BUTTON_RIGHT)) {
            Vector2 px = canvasToPixel(mouse);
            b.pickColor((int)px.x, (int)px.y);
        }
        if (onCanvas && IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && b.currentTool == TOOL_EYEDROPPER) {
            Vector2 px = canvasToPixel(mouse);
            b.pickColor((int)px.x, (int)px.y);
        }

        bool paintTool = (b.currentTool == TOOL_PENCIL || b.currentTool == TOOL_ERASER);

        if (onCanvas && IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && paintTool) {
            b.pushUndo();
            Vector2 px = canvasToPixel(mouse);
            b.paintAt((int)px.x, (int)px.y);
            b.lastDrawPos = px;
            b.drawing = true;
        }
        if (b.drawing && IsMouseButtonDown(MOUSE_BUTTON_LEFT) && paintTool) {
            if (onCanvas) {
                Vector2 px = canvasToPixel(mouse);
                b.paintLine((int)b.lastDrawPos.x, (int)b.lastDrawPos.y, (int)px.x, (int)px.y);
                b.lastDrawPos = px;
            }
        }
        if (IsMouseButtonReleased(MOUSE_BUTTON_LEFT)) {
            if (b.drawing) {
                b.syncActiveTexture();
            } else if (onCanvas && b.currentTool == TOOL_FILL) {
                b.pushUndo();
                Vector2 px = canvasToPixel(mouse);
                b.floodFill((int)px.x, (int)px.y);
                b.syncActiveTexture();
            }
            b.drawing = false;
        }
    }

    // ========== RIGHT PANEL ==========
    int px = canvasAreaW + 10;
    int py = 10;

    DrawText("Tools", px, py, 13, WHITE);
    py += 20;
    int toolX = px;
    for (int i = 0; i < TOOL_COUNT; ++i) {
        Rectangle btn = { (float)toolX, (float)py, 52, 24 };
        bool hover = pointInRect(mouse, btn);
        bool sel = (int)b.currentTool == i;
        DrawRectangleRec(btn, sel ? Color{80,80,120,255} : (hover ? Color{60,60,60,255} : Color{50,50,50,255}));
        DrawRectangleLinesEx(btn, 1, sel ? Color{160,160,255,255} : GRAY);
        DrawText(TOOL_NAMES[i], btn.x + 4, btn.y + 6, 11, WHITE);
        if (hover && IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && !b.playing) b.currentTool = (ToolId)i;
        toolX += 56;
        if (i == 1) { toolX = px; py += 28; }
    }
    py += 30;

    DrawText("Brush Size", px, py, 12, WHITE);
    py += 16;
    int sizes[3] = {1, 3, 5};
    for (int i = 0; i < 3; ++i) {
        Rectangle btn = { (float)(px + i * 40), (float)py, 36, 22 };
        bool hover = pointInRect(mouse, btn);
        bool sel = b.brushSize == sizes[i];
        DrawRectangleRec(btn, sel ? Color{80,80,120,255} : (hover ? Color{60,60,60,255} : Color{50,50,50,255}));
        DrawRectangleLinesEx(btn, 1, sel ? Color{160,160,255,255} : GRAY);
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%d px", sizes[i]);
        DrawText(buf, btn.x + 3, btn.y + 5, 10, WHITE);
        if (hover && IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && !b.playing) b.brushSize = sizes[i];
    }
    py += 32;

    DrawText("Palette", px, py, 12, WHITE);
    py += 16;
    int cellSize = 30;
    int cols = 4;
    for (int i = 0; i < PALETTE_SIZE; ++i) {
        int col = i % cols;
        int row = i / cols;
        Rectangle r = { (float)(px + col * cellSize), (float)(py + row * cellSize), (float)(cellSize - 4), (float)(cellSize - 4) };
        DrawRectangleRec(r, b.palette[i]);
        DrawRectangleLinesEx(r, 1, (i == b.currentColor) ? WHITE : Color{80,80,80,255});
        if (pointInRect(mouse, r) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) b.currentColor = i;
    }
    py += (PALETTE_SIZE / cols) * cellSize + 4;

    DrawText("Layers", px, py, 12, WHITE);
    py += 16;
    for (int i = 0; i < MAX_LAYERS; ++i) {
        Rectangle row = { (float)px, (float)py, (float)(panelW - 20), 22 };
        bool sel = b.activeLayer == i;
        if (pointInRect(mouse, row) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && !b.playing) {
            b.activeLayer = i; b.dirtyComposite = true;
        }
        DrawRectangleRec(row, sel ? Color{80,80,120,255} : Color{50,50,50,255});
        Rectangle visBtn = { row.x + 4, row.y + 2, 18, 18 };
        DrawRectangleRec(visBtn, b.layers[i].visible ? Color{100,180,100,255} : Color{80,80,80,255});
        DrawRectangleLinesEx(visBtn, 1, GRAY);
        DrawText(b.layers[i].visible ? "V" : " ", visBtn.x + 5, visBtn.y, 13, WHITE);
        if (pointInRect(mouse, visBtn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
            b.layers[i].visible = !b.layers[i].visible; b.dirtyComposite = true;
        }
        DrawText(b.layers[i].name.c_str(), row.x + 30, row.y + 5, 10, WHITE);
        py += 26;
    }
    py += 4;

    // Undo/Redo
    Rectangle undoBtn = { (float)px, (float)py, (float)((panelW - 24) / 2), 20 };
    DrawRectangleRec(undoBtn, b.history.canUndo() ? Color{70,110,70,255} : Color{50,50,50,255});
    DrawRectangleLinesEx(undoBtn, 1, GRAY);
    DrawText("Undo", undoBtn.x + 18, undoBtn.y + 4, 10, WHITE);
    if (pointInRect(mouse, undoBtn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && b.history.canUndo()) b.undo();

    Rectangle redoBtn = { (float)(px + (panelW - 24) / 2 + 4), (float)py, (float)((panelW - 24) / 2), 20 };
    DrawRectangleRec(redoBtn, b.history.canRedo() ? Color{70,110,70,255} : Color{50,50,50,255});
    DrawRectangleLinesEx(redoBtn, 1, GRAY);
    DrawText("Redo", redoBtn.x + 18, redoBtn.y + 4, 10, WHITE);
    if (pointInRect(mouse, redoBtn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && b.history.canRedo()) b.redo();
    py += 26;

    // Clear / Onion
    Rectangle clearBtn = { (float)px, (float)py, (float)((panelW - 24) / 2), 20 };
    DrawRectangleRec(clearBtn, Color{120,40,40,255});
    DrawRectangleLinesEx(clearBtn, 1, GRAY);
    DrawText("Clear", clearBtn.x + 16, clearBtn.y + 4, 10, WHITE);
    if (pointInRect(mouse, clearBtn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && !b.playing) b.clearActive();

    Rectangle onionBtn = { (float)(px + (panelW - 24) / 2 + 4), (float)py, (float)((panelW - 24) / 2), 20 };
    DrawRectangleRec(onionBtn, b.onionSkin ? Color{120,100,60,255} : Color{50,50,50,255});
    DrawRectangleLinesEx(onionBtn, 1, GRAY);
    DrawText(b.onionSkin ? "Onion: ON" : "Onion: OFF", onionBtn.x + 4, onionBtn.y + 4, 9, WHITE);
    if (pointInRect(mouse, onionBtn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
        b.onionSkin = !b.onionSkin; b.dirtyComposite = true;
    }
    py += 26;

    // Export
    DrawText("Export", px, py, 12, WHITE);
    py += 16;
    Rectangle pngBtn = { (float)px, (float)py, (float)((panelW - 24) / 2), 22 };
    DrawRectangleRec(pngBtn, Color{40,100,160,255});
    DrawRectangleLinesEx(pngBtn, 1, GRAY);
    DrawText("PNG", pngBtn.x + 20, pngBtn.y + 5, 10, WHITE);
    if (pointInRect(mouse, pngBtn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
        b.saveCurrentToFrame(b.currentFrame); exportPNG("pixel_board.png");
    }
    Rectangle gifBtn = { (float)(px + (panelW - 24) / 2 + 4), (float)py, (float)((panelW - 24) / 2), 22 };
    DrawRectangleRec(gifBtn, Color{100,60,140,255});
    DrawRectangleLinesEx(gifBtn, 1, GRAY);
    DrawText("GIF", gifBtn.x + 20, gifBtn.y + 5, 10, WHITE);
    if (pointInRect(mouse, gifBtn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) exportGIF("pixel_board.gif");
    py += 28;

    Rectangle apngBtn = { (float)px, (float)py, (float)(panelW - 20), 22 };
    DrawRectangleRec(apngBtn, Color{60,120,100,255});
    DrawRectangleLinesEx(apngBtn, 1, GRAY);
    DrawText("APNG (Animated PNG)", apngBtn.x + 16, apngBtn.y + 5, 10, WHITE);
    if (pointInRect(mouse, apngBtn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT))
        exportAPNG("pixel_board.apng");
    py += 30;

    // Info
    char info[160];
    std::snprintf(info, sizeof(info), "L%d | #%02X%02X%02X",
                  b.activeLayer + 1,
                  b.palette[b.currentColor].r, b.palette[b.currentColor].g, b.palette[b.currentColor].b);
    DrawText(info, px, py, 11, LIGHTGRAY);
    py += 13;
    DrawText("B/E/I/G tools  1/2/3 brush", px, py, 9, GRAY);
    py += 11;
    DrawText("Shift+1/2/3 layer  C clear", px, py, 9, GRAY);
    py += 11;
    DrawText("Ctrl+Z/Y undo/redo", px, py, 9, GRAY);
    py += 11;
    DrawText("Space play  N/D/Del frame", px, py, 9, GRAY);
    py += 11;
    DrawText("R-click: pick color", px, py, 9, GRAY);

    // ========== BOTTOM PANEL: FRAMES ==========
    int fpx = 10;
    int fpy = canvasAreaH + 8;

    Rectangle playBtn = { (float)fpx, (float)fpy, 36, 36 };
    DrawRectangleRec(playBtn, b.playing ? Color{160,60,60,255} : Color{60,120,60,255});
    DrawRectangleLinesEx(playBtn, 1, GRAY);
    DrawText(b.playing ? "II" : "|>", playBtn.x + 9, playBtn.y + 9, 16, WHITE);
    if (pointInRect(mouse, playBtn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
        b.playing = !b.playing;
        if (b.playing) b.playTimer = 0;
    }
    fpx += 44;

    DrawText("FPS", fpx, fpy - 3, 10, GRAY);
    Rectangle fpsTrack = { (float)fpx, (float)(fpy + 14), 60, 6 };
    DrawRectangleRec(fpsTrack, Color{50,50,50,255});
    float fpsNorm = (float)(b.fps - 1) / 29.0f;
    Rectangle fpsThumb = { (float)(fpx + fpsNorm * 54 - 3), (float)(fpy + 10), 6, 14 };
    DrawRectangleRec(fpsThumb, Color{120,120,180,255});
    if (IsMouseButtonDown(MOUSE_BUTTON_LEFT) && pointInRect(mouse, fpsTrack)) {
        float t = (mouse.x - fpx) / 60.0f;
        t = std::max(0.0f, std::min(1.0f, t));
        b.fps = 1 + (int)(t * 29);
    }
    char fpsBuf[16];
    std::snprintf(fpsBuf, sizeof(fpsBuf), "%d", b.fps);
    DrawText(fpsBuf, fpx + 66, fpy + 10, 12, WHITE);
    fpx += 92;

    // Frame list
    int fbW = 34, fbH = 36, fbGap = 3;
    int maxVis = std::max(1, (screenW - fpx - 200) / (fbW + fbGap));
    int sc = std::max(0, b.currentFrame - maxVis + 1);
    int sf = std::max(0, sc);
    int ef = std::min(b.frameCount, sf + maxVis);

    for (int i = sf; i < ef; ++i) {
        int bx = fpx + (i - sf) * (fbW + fbGap);
        Rectangle btn = { (float)bx, (float)fpy, (float)fbW, (float)fbH };
        bool sel = (i == b.currentFrame);
        DrawRectangleRec(btn, sel ? Color{100,100,160,255} : Color{55,55,55,255});
        DrawRectangleLinesEx(btn, 1, sel ? Color{180,180,255,255} : GRAY);
        char fnum[8];
        std::snprintf(fnum, sizeof(fnum), "%d", i + 1);
        DrawText(fnum, btn.x + 10, btn.y + 10, 14, WHITE);
        if (pointInRect(mouse, btn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && !b.playing)
            b.switchToFrame(i);
    }
    fpx += (ef - sf) * (fbW + fbGap) + 12;

    // Frame management buttons
    auto sbtn = [&](int& x, const char* lbl, Color bg, std::function<void()> cb) {
        Rectangle btn = { (float)x, (float)(fpy + 6), 28, 22 };
        DrawRectangleRec(btn, bg);
        DrawRectangleLinesEx(btn, 1, GRAY);
        DrawText(lbl, btn.x + (strlen(lbl)==1?9:5), btn.y + 4, 10, WHITE);
        if (pointInRect(mouse, btn) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && !b.playing) cb();
        x += 32;
    };
    sbtn(fpx, "+",  Color{60,120,60,255}, [&]() { b.addFrame(); });
    sbtn(fpx, "+0", Color{50,100,120,255}, [&]() { b.addBlankFrame(); });
    sbtn(fpx, "Dup", Color{100,100,60,255}, [&]() { b.duplicateFrame(); });
    sbtn(fpx, "Del", Color{140,60,60,255}, [&]() { b.deleteFrame(); });
    fpx += 4;
    sbtn(fpx, "<",  Color{60,60,80,255}, [&]() { if (b.currentFrame > 0) b.switchToFrame(b.currentFrame - 1); });
    sbtn(fpx, ">",  Color{60,60,80,255}, [&]() { if (b.currentFrame < b.frameCount - 1) b.switchToFrame(b.currentFrame + 1); });
}

static void loopFunc(void) {
    if (!g_board) return;
    updateInput(*g_board);
    BeginDrawing();
    ClearBackground(BLACK);
    UIState ui{};
    drawUI(*g_board, ui);
    EndDrawing();
}

int main() {
    SetConfigFlags(FLAG_WINDOW_RESIZABLE);
    InitWindow(1024, 576, "Pixel Board");
    SetTargetFPS(60);
    PixelBoard board;
    g_board = &board;
#ifdef PLATFORM_WASM
    emscripten_set_main_loop(loopFunc, 0, 1);
#else
    while (!WindowShouldClose()) loopFunc();
#endif
    CloseWindow();
    return 0;
}

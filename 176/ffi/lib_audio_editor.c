/*
 * lib_audio_editor.c
 * Dart FFI 绑定层。封装 FFmpeg 可执行文件，便于从 Flutter 调用。
 * 使用 `Process` 风格的同步调用：传入参数数组，返回码 0 表示成功。
 *
 * 构建 (Windows, MinGW64):
 *   gcc -shared -o lib_audio_editor.dll lib_audio_editor.c
 *   或将其打包进应用目录。
 *
 * 该实现调用外部可执行文件 `ffmpeg`（需在 PATH 中或通过
 * ae_set_ffmpeg_path 设置）。如需纯 FFmpeg libav 方式，可替换实现。
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <math.h>

#ifdef _WIN32
  #include <windows.h>
  #define DLLEXPORT __declspec(dllexport)
#else
  #define DLLEXPORT __attribute__((visibility("default")))
#endif

static char g_ffmpeg_path[1024] = "ffmpeg";
static char g_ffprobe_path[1024] = "ffprobe";

/* ---------- 日志回调 ---------- */
typedef void (*ae_log_cb)(int level, const char *msg);
static ae_log_cb g_log_cb = NULL;

DLLEXPORT void ae_set_log_callback(ae_log_cb cb) {
    g_log_cb = cb;
}

static void ae_log(int level, const char *fmt, ...) {
    char buf[2048];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    if (g_log_cb) g_log_cb(level, buf);
}

/* ---------- 配置 ---------- */
DLLEXPORT void ae_set_ffmpeg_path(const char *path) {
    if (path) strncpy(g_ffmpeg_path, path, sizeof(g_ffmpeg_path) - 1);
}

DLLEXPORT void ae_set_ffprobe_path(const char *path) {
    if (path) strncpy(g_ffprobe_path, path, sizeof(g_ffprobe_path) - 1);
}

/* ---------- 内部工具：构建命令 ---------- */
static int run_cmd(const char *cmd) {
    ae_log(0, "[run] %s", cmd);
    int rc = system(cmd);
    if (rc != 0) ae_log(2, "exit code: %d", rc);
    return rc == 0 ? 0 : -1;
}

static void escape(char *out, size_t outsz, const char *in) {
    /* 简化：用双引号包裹，并转义内部双引号与反斜杠 */
    size_t p = 0;
    out[p++] = '"';
    for (size_t i = 0; in[i] && p + 4 < outsz; i++) {
        if (in[i] == '"' || in[i] == '\\') out[p++] = '\\';
        out[p++] = in[i];
    }
    out[p++] = '"';
    out[p] = 0;
}

/* ---------- 业务函数 ---------- */

/**
 * ae_get_duration_seconds
 * 返回音频时长，单位秒。失败返回 -1。
 */
DLLEXPORT double ae_get_duration_seconds(const char *input_path) {
    char cmd[2048];
    char e_in[2048];
    char tmpfile[1024];

    escape(e_in, sizeof(e_in), input_path);

#ifdef _WIN32
    const char *tmp = getenv("TEMP");
    snprintf(tmpfile, sizeof(tmpfile), "%s\\ae_dur_XXXXXX", tmp ? tmp : ".");
    int fd = _mktemp_s(tmpfile, sizeof(tmpfile)) == 0 ? 0 : -1;
    (void)fd;
#else
    snprintf(tmpfile, sizeof(tmpfile), "/tmp/ae_dur_XXXXXX");
    int fd = mkstemp(tmpfile);
    if (fd >= 0) close(fd);
#endif

    snprintf(cmd, sizeof(cmd),
             "%s -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 %s > %s",
             g_ffprobe_path, e_in, tmpfile);

    if (run_cmd(cmd) != 0) { remove(tmpfile); return -1.0; }

    FILE *f = fopen(tmpfile, "r");
    if (!f) { return -1.0; }
    double dur = -1.0;
    if (fscanf(f, "%lf", &dur) != 1) dur = -1.0;
    fclose(f);
    remove(tmpfile);
    return dur;
}

/**
 * ae_extract_waveform
 * 把音频解码为 8kHz 单声道 PCM，然后做分桶聚合，返回聚合后的数据与指针。
 * target_bins: 期望的输出桶数（>0 时启用分桶，<=0 时保留全量行为）。
 * 分桶策略：每桶取绝对值峰值，等时间间隔。
 * 调用者负责用 ae_free_samples 释放。
 * 失败时 *samples=NULL, *count=0，返回 -1。
 */
DLLEXPORT int ae_extract_waveform(const char *input_path,
                                  float **samples,
                                  int *count,
                                  int target_bins) {
    char cmd[4096];
    char e_in[2048];
    char tmpfile[1024];

    escape(e_in, sizeof(e_in), input_path);

#ifdef _WIN32
    const char *tmp = getenv("TEMP");
    snprintf(tmpfile, sizeof(tmpfile), "%s\\ae_wav_XXXXXX.raw", tmp ? tmp : ".");
    _mktemp_s(tmpfile, sizeof(tmpfile));
#else
    snprintf(tmpfile, sizeof(tmpfile), "/tmp/ae_wav_XXXXXX.raw");
    int fd = mkstemp(tmpfile); close(fd);
#endif

    snprintf(cmd, sizeof(cmd),
             "%s -y -i %s -vn -ac 1 -ar 8000 -f f32le %s",
             g_ffmpeg_path, e_in, tmpfile);

    if (run_cmd(cmd) != 0) { *samples = NULL; *count = 0; return -1; }

    FILE *f = fopen(tmpfile, "rb");
    if (!f) { *samples = NULL; *count = 0; return -1; }
    fseek(f, 0, SEEK_END);
    long n = ftell(f) / (long)sizeof(float);
    fseek(f, 0, SEEK_SET);

    if (target_bins <= 0 || n <= target_bins) {
        float *buf = (float*)malloc((size_t)n * sizeof(float));
        if (!buf) { fclose(f); remove(tmpfile); *samples = NULL; *count = 0; return -1; }
        size_t rd = fread(buf, sizeof(float), (size_t)n, f);
        fclose(f);
        remove(tmpfile);
        *samples = buf;
        *count = (int)rd;
        return 0;
    }

    int bins = target_bins;
    float *buf = (float*)malloc((size_t)bins * sizeof(float));
    if (!buf) { fclose(f); remove(tmpfile); *samples = NULL; *count = 0; return -1; }

    long per_bin = n / (long)bins;
    if (per_bin < 1) per_bin = 1;
    int actual_bins = (int)(n / per_bin);
    if (actual_bins < 1) actual_bins = 1;

    float *tmp_buf = (float*)malloc((size_t)per_bin * sizeof(float));
    if (!tmp_buf) { free(buf); fclose(f); remove(tmpfile); *samples = NULL; *count = 0; return -1; }

    for (int i = 0; i < actual_bins; i++) {
        long want = per_bin;
        if (i == actual_bins - 1) {
            long remain = n - (long)i * per_bin;
            if (remain > 0) want = remain;
        }
        size_t rd = fread(tmp_buf, sizeof(float), (size_t)want, f);
        if (rd == 0) { buf[i] = 0.0f; continue; }
        float peak = 0.0f;
        for (size_t k = 0; k < rd; k++) {
            float a = tmp_buf[k];
            if (a < 0) a = -a;
            if (a > peak) peak = a;
        }
        buf[i] = peak;
    }

    free(tmp_buf);
    fclose(f);
    remove(tmpfile);
    *samples = buf;
    *count = actual_bins;
    return 0;
}

DLLEXPORT void ae_free_samples(float *samples) {
    free(samples);
}

/**
 * ae_trim
 * 裁剪：从 start_sec 到 end_sec。
 */
DLLEXPORT int ae_trim(const char *input_path,
                      const char *output_path,
                      double start_sec,
                      double end_sec) {
    char cmd[4096];
    char e_in[2048], e_out[2048];
    escape(e_in, sizeof(e_in), input_path);
    escape(e_out, sizeof(e_out), output_path);
    snprintf(cmd, sizeof(cmd),
             "%s -y -ss %.6f -to %.6f -i %s -acodec pcm_s16le -ar 44100 -ac 2 %s",
             g_ffmpeg_path, start_sec, end_sec, e_in, e_out);
    return run_cmd(cmd);
}

/**
 * ae_apply_volume
 * 音量 (0.0 ~ 2.0)。使用 volume 滤镜。
 */
DLLEXPORT int ae_apply_volume(const char *input_path,
                              const char *output_path,
                              double volume) {
    char cmd[4096];
    char e_in[2048], e_out[2048];
    escape(e_in, sizeof(e_in), input_path);
    escape(e_out, sizeof(e_out), output_path);
    snprintf(cmd, sizeof(cmd),
             "%s -y -i %s -af \"volume=%.4f\" -acodec pcm_s16le -ar 44100 -ac 2 %s",
             g_ffmpeg_path, e_in, volume, e_out);
    return run_cmd(cmd);
}

/**
 * ae_apply_fade
 * 淡入/淡出：fade_in_sec 为淡入时长，fade_out_sec 为淡出时长。
 * duration_sec 为总时长（用于计算淡出起点）。
 */
DLLEXPORT int ae_apply_fade(const char *input_path,
                            const char *output_path,
                            double fade_in_sec,
                            double fade_out_sec,
                            double duration_sec) {
    char cmd[4096];
    char e_in[2048], e_out[2048];
    char af[512];
    size_t p = 0;
    af[0] = 0;
    if (fade_in_sec > 0) {
        p += (size_t)snprintf(af + p, sizeof(af) - p,
                              "afade=t=in:st=0:d=%.4f", fade_in_sec);
    }
    if (fade_out_sec > 0 && duration_sec > fade_out_sec) {
        if (p > 0) { af[p++] = ','; }
        p += (size_t)snprintf(af + p, sizeof(af) - p,
                              "afade=t=out:st=%.4f:d=%.4f",
                              duration_sec - fade_out_sec, fade_out_sec);
    }
    escape(e_in, sizeof(e_in), input_path);
    escape(e_out, sizeof(e_out), output_path);
    snprintf(cmd, sizeof(cmd),
             "%s -y -i %s -af \"%s\" -acodec pcm_s16le -ar 44100 -ac 2 %s",
             g_ffmpeg_path, e_in, af, e_out);
    return run_cmd(cmd);
}

/**
 * ae_export_mp3
 * 从 WAV 输入导出 MP3，bitrate_kbps 例如 128、192、256、320。
 */
DLLEXPORT int ae_export_mp3(const char *input_path,
                            const char *output_path,
                            int bitrate_kbps) {
    char cmd[4096];
    char e_in[2048], e_out[2048];
    escape(e_in, sizeof(e_in), input_path);
    escape(e_out, sizeof(e_out), output_path);
    snprintf(cmd, sizeof(cmd),
             "%s -y -i %s -codec:a libmp3lame -b:a %dk %s",
             g_ffmpeg_path, e_in, bitrate_kbps, e_out);
    return run_cmd(cmd);
}

/* ======================================================================
 * FFT 实现 (Cooley-Tukey, 原地, 位反序)
 * 使用 double 精度；要求 N 为 2 的幂。
 * ====================================================================== */

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static void fft_bit_reverse(double *re, double *im, int n) {
    int j = 0;
    for (int i = 1; i < n; i++) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            double t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }
}

static void fft_inplace(double *re, double *im, int n, int inverse) {
    fft_bit_reverse(re, im, n);
    double sign = inverse ? 1.0 : -1.0;
    for (int len = 2; len <= n; len <<= 1) {
        double ang = sign * 2.0 * M_PI / (double)len;
        double wlen_re = cos(ang);
        double wlen_im = sin(ang);
        for (int i = 0; i < n; i += len) {
            double w_re = 1.0, w_im = 0.0;
            for (int k = 0; k < (len >> 1); k++) {
                double u_re = re[i + k];
                double u_im = im[i + k];
                double v_re = re[i + k + (len >> 1)] * w_re - im[i + k + (len >> 1)] * w_im;
                double v_im = re[i + k + (len >> 1)] * w_im + im[i + k + (len >> 1)] * w_re;
                re[i + k] = u_re + v_re;
                im[i + k] = u_im + v_im;
                re[i + k + (len >> 1)] = u_re - v_re;
                im[i + k + (len >> 1)] = u_im - v_im;
                double nwr = w_re * wlen_re - w_im * wlen_im;
                w_im = w_re * wlen_im + w_im * wlen_re;
                w_re = nwr;
            }
        }
    }
    if (inverse) {
        for (int i = 0; i < n; i++) { re[i] /= (double)n; im[i] /= (double)n; }
    }
}

static int next_pow2(int v) {
    int p = 1;
    while (p < v) p <<= 1;
    return p;
}

/* ======================================================================
 * 音频 I/O 辅助：读写 float32 单声道 PCM
 * 统一使用单声道处理，最后在需要时转换为立体声 WAV
 * ====================================================================== */
static float *read_mono_f32(const char *path, int *out_count, int *out_sr) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    char hdr[44];
    if (fread(hdr, 1, 44, f) != 44) { fclose(f); return NULL; }
    if (memcmp(hdr, "RIFF", 4) != 0 || memcmp(hdr + 8, "WAVE", 4) != 0) {
        fclose(f);
        return NULL;
    }
    int channels = *(short*)(hdr + 22);
    int sr = *(int*)(hdr + 24);
    int bits = *(short*)(hdr + 34);
    if (bits != 16 && bits != 32) { fclose(f); return NULL; }
    if (channels < 1) { fclose(f); return NULL; }

    long data_offset = -1;
    long data_size = 0;
    fseek(f, 12, SEEK_SET);
    while (1) {
        char chunk_id[4];
        int csize;
        if (fread(chunk_id, 1, 4, f) != 4) break;
        if (fread(&csize, 4, 1, f) != 1) break;
        if (memcmp(chunk_id, "data", 4) == 0) {
            data_offset = ftell(f);
            data_size = csize;
            break;
        }
        fseek(f, csize, SEEK_CUR);
    }
    if (data_offset < 0 || data_size <= 0) { fclose(f); return NULL; }
    fseek(f, data_offset, SEEK_SET);

    long sample_count;
    int bytes_per_sample = bits / 8;
    sample_count = (data_size / bytes_per_sample) / channels;
    if (sample_count <= 0) { fclose(f); return NULL; }

    float *buf = (float*)malloc((size_t)sample_count * sizeof(float));
    if (!buf) { fclose(f); return NULL; }

    if (bits == 16) {
        short *tmp = (short*)malloc((size_t)sample_count * (size_t)channels * sizeof(short));
        if (!tmp) { free(buf); fclose(f); return NULL; }
        fread(tmp, sizeof(short), (size_t)(sample_count * channels), f);
        for (long i = 0; i < sample_count; i++) {
            double sum = 0;
            for (int c = 0; c < channels; c++) {
                sum += (double)tmp[i * channels + c];
            }
            buf[i] = (float)(sum / (double)channels / 32768.0);
        }
        free(tmp);
    } else {
        float *tmp = (float*)malloc((size_t)sample_count * (size_t)channels * sizeof(float));
        if (!tmp) { free(buf); fclose(f); return NULL; }
        fread(tmp, sizeof(float), (size_t)(sample_count * channels), f);
        for (long i = 0; i < sample_count; i++) {
            double sum = 0;
            for (int c = 0; c < channels; c++) {
                sum += (double)tmp[i * channels + c];
            }
            buf[i] = (float)(sum / (double)channels);
        }
        free(tmp);
    }
    fclose(f);
    *out_count = (int)sample_count;
    *out_sr = sr;
    return buf;
}

static int write_mono_f32_to_wav(const char *path, const float *data,
                                  int count, int sr) {
    FILE *f = fopen(path, "wb");
    if (!f) return -1;
    /* 写 WAV 头，16-bit PCM 立体声 */
    int data_bytes = count * 2 * 2; /* 16-bit × 2ch */
    int riff_size = 36 + data_bytes;
    fwrite("RIFF", 1, 4, f);
    fwrite(&riff_size, 4, 1, f);
    fwrite("WAVE", 1, 4, f);
    fwrite("fmt ", 1, 4, f);
    int fmt_size = 16;
    fwrite(&fmt_size, 4, 1, f);
    short fmt = 1;
    fwrite(&fmt, 2, 1, f);
    short channels = 2;
    fwrite(&channels, 2, 1, f);
    fwrite(&sr, 4, 1, f);
    int byte_rate = sr * 2 * 2;
    fwrite(&byte_rate, 4, 1, f);
    short block_align = 4;
    fwrite(&block_align, 2, 1, f);
    short bits = 16;
    fwrite(&bits, 2, 1, f);
    fwrite("data", 1, 4, f);
    fwrite(&data_bytes, 4, 1, f);
    for (int i = 0; i < count; i++) {
        float v = data[i];
        if (v > 1.0f) v = 1.0f;
        if (v < -1.0f) v = -1.0f;
        short s = (short)(v * 32767.0f);
        fwrite(&s, 2, 1, f);
        fwrite(&s, 2, 1, f);
    }
    fclose(f);
    return 0;
}

/* ======================================================================
 * 生成合成脉冲响应 (Schroeder 混响)
 * 简化版：4 个并行梳状滤波器 + 2 个串联全通滤波器
 * ====================================================================== */
static float *generate_impulse_response(float duration_sec, int sr,
                                         float room_size, float damping,
                                         int *out_len) {
    int total = (int)(duration_sec * (float)sr);
    float *ir = (float*)calloc((size_t)total, sizeof(float));
    if (!ir) return NULL;

    /* 4 个梳状滤波器的延迟 (ms)，根据 room_size 缩放 */
    int delays[4] = {1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116};
    /* 实际用 4 个 */
    int comb_delays[4] = {
        (int)(delays[0] * room_size * sr / 44100),
        (int)(delays[1] * room_size * sr / 44100),
        (int)(delays[2] * room_size * sr / 44100),
        (int)(delays[3] * room_size * sr / 44100)
    };
    float comb_gain = damping;
    int ap_delays[2] = {
        (int)(556 * room_size * sr / 44100),
        (int)(441 * room_size * sr / 44100)
    };
    float ap_gain = 0.5f;

    /* 4 个并行梳状滤波器 */
    float *comb_out = (float*)calloc((size_t)total, sizeof(float));
    if (!comb_out) { free(ir); return NULL; }

    for (int c = 0; c < 4; c++) {
        float *tmp = (float*)calloc((size_t)total, sizeof(float));
        if (!tmp) { free(ir); free(comb_out); return NULL; }
        tmp[0] = 1.0f;
        int d = comb_delays[c];
        if (d > 0 && d < total) {
            for (int i = d; i < total; i++) {
                tmp[i] += comb_gain * tmp[i - d];
            }
        }
        for (int i = 0; i < total; i++) {
            comb_out[i] += tmp[i];
        }
        free(tmp);
    }
    for (int i = 0; i < total; i++) comb_out[i] *= 0.25f;

    /* 2 个全通滤波器串联 */
    float *ap_in = comb_out;
    for (int a = 0; a < 2; a++) {
        int d = ap_delays[a];
        if (d <= 0 || d >= total) continue;
        for (int i = d; i < total; i++) {
            float v = ap_gain * ap_in[i] + ap_in[i - d] - ap_gain * ap_in[i];
            ap_in[i] = v;
        }
    }

    /* 指数衰减包络 */
    float decay = -6.0f * duration_sec;
    for (int i = 0; i < total; i++) {
        float t = (float)i / (float)sr;
        float env = expf(decay * t / duration_sec);
        ir[i] = ap_in[i] * env;
    }

    free(comb_out);
    *out_len = total;
    return ir;
}

/* ======================================================================
 * FFT 卷积 (Overlap-Save / Overlap-Add)
 * x: 输入信号 (N 点)
 * h: 脉冲响应 (M 点)
 * 返回长度 N + M - 1 的输出
 * ====================================================================== */
static float *fft_convolve(const float *x, int N, const float *h, int M,
                            int *out_len) {
    int R = next_pow2(N + M - 1);
    double *re_a = (double*)calloc((size_t)R, sizeof(double));
    double *im_a = (double*)calloc((size_t)R, sizeof(double));
    double *re_b = (double*)calloc((size_t)R, sizeof(double));
    double *im_b = (double*)calloc((size_t)R, sizeof(double));
    if (!re_a || !im_a || !re_b || !im_b) {
        free(re_a); free(im_a); free(re_b); free(im_b);
        return NULL;
    }
    for (int i = 0; i < N; i++) re_a[i] = (double)x[i];
    for (int i = 0; i < M; i++) re_b[i] = (double)h[i];

    fft_inplace(re_a, im_a, R, 0);
    fft_inplace(re_b, im_b, R, 0);

    for (int i = 0; i < R; i++) {
        double r = re_a[i] * re_b[i] - im_a[i] * im_b[i];
        double im = re_a[i] * im_b[i] + im_a[i] * re_b[i];
        re_a[i] = r;
        im_a[i] = im;
    }
    fft_inplace(re_a, im_a, R, 1);

    int total = N + M - 1;
    float *out = (float*)malloc((size_t)total * sizeof(float));
    if (!out) { free(re_a); free(im_a); free(re_b); free(im_b); return NULL; }
    for (int i = 0; i < total; i++) {
        out[i] = (float)re_a[i];
    }
    free(re_a); free(im_a); free(re_b); free(im_b);
    *out_len = total;
    return out;
}

/* ======================================================================
 * ae_apply_echo
 * 回声效果：delay_ms 延迟毫秒，feedback 反馈系数 (0~0.9)，mix 干湿比 (0~1)
 * ====================================================================== */
DLLEXPORT int ae_apply_echo(const char *input_path,
                            const char *output_path,
                            double delay_ms,
                            double feedback,
                            double mix) {
    int count, sr;
    float *x = read_mono_f32(input_path, &count, &sr);
    if (!x) return -1;

    int delay = (int)(delay_ms * sr / 1000.0);
    if (delay <= 0) delay = 1;

    float *y = (float*)malloc((size_t)count * sizeof(float));
    if (!y) { free(x); return -1; }

    for (int i = 0; i < count; i++) {
        float wet = x[i];
        if (i >= delay) {
            wet += (float)feedback * y[i - delay];
        }
        y[i] = x[i] * (float)(1.0 - mix) + wet * (float)mix;
        /* 防振荡 */
        if (y[i] > 1.0f) y[i] = 1.0f;
        if (y[i] < -1.0f) y[i] = -1.0f;
    }

    int rc = write_mono_f32_to_wav(output_path, y, count, sr);
    free(x);
    free(y);
    return rc;
}

/* ======================================================================
 * ae_apply_reverb
 * 混响效果：使用 FFT 卷积 + 合成脉冲响应
 * room_size: 0.5~2.0 (房间大小)
 * damping: 0.1~0.9 (衰减系数)
 * wet_mix: 0~1 (干湿比)
 * ====================================================================== */
DLLEXPORT int ae_apply_reverb(const char *input_path,
                               const char *output_path,
                               double room_size,
                               double damping,
                               double wet_mix) {
    int count, sr;
    float *x = read_mono_f32(input_path, &count, &sr);
    if (!x) return -1;

    int ir_len;
    float *ir = generate_impulse_response(2.0f, sr, (float)room_size,
                                           (float)damping, &ir_len);
    if (!ir) { free(x); return -1; }

    int conv_len;
    float *conv = fft_convolve(x, count, ir, ir_len, &conv_len);
    free(ir);
    if (!conv) { free(x); return -1; }

    /* 归一化 conv 峰值 */
    float peak = 0.0f;
    for (int i = 0; i < conv_len && i < count; i++) {
        float a = conv[i];
        if (a < 0) a = -a;
        if (a > peak) peak = a;
    }
    if (peak > 0.0f) {
        float norm = 1.0f / peak;
        for (int i = 0; i < conv_len; i++) conv[i] *= norm;
    }

    /* 混音 */
    int out_len = count < conv_len ? count : conv_len;
    float *out = (float*)malloc((size_t)out_len * sizeof(float));
    if (!out) { free(x); free(conv); return -1; }
    for (int i = 0; i < out_len; i++) {
        float dry = x[i];
        float wet = conv[i];
        out[i] = dry * (float)(1.0 - wet_mix) + wet * (float)wet_mix;
        if (out[i] > 1.0f) out[i] = 1.0f;
        if (out[i] < -1.0f) out[i] = -1.0f;
    }

    int rc = write_mono_f32_to_wav(output_path, out, out_len, sr);
    free(x);
    free(conv);
    free(out);
    return rc;
}

/* ======================================================================
 * ae_apply_effect_preview
 * 实时预览：只处理前 preview_seconds 秒，输出到临时文件
 * effect_type: 0=回声, 1=混响
 * ====================================================================== */
DLLEXPORT int ae_apply_effect_preview(const char *input_path,
                                       const char *output_path,
                                       int effect_type,
                                       double preview_seconds,
                                       double param1,
                                       double param2,
                                       double param3) {
    /* 先裁剪到 preview_seconds 秒 */
    char tmp_path[2048];
#ifdef _WIN32
    const char *tmp = getenv("TEMP");
    snprintf(tmp_path, sizeof(tmp_path), "%s\\ae_pv_XXXXXX.wav", tmp ? tmp : ".");
    _mktemp_s(tmp_path, sizeof(tmp_path));
#else
    snprintf(tmp_path, sizeof(tmp_path), "/tmp/ae_pv_XXXXXX.wav");
    int fd = mkstemp(tmp_path); close(fd);
#endif

    int rc0 = ae_trim(input_path, tmp_path, 0.0, preview_seconds);
    if (rc0 != 0) { remove(tmp_path); return -1; }

    int rc;
    if (effect_type == 0) {
        rc = ae_apply_echo(tmp_path, output_path, param1, param2, param3);
    } else {
        rc = ae_apply_reverb(tmp_path, output_path, param1, param2, param3);
    }
    remove(tmp_path);
    return rc;
}

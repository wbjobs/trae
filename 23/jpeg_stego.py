#!/usr/bin/env python3
import argparse
import struct
import zlib
import base64
import io
import numpy as np
from PIL import Image
import matplotlib.pyplot as plt
from scipy import stats


Q_TABLE_LUMINANCE = np.array([
    [16, 11, 10, 16, 24, 40, 51, 61],
    [12, 12, 14, 19, 26, 58, 60, 55],
    [14, 13, 16, 24, 40, 57, 69, 56],
    [14, 17, 22, 29, 51, 87, 80, 62],
    [18, 22, 37, 56, 68, 109, 103, 77],
    [24, 35, 55, 64, 81, 104, 113, 92],
    [49, 64, 78, 87, 103, 121, 120, 101],
    [72, 92, 95, 98, 112, 100, 103, 99]
], dtype=np.float32)

ZIGZAG_ORDER = [
    (0, 0), (0, 1), (1, 0), (2, 0), (1, 1), (0, 2), (0, 3), (1, 2),
    (2, 1), (3, 0), (4, 0), (3, 1), (2, 2), (1, 3), (0, 4), (0, 5),
    (1, 4), (2, 3), (3, 2), (4, 1), (5, 0), (6, 0), (5, 1), (4, 2),
    (3, 3), (2, 4), (1, 5), (0, 6), (0, 7), (1, 6), (2, 5), (3, 4),
    (4, 3), (5, 2), (6, 1), (7, 0), (7, 1), (6, 2), (5, 3), (4, 4),
    (3, 5), (2, 6), (1, 7), (2, 7), (3, 6), (4, 5), (5, 4), (6, 3),
    (7, 2), (7, 3), (6, 4), (5, 5), (4, 6), (3, 7), (4, 7), (5, 6),
    (6, 5), (7, 4), (7, 5), (6, 6), (5, 7), (6, 7), (7, 6), (7, 7)
]

AC_START_INDEX = 1
AC_LOW_MID_END = 20

EMBEDDABLE_POSITIONS = [
    ZIGZAG_ORDER[i] for i in range(AC_START_INDEX, AC_LOW_MID_END)
]

SYNC_MARKER = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]


def text_to_bits_with_checksum(text):
    text_bytes = text.encode('utf-8')
    checksum = zlib.crc32(text_bytes) & 0xFFFFFFFF
    length = len(text_bytes)
    
    bits = []
    
    for bit in SYNC_MARKER:
        bits.append(bit)
    
    length_bytes = struct.pack('>I', length)
    for byte in length_bytes:
        for i in range(8):
            bits.append((byte >> (7 - i)) & 1)
    
    checksum_bytes = struct.pack('>I', checksum)
    for byte in checksum_bytes:
        for i in range(8):
            bits.append((byte >> (7 - i)) & 1)
    
    for byte in text_bytes:
        for i in range(8):
            bits.append((byte >> (7 - i)) & 1)
    
    return bits


def bits_to_text_with_checksum(bits):
    results = []
    
    for start in range(0, min(len(bits) - 64, 1000)):
        if not match_sync_marker(bits, start):
            continue
        
        header_start = start + len(SYNC_MARKER)
        if header_start + 64 > len(bits):
            continue
        
        length = 0
        for i in range(32):
            if header_start + i >= len(bits):
                break
            length = (length << 1) | bits[header_start + i]
        
        if length <= 0 or length > 100000:
            continue
        
        checksum_start = header_start + 32
        checksum = 0
        for i in range(32):
            if checksum_start + i >= len(bits):
                break
            checksum = (checksum << 1) | bits[checksum_start + i]
        
        text_start = checksum_start + 32
        text_end = text_start + length * 8
        if text_end > len(bits):
            continue
        
        text_bytes = bytearray()
        for i in range(0, length * 8, 8):
            byte = 0
            for j in range(8):
                if text_start + i + j < len(bits):
                    byte = (byte << 1) | bits[text_start + i + j]
            text_bytes.append(byte)
        
        calculated_checksum = zlib.crc32(bytes(text_bytes)) & 0xFFFFFFFF
        if calculated_checksum == checksum:
            try:
                text = bytes(text_bytes).decode('utf-8')
                results.append((text, length))
            except:
                continue
    
    if results:
        results.sort(key=lambda x: x[1], reverse=True)
        return results[0][0]
    
    return ""


def match_sync_marker(bits, start):
    if start + len(SYNC_MARKER) > len(bits):
        return False
    for i in range(len(SYNC_MARKER)):
        if bits[start + i] != SYNC_MARKER[i]:
            return False
    return True


def dct_2d_block(block):
    block = block - 128
    n = 8
    dct_block = np.zeros((n, n), dtype=np.float32)
    for u in range(n):
        for v in range(n):
            cu = np.sqrt(1 / n) if u == 0 else np.sqrt(2 / n)
            cv = np.sqrt(1 / n) if v == 0 else np.sqrt(2 / n)
            sum_val = 0
            for x in range(n):
                for y_val in range(n):
                    angle = np.pi * (2 * x + 1) * u / (2 * n) + np.pi * (2 * y_val + 1) * v / (2 * n)
                    sum_val += block[x, y_val] * np.cos(angle)
            dct_block[u, v] = cu * cv * sum_val
    return dct_block


def idct_2d_block(dct_block):
    n = 8
    block = np.zeros((n, n), dtype=np.float32)
    for x in range(n):
        for y_val in range(n):
            sum_val = 0
            for u in range(n):
                for v in range(n):
                    cu = np.sqrt(1 / n) if u == 0 else np.sqrt(2 / n)
                    cv = np.sqrt(1 / n) if v == 0 else np.sqrt(2 / n)
                    angle = np.pi * (2 * x + 1) * u / (2 * n) + np.pi * (2 * y_val + 1) * v / (2 * n)
                    sum_val += cu * cv * dct_block[u, v] * np.cos(angle)
            block[x, y_val] = sum_val + 128
    return block


def get_lsb(value):
    return abs(value) % 2


def set_lsb(value, lsb):
    current_lsb = get_lsb(value)
    if current_lsb == lsb:
        return value
    if value > 0:
        return value - 1 if value % 2 == 1 else value + 1
    else:
        return value + 1 if value % 2 == 1 else value - 1


def process_image_dct(image_path):
    img = Image.open(image_path)
    ycbcr = img.convert('YCbCr')
    y, cb, cr = ycbcr.split()
    y_np = np.array(y, dtype=np.float32)
    cb_np = np.array(cb, dtype=np.float32)
    cr_np = np.array(cr, dtype=np.float32)
    
    height, width = y_np.shape
    height_8 = (height // 8) * 8
    width_8 = (width // 8) * 8
    
    quantized_blocks = []
    
    for i in range(0, height_8, 8):
        for j in range(0, width_8, 8):
            block = y_np[i:i+8, j:j+8].copy()
            dct_block = dct_2d_block(block)
            quant_block = np.round(dct_block / Q_TABLE_LUMINANCE).astype(np.int16)
            quantized_blocks.append(quant_block)
    
    return y_np, cb_np, cr_np, quantized_blocks, height_8, width_8


def embed_text(image_path, text, output_path):
    y_np, cb_np, cr_np, quantized_blocks, height_8, width_8 = process_image_dct(image_path)
    
    original_dct = []
    for block in quantized_blocks:
        original_dct.extend(block.flatten())
    
    bits = text_to_bits_with_checksum(text)
    bit_idx = 0
    modified_blocks = []
    
    for quant_block in quantized_blocks:
        modified_block = quant_block.copy()
        for (u, v) in EMBEDDABLE_POSITIONS:
            if bit_idx >= len(bits):
                break
            coeff = quant_block[u, v]
            if abs(coeff) > 1:
                modified_block[u, v] = set_lsb(coeff, bits[bit_idx])
                bit_idx += 1
        modified_blocks.append(modified_block)
    
    if bit_idx < len(bits):
        print(f"警告: 文本过长，仅嵌入了 {bit_idx}/{len(bits)} 位")
    else:
        print(f"成功嵌入 {bit_idx} 位数据")
    
    modified_dct = []
    for block in modified_blocks:
        modified_dct.extend(block.flatten())
    
    new_y_np = y_np.copy()
    block_idx = 0
    for i in range(0, height_8, 8):
        for j in range(0, width_8, 8):
            if block_idx < len(modified_blocks):
                modified_block = modified_blocks[block_idx]
                dequant_block = modified_block * Q_TABLE_LUMINANCE
                idct_block = idct_2d_block(dequant_block)
                new_y_np[i:i+8, j:j+8] = np.clip(idct_block, 0, 255)
            block_idx += 1
    
    new_y = Image.fromarray(np.uint8(new_y_np))
    new_cb = Image.fromarray(np.uint8(cb_np))
    new_cr = Image.fromarray(np.uint8(cr_np))
    new_ycbcr = Image.merge('YCbCr', (new_y, new_cb, new_cr))
    new_img = new_ycbcr.convert('RGB')
    new_img.save(output_path, 'JPEG', quality=95)
    
    plot_histogram(original_dct, modified_dct)


def extract_text(image_path):
    _, _, _, quantized_blocks, _, _ = process_image_dct(image_path)
    
    bits = []
    
    for quant_block in quantized_blocks:
        for (u, v) in EMBEDDABLE_POSITIONS:
            coeff = quant_block[u, v]
            if abs(coeff) > 1:
                bits.append(get_lsb(coeff))
    
    return bits_to_text_with_checksum(bits)


def plot_histogram(original, modified):
    original = np.array(original)
    modified = np.array(modified)
    
    original_nonzero = original[original != 0]
    modified_nonzero = modified[modified != 0]
    
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
    
    ax1.hist(original_nonzero, bins=50, color='blue', alpha=0.7, edgecolor='black', range=(-20, 20))
    ax1.set_title('原始DCT系数分布（非零）', fontsize=12)
    ax1.set_xlabel('系数量化值', fontsize=10)
    ax1.set_ylabel('频率', fontsize=10)
    ax1.grid(True, alpha=0.3)
    
    ax2.hist(modified_nonzero, bins=50, color='red', alpha=0.7, edgecolor='black', range=(-20, 20))
    ax2.set_title('嵌入后DCT系数分布（非零）', fontsize=12)
    ax2.set_xlabel('系数量化值', fontsize=10)
    ax2.set_ylabel('频率', fontsize=10)
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('histogram.png', dpi=150, bbox_inches='tight')
    plt.close()
    print("直方图已保存为 histogram.png")


def collect_embeddable_coefficients(quantized_blocks):
    coefficients = []
    for quant_block in quantized_blocks:
        for (u, v) in EMBEDDABLE_POSITIONS:
            coeff = quant_block[u, v]
            if abs(coeff) > 1:
                coefficients.append(coeff)
    return np.array(coefficients)


def chi_square_analysis(coefficients):
    if len(coefficients) < 100:
        return None, None, None
    
    positive = coefficients[coefficients > 0]
    negative = coefficients[coefficients < 0]
    
    all_coeffs = np.concatenate([positive, np.abs(negative)])
    
    max_val = int(np.max(all_coeffs)) if len(all_coeffs) > 0 else 10
    if max_val < 3:
        max_val = 10
    
    observed_even = []
    observed_odd = []
    expected = []
    
    for k in range(2, max_val + 1, 2):
        count_even = np.sum(all_coeffs == k)
        count_odd = np.sum(all_coeffs == k + 1)
        
        if count_even + count_odd > 0:
            observed_even.append(count_even)
            observed_odd.append(count_odd)
            expected.append((count_even + count_odd) / 2)
    
    if len(expected) < 2:
        return None, None, None
    
    observed_even = np.array(observed_even)
    observed_odd = np.array(observed_odd)
    expected = np.array(expected)
    
    chi2_stat = 0
    for i in range(len(expected)):
        if expected[i] > 0:
            chi2_stat += (observed_even[i] - expected[i]) ** 2 / expected[i]
            chi2_stat += (observed_odd[i] - expected[i]) ** 2 / expected[i]
    
    df = len(expected) - 1
    if df <= 0:
        return None, None, None
    
    try:
        p_value = 1 - stats.chi2.cdf(chi2_stat, df)
    except:
        p_value = 0.5
    
    return chi2_stat, p_value, df


def calculate_lsb_distortion_score(coefficients):
    if len(coefficients) < 100:
        return 0.0
    
    lsb_values = np.abs(coefficients) % 2
    zero_count = np.sum(lsb_values == 0)
    one_count = np.sum(lsb_values == 1)
    total = zero_count + one_count
    
    if total == 0:
        return 0.0
    
    expected_ratio = 0.5
    actual_ratio = zero_count / total
    
    deviation = abs(actual_ratio - expected_ratio)
    max_deviation = 0.5
    
    score = (deviation / max_deviation) * 100
    return min(score, 100.0)


def analyze_steganography(image_path, output_html='stego_analysis_report.html'):
    print(f"正在分析图片: {image_path}")
    
    try:
        _, _, _, quantized_blocks, _, _ = process_image_dct(image_path)
    except Exception as e:
        print(f"图片处理失败: {e}")
        return 0
    
    coefficients = collect_embeddable_coefficients(quantized_blocks)
    
    if len(coefficients) < 100:
        print("警告: 可分析的系数数量不足，分析结果可能不可靠")
    
    print(f"收集到 {len(coefficients)} 个可分析的DCT系数")
    
    chi2_stat, p_value, df = chi_square_analysis(coefficients)
    lsb_score = calculate_lsb_distortion_score(coefficients)
    
    final_score = 0.0
    confidence_level = "低"
    verdict = "未检测到隐写"
    reasons = []
    
    if chi2_stat is not None and p_value is not None:
        print(f"卡方统计量: {chi2_stat:.4f}, P值: {p_value:.6f}, 自由度: {df}")
        
        if p_value < 0.01:
            final_score += 40
            reasons.append("卡方检验显示系数分布显著异常（p < 0.01）")
        elif p_value < 0.05:
            final_score += 25
            reasons.append("卡方检验显示系数分布存在异常（p < 0.05）")
        elif p_value < 0.1:
            final_score += 10
            reasons.append("卡方检验显示轻微异常迹象（p < 0.1）")
        else:
            reasons.append("卡方检验未发现显著异常")
    else:
        reasons.append("卡方检验无法执行（样本不足）")
    
    print(f"LSB偏离度评分: {lsb_score:.2f}")
    
    if lsb_score > 30:
        final_score += 35
        reasons.append("LSB分布严重偏离期望值")
    elif lsb_score > 15:
        final_score += 20
        reasons.append("LSB分布存在明显偏离")
    elif lsb_score > 8:
        final_score += 10
        reasons.append("LSB分布存在轻微偏离")
    else:
        reasons.append("LSB分布符合正常预期")
    
    if len(coefficients) >= 1000:
        lsb_values = np.abs(coefficients) % 2
        runs = 1
        for i in range(1, len(lsb_values)):
            if lsb_values[i] != lsb_values[i-1]:
                runs += 1
        
        expected_runs = (2 * np.sum(lsb_values == 0) * np.sum(lsb_values == 1)) / len(lsb_values) + 1
        
        if abs(runs - expected_runs) / expected_runs > 0.15:
            final_score += 15
            reasons.append("LSB游程检验显示异常模式")
        else:
            reasons.append("LSB游程分布正常")
    else:
        reasons.append("游程检验跳过（样本不足）")
    
    final_score = min(final_score, 100)
    
    if final_score >= 60:
        verdict = "高度疑似存在隐写"
        confidence_level = "高"
    elif final_score >= 40:
        verdict = "疑似存在隐写"
        confidence_level = "中"
    elif final_score >= 20:
        verdict = "可能存在隐写"
        confidence_level = "低"
    else:
        verdict = "未检测到隐写"
        confidence_level = "高"
    
    print(f"\n=== 分析结果 ===")
    print(f"隐写置信度: {final_score:.1f}/100")
    print(f"判定: {verdict} (置信度: {confidence_level})")
    print(f"判定理由:")
    for reason in reasons:
        print(f"  - {reason}")
    
    hist_base64 = generate_analysis_histogram(coefficients)
    
    generate_html_report(
        image_path=image_path,
        score=final_score,
        verdict=verdict,
        confidence_level=confidence_level,
        reasons=reasons,
        chi2_stat=chi2_stat,
        p_value=p_value,
        df=df,
        lsb_score=lsb_score,
        num_coefficients=len(coefficients),
        histogram_base64=hist_base64,
        output_file=output_html
    )
    
    print(f"\n详细报告已保存为: {output_html}")
    
    return final_score


def generate_analysis_histogram(coefficients):
    if len(coefficients) == 0:
        return ""
    
    coefficients = np.array(coefficients)
    coeffs_abs = np.abs(coefficients)
    lsb_values = coeffs_abs % 2
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    
    ax1 = axes[0, 0]
    ax1.hist(coeffs_abs, bins=50, color='steelblue', alpha=0.7, edgecolor='black', range=(0, 20))
    ax1.set_title('DCT系数绝对值分布', fontsize=12)
    ax1.set_xlabel('系数量化值（绝对值）')
    ax1.set_ylabel('频率')
    ax1.grid(True, alpha=0.3)
    
    ax2 = axes[0, 1]
    counts, bins, patches = ax2.hist(lsb_values, bins=3, color=['lightcoral', 'lightgreen'], 
                                     alpha=0.7, edgecolor='black', rwidth=0.8)
    ax2.set_title('LSB值分布', fontsize=12)
    ax2.set_xticks([0.25, 0.75])
    ax2.set_xticklabels(['0', '1'])
    ax2.set_ylabel('频率')
    ax2.grid(True, alpha=0.3)
    
    zero_count = np.sum(lsb_values == 0)
    one_count = np.sum(lsb_values == 1)
    total = zero_count + one_count
    if total > 0:
        ax2.text(0.25, zero_count + max(counts) * 0.02, f'{zero_count/total*100:.1f}%', 
                 ha='center', fontsize=10, fontweight='bold')
        ax2.text(0.75, one_count + max(counts) * 0.02, f'{one_count/total*100:.1f}%', 
                 ha='center', fontsize=10, fontweight='bold')
    
    ax3 = axes[1, 0]
    positive = coefficients[coefficients > 0]
    negative = coefficients[coefficients < 0]
    
    all_vals = np.concatenate([positive, np.abs(negative)])
    pairs = []
    for k in range(2, 21, 2):
        count_even = np.sum(all_vals == k)
        count_odd = np.sum(all_vals == k + 1)
        pairs.append((k, count_even, count_odd))
    
    pairs = np.array(pairs)
    x = np.arange(len(pairs))
    width = 0.35
    
    ax3.bar(x - width/2, pairs[:, 1], width, label='偶数值', color='steelblue', alpha=0.7)
    ax3.bar(x + width/2, pairs[:, 2], width, label='奇数值', color='coral', alpha=0.7)
    ax3.set_title('相邻奇偶值频率对比（卡方检验基础）', fontsize=12)
    ax3.set_xlabel('系数值')
    ax3.set_ylabel('频率')
    ax3.set_xticks(x)
    ax3.set_xticklabels([f'{int(k)}/{int(k+1)}' for k in pairs[:, 0]], rotation=45)
    ax3.legend()
    ax3.grid(True, alpha=0.3)
    
    ax4 = axes[1, 1]
    coeffs_10 = coeffs_abs[coeffs_abs <= 10]
    if len(coeffs_10) > 0:
        ax4.hist(coeffs_10, bins=10, color='mediumseagreen', alpha=0.7, edgecolor='black')
    ax4.set_title('小系数值（≤10）分布', fontsize=12)
    ax4.set_xlabel('系数量化值')
    ax4.set_ylabel('频率')
    ax4.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    
    return img_base64


def generate_html_report(image_path, score, verdict, confidence_level, reasons, 
                         chi2_stat, p_value, df, lsb_score, num_coefficients, 
                         histogram_base64, output_file):
    
    score_color = '#28a745'
    if score >= 60:
        score_color = '#dc3545'
    elif score >= 40:
        score_color = '#ffc107'
    elif score >= 20:
        score_color = '#fd7e14'
    
    reasons_html = '\n'.join([f'<li class="list-group-item">{reason}</li>' for reason in reasons])
    
    chi2_html = '<p class="text-muted">无法计算（样本不足）</p>'
    if chi2_stat is not None:
        chi2_html = f'''
        <table class="table table-sm table-bordered">
            <tr><th>卡方统计量</th><td>{chi2_stat:.4f}</td></tr>
            <tr><th>P值</th><td>{p_value:.6f}</td></tr>
            <tr><th>自由度</th><td>{df}</td></tr>
        </table>
        '''
    
    html_content = f'''
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JPEG隐写分析报告</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        .score-circle {{
            width: 150px;
            height: 150px;
            border-radius: 50%;
            background: conic-gradient({score_color} {score*3.6}deg, #e9ecef 0deg);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto;
        }}
        .score-inner {{
            width: 120px;
            height: 120px;
            border-radius: 50%;
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }}
        .score-value {{
            font-size: 32px;
            font-weight: bold;
            color: {score_color};
        }}
        .score-label {{
            font-size: 12px;
            color: #666;
        }}
        .verdict-badge {{
            font-size: 18px;
            padding: 10px 20px;
        }}
    </style>
</head>
<body class="bg-light">
    <div class="container py-5">
        <div class="row">
            <div class="col-12">
                <div class="card shadow-sm mb-4">
                    <div class="card-header bg-primary text-white">
                        <h2 class="mb-0">🔍 JPEG 隐写分析报告</h2>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-4 text-center">
                                <div class="score-circle">
                                    <div class="score-inner">
                                        <div class="score-value">{score:.1f}</div>
                                        <div class="score-label">/ 100</div>
                                    </div>
                                </div>
                                <div class="mt-3">
                                    <span class="badge {'bg-danger' if score >= 60 else 'bg-warning' if score >= 20 else 'bg-success'} verdict-badge">
                                        {verdict}
                                    </span>
                                    <p class="text-muted mt-2">置信度: {confidence_level}</p>
                                </div>
                            </div>
                            <div class="col-md-8">
                                <h5>📊 基本信息</h5>
                                <table class="table table-sm">
                                    <tr><th style="width: 150px;">分析文件</th><td>{image_path}</td></tr>
                                    <tr><th>分析系数数量</th><td>{num_coefficients}</td></tr>
                                    <tr><th>LSB偏离度</th><td>{lsb_score:.2f}/100</td></tr>
                                </table>
                                
                                <h5 class="mt-3">📈 卡方检验结果</h5>
                                {chi2_html}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card shadow-sm mb-4">
                    <div class="card-header">
                        <h5 class="mb-0">📋 判定理由</h5>
                    </div>
                    <div class="card-body">
                        <ul class="list-group list-group-flush">
                            {reasons_html}
                        </ul>
                    </div>
                </div>
                
                <div class="card shadow-sm mb-4">
                    <div class="card-header">
                        <h5 class="mb-0">📉 DCT系数分析图表</h5>
                    </div>
                    <div class="card-body text-center">
                        <img src="data:image/png;base64,{histogram_base64}" class="img-fluid rounded" alt="DCT系数分析图表">
                    </div>
                </div>
                
                <div class="card shadow-sm">
                    <div class="card-header bg-info text-white">
                        <h5 class="mb-0">ℹ️ 分析说明</h5>
                    </div>
                    <div class="card-body">
                        <p class="card-text">
                            <strong>卡方检验原理：</strong>LSB隐写会使相邻奇偶值的DCT系数频率趋于相等。
                            卡方检验用于检测这种统计异常，P值越小表示存在隐写的可能性越高。
                        </p>
                        <p class="card-text">
                            <strong>LSB偏离度：</strong>衡量LSB为0和1的比例偏离50%的程度。
                            正常图像的LSB分布应接近随机（各50%），隐写可能导致偏离。
                        </p>
                        <p class="card-text">
                            <strong>置信度说明：</strong>
                            <span class="text-success">0-20分：正常</span> | 
                            <span class="text-warning">20-40分：可疑</span> | 
                            <span class="text-orange">40-60分：较可疑</span> | 
                            <span class="text-danger">60-100分：高度可疑</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="text-center text-muted mt-4">
            <small>报告生成时间: 2026-05-16 | JPEG Stego Analyzer v1.0</small>
        </div>
    </div>
</body>
</html>
    '''
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)


def main():
    parser = argparse.ArgumentParser(description='JPEG DCT域LSB隐写工具')
    parser.add_argument('--embed', action='store_true', help='嵌入模式')
    parser.add_argument('--extract', action='store_true', help='提取模式')
    parser.add_argument('--analyze', action='store_true', help='隐写分析模式')
    parser.add_argument('--input', required=True, help='输入图片路径')
    parser.add_argument('--output', help='输出图片路径（嵌入模式必需）')
    parser.add_argument('--text', help='要嵌入的文本（嵌入模式必需）')
    parser.add_argument('--report', default='stego_analysis_report.html', help='分析报告输出路径')
    
    args = parser.parse_args()
    
    if args.embed:
        if not args.output or not args.text:
            print("嵌入模式需要 --output 和 --text 参数")
            return
        embed_text(args.input, args.text, args.output)
        print(f"文本已成功嵌入到 {args.output}")
    elif args.extract:
        text = extract_text(args.input)
        if text:
            print(f"提取的文本: {text}")
        else:
            print("未能提取到有效文本，请检查图片是否包含隐写信息")
    elif args.analyze:
        analyze_steganography(args.input, args.report)
    else:
        print("请指定 --embed、--extract 或 --analyze 模式")


if __name__ == "__main__":
    main()

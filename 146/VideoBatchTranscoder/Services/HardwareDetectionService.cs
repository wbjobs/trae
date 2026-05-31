using System.Diagnostics;
using System.Text.RegularExpressions;
using VideoBatchTranscoder.Models;

namespace VideoBatchTranscoder.Services;

public interface IHardwareDetectionService
{
    Task<HardwareInfo> DetectHardwareAsync(CancellationToken cancellationToken);
    string GetHardwareEncoderArguments(HardwareEncoder encoder, int quality, string preset);
}

public class HardwareDetectionService : IHardwareDetectionService
{
    private readonly string _ffmpegPath;
    private readonly object _lock = new();
    private HardwareInfo? _cachedInfo;

    public HardwareDetectionService(string ffmpegPath)
    {
        _ffmpegPath = ffmpegPath;
    }

    public async Task<HardwareInfo> DetectHardwareAsync(CancellationToken cancellationToken)
    {
        lock (_lock)
        {
            if (_cachedInfo != null)
                return _cachedInfo;
        }

        var info = new HardwareInfo();

        try
        {
            var encoders = await GetFFmpegEncodersAsync(cancellationToken);
            var decoders = await GetFFmpegDecodersAsync(cancellationToken);
            var gpuInfo = await DetectGPUInfoAsync(cancellationToken);

            info.AvailableEncoders = encoders;
            info.AvailableDecoders = decoders;
            info.GPUName = gpuInfo.GPUName;
            info.GPUVendor = gpuInfo.Vendor;
            info.VRAM = gpuInfo.VRAM;

            info.HasNvidiaNVENC = encoders.Any(e => e.Contains("nvenc"));
            info.HasNvidiaCUDA = encoders.Any(e => e.Contains("cuda"));
            info.HasIntelQSV = encoders.Any(e => e.Contains("qsv"));
            info.HasAmdAMF = encoders.Any(e => e.Contains("amf"));

            DetermineBestEncoder(info);
        }
        catch (Exception ex)
        {
            info.Recommendation = $"硬件检测失败: {ex.Message}";
        }

        lock (_lock)
        {
            _cachedInfo = info;
        }

        return info;
    }

    private async Task<List<string>> GetFFmpegEncodersAsync(CancellationToken cancellationToken)
    {
        var encoders = new List<string>();

        try
        {
            var process = new ProcessStartInfo
            {
                FileName = _ffmpegPath,
                Arguments = "-encoders",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var proc = Process.Start(process);
            if (proc == null) return encoders;

            var output = await proc.StandardOutput.ReadToEndAsync(cancellationToken);
            await proc.WaitForExitAsync(cancellationToken);

            var lines = output.Split('\n');
            foreach (var line in lines)
            {
                if (line.StartsWith(" "))
                {
                    var match = Regex.Match(line.Trim(), @"^(\S+)");
                    if (match.Success)
                    {
                        encoders.Add(match.Groups[1].Value);
                    }
                }
            }
        }
        catch
        {
        }

        return encoders;
    }

    private async Task<List<string>> GetFFmpegDecodersAsync(CancellationToken cancellationToken)
    {
        var decoders = new List<string>();

        try
        {
            var process = new ProcessStartInfo
            {
                FileName = _ffmpegPath,
                Arguments = "-decoders",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var proc = Process.Start(process);
            if (proc == null) return decoders;

            var output = await proc.StandardOutput.ReadToEndAsync(cancellationToken);
            await proc.WaitForExitAsync(cancellationToken);

            var lines = output.Split('\n');
            foreach (var line in lines)
            {
                if (line.StartsWith(" "))
                {
                    var match = Regex.Match(line.Trim(), @"^(\S+)");
                    if (match.Success)
                    {
                        decoders.Add(match.Groups[1].Value);
                    }
                }
            }
        }
        catch
        {
        }

        return decoders;
    }

    private async Task<(string GPUName, string Vendor, long VRAM)> DetectGPUInfoAsync(CancellationToken cancellationToken)
    {
        string gpuName = string.Empty;
        string vendor = string.Empty;
        long vram = 0;

        try
        {
            var process = new ProcessStartInfo
            {
                FileName = "nvidia-smi",
                Arguments = "--query-gpu=name,memory.total --format=csv,noheader",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var proc = Process.Start(process);
            if (proc != null)
            {
                var output = await proc.StandardOutput.ReadToEndAsync(cancellationToken);
                await proc.WaitForExitAsync(cancellationToken);

                if (proc.ExitCode == 0 && !string.IsNullOrWhiteSpace(output))
                {
                    var parts = output.Trim().Split(',');
                    if (parts.Length >= 1)
                        gpuName = parts[0].Trim();

                    if (parts.Length >= 2)
                    {
                        var vramMatch = Regex.Match(parts[1], @"(\d+)");
                        if (vramMatch.Success)
                            vram = long.Parse(vramMatch.Groups[1].Value) * 1024 * 1024;
                    }

                    vendor = "NVIDIA";
                }
            }
        }
        catch
        {
        }

        if (string.IsNullOrEmpty(gpuName))
        {
            try
            {
                var process = new ProcessStartInfo
                {
                    FileName = "wmic",
                    Arguments = "path win32_VideoController get name,AdapterRAM",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var proc = Process.Start(process);
                if (proc != null)
                {
                    var output = await proc.StandardOutput.ReadToEndAsync(cancellationToken);
                    await proc.WaitForExitAsync(cancellationToken);

                    var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                    foreach (var line in lines.Skip(1))
                    {
                        var parts = line.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 2)
                        {
                            gpuName = string.Join(" ", parts.Take(parts.Length - 1));

                            if (long.TryParse(parts.Last(), out long ram))
                                vram = ram;

                            if (gpuName.Contains("Intel", StringComparison.OrdinalIgnoreCase))
                                vendor = "Intel";
                            else if (gpuName.Contains("AMD", StringComparison.OrdinalIgnoreCase) ||
                                     gpuName.Contains("Radeon", StringComparison.OrdinalIgnoreCase))
                                vendor = "AMD";
                            else if (gpuName.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase))
                                vendor = "NVIDIA";

                            break;
                        }
                    }
                }
            }
            catch
            {
            }
        }

        return (gpuName, vendor, vram);
    }

    private void DetermineBestEncoder(HardwareInfo info)
    {
        if (info.HasNvidiaNVENC)
        {
            info.RecommendedEncoder = HardwareEncoder.NvidiaNVENC;
            info.RecommendedQuality = 23;
            info.RecommendedBitrate = info.VRAM >= 8 * 1024 * 1024 ? 8000 : 5000;
            info.RecommendedPreset = "p5";

            var details = new List<string> { "检测到 NVIDIA GPU" };

            if (!string.IsNullOrEmpty(info.GPUName))
                details.Add($"GPU: {info.GPUName}");

            if (info.VRAM > 0)
                details.Add($"VRAM: {info.VRAM / (1024 * 1024)} MB");

            details.Add("推荐使用 NVENC 硬件编码");

            if (info.AvailableEncoders.Contains("hevc_nvenc"))
            {
                info.RecommendedEncoder = HardwareEncoder.NvidiaNVENC_HEVC;
                details.Add("支持 HEVC (H.265) 编码");
            }

            info.Recommendation = string.Join(" | ", details);
        }
        else if (info.HasIntelQSV)
        {
            info.RecommendedEncoder = HardwareEncoder.IntelQSV;
            info.RecommendedQuality = 23;
            info.RecommendedBitrate = 5000;
            info.RecommendedPreset = "medium";

            var details = new List<string> { "检测到 Intel QSV 硬件加速" };

            if (!string.IsNullOrEmpty(info.GPUName))
                details.Add($"GPU: {info.GPUName}");

            info.Recommendation = string.Join(" | ", details);
        }
        else if (info.HasAmdAMF)
        {
            info.RecommendedEncoder = HardwareEncoder.AmdAMF;
            info.RecommendedQuality = 23;
            info.RecommendedBitrate = info.VRAM >= 8 * 1024 * 1024 ? 8000 : 5000;
            info.RecommendedPreset = "balanced";

            var details = new List<string> { "检测到 AMD AMF 硬件加速" };

            if (!string.IsNullOrEmpty(info.GPUName))
                details.Add($"GPU: {info.GPUName}");

            if (info.VRAM > 0)
                details.Add($"VRAM: {info.VRAM / (1024 * 1024)} MB");

            if (info.AvailableEncoders.Contains("hevc_amf"))
            {
                info.RecommendedEncoder = HardwareEncoder.AmdAMF_HEVC;
                details.Add("支持 HEVC (H.265) 编码");
            }

            info.Recommendation = string.Join(" | ", details);
        }
        else
        {
            info.RecommendedEncoder = HardwareEncoder.Software;
            info.RecommendedQuality = 23;
            info.RecommendedBitrate = 5000;
            info.RecommendedPreset = "medium";

            info.Recommendation = "未检测到硬件加速，将使用 CPU 软件编码。如需硬件加速，请安装支持 QSV/NVENC/AMF 的 GPU 驱动。";
        }
    }

    public string GetHardwareEncoderArguments(HardwareEncoder encoder, int quality, string preset)
    {
        var args = new List<string>();

        switch (encoder)
        {
            case HardwareEncoder.NvidiaNVENC:
            case HardwareEncoder.NvidiaNVENC_H264:
                args.Add("-c:v h264_nvenc");
                args.Add($"-preset {preset}");
                args.Add($"-cq {quality}");
                args.Add("-b:v 0");
                args.Add("-gpu 0");
                args.Add("-pix_fmt yuv420p");
                break;

            case HardwareEncoder.NvidiaNVENC_HEVC:
                args.Add("-c:v hevc_nvenc");
                args.Add($"-preset {preset}");
                args.Add($"-cq {quality}");
                args.Add("-b:v 0");
                args.Add("-gpu 0");
                args.Add("-pix_fmt yuv420p");
                break;

            case HardwareEncoder.IntelQSV:
                args.Add("-c:v h264_qsv");
                args.Add($"-preset {preset}");
                args.Add($"-global_quality {quality}");
                args.Add("-b:v 0");
                args.Add("-pix_fmt yuv420p");
                break;

            case HardwareEncoder.AmdAMF:
            case HardwareEncoder.AmdAMF_H264:
                args.Add("-c:v h264_amf");
                args.Add($"-quality {preset}");
                args.Add($"-rc cqp");
                args.Add($"-qp_i {quality}");
                args.Add($"-qp_p {quality}");
                args.Add("-pix_fmt yuv420p");
                break;

            case HardwareEncoder.AmdAMF_HEVC:
                args.Add("-c:v hevc_amf");
                args.Add($"-quality {preset}");
                args.Add($"-rc cqp");
                args.Add($"-qp_i {quality}");
                args.Add($"-qp_p {quality}");
                args.Add("-pix_fmt yuv420p");
                break;

            default:
                args.Add("-c:v libx264");
                args.Add($"-preset {preset}");
                args.Add($"-crf {quality}");
                break;
        }

        return string.Join(" ", args);
    }
}

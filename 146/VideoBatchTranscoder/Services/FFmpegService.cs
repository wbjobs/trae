using System.Diagnostics;
using System.Text.RegularExpressions;
using VideoBatchTranscoder.Models;

namespace VideoBatchTranscoder.Services;

public interface IFFmpegService
{
    Task<bool> TranscodeAsync(
        TranscodeTask task,
        IProgress<double> progress,
        CancellationToken cancellationToken);

    Task<bool> TranscodeAsync(
        TranscodeTask task,
        IProgress<double> progress,
        CancellationToken cancellationToken,
        TimeSpan? startTime,
        TimeSpan? endTime);

    Task<VideoInfo?> GetVideoInfoAsync(string filePath, CancellationToken cancellationToken);

    Task<TimeSpan?> GetOutputDurationAsync(string filePath, CancellationToken cancellationToken);

    bool IsFFmpegAvailable();
}

public class VideoInfo
{
    public TimeSpan Duration { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public string VideoCodec { get; set; } = string.Empty;
    public string AudioCodec { get; set; } = string.Empty;
    public long Bitrate { get; set; }
}

public class FFmpegService : IFFmpegService
{
    private readonly string _ffmpegPath;
    private readonly string _ffprobePath;

    public FFmpegService(string ffmpegPath, string ffprobePath)
    {
        _ffmpegPath = ffmpegPath;
        _ffprobePath = ffprobePath;
    }

    public bool IsFFmpegAvailable()
    {
        try
        {
            var process = new ProcessStartInfo
            {
                FileName = _ffmpegPath,
                Arguments = "-version",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var proc = Process.Start(process);
            if (proc == null) return false;
            proc.WaitForExit(5000);
            return proc.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    public async Task<VideoInfo?> GetVideoInfoAsync(string filePath, CancellationToken cancellationToken)
    {
        try
        {
            var arguments = $"-v quiet -print_format json -show_format -show_streams \"{filePath}\"";

            var process = new ProcessStartInfo
            {
                FileName = _ffprobePath,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var proc = Process.Start(process);
            if (proc == null) return null;

            var output = await proc.StandardOutput.ReadToEndAsync(cancellationToken);
            await proc.WaitForExitAsync(cancellationToken);

            if (proc.ExitCode != 0) return null;

            return ParseVideoInfo(output, filePath);
        }
        catch
        {
            return null;
        }
    }

    private VideoInfo? ParseVideoInfo(string jsonOutput, string filePath)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(jsonOutput);
            var root = doc.RootElement;

            var info = new VideoInfo();

            if (root.TryGetProperty("format", out var formatElement))
            {
                if (formatElement.TryGetProperty("duration", out var durationElement))
                {
                    if (double.TryParse(durationElement.GetString(), out double durationSeconds))
                    {
                        info.Duration = TimeSpan.FromSeconds(durationSeconds);
                    }
                }

                if (formatElement.TryGetProperty("bit_rate", out var bitrateElement))
                {
                    if (long.TryParse(bitrateElement.GetString(), out long bitrate))
                    {
                        info.Bitrate = bitrate;
                    }
                }
            }

            if (root.TryGetProperty("streams", out var streamsElement) && streamsElement.IsArray)
            {
                foreach (var stream in streamsElement.EnumerateArray())
                {
                    if (stream.TryGetProperty("codec_type", out var codecTypeElement))
                    {
                        var codecType = codecTypeElement.GetString();

                        if (codecType == "video" && string.IsNullOrEmpty(info.VideoCodec))
                        {
                            if (stream.TryGetProperty("codec_name", out var videoCodecElement))
                            {
                                info.VideoCodec = videoCodecElement.GetString() ?? "unknown";
                            }

                            if (stream.TryGetProperty("width", out var widthElement))
                            {
                                info.Width = widthElement.GetInt32();
                            }

                            if (stream.TryGetProperty("height", out var heightElement))
                            {
                                info.Height = heightElement.GetInt32();
                            }
                        }
                        else if (codecType == "audio" && string.IsNullOrEmpty(info.AudioCodec))
                        {
                            if (stream.TryGetProperty("codec_name", out var audioCodecElement))
                            {
                                info.AudioCodec = audioCodecElement.GetString() ?? "unknown";
                            }
                        }
                    }
                }
            }

            return info;
        }
        catch
        {
            return null;
        }
    }

    public async Task<bool> TranscodeAsync(
        TranscodeTask task,
        IProgress<double> progress,
        CancellationToken cancellationToken)
    {
        return await TranscodeAsync(task, progress, cancellationToken, null, null);
    }

    public async Task<bool> TranscodeAsync(
        TranscodeTask task,
        IProgress<double> progress,
        CancellationToken cancellationToken,
        TimeSpan? startTime,
        TimeSpan? endTime)
    {
        try
        {
            var presetArgs = task.Preset.GetFFmpegArguments();
            var hwAccelArgs = GetHardwareAccelerationArguments(task.Preset);
            var inputArgs = startTime.HasValue ? $"-ss {startTime.Value.TotalSeconds:F3}" : "";
            var endArgs = endTime.HasValue ? $"-t {(endTime.Value - (startTime ?? TimeSpan.Zero)).TotalSeconds:F3}" : "";
            var outputArgs = startTime.HasValue ? "-noaccurate_seek -avoid_negative_ts make_zero" : "";

            var arguments = $"-y {hwAccelArgs} {inputArgs} -i \"{task.InputFilePath}\" {endArgs} {presetArgs} {outputArgs} \"{task.OutputFilePath}\"";

            var process = new ProcessStartInfo
            {
                FileName = _ffmpegPath,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var proc = new Process { StartInfo = process };
            proc.EnableRaisingEvents = true;

            var tcs = new TaskCompletionSource<bool>();

            proc.Exited += (sender, args) =>
            {
                tcs.TrySetResult(proc.ExitCode == 0);
            };

            proc.Start();

            var errorOutput = proc.StandardError;

            var videoInfo = await GetVideoInfoAsync(task.InputFilePath, cancellationToken);
            var totalDuration = endTime.HasValue
                ? (endTime.Value - (startTime ?? TimeSpan.Zero)).TotalSeconds
                : videoInfo?.Duration.TotalSeconds ?? 0;

            while (!proc.HasExited)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    try
                    {
                        proc.Kill();
                    }
                    catch { }
                    return false;
                }

                var line = await errorOutput.ReadLineAsync(cancellationToken);
                if (line == null) continue;

                if (totalDuration > 0)
                {
                    var timeMatch = Regex.Match(line, @"time=(\d+):(\d+):(\d+\.\d+)");
                    if (timeMatch.Success)
                    {
                        var hours = int.Parse(timeMatch.Groups[1].Value);
                        var minutes = int.Parse(timeMatch.Groups[2].Value);
                        var seconds = double.Parse(timeMatch.Groups[3].Value);
                        var currentTime = hours * 3600 + minutes * 60 + seconds;
                        var percentage = Math.Min(100, (currentTime / totalDuration) * 100);
                        progress.Report(percentage);
                    }
                }
            }

            progress.Report(100);
            return await tcs.Task;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
        catch
        {
            return false;
        }
    }

    private string GetHardwareAccelerationArguments(TranscodePreset preset)
    {
        if (!preset.UseHardwareAcceleration || preset.HardwareEncoder == HardwareEncoder.Software)
            return string.Empty;

        return preset.HardwareEncoder switch
        {
            HardwareEncoder.NvidiaNVENC or HardwareEncoder.NvidiaNVENC_H264 or HardwareEncoder.NvidiaNVENC_HEVC
                => "-hwaccel cuda -hwaccel_output_format cuda",
            HardwareEncoder.IntelQSV
                => "-hwaccel qsv -hwaccel_output_format qsv",
            HardwareEncoder.AmdAMF or HardwareEncoder.AmdAMF_H264 or HardwareEncoder.AmdAMF_HEVC
                => "-hwaccel dxva2",
            _ => string.Empty
        };
    }

    public async Task<TimeSpan?> GetOutputDurationAsync(string filePath, CancellationToken cancellationToken)
    {
        try
        {
            var arguments = $"-v quiet -print_format json -show_format \"{filePath}\"";

            var process = new ProcessStartInfo
            {
                FileName = _ffprobePath,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var proc = Process.Start(process);
            if (proc == null) return null;

            var output = await proc.StandardOutput.ReadToEndAsync(cancellationToken);
            await proc.WaitForExitAsync(cancellationToken);

            if (proc.ExitCode != 0) return null;

            using var doc = System.Text.Json.JsonDocument.Parse(output);
            if (doc.RootElement.TryGetProperty("format", out var formatElement) &&
                formatElement.TryGetProperty("duration", out var durationElement))
            {
                if (double.TryParse(durationElement.GetString(), out double durationSeconds))
                {
                    return TimeSpan.FromSeconds(durationSeconds);
                }
            }

            return null;
        }
        catch
        {
            return null;
        }
    }
}

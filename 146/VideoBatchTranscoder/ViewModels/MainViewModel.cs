using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using VideoBatchTranscoder.Models;
using VideoBatchTranscoder.Services;

namespace VideoBatchTranscoder.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly ISettingsService _settingsService;
    private readonly IVideoScanner _videoScanner;
    private readonly TaskManagerService _taskManager;
    private readonly IFFmpegService _ffmpegService;
    private readonly IHardwareDetectionService _hardwareDetectionService;

    [ObservableProperty]
    private AppSettings settings;

    [ObservableProperty]
    private TranscodePreset selectedPreset;

    [ObservableProperty]
    private string statusMessage = "就绪";

    [ObservableProperty]
    private bool isScanning;

    [ObservableProperty]
    private bool isDetectingHardware;

    [ObservableProperty]
    private string ffmpegStatus = "正在检查 FFmpeg...";

    [ObservableProperty]
    private bool ffmpegAvailable;

    [ObservableProperty]
    private HardwareInfo hardwareInfo = new();

    public TaskManagerService TaskManager => _taskManager;

    public IReadOnlyList<VideoCodec> AvailableCodecs { get; } = Enum.GetValues(typeof(VideoCodec)).Cast<VideoCodec>().ToList();

    public IReadOnlyList<HardwareEncoder> AvailableHardwareEncoders { get; } = Enum.GetValues(typeof(HardwareEncoder)).Cast<HardwareEncoder>().ToList();

    public List<string> ResolutionPresets { get; } = new()
    {
        "Original",
        "1920x1080",
        "1280x720",
        "854x480",
        "640x360",
        "3840x2160",
        "2560x1440"
    };

    public MainViewModel(
        ISettingsService settingsService,
        IVideoScanner videoScanner,
        TaskManagerService taskManager,
        IFFmpegService ffmpegService,
        IHardwareDetectionService hardwareDetectionService)
    {
        _settingsService = settingsService;
        _videoScanner = videoScanner;
        _taskManager = taskManager;
        _ffmpegService = ffmpegService;
        _hardwareDetectionService = hardwareDetectionService;

        Settings = _settingsService.LoadSettings();
        SelectedPreset = Settings.Presets.FirstOrDefault(p => p.Name == Settings.SelectedPresetName) ?? Settings.Presets.First();
        _taskManager.MaxParallelTasks = Settings.MaxParallelTasks;

        CheckFFmpegAvailability();
        _ = DetectHardwareAsync();
    }

    private void CheckFFmpegAvailability()
    {
        FFmpegAvailable = _ffmpegService.IsFFmpegAvailable();
        FFmpegStatus = FFmpegAvailable ? "FFmpeg 已就绪" : "警告: 未找到 FFmpeg，请确保已安装并添加到系统路径";
    }

    [RelayCommand]
    private async Task DetectHardwareAsync()
    {
        if (IsDetectingHardware) return;

        IsDetectingHardware = true;
        StatusMessage = "正在检测硬件加速...";

        try
        {
            HardwareInfo = await _hardwareDetectionService.DetectHardwareAsync(CancellationToken.None);

            if (HardwareInfo.HasHardwareAcceleration)
            {
                StatusMessage = $"硬件检测完成: {HardwareInfo.Recommendation}";
                ApplyRecommendedSettings();
            }
            else
            {
                StatusMessage = "硬件检测完成: 未检测到硬件加速，将使用 CPU 编码";
            }
        }
        catch (Exception ex)
        {
            StatusMessage = $"硬件检测失败: {ex.Message}";
        }
        finally
        {
            IsDetectingHardware = false;
        }
    }

    private void ApplyRecommendedSettings()
    {
        if (HardwareInfo.RecommendedEncoder != HardwareEncoder.Software)
        {
            SelectedPreset.UseHardwareAcceleration = true;
            SelectedPreset.HardwareEncoder = HardwareInfo.RecommendedEncoder;
            SelectedPreset.Quality = HardwareInfo.RecommendedQuality;
            SelectedPreset.Bitrate = HardwareInfo.RecommendedBitrate;
            SelectedPreset.EncoderPreset = HardwareInfo.RecommendedPreset;
        }
    }

    [RelayCommand]
    private void ApplyRecommendedPreset()
    {
        if (HardwareInfo.RecommendedEncoder != HardwareEncoder.Software)
        {
            SelectedPreset.UseHardwareAcceleration = true;
            SelectedPreset.HardwareEncoder = HardwareInfo.RecommendedEncoder;
            SelectedPreset.Quality = HardwareInfo.RecommendedQuality;
            SelectedPreset.Bitrate = HardwareInfo.RecommendedBitrate;
            SelectedPreset.EncoderPreset = HardwareInfo.RecommendedPreset;
            StatusMessage = "已应用推荐的硬件编码设置";
        }
    }

    [RelayCommand]
    private async Task ScanVideosAsync()
    {
        if (string.IsNullOrEmpty(Settings.InputFolder) || !Directory.Exists(Settings.InputFolder))
        {
            StatusMessage = "请选择有效的输入文件夹";
            return;
        }

        IsScanning = true;
        StatusMessage = "正在扫描视频文件...";

        try
        {
            await Task.Run(() =>
            {
                var videoFiles = _videoScanner.ScanVideos(
                    Settings.InputFolder,
                    Settings.RecursiveScan,
                    Settings.SupportedExtensions);

                _taskManager.ClearTasks();

                var tasks = videoFiles.Select(file =>
                {
                    var fileInfo = new FileInfo(file);
                    var outputFileName = Path.GetFileNameWithoutExtension(file) + SelectedPreset.GetOutputExtension();
                    var relativePath = Path.GetRelativePath(Settings.InputFolder, Path.GetDirectoryName(file) ?? string.Empty);
                    var outputDir = string.IsNullOrEmpty(relativePath) || relativePath == "."
                        ? Settings.OutputFolder
                        : Path.Combine(Settings.OutputFolder, relativePath);

                    return new TranscodeTask
                    {
                        InputFilePath = file,
                        OutputFilePath = Path.Combine(outputDir, outputFileName),
                        FileName = fileInfo.Name,
                        FileSize = fileInfo.Length,
                        Preset = SelectedPreset
                    };
                }).ToList();

                _taskManager.AddTasks(tasks);
            });

            StatusMessage = $"找到 {_taskManager.Tasks.Count} 个视频文件";
        }
        catch (Exception ex)
        {
            StatusMessage = $"扫描失败: {ex.Message}";
        }
        finally
        {
            IsScanning = false;
        }
    }

    [RelayCommand]
    private async Task StartTranscodeAsync()
    {
        if (!FFmpegAvailable)
        {
            StatusMessage = "FFmpeg 不可用";
            return;
        }

        if (_taskManager.Tasks.Count == 0)
        {
            StatusMessage = "没有待处理的任务";
            return;
        }

        if (string.IsNullOrEmpty(Settings.OutputFolder))
        {
            StatusMessage = "请选择输出文件夹";
            return;
        }

        Settings.MaxParallelTasks = _taskManager.MaxParallelTasks;
        _settingsService.SaveSettings(Settings);

        StatusMessage = "开始转码...";

        var completionCommand = Settings.ExecuteCommandOnComplete ? Settings.CompletionCommand : null;
        var completionArgs = Settings.ExecuteCommandOnComplete ? Settings.CompletionCommandArguments : null;

        await _taskManager.StartProcessingAsync(completionCommand, completionArgs, Settings.RunCompletionCommandForEachFile);

        StatusMessage = $"转码完成 - 成功: {_taskManager.CompletedCount}, 失败: {_taskManager.FailedCount}";
    }

    [RelayCommand]
    private void CancelTranscode()
    {
        _taskManager.CancelProcessing();
        StatusMessage = "正在取消...";
    }

    [RelayCommand]
    private void PauseTranscode()
    {
        _taskManager.PauseProcessing();
        StatusMessage = "已暂停";
    }

    [RelayCommand]
    private async Task ResumeTranscodeAsync()
    {
        StatusMessage = "正在恢复转码...";
        var completionCommand = Settings.ExecuteCommandOnComplete ? Settings.CompletionCommand : null;
        var completionArgs = Settings.ExecuteCommandOnComplete ? Settings.CompletionCommandArguments : null;

        await _taskManager.ResumeProcessingAsync(completionCommand, completionArgs, Settings.RunCompletionCommandForEachFile);

        StatusMessage = $"转码完成 - 成功: {_taskManager.CompletedCount}, 失败: {_taskManager.FailedCount}";
    }

    [RelayCommand]
    private void ClearTasks()
    {
        _taskManager.ClearTasks();
        StatusMessage = "已清除所有任务";
    }

    [RelayCommand]
    private void SaveSettings()
    {
        Settings.MaxParallelTasks = _taskManager.MaxParallelTasks;
        Settings.SelectedPresetName = SelectedPreset.Name;
        _settingsService.SaveSettings(Settings);
        StatusMessage = "设置已保存";
    }

    [RelayCommand]
    private void AddPreset()
    {
        var newPreset = new TranscodePreset
        {
            Name = $"新预设_{Settings.Presets.Count + 1}",
            Codec = VideoCodec.H264,
            Bitrate = 5000,
            OutputFormat = "mp4"
        };

        Settings.Presets.Add(newPreset);
        SelectedPreset = newPreset;
    }

    [RelayCommand]
    private void RemovePreset()
    {
        if (Settings.Presets.Count <= 1)
        {
            StatusMessage = "至少保留一个预设";
            return;
        }

        Settings.Presets.Remove(SelectedPreset);
        SelectedPreset = Settings.Presets.First();
    }

    [RelayCommand]
    private void BrowseInputFolder()
    {
        var path = BrowseFolder("选择输入文件夹");
        if (!string.IsNullOrEmpty(path))
        {
            Settings.InputFolder = path;
        }
    }

    [RelayCommand]
    private void BrowseOutputFolder()
    {
        var path = BrowseFolder("选择输出文件夹");
        if (!string.IsNullOrEmpty(path))
        {
            Settings.OutputFolder = path;
        }
    }

    [RelayCommand]
    private void BrowseCommand()
    {
        var path = BrowseFile("选择命令或脚本");
        if (!string.IsNullOrEmpty(path))
        {
            Settings.CompletionCommand = path;
        }
    }

    private string BrowseFolder(string title)
    {
        try
        {
            var dialog = new Avalonia.Platform.Storage.StorageProvider();
        }
        catch
        {
        }
        return string.Empty;
    }

    private string BrowseFile(string title)
    {
        return string.Empty;
    }
}

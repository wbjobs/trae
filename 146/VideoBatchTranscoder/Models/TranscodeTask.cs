using CommunityToolkit.Mvvm.ComponentModel;

namespace VideoBatchTranscoder.Models;

public partial class TranscodeTask : ObservableObject
{
    public string InputFilePath { get; set; } = string.Empty;

    public string OutputFilePath { get; set; } = string.Empty;

    public string FileName { get; set; } = string.Empty;

    public long FileSize { get; set; }

    [ObservableProperty]
    private TranscodeStatus status = TranscodeStatus.Pending;

    [ObservableProperty]
    private double progress;

    [ObservableProperty]
    private string currentAction = string.Empty;

    [ObservableProperty]
    private string errorMessage = string.Empty;

    [ObservableProperty]
    private TimeSpan elapsedTime;

    public DateTime StartTime { get; set; }

    public DateTime? EndTime { get; set; }

    public TranscodePreset Preset { get; set; } = new();
}

public enum TranscodeStatus
{
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled
}

namespace VideoBatchTranscoder.Models;

public class AppSettings
{
    public string InputFolder { get; set; } = string.Empty;

    public string OutputFolder { get; set; } = string.Empty;

    public bool RecursiveScan { get; set; } = true;

    public int MaxParallelTasks { get; set; } = 2;

    public string FFmpegPath { get; set; } = "ffmpeg";

    public string FFprobePath { get; set; } = "ffprobe";

    public List<TranscodePreset> Presets { get; set; } = new();

    public string SelectedPresetName { get; set; } = "Default";

    public bool ExecuteCommandOnComplete { get; set; } = false;

    public string CompletionCommand { get; set; } = string.Empty;

    public string CompletionCommandArguments { get; set; } = string.Empty;

    public bool RunCompletionCommandForEachFile { get; set; } = false;

    public List<string> SupportedExtensions { get; set; } = new()
    {
        ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".ts", ".mpg", ".mpeg"
    };
}

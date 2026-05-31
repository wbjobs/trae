using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using VideoBatchTranscoder.Models;

namespace VideoBatchTranscoder.Services;

public partial class TaskManagerService : ObservableObject
{
    private readonly IFFmpegService _ffmpegService;
    private readonly object _lock = new();
    private CancellationTokenSource? _cts;
    private CancellationTokenSource? _pauseCts;
    private int _runningTasks;
    private Dictionary<string, TimeSpan> _pauseProgress = new();

    public ObservableCollection<TranscodeTask> Tasks { get; } = new();

    [ObservableProperty]
    private int completedCount;

    [ObservableProperty]
    private int failedCount;

    [ObservableProperty]
    private int totalCount;

    [ObservableProperty]
    private bool isProcessing;

    [ObservableProperty]
    private bool isPaused;

    [ObservableProperty]
    private double overallProgress;

    public int MaxParallelTasks { get; set; } = 2;

    public event EventHandler? AllTasksCompleted;

    public TaskManagerService(IFFmpegService ffmpegService)
    {
        _ffmpegService = ffmpegService;
    }

    public void AddTasks(IEnumerable<TranscodeTask> tasks)
    {
        foreach (var task in tasks)
        {
            Tasks.Add(task);
        }
        TotalCount = Tasks.Count;
        UpdateOverallProgress();
    }

    public void ClearTasks()
    {
        Tasks.Clear();
        CompletedCount = 0;
        FailedCount = 0;
        TotalCount = 0;
        OverallProgress = 0;
        _pauseProgress.Clear();
    }

    public async Task StartProcessingAsync(string? completionCommand = null, string? completionArgs = null, bool runForEachFile = false)
    {
        if (IsProcessing) return;

        _cts = new CancellationTokenSource();
        IsProcessing = true;
        IsPaused = false;
        _runningTasks = 0;

        var pendingTasks = Tasks.Where(t => t.Status == TranscodeStatus.Pending || t.Status == TranscodeStatus.Cancelled).ToList();
        var semaphore = new SemaphoreSlim(MaxParallelTasks);

        try
        {
            var tasks = pendingTasks.Select(async task =>
            {
                await semaphore.WaitAsync(_cts.Token);
                Interlocked.Increment(ref _runningTasks);

                try
                {
                    await ProcessTaskAsync(task, _cts.Token);

                    if (task.Status == TranscodeStatus.Completed)
                    {
                        Interlocked.Increment(ref completedCount);

                        if (runForEachFile && !string.IsNullOrEmpty(completionCommand))
                        {
                            await ExecuteCompletionCommandAsync(completionCommand, completionArgs, task, _cts.Token);
                        }
                    }
                    else if (task.Status == TranscodeStatus.Failed)
                    {
                        Interlocked.Increment(ref failedCount);
                    }
                }
                finally
                {
                    semaphore.Release();
                    Interlocked.Decrement(ref _runningTasks);
                    UpdateOverallProgress();
                }
            });

            await Task.WhenAll(tasks);

            if (!runForEachFile && !string.IsNullOrEmpty(completionCommand) && CompletedCount > 0)
            {
                await ExecuteCompletionCommandAsync(completionCommand, completionArgs, null, _cts.Token);
            }

            AllTasksCompleted?.Invoke(this, EventArgs.Empty);
        }
        finally
        {
            IsProcessing = false;
            IsPaused = false;
        }
    }

    public void PauseProcessing()
    {
        if (!IsProcessing || IsPaused) return;

        IsPaused = true;
        _pauseCts = new CancellationTokenSource();

        foreach (var task in Tasks.Where(t => t.Status == TranscodeStatus.Processing))
        {
            _pauseProgress[task.InputFilePath] = TimeSpan.FromSeconds(task.Progress / 100.0 * GetTaskDuration(task));
        }

        _cts?.Cancel();
    }

    public async Task ResumeProcessingAsync(string? completionCommand = null, string? completionArgs = null, bool runForEachFile = false)
    {
        if (!IsPaused) return;

        IsPaused = false;
        _cts = new CancellationTokenSource();

        var pausedTasks = Tasks.Where(t => t.Status == TranscodeStatus.Processing || t.Status == TranscodeStatus.Cancelled).ToList();
        var semaphore = new SemaphoreSlim(MaxParallelTasks);

        try
        {
            var tasks = pausedTasks.Select(async task =>
            {
                await semaphore.WaitAsync(_cts.Token);
                Interlocked.Increment(ref _runningTasks);

                try
                {
                    TimeSpan? resumePoint = null;
                    if (_pauseProgress.TryGetValue(task.InputFilePath, out var pauseTime))
                    {
                        resumePoint = pauseTime;
                        task.Progress = (pauseTime.TotalSeconds / GetTaskDuration(task)) * 100;
                    }

                    await ProcessTaskAsync(task, _cts.Token, resumePoint);

                    if (task.Status == TranscodeStatus.Completed)
                    {
                        Interlocked.Increment(ref completedCount);
                        _pauseProgress.Remove(task.InputFilePath);

                        if (runForEachFile && !string.IsNullOrEmpty(completionCommand))
                        {
                            await ExecuteCompletionCommandAsync(completionCommand, completionArgs, task, _cts.Token);
                        }
                    }
                    else if (task.Status == TranscodeStatus.Failed)
                    {
                        Interlocked.Increment(ref failedCount);
                    }
                }
                finally
                {
                    semaphore.Release();
                    Interlocked.Decrement(ref _runningTasks);
                    UpdateOverallProgress();
                }
            });

            await Task.WhenAll(tasks);

            if (!runForEachFile && !string.IsNullOrEmpty(completionCommand) && CompletedCount > 0)
            {
                await ExecuteCompletionCommandAsync(completionCommand, completionArgs, null, _cts.Token);
            }

            AllTasksCompleted?.Invoke(this, EventArgs.Empty);
        }
        finally
        {
            IsProcessing = false;
            IsPaused = false;
        }
    }

    private double GetTaskDuration(TranscodeTask task)
    {
        var videoInfo = _ffmpegService.GetVideoInfoAsync(task.InputFilePath, CancellationToken.None).Result;
        return videoInfo?.Duration.TotalSeconds ?? 3600;
    }

    private async Task ProcessTaskAsync(TranscodeTask task, CancellationToken cancellationToken, TimeSpan? resumeFrom = null)
    {
        task.Status = TranscodeStatus.Processing;
        task.StartTime = DateTime.Now - task.ElapsedTime;
        task.CurrentAction = resumeFrom.HasValue ? "恢复转码..." : "正在转码...";

        try
        {
            var outputDir = Path.GetDirectoryName(task.OutputFilePath);
            if (!string.IsNullOrEmpty(outputDir) && !Directory.Exists(outputDir))
            {
                Directory.CreateDirectory(outputDir);
            }

            var progress = new Progress<double>(p =>
            {
                if (resumeFrom.HasValue)
                {
                    var resumeProgress = (resumeFrom.Value.TotalSeconds / GetTaskDuration(task)) * 100;
                    task.Progress = resumeProgress + (100 - resumeProgress) * (p / 100);
                }
                else
                {
                    task.Progress = p;
                }
                task.ElapsedTime = DateTime.Now - task.StartTime;
            });

            var result = await _ffmpegService.TranscodeAsync(task, progress, cancellationToken, resumeFrom, null);

            task.EndTime = DateTime.Now;
            task.Status = result ? TranscodeStatus.Completed : TranscodeStatus.Failed;
            task.CurrentAction = result ? "转码完成" : "转码失败";

            if (!result && !cancellationToken.IsCancellationRequested)
            {
                task.ErrorMessage = "转码过程中发生错误";
            }
        }
        catch (OperationCanceledException)
        {
            task.Status = IsPaused ? TranscodeStatus.Cancelled : TranscodeStatus.Cancelled;
            task.CurrentAction = IsPaused ? "已暂停" : "已取消";
        }
        catch (Exception ex)
        {
            task.Status = TranscodeStatus.Failed;
            task.CurrentAction = "转码失败";
            task.ErrorMessage = ex.Message;
            task.EndTime = DateTime.Now;
        }
    }

    private async Task ExecuteCompletionCommandAsync(string command, string? args, TranscodeTask? task, CancellationToken cancellationToken)
    {
        try
        {
            var arguments = args ?? string.Empty;

            if (task != null)
            {
                arguments = arguments
                    .Replace("{input}", task.InputFilePath)
                    .Replace("{output}", task.OutputFilePath)
                    .Replace("{filename}", task.FileName);
            }

            var process = new ProcessStartInfo
            {
                FileName = command,
                Arguments = arguments,
                UseShellExecute = true,
                CreateNoWindow = false
            };

            using var proc = Process.Start(process);
            if (proc != null)
            {
                await proc.WaitForExitAsync(cancellationToken);
            }
        }
        catch
        {
        }
    }

    public void CancelProcessing()
    {
        _cts?.Cancel();
        IsPaused = false;
    }

    private void UpdateOverallProgress()
    {
        if (TotalCount == 0)
        {
            OverallProgress = 0;
            return;
        }

        var totalProgress = Tasks.Sum(t => t.Progress);
        OverallProgress = totalProgress / TotalCount;
    }
}

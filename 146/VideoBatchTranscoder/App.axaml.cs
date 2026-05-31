using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Microsoft.Extensions.DependencyInjection;
using VideoBatchTranscoder.ViewModels;
using VideoBatchTranscoder.Views;
using VideoBatchTranscoder.Services;
using VideoBatchTranscoder.Models;

namespace VideoBatchTranscoder;

public partial class App : Application
{
    public IServiceProvider Services { get; private set; } = null!;

    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        var serviceCollection = new ServiceCollection();
        ConfigureServices(serviceCollection);
        Services = serviceCollection.BuildServiceProvider();

        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var mainWindow = new MainWindow
            {
                DataContext = Services.GetRequiredService<MainViewModel>()
            };
            desktop.MainWindow = mainWindow;
        }

        base.OnFrameworkInitializationCompleted();
    }

    private void ConfigureServices(IServiceCollection services)
    {
        services.AddSingleton<ISettingsService, SettingsService>();
        services.AddSingleton<IVideoScanner, VideoScanner>();

        var settingsProvider = services.BuildServiceProvider();
        var settings = settingsProvider.GetRequiredService<ISettingsService>().LoadSettings();

        services.AddSingleton<IFFmpegService, FFmpegService>(sp =>
            new FFmpegService(settings.FFmpegPath, settings.FFprobePath));

        services.AddSingleton<IHardwareDetectionService, HardwareDetectionService>(sp =>
            new HardwareDetectionService(settings.FFmpegPath));

        services.AddSingleton<TaskManagerService>();
        services.AddTransient<MainViewModel>();
    }
}

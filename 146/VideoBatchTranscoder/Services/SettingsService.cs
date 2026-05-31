using System.Text.Json;
using VideoBatchTranscoder.Models;

namespace VideoBatchTranscoder.Services;

public interface ISettingsService
{
    AppSettings LoadSettings();
    void SaveSettings(AppSettings settings);
}

public class SettingsService : ISettingsService
{
    private readonly string _settingsPath;
    private readonly JsonSerializerOptions _jsonOptions;

    public SettingsService()
    {
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "VideoBatchTranscoder");
        _settingsPath = Path.Combine(appDataPath, "settings.json");

        _jsonOptions = new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        if (!Directory.Exists(appDataPath))
        {
            Directory.CreateDirectory(appDataPath);
        }
    }

    public AppSettings LoadSettings()
    {
        try
        {
            if (File.Exists(_settingsPath))
            {
                var json = File.ReadAllText(_settingsPath);
                var settings = JsonSerializer.Deserialize<AppSettings>(json, _jsonOptions);
                if (settings != null)
                {
                    if (settings.Presets == null || settings.Presets.Count == 0)
                    {
                        settings.Presets = GetDefaultPresets();
                        settings.SelectedPresetName = settings.SelectedPresetName ?? "Default";
                    }
                    return settings;
                }
            }
        }
        catch
        {
        }

        return CreateDefaultSettings();
    }

    public void SaveSettings(AppSettings settings)
    {
        try
        {
            var json = JsonSerializer.Serialize(settings, _jsonOptions);
            File.WriteAllText(_settingsPath, json);
        }
        catch
        {
        }
    }

    private AppSettings CreateDefaultSettings()
    {
        return new AppSettings
        {
            Presets = GetDefaultPresets(),
            SelectedPresetName = "Default"
        };
    }

    private List<TranscodePreset> GetDefaultPresets()
    {
        return new List<TranscodePreset>
        {
            new()
            {
                Name = "Default",
                Codec = VideoCodec.H264,
                Resolution = "Original",
                Bitrate = 5000,
                OutputFormat = "mp4"
            },
            new()
            {
                Name = "H.264 1080p",
                Codec = VideoCodec.H264,
                Width = 1920,
                Height = 1080,
                Resolution = "1920x1080",
                Bitrate = 8000,
                OutputFormat = "mp4"
            },
            new()
            {
                Name = "H.264 720p",
                Codec = VideoCodec.H264,
                Width = 1280,
                Height = 720,
                Resolution = "1280x720",
                Bitrate = 4000,
                OutputFormat = "mp4"
            },
            new()
            {
                Name = "H.265 1080p",
                Codec = VideoCodec.H265,
                Width = 1920,
                Height = 1080,
                Resolution = "1920x1080",
                Bitrate = 4000,
                OutputFormat = "mp4"
            },
            new()
            {
                Name = "H.265 720p",
                Codec = VideoCodec.H265,
                Width = 1280,
                Height = 720,
                Resolution = "1280x720",
                Bitrate = 2000,
                OutputFormat = "mp4"
            },
            new()
            {
                Name = "H.265 4K",
                Codec = VideoCodec.H265,
                Width = 3840,
                Height = 2160,
                Resolution = "3840x2160",
                Bitrate = 20000,
                OutputFormat = "mp4"
            },
            new()
            {
                Name = "NVENC H.264 1080p",
                Codec = VideoCodec.H264,
                UseHardwareAcceleration = true,
                HardwareEncoder = HardwareEncoder.NvidiaNVENC,
                Width = 1920,
                Height = 1080,
                Resolution = "1920x1080",
                Bitrate = 8000,
                Quality = 23,
                EncoderPreset = "p5",
                OutputFormat = "mp4"
            },
            new()
            {
                Name = "NVENC HEVC 1080p",
                Codec = VideoCodec.H265,
                UseHardwareAcceleration = true,
                HardwareEncoder = HardwareEncoder.NvidiaNVENC_HEVC,
                Width = 1920,
                Height = 1080,
                Resolution = "1920x1080",
                Bitrate = 4000,
                Quality = 28,
                EncoderPreset = "p5",
                OutputFormat = "mp4"
            },
            new()
            {
                Name = "QSV H.264 1080p",
                Codec = VideoCodec.H264,
                UseHardwareAcceleration = true,
                HardwareEncoder = HardwareEncoder.IntelQSV,
                Width = 1920,
                Height = 1080,
                Resolution = "1920x1080",
                Bitrate = 8000,
                Quality = 23,
                EncoderPreset = "medium",
                OutputFormat = "mp4"
            },
            new()
            {
                Name = "AMF H.264 1080p",
                Codec = VideoCodec.H264,
                UseHardwareAcceleration = true,
                HardwareEncoder = HardwareEncoder.AmdAMF,
                Width = 1920,
                Height = 1080,
                Resolution = "1920x1080",
                Bitrate = 8000,
                Quality = 23,
                EncoderPreset = "balanced",
                OutputFormat = "mp4"
            }
        };
    }
}

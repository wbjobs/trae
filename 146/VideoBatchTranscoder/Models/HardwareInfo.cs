namespace VideoBatchTranscoder.Models;

public class HardwareInfo
{
    public bool HasIntelQSV { get; set; }
    public bool HasNvidiaNVENC { get; set; }
    public bool HasAmdAMF { get; set; }
    public bool HasNvidiaCUDA { get; set; }

    public string GPUName { get; set; } = string.Empty;
    public string GPUVendor { get; set; } = string.Empty;
    public long VRAM { get; set; }

    public List<string> AvailableEncoders { get; set; } = new();
    public List<string> AvailableDecoders { get; set; } = new();

    public HardwareEncoder RecommendedEncoder { get; set; } = HardwareEncoder.Software;
    public string Recommendation { get; set; } = string.Empty;

    public bool HasHardwareAcceleration => HasIntelQSV || HasNvidiaNVENC || HasAmdAMF;

    public int RecommendedQuality { get; set; } = 23;
    public int RecommendedBitrate { get; set; } = 5000;
    public string RecommendedPreset { get; set; } = "medium";
}

public enum HardwareEncoder
{
    Software,
    IntelQSV,
    NvidiaNVENC,
    NvidiaNVENC_H264,
    NvidiaNVENC_HEVC,
    AmdAMF,
    AmdAMF_H264,
    AmdAMF_HEVC
}

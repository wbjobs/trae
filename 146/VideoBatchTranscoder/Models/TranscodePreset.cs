using System.Text.Json.Serialization;

namespace VideoBatchTranscoder.Models;

public class TranscodePreset
{
    public string Name { get; set; } = "Default";

    public VideoCodec Codec { get; set; } = VideoCodec.H264;

    public HardwareEncoder HardwareEncoder { get; set; } = HardwareEncoder.Software;

    public bool UseHardwareAcceleration { get; set; } = false;

    public string Resolution { get; set; } = "Original";

    public int? Width { get; set; }

    public int? Height { get; set; }

    public int Bitrate { get; set; } = 5000;

    public int? FrameRate { get; set; }

    public int Quality { get; set; } = 23;

    public string EncoderPreset { get; set; } = "medium";

    public string OutputFormat { get; set; } = "mp4";

    public string GetFFmpegArguments()
    {
        var args = new List<string>();

        args.Add("-copyts");
        args.Add("-fflags +genpts");
        args.Add("-avoid_negative_ts make_zero");

        if (UseHardwareAcceleration && HardwareEncoder != HardwareEncoder.Software)
        {
            args.AddRange(GetHardwareEncoderArguments());
        }
        else
        {
            args.AddRange(GetSoftwareEncoderArguments());
        }

        if (Width.HasValue && Height.HasValue)
        {
            args.Add($"-vf scale={Width.Value}:{Height.Value}");
        }
        else if (Resolution != "Original")
        {
            var resParts = Resolution.Split('x');
            if (resParts.Length == 2 && int.TryParse(resParts[0], out int w) && int.TryParse(resParts[1], out int h))
            {
                args.Add($"-vf scale={w}:{h}");
            }
        }

        if (FrameRate.HasValue)
        {
            args.Add($"-r {FrameRate.Value}");
        }

        args.Add("-vsync cfr");
        args.Add("-async 1");
        args.Add("-c:a aac");
        args.Add("-b:a 192k");
        args.Add("-ar 48000");
        args.Add("-ac 2");

        if (OutputFormat.ToLowerInvariant() == "mp4")
        {
            args.Add("-movflags +faststart");
        }

        return string.Join(" ", args);
    }

    private List<string> GetSoftwareEncoderArguments()
    {
        var args = new List<string>();

        switch (Codec)
        {
            case VideoCodec.H264:
                args.Add("-c:v libx264");
                args.Add($"-b:v {Bitrate}k");
                args.Add($"-preset {EncoderPreset}");
                args.Add($"-crf {Quality}");
                args.Add("-x264opts stitchable=1");
                break;
            case VideoCodec.H265:
                args.Add("-c:v libx265");
                args.Add($"-b:v {Bitrate}k");
                args.Add($"-preset {EncoderPreset}");
                args.Add($"-crf {Quality}");
                args.Add("-x265-params stitchable=1");
                break;
        }

        return args;
    }

    private List<string> GetHardwareEncoderArguments()
    {
        var args = new List<string>();

        switch (HardwareEncoder)
        {
            case HardwareEncoder.NvidiaNVENC:
            case HardwareEncoder.NvidiaNVENC_H264:
                args.Add("-c:v h264_nvenc");
                args.Add($"-preset {EncoderPreset}");
                args.Add($"-cq {Quality}");
                args.Add($"-b:v {Bitrate}k");
                args.Add("-gpu 0");
                args.Add("-pix_fmt yuv420p");
                break;

            case HardwareEncoder.NvidiaNVENC_HEVC:
                args.Add("-c:v hevc_nvenc");
                args.Add($"-preset {EncoderPreset}");
                args.Add($"-cq {Quality}");
                args.Add($"-b:v {Bitrate}k");
                args.Add("-gpu 0");
                args.Add("-pix_fmt yuv420p");
                break;

            case HardwareEncoder.IntelQSV:
                args.Add("-c:v h264_qsv");
                args.Add($"-preset {EncoderPreset}");
                args.Add($"-global_quality {Quality}");
                args.Add($"-b:v {Bitrate}k");
                args.Add("-pix_fmt yuv420p");
                break;

            case HardwareEncoder.AmdAMF:
            case HardwareEncoder.AmdAMF_H264:
                args.Add("-c:v h264_amf");
                args.Add($"-quality {EncoderPreset}");
                args.Add("-rc cqp");
                args.Add($"-qp_i {Quality}");
                args.Add($"-qp_p {Quality}");
                args.Add($"-b:v {Bitrate}k");
                args.Add("-pix_fmt yuv420p");
                break;

            case HardwareEncoder.AmdAMF_HEVC:
                args.Add("-c:v hevc_amf");
                args.Add($"-quality {EncoderPreset}");
                args.Add("-rc cqp");
                args.Add($"-qp_i {Quality}");
                args.Add($"-qp_p {Quality}");
                args.Add($"-b:v {Bitrate}k");
                args.Add("-pix_fmt yuv420p");
                break;

            default:
                return GetSoftwareEncoderArguments();
        }

        return args;
    }

    public string GetOutputExtension()
    {
        return OutputFormat.StartsWith('.') ? OutputFormat : $".{OutputFormat}";
    }
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum VideoCodec
{
    H264,
    H265
}

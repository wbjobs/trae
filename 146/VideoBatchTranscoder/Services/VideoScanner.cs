using VideoBatchTranscoder.Models;

namespace VideoBatchTranscoder.Services;

public interface IVideoScanner
{
    List<string> ScanVideos(string folderPath, bool recursive, List<string> supportedExtensions);
}

public class VideoScanner : IVideoScanner
{
    public List<string> ScanVideos(string folderPath, bool recursive, List<string> supportedExtensions)
    {
        var result = new List<string>();

        if (!Directory.Exists(folderPath))
            return result;

        try
        {
            var searchOption = recursive ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly;
            var files = Directory.GetFiles(folderPath, "*.*", searchOption);

            foreach (var file in files)
            {
                var extension = Path.GetExtension(file).ToLowerInvariant();
                if (supportedExtensions.Contains(extension))
                {
                    result.Add(file);
                }
            }
        }
        catch (Exception ex)
        {
            throw new Exception($"扫描文件夹时出错: {ex.Message}", ex);
        }

        return result;
    }
}

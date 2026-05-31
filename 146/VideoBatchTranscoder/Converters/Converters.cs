using Avalonia.Data.Converters;
using Avalonia.Media;
using VideoBatchTranscoder.Models;

namespace VideoBatchTranscoder.Converters;

public static class Converters
{
    public static readonly BoolToColorConverter BoolToColorConverter = new();
    public static readonly InverseBoolConverter InverseBoolConverter = new();
    public static readonly StatusToColorConverter StatusToColorConverter = new();
    public static readonly BoolToNotPausedConverter BoolToNotPausedConverter = new();
    public static readonly StringToVisibilityConverter StringToVisibilityConverter = new();
    public static readonly IntToVisibilityConverter IntToVisibilityConverter = new();
    public static readonly BytesToMBConverter BytesToMBConverter = new();
}

public class BoolToColorConverter : IValueConverter
{
    public static readonly BoolToColorConverter Instance = new();

    public object? Convert(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        if (value is bool boolValue)
        {
            return boolValue ? Brushes.LimeGreen : Brushes.OrangeRed;
        }
        return Brushes.Gray;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class InverseBoolConverter : IValueConverter
{
    public static readonly InverseBoolConverter Instance = new();

    public object? Convert(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        if (value is bool boolValue)
        {
            return !boolValue;
        }
        return true;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        if (value is bool boolValue)
        {
            return !boolValue;
        }
        return true;
    }
}

public class StatusToColorConverter : IValueConverter
{
    public static readonly StatusToColorConverter Instance = new();

    public object? Convert(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        if (value is TranscodeStatus status)
        {
            return status switch
            {
                TranscodeStatus.Pending => Brushes.Gray,
                TranscodeStatus.Processing => Brushes.DodgerBlue,
                TranscodeStatus.Completed => Brushes.LimeGreen,
                TranscodeStatus.Failed => Brushes.OrangeRed,
                TranscodeStatus.Cancelled => Brushes.Gold,
                _ => Brushes.Gray
            };
        }
        return Brushes.Gray;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class BoolToNotPausedConverter : IValueConverter
{
    public static readonly BoolToNotPausedConverter Instance = new();

    public object? Convert(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        if (value is bool isProcessing)
        {
            return isProcessing;
        }
        return false;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class StringToVisibilityConverter : IValueConverter
{
    public static readonly StringToVisibilityConverter Instance = new();

    public object? Convert(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        if (value is string strValue)
        {
            return !string.IsNullOrEmpty(strValue);
        }
        return false;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class IntToVisibilityConverter : IValueConverter
{
    public static readonly IntToVisibilityConverter Instance = new();

    public object? Convert(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        if (value is long longValue)
        {
            return longValue > 0;
        }
        return false;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class BytesToMBConverter : IValueConverter
{
    public static readonly BytesToMBConverter Instance = new();

    public object? Convert(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        if (value is long bytes)
        {
            return $"{bytes / (1024 * 1024)} MB";
        }
        return "0 MB";
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

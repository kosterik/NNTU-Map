param([string]$ImagePath)

$csharp = @"
using System;
using System.IO;
using System.Threading.Tasks;
using Windows.Media.Ocr;
using Windows.Graphics.Imaging;
using Windows.Storage;

public class WinOcr {
    public static string Recognize(string filePath) {
        try {
            return RecognizeAsync(filePath).GetAwaiter().GetResult();
        } catch (Exception ex) {
            return "ERROR: " + ex.Message;
        }
    }

    private static async Task<string> RecognizeAsync(string filePath) {
        var file = await StorageFile.GetFileFromPathAsync(Path.GetFullPath(filePath));
        using (var stream = await file.OpenAsync(FileAccessMode.Read)) {
            var decoder = await BitmapDecoder.CreateAsync(stream);
            var bitmap = await decoder.GetSoftwareBitmapAsync();
            var lang = new Windows.Globalization.Language("ru");
            var engine = OcrEngine.TryCreateFromLanguage(lang) ?? OcrEngine.AvailableRecognizerLanguages[0] != null ? OcrEngine.TryCreateFromLanguage(OcrEngine.AvailableRecognizerLanguages[0]) : null;
            if (engine == null) return "";
            var ocrResult = await engine.RecognizeAsync(bitmap);
            return ocrResult.Text;
        }
    }
}
"@

Add-Type -TypeDefinition $csharp -ReferencedAssemblies @(
    "System.Runtime.WindowsRuntime",
    "C:\Windows\System32\WinMetadata\Windows.Foundation.winmd",
    "C:\Windows\System32\WinMetadata\Windows.Media.winmd",
    "C:\Windows\System32\WinMetadata\Windows.Graphics.winmd",
    "C:\Windows\System32\WinMetadata\Windows.Storage.winmd"
) -IgnoreWarnings

$res = [WinOcr]::Recognize($ImagePath)
Write-Output $res

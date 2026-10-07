param([string]$ImagePath)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$lang = New-Object Windows.Globalization.Language("ru")
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages[0]
}

$file = [System.IO.Path]::GetFullPath($ImagePath)
$fileStream = [System.IO.File]::OpenRead($file)
$stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fileStream)

$decoderTask = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
$decoder = $decoderTask.GetAwaiter().GetResult()

$bmpTask = $decoder.GetSoftwareBitmapAsync()
$bitmap = $bmpTask.GetAwaiter().GetResult()

$ocrTask = $engine.RecognizeAsync($bitmap)
$result = $ocrTask.GetAwaiter().GetResult()

$fileStream.Close()

Write-Output $result.Text

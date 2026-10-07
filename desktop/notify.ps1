Add-Type -AssemblyName System.Windows.Forms
$balloon = New-Object System.Windows.Forms.NotifyIcon
$balloon.Icon = [System.Drawing.SystemIcons]::Information
$balloon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
$balloon.BalloonTipTitle = $args[0]
$balloon.BalloonTipText = $args[1]
$balloon.Visible = $True
$balloon.ShowBalloonTip(4000)
Start-Sleep -Seconds 2
$balloon.Dispose()

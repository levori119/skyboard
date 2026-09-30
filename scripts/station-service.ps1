<#
.SYNOPSIS
  סוכן העמדה עולה עם המחשב - התקנה, הסרה ובדיקה.

.DESCRIPTION
  הסוכן מחזיק את המאגר המקומי ואת שירות המראה. כל עוד הוא רץ רק מחלון טרמינל
  פתוח, הוא מת ברגע שסוגרים אותו - וזה ההבדל בין "עובד כשבודקים" לבין "עובד
  בשדה".

  ⚠️ **משימה מתוזמנת ולא שירות Windows אמיתי, ובכוונה.** שירות אמיתי היה דורש
  עוטף חיצוני (NSSM / node-windows). ברשת מבודדת כל תלות חיצונית היא גם בעיית
  זמינות וגם שרשרת אספקה (SK-30), ומתזמן המשימות מובנה ב-Windows, תומך
  בהפעלה באתחול, ומתאושש מקריסה - כל מה שצריך, בלי להוריד דבר.

  ⚠️ **האסימון אינו נכנס לשורת הפקודה.** `schtasks /query /v` חושף את שורת
  הפקודה של כל משימה לכל משתמש מקומי. לכן התצורה יושבת ב-station-agent.json
  עם ACL מצומצם, והמשימה מקבלת רק את הנתיב אליו.

.EXAMPLE
  # התקנה (מחלון PowerShell כמנהל - נדרש להפעלה באתחול)
  .\scripts\station-service.ps1 -Install -ApiUrl https://sky-king.up.railway.app -Token '...'

  .\scripts\station-service.ps1 -Status     # האם רץ, ומה מצב הסנכרון
  .\scripts\station-service.ps1 -Logs       # 40 השורות האחרונות
  .\scripts\station-service.ps1 -Restart
  .\scripts\station-service.ps1 -Uninstall
#>
[CmdletBinding(DefaultParameterSetName = 'Status')]
param(
  [Parameter(ParameterSetName = 'Install')][switch]$Install,
  [Parameter(ParameterSetName = 'Install')][string]$ApiUrl,
  [Parameter(ParameterSetName = 'Install')][string]$Token,
  [Parameter(ParameterSetName = 'Install')][int]$Port = 5100,
  [Parameter(ParameterSetName = 'Install')][string]$StationKey = $env:COMPUTERNAME,
  [Parameter(ParameterSetName = 'Install')][string]$DbDir,
  # ללא -Dist הסוכן מגיש מ-Vite בפיתוח; בעמדה רוצים את ה-build שעל הדיסק
  [Parameter(ParameterSetName = 'Install')][switch]$Dist,

  [Parameter(ParameterSetName = 'Uninstall')][switch]$Uninstall,
  [Parameter(ParameterSetName = 'Status')][switch]$Status,
  [Parameter(ParameterSetName = 'Logs')][switch]$Logs,
  [Parameter(ParameterSetName = 'Restart')][switch]$Restart
)

$ErrorActionPreference = 'Stop'

$TaskName = 'SKY-KING Station Agent'
$Root     = Split-Path -Parent $PSScriptRoot
$CfgPath  = Join-Path $Root 'station-agent.json'
$LogDir   = Join-Path $env:ProgramData 'SKY-KING\logs'
$LogPath  = Join-Path $LogDir 'station-agent.log'

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-NodePath {
  $n = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $n) { throw 'node לא נמצא ב-PATH. להתקין Node.js 22 ולנסות שוב.' }
  return $n
}

# ── התקנה ────────────────────────────────────────────────────────────────────
if ($Install) {
  if (-not $ApiUrl) { throw 'חסר -ApiUrl (כתובת השרת המרכזי)' }

  # ⚠️ **בודקים הרשאות לפני שכותבים משהו.** הגרסה הראשונה כתבה את קובץ
  # התצורה, נכשלה ב-Register-ScheduledTask ב-Access denied, ובכל זאת הדפיסה
  # "המשימה הותקנה והופעלה". התקנה חלקית שמדווחת הצלחה היא הדבר הגרוע ביותר
  # שסקריפט התקנה יכול לעשות.
  if (-not (Test-Admin)) {
    Write-Host "✗ נדרשות הרשאות מנהל" -ForegroundColor Red
    Write-Host "  רישום משימה שעולה עם המחשב הוא פעולת מנהל."
    Write-Host "  לפתוח PowerShell כמנהל (קליק ימני → Run as administrator) ולהריץ שוב."
    exit 3
  }
  $node = Get-NodePath
  if (-not $DbDir) { $DbDir = Join-Path $env:ProgramData 'SKY-KING\local-db' }

  New-Item -ItemType Directory -Force -Path $LogDir, $DbDir | Out-Null

  # ── קובץ התצורה, עם ACL מצומצם ─────────────────────────────────────────
  # ⚠️ הקובץ מחזיק את אסימון העמדה. ברירת המחדל של NTFS נותנת ל-Users
  # קריאה, וזה מדליף אותו לכל מי שיושב על המחשב.
  $cfg = [ordered]@{
    api     = $ApiUrl
    port    = $Port
    station = $StationKey
    db      = $DbDir
    log     = $LogPath
  }
  if ($Token) { $cfg.token = $Token }
  # ⚠️ **UTF-8 בלי BOM.** `Set-Content -Encoding utf8` ב-Windows PowerShell 5.1
  # כותב BOM, ו-`JSON.parse` ב-node נחנק עליו ב-`Unexpected token 'ï»¿'`.
  # זה מה שהפיל את ההתקנה האמיתית הראשונה, בלי שום לוג.
  $json = $cfg | ConvertTo-Json -Depth 3
  [System.IO.File]::WriteAllText($CfgPath, $json, (New-Object System.Text.UTF8Encoding($false)))

  $acl = Get-Acl $CfgPath
  $acl.SetAccessRuleProtection($true, $false)   # ניתוק ירושה
  foreach ($who in @('SYSTEM', 'Administrators')) {
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
      $who, 'FullControl', 'Allow')))
  }
  Set-Acl -Path $CfgPath -AclObject $acl
  Write-Host "✓ תצורה נכתבה: $CfgPath (SYSTEM ו-Administrators בלבד)" -ForegroundColor Green

  # ── המשימה ─────────────────────────────────────────────────────────────
  #
  # ⚠️ **דרך cmd עם הפניה לקובץ, ולא node ישירות.** בגרסה הראשונה המשימה
  # הריצה את node ישירות, היא נכשלה ב-exit 1, ו**לא נשאר שום לוג** - כי
  # הכשל קרה לפני שהלוג של האפליקציה הוקם. כשל עלייה בלי ראיה הוא בדיוק
  # המצב שאי אפשר לאבחן ממנו. ההפניה כאן תופסת גם כשל של node עצמו
  # (DLL חסר, נתיב לא נגיש, הרשאה), עוד לפני ששורת JS אחת רצה.
  #
  # `--quiet` כדי שהאפליקציה לא תכתוב פעמיים - ללוג שלה וגם לקובץ האתחול.
  $script   = Join-Path $Root 'scripts\station.mjs'
  $bootLog  = Join-Path $LogDir 'station-agent-boot.log'
  $inner    = "`"$node`" `"$script`" --config=`"$CfgPath`" --quiet"
  if ($Dist) { $inner += ' --dist' }
  # `2>&1` אחרי ההפניה: גם stderr נכנס לאותו קובץ. המרכאות הכפולות בקצוות
  # נדרשות ל-cmd /c כשיש מרכאות בפנים.
  $cmdArgs  = "/c `"$inner >> `"$bootLog`" 2>&1`""

  $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" `
    -Argument $cmdArgs -WorkingDirectory $Root

  # באתחול המחשב, לא בכניסת משתמש: העמדה צריכה לסנכרן גם לפני שמישהו התחבר.
  $trigger = New-ScheduledTaskTrigger -AtStartup

  # ⚠️ **התאוששות מקריסה.** בלי זה, תהליך שמת נשאר מת עד האתחול הבא -
  # והמאגר המקומי מפסיק להתעדכן בלי שאיש יידע.
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)   # אפס = בלי תקרת זמן. זה daemon.
  $settings.MultipleInstances = 'IgnoreNew'  # לא להרים שני סוכנים על אותו פורט

  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' `
    -LogonType ServiceAccount -RunLevel Highest

  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
      -Settings $settings -Principal $principal `
      -Description 'מחזיק את המאגר המקומי ואת שירות המראה של עמדת SKY-KING' `
      -ErrorAction Stop | Out-Null
  } catch {
    Write-Host "✗ רישום המשימה נכשל: $($_.Exception.Message)" -ForegroundColor Red
    exit 4
  }

  # ⚠️ **מאמתים שהמשימה באמת שם.** Register יכול להיכשל בשקט תחת מדיניות
  # קבוצתית, ו"הותקן" שאינו נכון שולח את מי שמתקין לחפש את התקלה במקום אחר.
  if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
    Write-Host "✗ המשימה אינה מופיעה אחרי הרישום - ייתכן שמדיניות קבוצתית חוסמת" -ForegroundColor Red
    exit 4
  }

  Start-ScheduledTask -TaskName $TaskName
  Write-Host "✓ המשימה הותקנה והופעלה" -ForegroundColor Green
  Write-Host "  טריגר:  באתחול המחשב (SYSTEM)"
  Write-Host "  לוג:    $LogPath"
  Write-Host "  לוג אתחול: $bootLog   (כשלים שקורים לפני שהלוג עולה)"
  Write-Host "  כתובת:  http://127.0.0.1:$Port"
  Write-Host ""
  Write-Host "  הסנכרון הראשון לוקח כדקה. לבדיקה:" -ForegroundColor Cyan
  Write-Host "    .\scripts\station-service.ps1 -Status"
  return
}

# ── הסרה ─────────────────────────────────────────────────────────────────────
if ($Uninstall) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "✓ המשימה הוסרה" -ForegroundColor Green
  Write-Host "  התצורה והמאגר המקומי **לא** נמחקו:"
  Write-Host "    $CfgPath"
  Write-Host "    $(Join-Path $env:ProgramData 'SKY-KING\local-db')"
  return
}

# ── הפעלה מחדש ───────────────────────────────────────────────────────────────
if ($Restart) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "✓ הופעל מחדש" -ForegroundColor Green
  return
}

# ── לוג ──────────────────────────────────────────────────────────────────────
if ($Logs) {
  $bootLog = Join-Path $LogDir 'station-agent-boot.log'
  # ⚠️ **לוג האתחול קודם.** כשהסוכן לא עולה בכלל, הלוג שלו ריק או לא קיים,
  # והראיה היחידה נמצאת שם. להציג רק את הלוג ה"רגיל" פירושו לומר "אין לוג"
  # דווקא במקרה שבו הכי צריך אותו.
  if (Test-Path $bootLog) {
    $boot = Get-Content -Path $bootLog -Tail 20
    if ($boot) {
      Write-Host "── לוג אתחול ($bootLog) ──" -ForegroundColor Yellow
      $boot
      Write-Host ""
    }
  }
  if (Test-Path $LogPath) {
    Write-Host "── לוג הסוכן ($LogPath) ──" -ForegroundColor Cyan
    Get-Content -Path $LogPath -Tail 40
  } else {
    Write-Host "אין עדיין לוג סוכן ב-$LogPath - הסוכן לא הגיע לשלב הזה"
  }
  return
}

# ── מצב (ברירת המחדל) ────────────────────────────────────────────────────────
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "✗ המשימה אינה מותקנת" -ForegroundColor Red
  Write-Host "  להתקנה: .\scripts\station-service.ps1 -Install -ApiUrl <כתובת> -Token <אסימון>"
  exit 2
}

$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "משימה:      $($task.State)"
Write-Host "הרצה אחרונה: $($info.LastRunTime)  (תוצאה: $($info.LastTaskResult))"

# ⚠️ "המשימה רצה" אינו "הסוכן עונה". רק בקשה אמיתית מוכיחה זאת.
$port = 5100
if (Test-Path $CfgPath) {
  try { $port = (Get-Content $CfgPath -Raw | ConvertFrom-Json).port } catch { }
}
try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/__local/__localdb/startup" -TimeoutSec 5
  Write-Host "✓ הסוכן עונה על פורט $port" -ForegroundColor Green
  Write-Host "  מצב עלייה: $($r.startup)   פ`"מים במאגר: $($r.strips)"
  if ($r.error) { Write-Host "  שגיאת סנכרון אחרונה: $($r.error)" -ForegroundColor Yellow }
} catch {
  Write-Host "✗ הסוכן אינו עונה על פורט $port" -ForegroundColor Red
  Write-Host "  הלוג: .\scripts\station-service.ps1 -Logs"
  exit 1
}

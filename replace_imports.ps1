param (
    [string]$oldStringPattern,
    [string]$newStringReplacement
)

$files = Get-ChildItem -Path src -Filter "*.ts" -Recurse

foreach ($file in $files) {
    $content = Get-Content $file.FullName
    $newContent = $content -replace $oldStringPattern, $newStringReplacement
    Set-Content -Path $file.FullName -Value $newContent
}

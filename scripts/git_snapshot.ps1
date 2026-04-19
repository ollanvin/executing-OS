param(
  [string]$RepoPath,
  [string]$OutDir
)

Set-Location $RepoPath
git status --short | Out-File "$OutDir\git_status.txt" -Encoding UTF8
git diff           | Out-File "$OutDir\git_diff.patch" -Encoding UTF8
exit 0

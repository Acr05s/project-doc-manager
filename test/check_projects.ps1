Write-Host "Checking projects directory..."
$projectsPath = "d:\workspace\Doc\project_doc_manager\projects"
Write-Host "Path: $projectsPath"

if (Test-Path $projectsPath) {
    Write-Host "✅ Projects directory exists"
    Write-Host "Contents:"
    Get-ChildItem -Path $projectsPath -Name
} else {
    Write-Host "❌ Projects directory does not exist"
}

Write-Host ""
Write-Host "Checking uploads/projects directory..."
$uploadsProjectsPath = "d:\workspace\Doc\project_doc_manager\uploads\projects"
Write-Host "Path: $uploadsProjectsPath"

if (Test-Path $uploadsProjectsPath) {
    Write-Host "✅ Uploads/projects directory exists"
    Write-Host "Contents:"
    Get-ChildItem -Path $uploadsProjectsPath -Name
} else {
    Write-Host "❌ Uploads/projects directory does not exist"
}

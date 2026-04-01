$cmd = @"
ps aux | grep -E 'gunicorn|project_doc' | grep -v grep
echo '---'
systemctl list-units | grep -i project
echo '---'
cd /home/across/project_doc_manager && git log --oneline -2
"@

$pw = ConvertTo-SecureString 'Abcd@123$' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('across', $pw)
$session = New-PSSession -HostName topshow.club -Port 8849 -Credential $cred -AuthenticationMethod Password
$result = Invoke-Command -Session $session -ScriptBlock { param($c) iex $c } -Argument $cmd
Remove-PSSession $session
$result

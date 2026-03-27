@echo off
echo Running test...
python test_simple.py > test_output.txt 2>&1
echo Test completed. Output saved to test_output.txt
type test_output.txt
pause

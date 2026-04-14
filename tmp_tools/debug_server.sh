#!/bin/bash
# 服务器诊断脚本

cd ~/project-doc-manager

echo "=== Git 状态 ==="
git log --oneline -3
git status

echo ""
echo "=== 检查 lock-project 路由 ==="
grep -n "lock-project" app/routes/task_routes.py | head -5

echo ""
echo "=== 检查 task_bp 注册 ==="
grep -n "register_blueprint.*task" main.py

echo ""
echo "=== 检查项目索引文件 ==="
if [ -f projects/projects_index.json ]; then
    cat projects/projects_index.json | head -20
else
    echo "项目索引文件不存在"
fi

echo ""
echo "=== 检查导入的项目目录 ==="
ls -la projects/ | head -20

echo ""
echo "=== Python 缓存文件 ==="
find . -name "*.pyc" | wc -l
echo "个 .pyc 缓存文件"

echo ""
echo "=== 建议操作 ==="
echo "1. 如果 lock-project 路由不存在，请执行: git pull origin main"
echo "2. 清除 Python 缓存: find . -name '*.pyc' -delete && find . -name '__pycache__' -type d -exec rm -rf {} +"
echo "3. 重启服务: ./launcher.sh restart"

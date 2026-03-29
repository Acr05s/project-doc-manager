# 🚀 快速开始指南

## 项目文档管理中心

恭喜！您的项目文档管理中心已完整创建。这是一个**功能完整、即插即用的Python Web插件**。

## 📂 项目位置

```
d:\workspace\Doc\project_doc_manager\
```

## ⚡ 30秒快速启动

### 1️⃣ Windows用户
```bash
cd d:\workspace\Doc\project_doc_manager
run.bat
```

### 2️⃣ Linux/Mac用户
```bash
cd d:\workspace\Doc\project_doc_manager
chmod +x run.sh
./run.sh
```

### 3️⃣ 打开浏览器
访问 `http://localhost:5000`

## 📋 第一次使用步骤

### 步骤1️⃣ : 生成示例配置
```bash
python generate_sample_requirements.py
```
这会生成 `示例需求清单.xlsx` 文件。

### 步骤2️⃣ : 加载项目配置
1. 打开应用（http://localhost:5000）
2. 点击 **"加载项目配置"** 按钮
3. 选択 `示例需求清单.xlsx` 文件
4. 点击 **"加载项目"**

### 步骤3️⃣ : 上传文档
1. 在左侧选择一个项目周期
2. 在右侧选择一个文档
3. 点击 **"查看/管理文档"**
4. 上传一个PDF或图片文件
5. 填写元数据（日期、签字人等）
6. 点击 **"上传文档"**

### 步骤4️⃣ : 查看报告
1. 点击 **"生成报告"** 按钮
2. 查看各周期的完成进度
3. 点击 **"导出报告"** 下载HTML文件

## ✨ 核心特性

| 功能 | 说明 |
|------|------|
| 📅 竖向周期导航 | 左侧展示项目生命周期，可快速切换 |
| 📄 文档管理 | 每个周期可上传多个文档版本 |
| 🎯 拖拽上传 | 直接拖拽文件到上传区域或点击选择 |
| 🔍 自动识别 | 自动检测签字和盖章并计算置信度 |
| 📊 进度统计 | 实时统计各周期的文档完成率 |
| 📈 报告生成 | 生成详细的文档管理报告 |
| 💾 版本管理 | 支持文档版本覆盖和删除 |
| 📱 响应式设计 | 完美适配桌面、平板和手机 |

## 📦 项目文件清单

```
project_doc_manager/
│
├─ 核心文件（必需）
│  ├─ plugin.json                    # 插件配置
│  ├─ main.py                        # Flask后端应用
│  ├─ requirements.txt               # Python依赖列表
│
├─ 前端文件
│  ├─ templates/
│  │  └─ index.html                  # 主页面（HTML）
│  └─ static/
│     ├─ css/
│     │  └─ style.css                # 样式表（CSS）
│     └─ js/
│        ├─ app.js                   # 主应用逻辑（JS）
│        └─ upload.js                # 上传管理模块（JS）
│
├─ 启动脚本
│  ├─ run.bat                        # Windows启动脚本
│  └─ run.sh                         # Linux/Mac启动脚本
│
├─ 工具和示例
│  └─ generate_sample_requirements.py # 生成示例Excel
│
├─ 文档
│  ├─ README.md                      # 功能说明文档
│  ├─ DEPLOYMENT_GUIDE.md            # 部署和测试指南
│  ├─ PROJECT_SUMMARY.md             # 项目详细总结
│  └─ QUICK_START.md                 # 本文件
│
└─ 配置文件
   └─ .gitignore                     # Git忽略配置

共 16 个文件
```

## 🛠️ 系统要求

- ✅ **Python** 3.7+
- ✅ **pip** 包管理器
- ✅ **现代浏览器** (Chrome, Firefox, Safari, Edge)
- ✅ **50MB磁盘空间** (含依赖包)

## 🔧 常见配置

### 修改端口号
编辑 `main.py` 最后一行：
```python
app.run(debug=True, host='0.0.0.0', port=5001)  # 改为5001
```

### 修改上传文件夹大小限制
编辑 `plugin.json`：
```json
"max_file_size": 104857600  # 改为100MB
```

### 修改识别阈值
编辑 `main.py`：
```python
# 签字识别阈值（越小越容易识别）
has_signature = edge_ratio > 0.005

# 盖章识别阈值（越小越容易识别）
has_seal = color_ratio > 0.001
```

## 🎓 工作原理

### 1. Excel解析
- 读取A列（项目周期）
- 读取C列（文档名称）
- 读取D列（文档要求）

### 2. 文档管理
- 上传文档到 `uploads/周期名/文档名/` 目录
- 自动记录元数据（上传时间、签字人等）
- 支持多版本存储

### 3. 智能识别
- **签字识别**: 边缘检测 → 像素计数 → 阈值判定
- **盖章识别**: 颜色分析 → 有色像素计数 → 阈值判定

### 4. 完成率计算
```
完成率 = 已上传文档数 / 需求文档数 × 100%
```

## 📊 Excel文件格式说明

### 必须列
- **A列**: 项目周期
- **C列**: 文档名称
- **D列**: 文档要求

### 示例
```
A列        C列        D列
周期一     文档一     要求一
周期二     文档二     要求二
周期三     文档三     要求三
```

## 🐛 常见问题

### Q: 无法启动应用？
A: 
1. 确保Python已安装：`python --version`
2. 检查依赖：`pip install -r requirements.txt`
3. 查看错误日志获得详细信息

### Q: 上传文件在哪？
A: `uploads/` 文件夹，按周期和文档名分类

### Q: 能删除已上传的文档吗？
A: 可以，点击文档旁边的"删除"按钮

### Q: 签字识别不准确？
A:
1. 确保图片清晰
2. 调整识别阈值（修改main.py）
3. 手动标注（勾选"是否盖章"）

### Q: 报告导出为什么是HTML？
A: 可以用浏览器打开后，按Ctrl+P打印为PDF

## 📞 需要帮助？

查看详细文档：
- 📖 [README.md](README.md) - 功能详解
- 🚀 [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - 部署和故障排除
- 📊 [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - 技术细节

## 📦 打包为插件

当您准备好将此项目作为插件上传到DataProcessHub时：

```bash
# 1. 创建zip包（不包含uploads文件夹）
# Windows: 使用右键菜单 → 发送到 → 压缩文件夹
# Linux: zip -r project_doc_manager.zip . -x "uploads/*" "venv/*" ".git/*"

# 2. 在DataProcessHub中登录
# 3. 进入"插件中心" → "上传插件"
# 4. 选择plugin.json和打包的zip文件
# 5. 提交审核
```

## ✅ 检查清单

启动前确保：
- [x] Python已安装
- [x] 依赖已安装
- [x] 网络连接正常
- [x] 5000端口未被占用
- [x] 有足够的磁盘空间

## 🎉 开始使用

```bash
cd d:\workspace\Doc\project_doc_manager
run.bat          # Windows
# 或
./run.sh         # Linux/Mac
```

然后打开浏览器访问 **http://localhost:5000**

祝您使用愉快！🎊

---

**项目版本**: 1.0.0  
**更新时间**: 2024年3月  
**支持**: 如有问题，查看相关文档或检查应用日志

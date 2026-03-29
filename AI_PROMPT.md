# AI提示语 - 项目文档管理中心生成指南

## 角色设定

你是一个全栈开发专家，精通Python Flask后端开发和Vanilla JavaScript前端开发。请根据以下详细规格，生成一个完整的项目文档管理系统。

---

## 项目概述

**项目名称**: 项目文档管理中心  
**版本**: v2.1.0  
**架构**: 单体应用，前后端分离  
**数据存储**: JSON文件系统（无需数据库）

### 核心功能
1. 项目全生命周期文档管理（从立项到验收的11个阶段）
2. ZIP批量导入文档并智能匹配到对应文档类型
3. 自动签字检测（OpenCV边缘检测算法）
4. 自动盖章识别（颜色分析算法）
5. 文档完成度统计和报告生成
6. 项目打包导出功能

---

## 技术栈要求

### 后端 (Python)
```
Flask==2.3.2
flask-cors==4.0.0
pandas==2.0.3
openpyxl==3.1.2
opencv-python==4.8.0.74
Pillow==10.0.0
numpy==1.24.3
flasgger==0.9.7.1
python-docx==0.8.11
python-pptx==0.6.21
docx2pdf==0.1.8
PyPDF2==3.0.1
```

### 前端
- Vanilla JavaScript (ES6+)
- ES6 Modules模块化
- 原生Fetch API
- HTML5 + CSS3

---

## 目录结构要求

```
project_doc_manager/
├── main.py                          # Flask入口
├── requirements.txt                 # 依赖列表
├── app/
│   ├── __init__.py
│   ├── routes/
│   │   ├── main_routes.py           # 主页路由
│   │   ├── documents/
│   │   │   ├── __init__.py
│   │   │   ├── upload.py            # 文件上传
│   │   │   ├── list.py              # 文档列表
│   │   │   ├── preview.py           # 预览功能
│   │   │   ├── delete.py            # 删除文档
│   │   │   ├── recognize.py         # 智能识别
│   │   │   └── cleanup.py           # 清理重复
│   │   └── projects/
│   │       ├── __init__.py
│   │       ├── basic.py             # 项目CRUD
│   │       ├── export.py            # 导出导入
│   │       └── requirements.py      # 需求配置
│   └── utils/
│       ├── document_manager.py      # 主管理器（组合模式）
│       ├── image_analyzer.py        # 图像分析
│       ├── project_data_manager.py  # 数据管理
│       └── project_manager.py       # 项目管理
├── templates/
│   └── index.html                   # 主页面
└── static/js/modules/
    ├── index.js                     # 初始化
    ├── app-state.js                 # 全局状态
    ├── api.js                       # API封装
    ├── document.js                  # 文档操作
    ├── project.js                   # 项目管理
    ├── cycle.js                     # 周期管理
    ├── zip.js                       # ZIP处理
    └── ui.js                        # UI组件
```

---

## 核心代码规范

### 1. 后端主管理器（组合模式）

```python
# app/utils/document_manager.py
class DocumentManager:
    """项目文档管理器主类 - 组合模式"""
    
    def __init__(self, config=None):
        self.version = "2.1.0"
        self.documents_db = {}
        self.config = config or BaseConfig()
        self._init_modules()
    
    def _init_modules(self):
        """初始化所有子模块"""
        from .cache_manager import CacheManager
        from .operation_logger import OperationLogger
        from .folder_manager import FolderManager
        from .doc_naming import DocumentNamer
        from .image_analyzer import ImageAnalyzer
        from .document_uploader import DocumentUploader
        from .project_manager import ProjectManager
        from .project_data_manager import ProjectDataManager
        
        self.cache = CacheManager(self.config)
        self.logger = OperationLogger(self.config)
        self.folders = FolderManager(self.config)
        self.naming = DocumentNamer(self.config)
        self.analyzer = ImageAnalyzer(self.config)
        self.uploader = DocumentUploader(self.config, self.analyzer, self.logger)
        self.projects = ProjectManager(self.config)
        self.data_manager = ProjectDataManager(self.config)
    
    # 项目管理方法
    def get_projects_list(self):
        """获取项目列表"""
        return self.projects.list_projects()
    
    def create_project(self, name, description, cycles, required_docs):
        """创建新项目"""
        project_id = f"project_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        project_config = {
            "id": project_id,
            "name": name,
            "description": description,
            "cycles": cycles,
            "documents": {},
            "created_time": datetime.now().isoformat()
        }
        for cycle in cycles:
            project_config["documents"][cycle] = {
                "required_docs": required_docs.get(cycle, []),
                "uploaded_docs": []
            }
        return self.projects.save_project(project_id, project_config)
    
    def load_project(self, project_name):
        """加载项目配置"""
        return self.data_manager.load_full_config(project_name)
    
    # 文档管理方法
    def upload_document(self, file, metadata):
        """上传文档"""
        return self.uploader.upload(file, metadata)
    
    def detect_signature(self, image_path):
        """检测签字"""
        return self.analyzer.detect_signature(image_path)
    
    def detect_seal(self, image_path):
        """检测盖章"""
        return self.analyzer.detect_seal(image_path)
```

### 2. 图像分析模块（OpenCV）

```python
# app/utils/image_analyzer.py
import cv2
import numpy as np

class ImageAnalyzer:
    """图像分析器 - 签字和盖章检测"""
    
    def detect_signature(self, image_path):
        """
        检测签字 - 使用Canny边缘检测
        Returns: (has_signature: bool, confidence: float)
        """
        try:
            img = cv2.imread(image_path)
            if img is None:
                return False, 0.0
            
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # 筛选符合签字特征的轮廓（手写体特征：细长、不规则）
            valid_contours = []
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if 50 < area < 5000:  # 过滤噪声和过大区域
                    x, y, w, h = cv2.boundingRect(cnt)
                    aspect_ratio = float(w)/h if h > 0 else 0
                    if 0.1 < aspect_ratio < 10:  # 签字通常有特定宽高比
                        valid_contours.append(cnt)
            
            has_signature = len(valid_contours) > 5
            confidence = min(len(valid_contours) / 20, 1.0)
            return has_signature, round(confidence, 2)
        except Exception as e:
            return False, 0.0
    
    def detect_seal(self, image_path):
        """
        检测盖章 - 使用颜色范围检测
        Returns: (has_seal: bool, confidence: float)
        """
        try:
            img = cv2.imread(image_path)
            if img is None:
                return False, 0.0
            
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            
            # 红色印章范围
            lower_red1 = np.array([0, 100, 100])
            upper_red1 = np.array([10, 255, 255])
            lower_red2 = np.array([160, 100, 100])
            upper_red2 = np.array([180, 255, 255])
            
            mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
            mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
            red_mask = mask1 + mask2
            
            # 检测圆形
            circles = cv2.HoughCircles(red_mask, cv2.HOUGH_GRADIENT, 1, 20,
                                       param1=50, param2=30, minRadius=10, maxRadius=100)
            
            has_seal = circles is not None and len(circles) > 0
            confidence = 0.8 if has_seal else 0.0
            return has_seal, confidence
        except Exception as e:
            return False, 0.0
```

### 3. 数据管理模块

```python
# app/utils/project_data_manager.py
import json
import os
from pathlib import Path

class ProjectDataManager:
    """项目数据管理器 - JSON文件读写"""
    
    def __init__(self, config):
        self.config = config
        self.projects_dir = Path(config.projects_base_folder)
    
    def load_full_config(self, project_name):
        """加载完整项目配置"""
        project_dir = self.projects_dir / project_name
        config_file = project_dir / "project_config.json"
        
        if not config_file.exists():
            return None
        
        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # 加载文档索引
        doc_index = self.load_documents_index(project_name)
        config['documents_index'] = doc_index
        
        return config
    
    def save_full_config(self, project_name, config):
        """保存项目配置"""
        project_dir = self.projects_dir / project_name
        project_dir.mkdir(parents=True, exist_ok=True)
        
        config_file = project_dir / "project_config.json"
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        
        return True
    
    def load_documents_index(self, project_name):
        """加载文档索引"""
        index_file = self.projects_dir / project_name / "data" / "documents_index.json"
        if index_file.exists():
            with open(index_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {"documents": {}}
    
    def add_document_to_index(self, project_name, doc_meta):
        """添加文档到索引"""
        index = self.load_documents_index(project_name)
        doc_id = doc_meta.get('doc_id')
        index['documents'][doc_id] = doc_meta
        
        index_file = self.projects_dir / project_name / "data" / "documents_index.json"
        index_file.parent.mkdir(parents=True, exist_ok=True)
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(index, f, ensure_ascii=False, indent=2)
        
        return True
```

### 4. 前端全局状态

```javascript
// static/js/modules/app-state.js

// 应用全局状态
export const appState = {
    projectConfig: null,
    currentProjectId: null,
    currentCycle: null,
    currentDocument: null,
    documents: {},
    zipSelectedFiles: [],
    filterOptions: {
        hideArchived: false,
        hideCompleted: false,
        keyword: ''
    }
};

// DOM元素引用
export const elements = {
    projectTitle: document.getElementById('projectTitle'),
    cycleNavList: document.getElementById('cycleNavList'),
    contentArea: document.getElementById('contentArea'),
    documentModal: document.getElementById('documentModal')
};

// 初始化会话
export function initSession() {
    appState.sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

### 5. 前端API封装

```javascript
// static/js/modules/api.js
import { appState } from './app-state.js';

const API_BASE = '/api';

// 项目API
export async function loadProjectsList() {
    const response = await fetch(`${API_BASE}/projects/list`);
    const result = await response.json();
    return result.status === 'success' ? result.projects : [];
}

export async function createProject(projectData) {
    const response = await fetch(`${API_BASE}/projects/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
    });
    return await response.json();
}

export async function loadProject(projectId) {
    const response = await fetch(`${API_BASE}/projects/${projectId}`);
    return await response.json();
}

// 文档API
export async function getCycleDocuments(cycle) {
    const projectId = appState.currentProjectId;
    const response = await fetch(
        `${API_BASE}/documents/list?cycle=${encodeURIComponent(cycle)}&project_id=${projectId}`
    );
    const result = await response.json();
    return result.data || [];
}

export async function uploadDocument(formData) {
    const response = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        body: formData
    });
    return await response.json();
}

export async function deleteDocument(docId) {
    const response = await fetch(`${API_BASE}/documents/${docId}`, {
        method: 'DELETE'
    });
    return await response.json();
}
```

### 6. 前端文档渲染

```javascript
// static/js/modules/document.js
import { appState, elements } from './app-state.js';
import { getCycleDocuments, uploadDocument } from './api.js';
import { showNotification, showLoading } from './ui.js';

// 渲染周期文档列表
export async function renderCycleDocuments(cycle, filterOptions = {}) {
    showLoading(true);
    
    try {
        const uploadedDocs = await getCycleDocuments(cycle);
        const docsInfo = appState.projectConfig.documents[cycle];
        const requiredDocs = docsInfo?.required_docs || [];
        
        // 按文档类型分组
        const docsByName = {};
        for (const doc of uploadedDocs) {
            const key = doc.doc_name;
            if (!docsByName[key]) docsByName[key] = [];
            docsByName[key].push(doc);
        }
        
        // 生成HTML
        let html = generateDocumentsTable(requiredDocs, docsByName, cycle, filterOptions);
        elements.contentArea.innerHTML = html;
        
    } catch (error) {
        showNotification('加载文档失败', 'error');
    } finally {
        showLoading(false);
    }
}

// 生成文档表格
function generateDocumentsTable(requiredDocs, docsByName, cycle, filterOptions) {
    // 过滤逻辑...
    
    return requiredDocs.map((doc, index) => {
        const docsList = docsByName[doc.name] || [];
        const docIndex = doc._originalIndex || (index + 1);
        
        return `
            <tr>
                <td>${docIndex}</td>
                <td>${doc.name}</td>
                <td>${generateFileList(docsList)}</td>
                <td>
                    <button onclick="openUploadModal('${cycle}', '${doc.name}')">
                        上传/选择
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}
```

### 7. 路由蓝图注册

```python
# app/routes/documents/__init__.py
from flask import Blueprint

document_bp = Blueprint('documents', __name__, url_prefix='/api/documents')

# 导入各模块路由
from . import upload
from . import list
from . import preview
from . import delete
from . import recognize
from . import cleanup

# 注册路由
# 上传相关
document_bp.route('/upload', methods=['POST'])(upload.upload_document)
document_bp.route('/upload/chunk', methods=['POST'])(upload.upload_chunk)
document_bp.route('/upload/merge', methods=['POST'])(upload.merge_chunks)

# 列表相关
document_bp.route('/list', methods=['GET'])(list.list_documents)
document_bp.route('/<doc_id>', methods=['GET'])(list.get_document)
document_bp.route('/<doc_id>', methods=['DELETE'])(delete.delete_document)

# 预览相关
document_bp.route('/preview/<doc_id>', methods=['GET'])(preview.preview_document)
document_bp.route('/view/<doc_id>', methods=['GET'])(preview.view_document)
document_bp.route('/download/<doc_id>', methods=['GET'])(preview.download_document)

# 识别相关
document_bp.route('/smart-recognize', methods=['POST'])(recognize.smart_recognize)

# 清理相关
document_bp.route('/cleanup-duplicates', methods=['POST'])(cleanup.cleanup_duplicates)
```

---

## 数据存储规范

### 项目索引 (projects/projects_index.json)
```json
{
  "updated_time": "2026-03-29T13:36:20.999911",
  "project_20260327133326": {
    "id": "project_20260327133326",
    "name": "智慧党建",
    "description": "",
    "created_time": "2026-03-27T13:33:26.990228",
    "updated_time": "2026-03-29T13:21:20.904930",
    "locked": true
  }
}
```

### 项目配置 (projects/{project}/project_config.json)
```json
{
  "id": "project_20260327133326",
  "name": "智慧党建",
  "cycles": ["项目立项", "项目组织及管理", "项目准备", "项目开工", "项目启动", "方案设计", "系统开发测试", "上线试用", "验收", "运维", "其他"],
  "documents": {
    "项目立项": {
      "required_docs": [
        {
          "name": "项目立项申请书",
          "requirement": "甲方签字 乙方签字",
          "attributes": ["甲方签字", "乙方签字"]
        }
      ],
      "uploaded_docs": []
    }
  },
  "documents_archived": {}
}
```

### 文档索引 (projects/{project}/data/documents_index.json)
```json
{
  "documents": {
    "项目立项_项目立项申请书_20260327_133733_0": {
      "doc_id": "项目立项_项目立项申请书_20260327_133733_0",
      "doc_name": "项目立项申请书",
      "filename": "xxx.docx",
      "original_filename": "原始文件名.docx",
      "file_path": "projects/xxx/uploads/xxx.docx",
      "project_name": "智慧党建",
      "cycle": "项目立项",
      "upload_time": "2026-03-27T13:37:33.230431",
      "file_size": 82801,
      "has_signature": true,
      "has_seal": false
    }
  }
}
```

---

## API端点规范

### 项目管理
- `GET /api/projects/list` - 项目列表
- `POST /api/projects/create` - 创建项目
- `GET /api/projects/<id>` - 获取项目详情
- `PUT /api/projects/<id>` - 更新项目
- `DELETE /api/projects/<id>` - 删除项目
- `POST /api/projects/<id>/package` - 打包项目

### 文档管理
- `POST /api/documents/upload` - 上传文档
- `POST /api/documents/upload/chunk` - 分片上传
- `POST /api/documents/upload/merge` - 合并分片
- `GET /api/documents/list?cycle=xxx` - 文档列表
- `GET /api/documents/<id>` - 获取文档
- `DELETE /api/documents/<id>` - 删除文档
- `GET /api/documents/preview/<id>` - 预览文档
- `GET /api/documents/view/<id>` - 查看文档（PDF转换）
- `POST /api/documents/smart-recognize` - 智能识别签字/盖章

---

## 生成要求

1. **代码完整性**: 所有文件必须是完整可运行的代码，不是伪代码
2. **模块化**: 严格遵循模块化设计，避免循环依赖
3. **错误处理**: 每个函数都要有try-except错误处理
4. **日志记录**: 关键操作需要打印日志
5. **中文注释**: 所有注释使用中文
6. **数据分离**: 项目配置和文档索引必须分离存储
7. **筛选功能**: 文档列表支持关键字筛选、隐藏已归档、隐藏已完成
8. **序号保持**: 筛选后序号要保持原始序号不变

---

## 输出格式

请按以下格式生成代码：

```
=== FILE: 文件路径 ===
[完整的文件代码]

=== FILE: 下一个文件 ===
[完整的文件代码]
```

先生成后端Python代码，再生成前端JavaScript代码，最后生成HTML模板。

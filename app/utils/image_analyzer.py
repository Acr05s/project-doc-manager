"""图像分析模块

提供文档图像分析功能，包括签字检测和盖章检测。
"""

import logging
from pathlib import Path
from typing import Tuple

# 尝试导入cv2，如果失败则使用降级方案
cv2_available = False
try:
    import cv2
    import numpy as np
    cv2_available = True
except ImportError:
    logging.warning('OpenCV 未安装，图像分析功能将不可用')

from .base import DocumentConfig, setup_logging

logger = setup_logging(__name__)


class ImageAnalyzer:
    """图像分析器"""
    
    def __init__(self, config: DocumentConfig):
        """初始化图像分析器
        
        Args:
            config: 文档配置实例
        """
        self.config = config
    
    def detect_signature(self, image_path: str) -> Tuple[bool, float]:
        """检测文档是否有签字（增强版）
        
        使用多种技术组合：
        - 边缘检测（Canny）
        - 形态学操作
        - 自适应阈值
        - 连通区域分析
        - 笔画宽度分析
        
        Args:
            image_path: 图像文件路径
            
        Returns:
            tuple: (是否有签字, 置信度)
        """
        if not cv2_available:
            logger.warning('OpenCV 未安装，无法检测签字')
            return False, 0.0
            
        try:
            # 读取图像并限制大小以减少内存使用
            image = cv2.imread(image_path)
            if image is None:
                logger.warning(f"无法读取图像: {image_path}")
                return False, 0.0
            
            # 调整图像大小，限制最大维度为1000像素
            max_dim = 1000
            h, w = image.shape[:2]
            if max(h, w) > max_dim:
                scale = max_dim / max(h, w)
                new_w = int(w * scale)
                new_h = int(h * scale)
                image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
            
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # 1. 基础边缘检测
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            edges = cv2.Canny(enhanced, 50, 150)
            total_pixels = edges.shape[0] * edges.shape[1]
            edge_pixels = cv2.countNonZero(edges)
            edge_ratio = edge_pixels / total_pixels
            
            # 2. 形态学操作增强签字区域
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            dilated = cv2.dilate(edges, kernel, iterations=1)
            morph_ratio = cv2.countNonZero(dilated) / total_pixels
            
            # 3. 自适应阈值检测
            adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                           cv2.THRESH_BINARY_INV, 11, 2)
            adaptive_ratio = cv2.countNonZero(adaptive) / total_pixels
            
            # 4. 连通区域分析
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(adaptive, connectivity=8)
            if num_labels > 1:
                valid_components = [s for s in stats[1:] if s[4] > 50]
                component_score = len(valid_components) / 100.0
            else:
                component_score = 0.0
            
            # 5. 笔画宽度分析
            dist_transform = cv2.distanceTransform(255 - adaptive, cv2.DIST_L2, 5)
            stroke_width = np.mean(dist_transform[dist_transform > 0])
            stroke_score = min(stroke_width / 10.0, 1.0)
            
            # 6. 区域检测（签字通常在文档底部）
            h, w = gray.shape
            bottom_region = gray[int(h * 0.7):, :]
            bottom_edges = cv2.Canny(bottom_region, 50, 150)
            bottom_ratio = cv2.countNonZero(bottom_edges) / (bottom_region.shape[0] * bottom_region.shape[1])
            
            # 综合评分
            scores = {
                'edge': min(edge_ratio * 100, 100.0),
                'morph': min(morph_ratio * 100, 100.0),
                'adaptive': min(adaptive_ratio * 100, 100.0),
                'component': min(component_score * 100, 100.0),
                'stroke': stroke_score * 100,
                'bottom': min(bottom_ratio * 100, 100.0)
            }
            
            # 权重配置
            weights = {
                'edge': 0.25,
                'morph': 0.15,
                'adaptive': 0.20,
                'component': 0.15,
                'stroke': 0.10,
                'bottom': 0.15
            }
            
            final_score = sum(scores[k] * weights[k] for k in scores)
            
            # 动态阈值
            base_threshold = 1.5
            if adaptive_ratio > 0.10:
                base_threshold = 2.0
            
            has_signature = final_score > base_threshold
            confidence = min(final_score, 100.0)
            
            logger.info(f"签字检测: {image_path}, 有签字: {has_signature}, 置信度: {confidence:.2f}%")
            return has_signature, confidence
            
        except Exception as e:
            logger.error(f"签字检测失败: {e}")
            return False, 0.0
    
    def detect_seal(self, image_path: str) -> Tuple[bool, float]:
        """检测文档是否有盖章（增强版）
        
        使用多种技术组合：
        - 多范围颜色检测
        - 圆形检测（Hough变换）
        - 纹理分析
        - 区域密度分析
        
        Args:
            image_path: 图像文件路径
            
        Returns:
            tuple: (是否有盖章, 置信度)
        """
        if not cv2_available:
            logger.warning('OpenCV 未安装，无法检测盖章')
            return False, 0.0
            
        try:
            # 读取图像并限制大小以减少内存使用
            image = cv2.imread(image_path)
            if image is None:
                logger.warning(f"无法读取图像: {image_path}")
                return False, 0.0
            
            # 调整图像大小，限制最大维度为1000像素
            max_dim = 1000
            h, w = image.shape[:2]
            if max(h, w) > max_dim:
                scale = max_dim / max(h, w)
                new_w = int(w * scale)
                new_h = int(h * scale)
                image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
                h, w = image.shape[:2]
            
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            total_pixels = h * w
            
            # 1. 多范围颜色检测
            # 红色范围1
            lower_red1 = np.array([0, 70, 50])
            upper_red1 = np.array([10, 255, 255])
            mask_red1 = cv2.inRange(hsv, lower_red1, upper_red1)
            
            # 红色范围2
            lower_red2 = np.array([170, 70, 50])
            upper_red2 = np.array([180, 255, 255])
            mask_red2 = cv2.inRange(hsv, lower_red2, upper_red2)
            
            # 蓝色范围
            lower_blue = np.array([100, 70, 50])
            upper_blue = np.array([130, 255, 255])
            mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)
            
            # 紫色范围
            lower_purple = np.array([130, 70, 50])
            upper_purple = np.array([160, 255, 255])
            mask_purple = cv2.inRange(hsv, lower_purple, upper_purple)
            
            # 合并所有颜色掩码
            mask = cv2.bitwise_or(mask_red1, cv2.bitwise_or(mask_red2, mask_blue))
            mask = cv2.bitwise_or(mask, mask_purple)
            
            # 计算颜色得分
            colored_pixels = cv2.countNonZero(mask)
            color_ratio = colored_pixels / total_pixels
            color_score = min(color_ratio * 100, 100.0)
            
            # 2. 圆形检测（印章通常是圆形的）
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            circles = cv2.HoughCircles(
                gray, cv2.HOUGH_GRADIENT, dp=1.2, minDist=50,
                param1=50, param2=30, minRadius=20, maxRadius=min(h, w) // 3
            )
            
            circle_score = 0.0
            if circles is not None:
                circles = np.round(circles[0, :]).astype("int")
                valid_circles = 0
                for (x, y, r) in circles:
                    circle_mask = np.zeros((h, w), dtype=np.uint8)
                    cv2.circle(circle_mask, (x, y), r, 255, -1)
                    circle_color_pixels = cv2.countNonZero(cv2.bitwise_and(mask, circle_mask))
                    circle_area = np.pi * r * r
                    if circle_color_pixels / circle_area > 0.3:
                        valid_circles += 1
                
                circle_score = min((valid_circles / max(len(circles), 1)) * 100, 100.0)
            
            # 3. 纹理分析
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            texture_variance = np.var(laplacian)
            texture_score = min(texture_variance / 1000.0 * 100, 100.0)
            
            # 4. 区域密度分析
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
            closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            
            contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            density_score = 0.0
            if contours:
                max_contour = max(contours, key=cv2.contourArea)
                contour_area = cv2.contourArea(max_contour)
                hull = cv2.convexHull(max_contour)
                hull_area = cv2.contourArea(hull)
                
                if hull_area > 0:
                    fill_ratio = contour_area / hull_area
                    if 0.6 <= fill_ratio <= 0.9:
                        density_score = 90.0
                    else:
                        density_score = min(fill_ratio * 100, 100.0)
            
            # 5. 位置分析
            M = cv2.moments(mask)
            position_score = 0.0
            if M['m00'] > 0:
                cx = int(M['m10'] / M['m00'])
                cy = int(M['m01'] / M['m00'])
                
                if cx > w * 0.7 and cy > h * 0.7:
                    position_score = 80.0
                elif cx < w * 0.3 and cy > h * 0.7:
                    position_score = 70.0
                elif cy > h * 0.6:
                    position_score = 50.0
            
            # 综合评分
            scores = {
                'color': color_score,
                'circle': circle_score,
                'texture': texture_score,
                'density': density_score,
                'position': position_score
            }
            
            weights = {
                'color': 0.35,
                'circle': 0.25,
                'texture': 0.15,
                'density': 0.15,
                'position': 0.10
            }
            
            final_score = sum(scores[k] * weights[k] for k in scores)
            
            # 动态阈值
            base_threshold = 2.0
            if color_ratio > 0.005:
                base_threshold = 1.5
            
            has_seal = final_score > base_threshold
            confidence = min(final_score, 100.0)
            
            logger.info(f"盖章检测: {image_path}, 有盖章: {has_seal}, 置信度: {confidence:.2f}%")
            return has_seal, confidence
            
        except Exception as e:
            logger.error(f"盖章检测失败: {e}")
            return False, 0.0
    
    def analyze_document(self, image_path: str) -> dict:
        """综合分析文档图像
        
        Args:
            image_path: 图像文件路径
            
        Returns:
            dict: 分析结果
        """
        if not cv2_available:
            logger.warning('OpenCV 未安装，无法分析文档')
            return {
                'has_signature': False,
                'signature_confidence': 0.0,
                'has_seal': False,
                'seal_confidence': 0.0,
                'analysis_complete': False
            }
            
        has_sig, sig_conf = self.detect_signature(image_path)
        has_seal, seal_conf = self.detect_seal(image_path)
        
        return {
            'has_signature': has_sig,
            'signature_confidence': sig_conf,
            'has_seal': has_seal,
            'seal_confidence': seal_conf,
            'analysis_complete': True
        }
    
    def batch_analyze(self, image_paths: list) -> list:
        """批量分析图像
        
        Args:
            image_paths: 图像路径列表
            
        Returns:
            list: 分析结果列表
        """
        if not cv2_available:
            logger.warning('OpenCV 未安装，无法批量分析图像')
            return []
            
        import gc
        results = []
        batch_size = 5  # 分批处理，每批5个图像
        
        for i in range(0, len(image_paths), batch_size):
            batch = image_paths[i:i+batch_size]
            for path in batch:
                result = self.analyze_document(path)
                result['path'] = path
                results.append(result)
            
            # 每批处理后释放内存
            gc.collect()
        
        return results

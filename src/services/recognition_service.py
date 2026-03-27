"""识别服务"""
import cv2
import numpy as np
from typing import Tuple, List, Dict, Any
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class RecognitionService:
    """识别服务类"""
    
    @staticmethod
    def detect_signature(image_path: str) -> Tuple[bool, float]:
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
        try:
            image = cv2.imread(image_path)
            if image is None:
                logger.warning(f"无法读取图像: {image_path}")
                return False, 0.0
            
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
                # 过滤掉过小的区域
                valid_components = [s for s in stats[1:] if s[4] > 50]  # 面积大于50像素
                component_score = len(valid_components) / 100.0
            else:
                component_score = 0.0
            
            # 5. 笔画宽度分析（简化版）
            # 使用距离变换估计笔画宽度
            dist_transform = cv2.distanceTransform(255 - adaptive, cv2.DIST_L2, 5)
            stroke_width = np.mean(dist_transform[dist_transform > 0])
            stroke_score = min(stroke_width / 10.0, 1.0)  # 归一化
            
            # 6. 区域检测（签字通常在文档底部）
            h, w = gray.shape
            bottom_region = gray[int(h * 0.7):, :]
            bottom_edges = cv2.Canny(bottom_region, 50, 150)
            bottom_ratio = cv2.countNonZero(bottom_edges) / (bottom_region.shape[0] * bottom_region.shape[1])
            
            # 综合评分（加权平均）
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
            
            # 动态阈值：根据文档内容密度调整
            base_threshold = 1.5
            if adaptive_ratio > 0.1:  # 文档内容较多
                base_threshold = 2.0
            
            has_signature = final_score > base_threshold
            confidence = min(final_score, 100.0)
            
            logger.info(f"签字检测增强版: {image_path}, 有签字: {has_signature}, 置信度: {confidence:.2f}%, 详细评分: {scores}")
            return has_signature, confidence
            
        except Exception as e:
            logger.error(f"签字检测失败: {e}")
            return False, 0.0
    
    @staticmethod
    def detect_seal(image_path: str) -> Tuple[bool, float]:
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
        try:
            image = cv2.imread(image_path)
            if image is None:
                logger.warning(f"无法读取图像: {image_path}")
                return False, 0.0
            
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            h, w = image.shape[:2]
            total_pixels = h * w
            
            # 1. 多范围颜色检测（更精确的颜色范围）
            # 红色范围1
            lower_red1 = np.array([0, 70, 50])
            upper_red1 = np.array([10, 255, 255])
            mask_red1 = cv2.inRange(hsv, lower_red1, upper_red1)
            
            # 红色范围2
            lower_red2 = np.array([170, 70, 50])
            upper_red2 = np.array([180, 255, 255])
            mask_red2 = cv2.inRange(hsv, lower_red2, upper_red2)
            
            # 红色范围3（深红）
            lower_red3 = np.array([175, 70, 50])
            upper_red3 = np.array([180, 255, 255])
            
            mask_red = cv2.bitwise_or(mask_red1, cv2.bitwise_or(mask_red2, mask_red3))
            
            # 蓝色范围
            lower_blue = np.array([100, 70, 50])
            upper_blue = np.array([130, 255, 255])
            mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)
            
            # 紫色范围（有些印章是紫色的）
            lower_purple = np.array([130, 70, 50])
            upper_purple = np.array([160, 255, 255])
            mask_purple = cv2.inRange(hsv, lower_purple, upper_purple)
            
            # 合并所有颜色掩码
            mask = cv2.bitwise_or(mask_red, cv2.bitwise_or(mask_blue, mask_purple))
            
            # 计算颜色得分
            colored_pixels = cv2.countNonZero(mask)
            color_ratio = colored_pixels / total_pixels
            color_score = min(color_ratio * 100, 100.0)
            
            # 2. 圆形检测（印章通常是圆形的）
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            circles = cv2.HoughCircles(
                gray, cv2.HOUGH_GRADIENT, dp=1.2, minDist=50,
                param1=50, param2=30, minRadius=20, maxRadius=min(h, w)//3
            )
            
            circle_score = 0.0
            if circles is not None:
                circles = np.round(circles[0, :]).astype("int")
                # 检查检测到的圆形是否在颜色区域内
                valid_circles = 0
                for (x, y, r) in circles:
                    # 创建圆形掩码
                    circle_mask = np.zeros((h, w), dtype=np.uint8)
                    cv2.circle(circle_mask, (x, y), r, 255, -1)
                    # 计算圆形内颜色像素比例
                    circle_color_pixels = cv2.countNonZero(cv2.bitwise_and(mask, circle_mask))
                    circle_area = np.pi * r * r
                    if circle_color_pixels / circle_area > 0.3:  # 至少30%是目标颜色
                        valid_circles += 1
                
                circle_score = min((valid_circles / max(len(circles), 1)) * 100, 100.0)
            
            # 3. 纹理分析（印章有特定的纹理特征）
            # 使用Laplacian算子检测纹理
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            texture_variance = np.var(laplacian)
            texture_score = min(texture_variance / 1000.0 * 100, 100.0)
            
            # 4. 区域密度分析（印章区域颜色密度高）
            # 使用形态学闭运算连接相近的像素
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
            closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            
            # 查找轮廓
            contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            density_score = 0.0
            if contours:
                # 计算最大轮廓的填充率
                max_contour = max(contours, key=cv2.contourArea)
                contour_area = cv2.contourArea(max_contour)
                hull = cv2.convexHull(max_contour)
                hull_area = cv2.contourArea(hull)
                
                if hull_area > 0:
                    fill_ratio = contour_area / hull_area
                    # 印章的填充率通常在0.6-0.9之间
                    if 0.6 <= fill_ratio <= 0.9:
                        density_score = 90.0
                    else:
                        density_score = min(fill_ratio * 100, 100.0)
            
            # 5. 位置分析（印章通常在特定位置）
            # 检测颜色区域的质心位置
            M = cv2.moments(mask)
            if M['m00'] > 0:
                cx = int(M['m10'] / M['m00'])
                cy = int(M['m01'] / M['m00'])
                
                # 检查是否在常见盖章位置（右下角、左下角等）
                position_score = 0.0
                if cx > w * 0.7 and cy > h * 0.7:  # 右下角
                    position_score = 80.0
                elif cx < w * 0.3 and cy > h * 0.7:  # 左下角
                    position_score = 70.0
                elif cy > h * 0.6:  # 下半部分
                    position_score = 50.0
            else:
                position_score = 0.0
            
            # 综合评分
            scores = {
                'color': color_score,
                'circle': circle_score,
                'texture': texture_score,
                'density': density_score,
                'position': position_score
            }
            
            # 权重配置
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
            if color_ratio > 0.005:  # 颜色区域较大
                base_threshold = 1.5
            
            has_seal = final_score > base_threshold
            confidence = min(final_score, 100.0)
            
            logger.info(f"盖章检测增强版: {image_path}, 有盖章: {has_seal}, 置信度: {confidence:.2f}%, 详细评分: {scores}")
            return has_seal, confidence
            
        except Exception as e:
            logger.error(f"盖章检测失败: {e}")
            return False, 0.0

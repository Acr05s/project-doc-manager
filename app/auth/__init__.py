"""认证模块"""

from flask import Blueprint, render_template, redirect, url_for, request, jsonify
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from app.models.user import user_manager
import json

# 创建认证蓝图
auth_bp = Blueprint('auth', __name__)

# 初始化登录管理器
login_manager = LoginManager()


@login_manager.user_loader
def load_user(user_id):
    """加载用户"""
    return user_manager.get_user_by_id(int(user_id))


def get_real_ip():
    """获取真实IP地址"""
    # 尝试从X-Forwarded-For获取
    ip = request.headers.get('X-Forwarded-For')
    if ip:
        # 取第一个IP地址
        ip = ip.split(',')[0].strip()
    else:
        # 尝试从X-Real-IP获取
        ip = request.headers.get('X-Real-IP')
    if not ip:
        # 使用remote_addr
        ip = request.remote_addr
    return ip


def check_ip_blacklist():
    """检查IP是否在黑名单中"""
    ip = get_real_ip()
    return user_manager.is_ip_blocked(ip)


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """登录"""
    # 检查IP是否被拉黑
    if check_ip_blacklist():
        return jsonify({'status': 'error', 'message': 'IP地址已被限制访问'})
    
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        # 获取真实IP
        ip = get_real_ip()
        
        # 检查用户
        user = user_manager.get_user_by_username(username)
        if user and check_password_hash(user.password_hash, password):
            # 登录成功
            login_user(user)
            # 记录登录成功日志
            user_manager.add_operation_log(user.id, user.username, 'login', ip_address=ip)
            # 记录登录成功
            user_manager.add_login_attempt(username, ip, True)
            return jsonify({'status': 'success', 'message': '登录成功', 'user': {'username': user.username, 'role': user.role}})
        else:
            # 登录失败
            user_manager.add_login_attempt(username, ip, False)
            # 检查失败次数，超过5次自动拉黑
            failed_attempts = user_manager.get_failed_login_attempts(ip)
            if failed_attempts >= 5:
                user_manager.add_ip_to_blacklist(ip, f'连续登录失败{failed_attempts}次', None)
                return jsonify({'status': 'error', 'message': '登录失败次数过多，IP已被限制'})
            return jsonify({'status': 'error', 'message': '用户名或密码错误'})
    
    return render_template('login.html')


@auth_bp.route('/logout')
@login_required
def logout():
    """注销"""
    # 记录注销日志
    ip = get_real_ip()
    user_manager.add_operation_log(current_user.id, current_user.username, 'logout', ip_address=ip)
    # 注销
    logout_user()
    return redirect(url_for('auth.login'))


@auth_bp.route('/register', methods=['POST'])
def register():
    """注册（仅系统管理员可用）"""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'contractor')
    
    # 检查权限
    if not current_user.is_authenticated or current_user.role != 'admin':
        return jsonify({'status': 'error', 'message': '权限不足'})
    
    # 生成密码哈希
    password_hash = generate_password_hash(password)
    # 添加用户
    user_id = user_manager.add_user(username, password_hash, role)
    if user_id:
        # 记录操作日志
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'register', str(user_id), username, f'角色: {role}', ip)
        return jsonify({'status': 'success', 'message': '用户注册成功'})
    else:
        return jsonify({'status': 'error', 'message': '用户名已存在'})


@auth_bp.route('/users')
@login_required
def list_users():
    """列出所有用户（仅系统管理员可用）"""
    if current_user.role != 'admin':
        return jsonify({'status': 'error', 'message': '权限不足'})
    
    # 这里简化处理，实际应该从数据库获取所有用户
    return jsonify({'status': 'success', 'users': []})


@auth_bp.route('/blacklist', methods=['GET', 'POST'])
@login_required
def manage_blacklist():
    """管理IP黑名单（仅系统管理员可用）"""
    if current_user.role != 'admin':
        return jsonify({'status': 'error', 'message': '权限不足'})
    
    if request.method == 'POST':
        data = request.get_json()
        action = data.get('action')
        ip_address = data.get('ip_address')
        reason = data.get('reason', '')
        
        if action == 'add':
            # 添加到黑名单
            success = user_manager.add_ip_to_blacklist(ip_address, reason, current_user.id)
            if success:
                # 记录操作日志
                ip = get_real_ip()
                user_manager.add_operation_log(current_user.id, current_user.username, 'add_ip_blacklist', ip_address, None, reason, ip)
                return jsonify({'status': 'success', 'message': 'IP已添加到黑名单'})
            else:
                return jsonify({'status': 'error', 'message': '添加失败'})
        elif action == 'remove':
            # 从黑名单移除
            success = user_manager.remove_ip_from_blacklist(ip_address)
            if success:
                # 记录操作日志
                ip = get_real_ip()
                user_manager.add_operation_log(current_user.id, current_user.username, 'remove_ip_blacklist', ip_address, None, None, ip)
                return jsonify({'status': 'success', 'message': 'IP已从黑名单移除'})
            else:
                return jsonify({'status': 'error', 'message': '移除失败'})
    
    # GET请求，返回黑名单列表
    # 这里简化处理，实际应该从数据库获取
    return jsonify({'status': 'success', 'blacklist': []})


def init_auth(app):
    """初始化认证模块"""
    # 配置登录管理器
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = '请先登录'
    
    # 注册蓝图
    app.register_blueprint(auth_bp)
    
    # 添加请求钩子，检查IP黑名单
    @app.before_request
    def before_request():
        # 排除登录路由
        if request.endpoint not in ['auth.login', 'static']:
            if check_ip_blacklist():
                return jsonify({'status': 'error', 'message': 'IP地址已被限制访问'}), 403

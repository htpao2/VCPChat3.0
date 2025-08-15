import json
import os
from typing import Dict, Any, Optional, List

# 用户偏好文件路径
PREFERENCES_FILE = 'config/user_preferences.json'

def load_user_preferences() -> List[Dict[str, Any]]:
    """
    加载用户偏好设置
    
    Returns:
        List[Dict[str, Any]]: 用户偏好列表，每个元素对应一个模型的偏好设置，如果文件不存在或读取失败则返回空列表
    """
    try:
        if os.path.exists(PREFERENCES_FILE):
            with open(PREFERENCES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # 兼容旧格式：如果是字典格式，转换为列表格式
                if isinstance(data, dict):
                    if 'model_path' in data and 'position' in data and 'scale' in data:
                        return [data]  # 将旧格式转换为列表
                    else:
                        return []
                elif isinstance(data, list):
                    return data
                else:
                    return []
    except Exception as e:
        print(f"加载用户偏好失败: {e}")
    return []

def save_user_preferences(preferences: List[Dict[str, Any]]) -> bool:
    """
    保存用户偏好设置
    
    Args:
        preferences (List[Dict[str, Any]]): 要保存的偏好设置列表
        
    Returns:
        bool: 保存成功返回True，失败返回False
    """
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(PREFERENCES_FILE), exist_ok=True)
        with open(PREFERENCES_FILE, 'w', encoding='utf-8') as f:
            json.dump(preferences, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存用户偏好失败: {e}")
        return False

def update_model_preferences(model_path: str, position: Dict[str, float], scale: Dict[str, float]) -> bool:
    """
    更新指定模型的偏好设置
    
    Args:
        model_path (str): 模型路径
        position (Dict[str, float]): 位置信息 {'x': float, 'y': float}
        scale (Dict[str, float]): 缩放信息 {'x': float, 'y': float}
        
    Returns:
        bool: 更新成功返回True，失败返回False
    """
    try:
        # 加载现有偏好
        current_preferences = load_user_preferences()
        
        # 查找是否已存在该模型的偏好
        model_index = -1
        for i, pref in enumerate(current_preferences):
            if pref.get('model_path') == model_path:
                model_index = i
                break
        
        # 创建新的模型偏好
        new_model_pref = {
            'model_path': model_path,
            'position': position,
            'scale': scale
        }
        
        if model_index >= 0:
            # 更新现有模型的偏好
            current_preferences[model_index] = new_model_pref
        else:
            # 添加新模型的偏好到列表开头（作为首选）
            current_preferences.insert(0, new_model_pref)
        
        # 保存更新后的偏好
        return save_user_preferences(current_preferences)
    except Exception as e:
        print(f"更新模型偏好失败: {e}")
        return False

def get_model_preferences(model_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    获取指定模型的偏好设置，如果不指定则返回首选模型（列表第一个）的偏好
    
    Args:
        model_path (str, optional): 模型路径，如果不指定则返回首选模型
        
    Returns:
        Optional[Dict[str, Any]]: 包含model_path, position, scale的字典，如果没有则返回None
    """
    preferences = load_user_preferences()
    
    if not preferences:
        return None
    
    if model_path:
        # 查找指定模型的偏好
        for pref in preferences:
            if pref.get('model_path') == model_path:
                return pref
        return None
    else:
        # 返回首选模型（列表第一个）的偏好
        return preferences[0] if preferences else None

def get_preferred_model_path() -> Optional[str]:
    """
    获取首选模型的路径
    
    Returns:
        Optional[str]: 首选模型的路径，如果没有则返回None
    """
    preferences = load_user_preferences()
    if preferences and len(preferences) > 0:
        return preferences[0].get('model_path')
    return None

def validate_model_preferences(preferences: Dict[str, Any]) -> bool:
    """
    验证模型偏好设置是否包含必要字段
    
    Args:
        preferences (Dict[str, Any]): 要验证的模型偏好设置
        
    Returns:
        bool: 验证通过返回True，失败返回False
    """
    required_fields = ['model_path', 'position', 'scale']
    
    # 检查必要字段是否存在
    for field in required_fields:
        if field not in preferences:
            return False
    
    # 检查position和scale是否包含必要的子字段
    if not isinstance(preferences.get('position'), dict) or 'x' not in preferences['position'] or 'y' not in preferences['position']:
        return False
    
    if not isinstance(preferences.get('scale'), dict) or 'x' not in preferences['scale'] or 'y' not in preferences['scale']:
        return False
    
    return True

def move_model_to_top(model_path: str) -> bool:
    """
    将指定模型移动到列表顶部（设为首选）
    
    Args:
        model_path (str): 模型路径
        
    Returns:
        bool: 操作成功返回True，失败返回False
    """
    try:
        preferences = load_user_preferences()
        
        # 查找模型索引
        model_index = -1
        for i, pref in enumerate(preferences):
            if pref.get('model_path') == model_path:
                model_index = i
                break
        
        if model_index >= 0:
            # 将模型移动到顶部
            model_pref = preferences.pop(model_index)
            preferences.insert(0, model_pref)
            return save_user_preferences(preferences)
        else:
            # 如果模型不存在，返回False
            return False
    except Exception as e:
        print(f"移动模型到顶部失败: {e}")
        return False 
# Copyright (c) 2024 Alibaba Inc (authors: Xiang Lyu, Zhihao Du)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import re
import regex
import os
import logging
import json
from pathlib import Path
import requests

chinese_char_pattern = re.compile(r'[\u4e00-\u9fff]+')
bracket_patterns = [re.compile(r'\(.*?\)'),
                   re.compile('（.*?）')]

# whether contain chinese character
def contains_chinese(text):
    return bool(chinese_char_pattern.search(text))


# replace special symbol
def replace_corner_mark(text):
    text = text.replace('²', '平方')
    text = text.replace('³', '立方')
    return text

def estimate_speech_time(text, unit_duration=0.2):
    # 中文汉字范围
    chinese_chars = re.findall(r'[\u4e00-\u9fff]', text)
    chinese_units = len(chinese_chars) * 1.5

    # 日文假名范围（平假名 3040–309F，片假名 30A0–30FF）
    japanese_kana = re.findall(r'[\u3040-\u30FF]', text)
    japanese_units = len(japanese_kana) * 1.0

    # 英文单词（连续的 a-z 或 A-Z）
    english_words = re.findall(r'\b[a-zA-Z]+\b', text)
    english_units = len(english_words) * 1.5

    total_units = chinese_units + japanese_units + english_units
    estimated_seconds = total_units * unit_duration

    return estimated_seconds

# remove meaningless symbol
def remove_bracket(text):
    for p in bracket_patterns:
        text = p.sub('', text)
    text = text.replace('【', '').replace('】', '')
    text = text.replace('《', '').replace('》', '')
    text = text.replace('`', '').replace('`', '')
    text = text.replace("——", " ")
    text = text.replace("（", "").replace("）", "").replace("(", "").replace(")", "")
    return text


# spell Arabic numerals
def spell_out_number(text: str, inflect_parser):
    new_text = []
    st = None
    for i, c in enumerate(text):
        if not c.isdigit():
            if st is not None:
                num_str = inflect_parser.number_to_words(text[st: i])
                new_text.append(num_str)
                st = None
            new_text.append(c)
        else:
            if st is None:
                st = i
    if st is not None and st < len(text):
        num_str = inflect_parser.number_to_words(text[st:])
        new_text.append(num_str)
    return ''.join(new_text)


# split paragrah logic：
# 1. per sentence max len token_max_n, min len token_min_n, merge if last sentence len less than merge_len
# 2. cal sentence len according to lang
# 3. split sentence according to punctuation
# 4. 返回（要处理的文本，剩余buffer）
def split_paragraph(text: str, force_process=False, lang="zh", token_min_n=2.5, comma_split=True):
    def calc_utt_length(_text: str):
        return estimate_speech_time(_text)

    if lang == "zh":
        pounc = ['。', '？', '！', '；', '：', '、', '.', '?', '!', ';']
    else:
        pounc = ['.', '?', '!', ';', ':']
    if comma_split:
        pounc.extend(['，', ','])

    st = 0
    utts = []
    for i, c in enumerate(text):
        if c in pounc:
            if len(text[st: i]) > 0:
                utts.append(text[st: i+1])
            if i + 1 < len(text) and text[i + 1] in ['"', '”']:
                tmp = utts.pop(-1)
                utts.append(tmp + text[i + 1])
                st = i + 2
            else:
                st = i + 1

    if len(utts) == 0: # 没有一个标点
        if force_process:
            return text, ""
        else:
            return "", text
    elif calc_utt_length(utts[-1]) > token_min_n: #如果最后一个utt长度达标
        # print(f"💼后端进行切割：|| {''.join(utts)} || {text[st:]}")
        return ''.join(utts), text[st:]
    elif len(utts)==1: #如果长度不达标，但没有其他utt
        if force_process:
            return text, ""
        else:
            return "", text
    else:
        # print(f"💼后端进行切割：|| {''.join(utts[:-1])} || {utts[-1] + text[st:]}")
        return ''.join(utts[:-1]), utts[-1] + text[st:]

# remove blank between chinese character
def replace_blank(text: str):
    out_str = []
    for i, c in enumerate(text):
        if c == " ":
            if ((text[i + 1].isascii() and text[i + 1] != " ") and
                    (text[i - 1].isascii() and text[i - 1] != " ")):
                out_str.append(c)
        else:
            out_str.append(c)
    return "".join(out_str)


def is_only_punctuation(text):
    # Regular expression: Match strings that consist only of punctuation marks or are empty.
    punctuation_pattern = r'^[\p{P}\p{S}]*$'
    return bool(regex.fullmatch(punctuation_pattern, text))


def find_models():
    """
    递归扫描整个 'static' 文件夹，查找所有包含 '.model3.json' 文件的子目录。
    """
    found_models = []
    search_root_dir = 'static'
    
    if not os.path.exists(search_root_dir):
        logging.warning(f"警告：指定的静态文件夹路径不存在: {search_root_dir}")
        return []

    # os.walk会遍历指定的根目录下的所有文件夹和文件
    for root, dirs, files in os.walk(search_root_dir):
        for file in files:
            if file.endswith('.model3.json'):
                # 获取模型名称 (使用其所在的文件夹名，更加直观)
                model_name = os.path.basename(root)
                
                # 构建可被浏览器访问的URL路径
                # 1. 计算文件相对于 static_folder 的路径
                relative_path = os.path.relpath(os.path.join(root, file), search_root_dir)
                # 2. 将本地路径分隔符 (如'\') 替换为URL分隔符 ('/')
                model_path = relative_path.replace(os.path.sep, '/')
                
                found_models.append({
                    "name": model_name,
                    "path": f"/static/{model_path}"
                })
                
                # 优化：一旦在某个目录找到模型json，就无需再继续深入该目录的子目录
                dirs[:] = []
                break
                
    return found_models

# --- 工具函数 ---
def get_upload_policy(api_key, model_name):
    url = "https://dashscope.aliyuncs.com/api/v1/uploads"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    params = {
        "action": "getPolicy",
        "model": model_name
    }
    response = requests.get(url, headers=headers, params=params)
    if response.status_code != 200:
        raise Exception(f"获取上传凭证失败: {response.text}")
    return response.json()['data']

def upload_file_to_oss(policy_data, file_path):
    file_name = Path(file_path).name
    key = f"{policy_data['upload_dir']}/{file_name}"
    with open(file_path, 'rb') as file:
        files = {
            'OSSAccessKeyId': (None, policy_data['oss_access_key_id']),
            'Signature': (None, policy_data['signature']),
            'policy': (None, policy_data['policy']),
            'x-oss-object-acl': (None, policy_data['x_oss_object_acl']),
            'x-oss-forbid-overwrite': (None, policy_data['x_oss_forbid_overwrite']),
            'key': (None, key),
            'success_action_status': (None, '200'),
            'file': (file_name, file)
        }
        response = requests.post(policy_data['upload_host'], files=files)
        if response.status_code != 200:
            raise Exception(f"上传文件失败: {response.text}")
    return f'oss://{key}'
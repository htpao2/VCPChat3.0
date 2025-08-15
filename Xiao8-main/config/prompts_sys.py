from config import get_character_data
MASTER_NAME, _, _, _, _, _, _, _, _, _ = get_character_data()

gpt4_1_system = """## PERSISTENCE
You are an agent - please keep going until the user's query is completely 
resolved, before ending your turn and yielding back to the user. Only 
terminate your turn when you are sure that the problem is solved.

## TOOL CALLING
If you are not sure about file content or codebase structure pertaining to 
the user's request, use your tools to read files and gather the relevant 
information: do NOT guess or make up an answer.

## PLANNING
You MUST plan extensively before each function call, and reflect 
extensively on the outcomes of the previous function calls. DO NOT do this 
entire process by making function calls only, as this can impair your 
ability to solve the problem and think insightfully"""

semantic_manager_prompt = """你正在为一个记忆检索系统提供精筛服务。请根据Query与记忆片段的相关性对记忆进行筛选和排序。

=======Query======
%s

=======记忆=======
%s

返回json格式的按相关性排序的记忆编号列表，最相关的排在前面，不相关的去掉。最多选取%d个，越精准越好，无须凑数。
只返回记忆编号(int类型)，用逗号分隔，例如: [3,1,5,2,4]
"""

recent_history_manager_prompt = """请总结以下对话内容，生成简洁但信息丰富的摘要：

======以下为对话======
%s
======以上为对话======

你的摘要应该保留关键信息、重要事实和主要讨论点，且不能具有误导性或产生歧义。请以key为"对话摘要"的json字典格式返回。"""


detailed_recent_history_manager_prompt = """请总结以下对话内容，生成简洁但信息丰富的摘要：

======以下为对话======
%s
======以上为对话======

你的摘要应该尽可能多地保留有效且清晰的信息。请以key为"对话摘要"的json字典格式返回。
"""

further_summarize_prompt = """请总结以下内容，生成简洁但信息丰富的摘要：

======以下为内容======
%s
======以上为内容======

你的摘要应该保留关键信息、重要事实和主要讨论点，且不能具有误导性或产生歧义，不得超过500字。请以key为"对话摘要"的json字典格式返回。"""

settings_extractor_prompt = f"""从以下对话中提取关于{{LANLAN_NAME}}和{MASTER_NAME}的重要个人信息，用于个人备忘录以及未来的角色扮演，以json格式返回。
请以JSON格式返回，格式为:
{{
    "{{LANLAN_NAME}}": {{"属性1": "值", "属性2": "值", ...其他个人信息...}}
    "{MASTER_NAME}": {{...个人信息...}},
}}

========以下为对话========
%s
========以上为对话========

现在，请提取关于{{LANLAN_NAME}}和{MASTER_NAME}的重要个人信息。注意，只允许添加重要、准确的信息。如果没有符合条件的信息，可以返回一个空字典({{}})。"""

settings_verifier_prompt = ''

history_review_prompt = """请审阅%s和%s之间的对话历史记录，识别并修正以下问题：

<问题1> 矛盾的部分：前后不一致的信息或观点 </问题1>
<问题2> 冗余的部分：重复的内容或信息 </问题2>
<问题3> 复读的部分：重复表达相同意思的内容 </问题3>
<问题4> 人称错误的部分：对自己或对方的人称错误，或擅自生成了多轮对话 </问题4>
<问题5> 角色错误的部分：认知失调，认为自己是大语言模型 </问题5>

请注意！
<要点1> 这是一段情景对话，双方的回答应该是口语化的、自然的、拟人化的。</要点1>
<要点2> 请以删除为主，除非不得已、不要直接修改内容。</要点2>
<要点3> 如果对话历史中包含“先前对话的备忘录”，你可以修改它，但不允许删除它。你必须保留这一项。</要点3>

======以下为对话历史======
%s
======以上为对话历史======

请以JSON格式返回修正后的对话历史，格式为：
{
    "修正说明": "简要说明发现的问题和修正内容",
    "修正后的对话": [
        {"role": "SYSTEM_MESSAGE/%s/%s", "content": "修正后的消息内容"},
        ...
    ]
}

注意：
- 对话应当是口语化的、自然的、拟人化的
- 保持对话的核心信息和重要内容
- 确保修正后的对话逻辑清晰、连贯
- 移除冗余和重复内容
- 解决明显的矛盾
- 保持对话的自然流畅性"""

emotion_analysis_prompt = """你是一个情感分析专家。请分析用户输入的文本情感，并返回以下格式的JSON：{"emotion": "情感类型", "confidence": 置信度(0-1), "reason": "分析原因"}。情感类型包括：happy(开心), sad(悲伤), angry(愤怒), neutral(中性),surprised(惊讶)。"""
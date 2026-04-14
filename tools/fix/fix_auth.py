with open("app/auth/__init__.py", "r", encoding="utf-8") as f:
    content = f.read()

old = "return jsonify({'status': 'error', 'message': status_messages.get(user.status, f'账户状态异常: {user.status}')})"
new = "return jsonify({'status': 'error', 'message': status_messages.get(user.status, f'账户状态异常: {user.status}')})"

print("old in content:", old in content)
if old in content:
    content = content.replace(old, new)
    with open("app/auth/__init__.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("fixed auth syntax")
else:
    print("old not found, trying line-based fix")
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if "status_messages.get(user.status" in line:
            print(f"Line {i+1}: {repr(line)}")
            print(f"Open parens: {line.count('(')}, close parens: {line.count(')')}")
            if line.count('(') > line.count(')'):
                lines[i] = line.replace("')})", "')})\n")  # this won't work either
                # just add one more ) at the end before newline
                lines[i] = line.rstrip() + ")\n"
                print(f"Fixed line {i+1}: {repr(lines[i])}")
                break
    content = '\n'.join(lines)
    with open("app/auth/__init__.py", "w", encoding="utf-8") as f:
        f.write(content)

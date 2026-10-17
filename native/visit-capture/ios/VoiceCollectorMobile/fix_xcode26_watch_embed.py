"""Fix XcodeGen's legacy Watch embed destination for Xcode 26 projects."""

from pathlib import Path
import re


project = Path("VoiceCollectorMobile.xcodeproj/project.pbxproj")
if not project.exists():
    raise SystemExit("Generated project.pbxproj was not found")

text = project.read_text()
pattern = re.compile(
    r"(/\* Embed Watch Content \*/ = \{.*?\n\s*\};)",
    flags=re.DOTALL,
)
match = pattern.search(text)
if not match:
    raise SystemExit("Embed Watch Content build phase was not found")

block = match.group(1)
block = re.sub(r"dstPath = .*?;", 'dstPath = "";', block)
block = re.sub(r"dstSubfolderSpec = \d+;", "dstSubfolderSpec = 13;", block)
updated = text[: match.start()] + block + text[match.end() :]
project.write_text(updated)
print("Applied Xcode 26 Watch embedding compatibility fix")

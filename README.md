# 🚀 AI Code Review & Auto-Fix Extension for VS Code

![VS Code](https://img.shields.io/badge/VS_Code-Extension-blue.svg)
![Mistral AI](https://img.shields.io/badge/Mistral-AI-orange.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> **Supercharge your code quality with AI-powered reviews and instant auto-fixes!**

---

## ✨ Features

- 🤖 **AI-Powered Code Review**: Detects bugs, security issues, and performance problems
- 🛠️ **Auto-Fix Suggestions**: Instantly apply fixes with your approval
- ⚡ **Real-Time Analysis**: Get feedback as you type or on save
- 📊 **Quality Metrics**: Visualize code health and complexity
- 🌍 **Multi-Language Support**: JS, TS, Python, Java, Go, C/C++, C#, and more
- 🎨 **Visual Dashboard**: Interactive webview for review results
- 🩹 **Quick Fixes**: Instantly fix selected code snippets
- 🛡️ **Security Focus**: Highlights vulnerabilities
- ⚙️ **Customizable Settings**: Tailor the extension to your workflow

---

## 🛠️ Installation

### From VSIX
1. Download the latest `.vsix` from Releases
2. Open VS Code
3. Go to Extensions (`Ctrl+Shift+X`)
4. Click `...` → "Install from VSIX..."
5. Select the file and restart VS Code

### From Source
```bash
git clone https://github.com/RiyanshiTomar/Code-Reviewer-Extension-for-VS-Code.git
cd Code-Reviewer-Extension-for-VS-Code
npm install
vsce package
```

---

## 🔑 Configuration

1. **Get a Mistral API Key**: [Sign up at Mistral AI](https://mistral.ai/)
2. **Configure in VS Code**:
   - Press `Ctrl+Shift+P`
   - Type `Code Review Extension: Configure Mistral API Key`
   - Paste your API key

---

## 🎯 Commands

| Command                                         | Description                          |
|-------------------------------------------------|--------------------------------------|
| Review Current File                             | Analyze the open file                |
| Review Entire Project                           | Analyze all files in the workspace   |
| Review & Fix Code                              | Review and apply fixes with preview  |
| Add Feature to Code                            | Add new functionality via AI         |
| Quick Fix Selected Code                        | Instantly fix selected code          |
| Show Code Quality Report                       | Display code metrics                 |
| Open Code Review Panel                         | Open the visual dashboard            |
| Configure Mistral API Key                      | Set your API key                     |
| Configure Fallback API Key                     | Set backup API key (dev only)        |

---

## 🚦 Usage

- **Review Current File**: `Ctrl+Shift+P` → "Review Current File"
- **Auto-Fix**: `Ctrl+Shift+P` → "Review & Fix Code"
- **Add Feature**: `Ctrl+Shift+P` → "Add Feature to Code"
- **Quick Fix**: Select code → `Ctrl+Shift+P` → "Quick Fix Selected Code"

---

## 🌐 Supported Languages

- JavaScript, TypeScript
- Python
- Java
- C/C++, C#
- Go, Rust
- HTML, CSS, JSON, YAML
- ...and more!

---

## 🧠 What Gets Reviewed?

- **Security**: Hardcoded secrets, SQL injection, XSS, auth issues
- **Performance**: Memory leaks, slow code, resource waste
- **Quality**: Naming, duplication, complexity, missing docs
- **Bugs**: Null pointers, type errors, missing error handling

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.

---

## 🆘 Support

- [Open an Issue](https://github.com/RiyanshiTomar/Code-Reviewer-Extension-for-VS-Code/issues)
- Include VS Code version, extension version, and error details

---

_Made with ❤️ and AI for better code quality!_

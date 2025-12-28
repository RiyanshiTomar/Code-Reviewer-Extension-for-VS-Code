# AI Code Review Extension for VS Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS_Code-Extension-blue.svg)](https://code.visualstudio.com/)
[![Mistral AI](https://img.shields.io/badge/Mistral-AI-orange.svg)](https://mistral.ai/)

🤖 **AI-Powered Code Review and Auto-Fix for VS Code** - Enhance your code quality with intelligent analysis and automated fixes using Mistral AI.

## ✨ Features

- 🧠 **AI-Powered Code Review** - Analyze code for bugs, security vulnerabilities, and performance issues
- 🔧 **Auto-Fix Suggestions** - Apply fixes with your permission
- 🚀 **Real-time Analysis** - Get instant feedback as you type
- 📊 **Quality Metrics** - View detailed code quality reports
- 🌐 **Multi-language Support** - JavaScript, TypeScript, Python, Java, Go, C/C++, C#, and more
- 🎨 **Visual Dashboard** - Interactive webview for review results
- ⚡ **Quick Fixes** - Fix selected code snippets instantly
- 🛡️ **Security Focus** - Identify security vulnerabilities
- ⚙️ **Configurable Settings** - Customize review preferences

## 📋 Requirements

- **Node.js** >= 16.0.0
- **VS Code** >= 1.74.0
- **Mistral API Key** (free tier available)

## 🚀 Installation

### Method 1: Install from VSIX

1. Download the latest `.vsix` file from releases
2. Open VS Code
3. Go to Extensions (`Ctrl+Shift+X`)
4. Click `...` menu → "Install from VSIX..."
5. Select the downloaded file
6. Restart VS Code

### Method 2: Build from Source

```bash
git clone https://github.com/RiyanshiTomar/Code-Reviewer-Extension-for-VS-Code.git
cd Code-Reviewer-Extension-for-VS-Code
npm install
vsce package
```

## 🔑 Configuration

### 1. Get Mistral API Key

- Visit [Mistral AI](https://mistral.ai/)
- Sign up for an account
- Get your API key from the dashboard

### 2. Configure in VS Code

- Press `Ctrl+Shift+P`
- Type "Code Review Extension: Configure Mistral API Key"
- Paste your API key

## 🎯 Available Commands

| Command                                               | Description                            |
| ----------------------------------------------------- | -------------------------------------- |
| `Code Review Extension: Review Current File`        | Analyze the currently open file        |
| `Code Review Extension: Review Entire Project`      | Analyze all files in the workspace     |
| `Code Review Extension: Review & Fix Code`          | Review and apply fixes with permission |
| `Code Review Extension: Add Feature to Code`        | Add new functionality to your code     |
| `Code Review Extension: Quick Fix Selected Code`    | Fix selected code snippet              |
| `Code Review Extension: Show Code Quality Report`   | Display quality metrics                |
| `Code Review Extension: Open Code Review Panel`     | Open visual dashboard                  |
| `Code Review Extension: Configure Mistral API Key`  | Set your API key                       |
| `Code Review Extension: Configure Fallback API Key` | Set backup API key (dev only)          |

### Quick Access

- **Review Current File**: `Ctrl+Shift+P` → "Review Current File"
- **Auto-Fix**: `Ctrl+Shift+P` → "Review & Fix Code"
- **Add Feature**: `Ctrl+Shift+P` → "Add Feature to Code"
- **Quick Fix**: Select code → `Ctrl+Shift+P` → "Quick Fix Selected Code"

## 🛠️ Usage Examples

### 1. Code Review

1. Open any code file
2. Press `Ctrl+Shift+P`
3. Select "Review Current File"
4. View results in Output panel

### 2. Auto-Fix Issues

1. Open a file with issues
2. Press `Ctrl+Shift+P`
3. Select "Review & Fix Code"
4. Choose fixes to apply
5. Review and confirm changes

### 3. Add New Feature

1. Open your code file
2. Press `Ctrl+Shift+P`
3. Select "Add Feature to Code"
4. Describe the feature you want
5. Preview and apply changes

### 4. Quick Fix Selection

1. Select problematic code
2. Press `Ctrl+Shift+P`
3. Select "Quick Fix Selected Code"
4. Apply the suggested fix

## ⚙️ Configuration Options

Access settings via `Ctrl+,` → Extensions → Code Review Extension:

- **API Key**: Your Mistral API key
- **Model**: Choose Mistral model (tiny, small, medium, large)
- **Real-time Review**: Enable analysis as you type
- **Review Delay**: Time to wait after typing stops (500-10000ms)
- **Max File Size**: Maximum file size to analyze
- **Review on Save**: Analyze when files are saved
- **Security Focus**: Prioritize security issues
- **Performance Focus**: Prioritize performance issues
- **Style Focus**: Prioritize code style issues
- **File Extensions**: Which file types to analyze

## 🌐 Supported Languages

- JavaScript (`.js`, `.jsx`)
- TypeScript (`.ts`, `.tsx`)
- Python (`.py`)
- Java (`.java`)
- C/C++ (`.c`, `.cpp`)
- C# (`.cs`)
- Go (`.go`)
- Rust (`.rs`)
- HTML (`.html`)
- CSS (`.css`)
- JSON (`.json`)
- YAML (`.yaml`, `.yml`)
- And more!

## 🔍 What We Analyze

### Security Issues

- Hardcoded secrets
- SQL injection vulnerabilities
- XSS risks
- Authentication problems

### Performance Issues

- Memory leaks
- Inefficient algorithms
- Resource waste
- Slow operations

### Code Quality

- Naming conventions
- Code duplication
- Complexity metrics
- Documentation gaps

### Bug Detection

- Null pointer exceptions
- Type errors
- Missing error handling
- Logic errors

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues:

1. Check the [Issues](https://github.com/RiyanshiTomar/Code-Reviewer-Extension-for-VS-Code/issues) page
2. Create a new issue with detailed information
3. Include VS Code version, extension version, and error details

## 🙏 Acknowledgments

- Built with [Mistral AI](https://mistral.ai/)
- Powered by VS Code Extension API
- Inspired by the need for better code quality tools

---

⭐ **Star this repo if it helped you!**

Made with ❤️ and AI for better code quality

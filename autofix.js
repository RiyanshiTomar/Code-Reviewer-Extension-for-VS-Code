const vscode = require('vscode');
const MistralClient = require('@mistralai/mistralai').default;
require('dotenv').config();

// Get API key from configuration or environment
function getApiKey() {
    const config = vscode.workspace.getConfiguration('code-review-extension');
    const userKey = config.get('apiKey');
    const fallbackKey = config.get('fallbackApiKey');
    return userKey || fallbackKey || process.env.MISTRAL_API_KEY;
}

// Initialize Mistral client
function getMistralClient() {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('No API key configured. Please configure your Mistral API key.');
    }
    return new MistralClient(apiKey);
}

/**
 * Represents a suggested fix from the AI
 */
class SuggestedFix {
    constructor(id, description, originalCode, fixedCode, lineStart, lineEnd, severity, type) {
        this.id = id;
        this.description = description;
        this.originalCode = originalCode;
        this.fixedCode = fixedCode;
        this.lineStart = lineStart;
        this.lineEnd = lineEnd;
        this.severity = severity; // 'error', 'warning', 'info'
        this.type = type; // 'bug', 'security', 'performance', 'style', 'feature'
    }
}

/**
 * Analyze code and get suggested fixes from Mistral AI
 * @param {string} code - The code to analyze
 * @param {string} language - The programming language
 * @returns {Promise<SuggestedFix[]>} - Array of suggested fixes
 */
async function analyzeAndGetFixes(code, language) {
    const client = getMistralClient();
    const config = vscode.workspace.getConfiguration('code-review-extension');
    const model = config.get('model') || 'mistral-large-latest';

    const prompt = `You are an expert code reviewer and fixer. Analyze the following ${language} code and provide specific fixes.

For each issue found, provide a JSON response in this exact format:
{
    "fixes": [
        {
            "id": "unique_id_1",
            "description": "Brief description of the issue and fix",
            "severity": "error|warning|info",
            "type": "bug|security|performance|style|feature",
            "lineStart": 1,
            "lineEnd": 5,
            "originalCode": "the exact original code snippet",
            "fixedCode": "the corrected code snippet"
        }
    ],
    "summary": "Overall summary of issues found"
}

IMPORTANT RULES:
1. Only suggest fixes for real issues, not stylistic preferences
2. The originalCode must EXACTLY match code from the input
3. Provide complete, working fixedCode that can replace the original
4. Include line numbers (1-indexed)
5. Focus on: bugs, security vulnerabilities, performance issues, missing error handling
6. Return valid JSON only, no markdown formatting

CODE TO ANALYZE:
\`\`\`${language}
${code}
\`\`\`

Respond with JSON only:`;

    try {
        const response = await client.chat({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert code reviewer. Respond only with valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 4096
        });

        const content = response.choices[0]?.message?.content || '{"fixes": []}';
        
        // Parse JSON response
        let parsed;
        try {
            // Remove markdown code blocks if present
            let cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            parsed = JSON.parse(cleanContent);
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            return [];
        }

        // Convert to SuggestedFix objects
        const fixes = (parsed.fixes || []).map((fix, index) => {
            return new SuggestedFix(
                fix.id || `fix_${index}`,
                fix.description || 'No description',
                fix.originalCode || '',
                fix.fixedCode || '',
                fix.lineStart || 1,
                fix.lineEnd || 1,
                fix.severity || 'info',
                fix.type || 'style'
            );
        });

        return fixes;
    } catch (error) {
        console.error('Error analyzing code:', error);
        throw error;
    }
}

/**
 * Show fixes in a QuickPick menu and let user select which to apply
 * @param {vscode.TextEditor} editor - The active editor
 * @param {SuggestedFix[]} fixes - Array of suggested fixes
 */
async function showFixesMenu(editor, fixes) {
    if (fixes.length === 0) {
        vscode.window.showInformationMessage('No issues found! Your code looks good.');
        return;
    }

    // Create QuickPick items
    const items = fixes.map(fix => ({
        label: `${getSeverityIcon(fix.severity)} ${fix.description}`,
        description: `[${fix.type.toUpperCase()}] Lines ${fix.lineStart}-${fix.lineEnd}`,
        detail: `Original: ${fix.originalCode.substring(0, 50)}... → Fixed: ${fix.fixedCode.substring(0, 50)}...`,
        fix: fix
    }));

    // Add options
    items.unshift({
        label: '$(check-all) Apply All Fixes',
        description: `Apply all ${fixes.length} suggested fixes`,
        applyAll: true
    });

    items.push({
        label: '$(eye) Preview All Fixes',
        description: 'Show detailed view of all fixes',
        preview: true
    });

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: `Found ${fixes.length} issues. Select a fix to apply or preview.`,
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selection) {
        return;
    }

    if (selection.applyAll) {
        await applyAllFixes(editor, fixes);
    } else if (selection.preview) {
        await showFixesPreview(editor, fixes);
    } else if (selection.fix) {
        await applySingleFix(editor, selection.fix);
    }
}

/**
 * Get icon for severity level
 */
function getSeverityIcon(severity) {
    switch (severity) {
        case 'error': return '$(error)';
        case 'warning': return '$(warning)';
        case 'info': return '$(info)';
        default: return '$(lightbulb)';
    }
}

/**
 * Apply a single fix to the editor
 * @param {vscode.TextEditor} editor 
 * @param {SuggestedFix} fix 
 */
async function applySingleFix(editor, fix) {
    const document = editor.document;
    const fullText = document.getText();

    // Find the original code in the document
    const originalIndex = fullText.indexOf(fix.originalCode);
    
    if (originalIndex === -1) {
        // Try to find by line range
        const startPos = new vscode.Position(Math.max(0, fix.lineStart - 1), 0);
        const endPos = new vscode.Position(fix.lineEnd, 0);
        
        const confirm = await vscode.window.showWarningMessage(
            `Could not find exact match for the original code. Apply fix at lines ${fix.lineStart}-${fix.lineEnd}?`,
            'Yes, Apply', 'No, Cancel'
        );
        
        if (confirm !== 'Yes, Apply') {
            return;
        }
        
        const range = new vscode.Range(startPos, endPos);
        await editor.edit(editBuilder => {
            editBuilder.replace(range, fix.fixedCode + '\n');
        });
    } else {
        // Found exact match - replace it
        const startPos = document.positionAt(originalIndex);
        const endPos = document.positionAt(originalIndex + fix.originalCode.length);
        const range = new vscode.Range(startPos, endPos);

        // Show confirmation
        const confirm = await vscode.window.showInformationMessage(
            `Apply fix: ${fix.description}?`,
            'Yes, Apply', 'Preview First', 'Cancel'
        );

        if (confirm === 'Yes, Apply') {
            await editor.edit(editBuilder => {
                editBuilder.replace(range, fix.fixedCode);
            });
            vscode.window.showInformationMessage(`Fix applied: ${fix.description}`);
        } else if (confirm === 'Preview First') {
            await showSingleFixPreview(editor, fix);
        }
    }
}

/**
 * Apply all fixes to the editor
 * @param {vscode.TextEditor} editor 
 * @param {SuggestedFix[]} fixes 
 */
async function applyAllFixes(editor, fixes) {
    const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to apply all ${fixes.length} fixes? This will modify your code.`,
        'Yes, Apply All', 'Preview First', 'Cancel'
    );

    if (confirm === 'Cancel' || !confirm) {
        return;
    }

    if (confirm === 'Preview First') {
        await showFixesPreview(editor, fixes);
        return;
    }

    // Sort fixes by position (descending) to avoid offset issues
    // Apply from bottom to top so earlier positions don't shift
    const sortedFixes = [...fixes].sort((a, b) => b.lineStart - a.lineStart);

    let appliedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Track which ranges have been modified to avoid overlaps
    const modifiedRanges = [];

    // Apply fixes one by one to avoid overlapping range errors
    for (const fix of sortedFixes) {
        try {
            const document = editor.document;
            const fullText = document.getText();
            const originalIndex = fullText.indexOf(fix.originalCode);
            
            if (originalIndex === -1) {
                failedCount++;
                continue;
            }

            const startPos = document.positionAt(originalIndex);
            const endPos = document.positionAt(originalIndex + fix.originalCode.length);
            
            // Check if this range overlaps with any already modified range
            const startOffset = originalIndex;
            const endOffset = originalIndex + fix.originalCode.length;
            
            let overlaps = false;
            for (const range of modifiedRanges) {
                if ((startOffset >= range.start && startOffset < range.end) ||
                    (endOffset > range.start && endOffset <= range.end) ||
                    (startOffset <= range.start && endOffset >= range.end)) {
                    overlaps = true;
                    break;
                }
            }

            if (overlaps) {
                skippedCount++;
                continue;
            }

            const range = new vscode.Range(startPos, endPos);
            
            // Apply this single fix
            const success = await editor.edit(editBuilder => {
                editBuilder.replace(range, fix.fixedCode);
            });

            if (success) {
                appliedCount++;
                // Track this range as modified
                modifiedRanges.push({ start: startOffset, end: endOffset });
            } else {
                failedCount++;
            }
        } catch (error) {
            console.error('Error applying fix:', error);
            failedCount++;
        }
    }

    let message = `Applied ${appliedCount} fix${appliedCount !== 1 ? 'es' : ''}.`;
    if (failedCount > 0) {
        message += ` ${failedCount} could not be applied.`;
    }
    if (skippedCount > 0) {
        message += ` ${skippedCount} skipped (overlapping).`;
    }
    
    vscode.window.showInformationMessage(message);
}

/**
 * Show a preview of a single fix
 */
async function showSingleFixPreview(editor, fix) {
    const panel = vscode.window.createWebviewPanel(
        'fixPreview',
        `Fix Preview: ${fix.description}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    panel.webview.html = getFixPreviewHtml([fix], editor.document.fileName);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'applyFix') {
            await applySingleFix(editor, fix);
            panel.dispose();
        }
    });
}

/**
 * Show a preview of all fixes in a webview
 */
async function showFixesPreview(editor, fixes) {
    const panel = vscode.window.createWebviewPanel(
        'fixesPreview',
        'Code Fixes Preview',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    panel.webview.html = getFixPreviewHtml(fixes, editor.document.fileName);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'applyFix') {
            const fix = fixes.find(f => f.id === message.fixId);
            if (fix) {
                await applySingleFix(editor, fix);
            }
        } else if (message.command === 'applyAll') {
            await applyAllFixes(editor, fixes);
            panel.dispose();
        }
    });
}

/**
 * Generate HTML for fix preview
 */
function getFixPreviewHtml(fixes, fileName) {
    const fixItems = fixes.map(fix => `
        <div class="fix-item ${fix.severity}">
            <div class="fix-header">
                <span class="severity-badge ${fix.severity}">${fix.severity.toUpperCase()}</span>
                <span class="type-badge">${fix.type}</span>
                <span class="lines">Lines ${fix.lineStart}-${fix.lineEnd}</span>
            </div>
            <h3>${escapeHtml(fix.description)}</h3>
            <div class="code-comparison">
                <div class="code-block original">
                    <h4>Original Code</h4>
                    <pre><code>${escapeHtml(fix.originalCode)}</code></pre>
                </div>
                <div class="arrow">→</div>
                <div class="code-block fixed">
                    <h4>Fixed Code</h4>
                    <pre><code>${escapeHtml(fix.fixedCode)}</code></pre>
                </div>
            </div>
            <button class="apply-btn" onclick="applyFix('${fix.id}')">Apply This Fix</button>
        </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Fixes Preview</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: #1e1e1e;
            color: #d4d4d4;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #404040;
        }
        .header h1 {
            margin: 0;
            font-size: 1.5em;
        }
        .file-name {
            color: #888;
            font-size: 0.9em;
        }
        .apply-all-btn {
            background: #0e639c;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .apply-all-btn:hover {
            background: #1177bb;
        }
        .fix-item {
            background: #252526;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            border-left: 4px solid #888;
        }
        .fix-item.error { border-left-color: #f14c4c; }
        .fix-item.warning { border-left-color: #cca700; }
        .fix-item.info { border-left-color: #3794ff; }
        .fix-header {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
        }
        .severity-badge, .type-badge {
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
        }
        .severity-badge.error { background: #f14c4c; color: white; }
        .severity-badge.warning { background: #cca700; color: black; }
        .severity-badge.info { background: #3794ff; color: white; }
        .type-badge { background: #404040; }
        .lines { color: #888; font-size: 12px; }
        .fix-item h3 {
            margin: 0 0 15px 0;
            font-size: 1.1em;
        }
        .code-comparison {
            display: flex;
            gap: 20px;
            align-items: stretch;
        }
        .code-block {
            flex: 1;
            background: #1e1e1e;
            border-radius: 4px;
            padding: 10px;
        }
        .code-block.original { border: 1px solid #f14c4c33; }
        .code-block.fixed { border: 1px solid #89d18533; }
        .code-block h4 {
            margin: 0 0 10px 0;
            font-size: 12px;
            color: #888;
        }
        .code-block pre {
            margin: 0;
            overflow-x: auto;
        }
        .code-block code {
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .arrow {
            display: flex;
            align-items: center;
            font-size: 24px;
            color: #888;
        }
        .apply-btn {
            background: #2ea043;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 15px;
            font-size: 13px;
        }
        .apply-btn:hover { background: #3fb950; }
        .summary {
            text-align: center;
            padding: 20px;
            color: #888;
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>Code Fixes Preview</h1>
            <div class="file-name">${escapeHtml(fileName)}</div>
        </div>
        <button class="apply-all-btn" onclick="applyAll()">Apply All ${fixes.length} Fixes</button>
    </div>
    
    ${fixItems}
    
    <div class="summary">
        Found ${fixes.length} issue${fixes.length !== 1 ? 's' : ''} to fix
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function applyFix(fixId) {
            vscode.postMessage({ command: 'applyFix', fixId: fixId });
        }
        
        function applyAll() {
            vscode.postMessage({ command: 'applyAll' });
        }
    </script>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Main function to review and fix current file
 */
async function reviewAndFix() {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
        vscode.window.showErrorMessage('No active file to review.');
        return;
    }

    const document = editor.document;
    const code = document.getText();
    const language = document.languageId;

    // Show progress
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Analyzing code for fixes...',
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ message: 'Sending to AI...' });
            const fixes = await analyzeAndGetFixes(code, language);
            
            progress.report({ message: 'Processing results...' });
            await showFixesMenu(editor, fixes);
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
    });
}

/**
 * Add a new feature to the code
 */
async function addFeature() {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
        vscode.window.showErrorMessage('No active file.');
        return;
    }

    const featureDescription = await vscode.window.showInputBox({
        prompt: 'Describe the feature you want to add',
        placeHolder: 'e.g., Add input validation, Add error handling, Add logging...'
    });

    if (!featureDescription) {
        return;
    }

    const document = editor.document;
    const code = document.getText();
    const language = document.languageId;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Generating feature...',
        cancellable: false
    }, async (progress) => {
        try {
            const client = getMistralClient();
            const config = vscode.workspace.getConfiguration('code-review-extension');
            const model = config.get('model') || 'mistral-large-latest';

            const prompt = `You are an expert ${language} developer. I want you to add a feature to my code.

FEATURE REQUEST: ${featureDescription}

CURRENT CODE:
\`\`\`${language}
${code}
\`\`\`

Provide the complete updated code with the feature implemented.
Include comments explaining the new feature.
Return ONLY the code, no explanations or markdown formatting.`;

            progress.report({ message: 'AI is generating feature...' });
            
            const response = await client.chat({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert ${language} developer. Return only code, no explanations.`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.4,
                max_tokens: 8000
            });

            let newCode = response.choices[0]?.message?.content || '';
            
            // Clean up response
            newCode = newCode.replace(/```[\w]*\n?/g, '').replace(/```\n?/g, '').trim();

            // Show preview and ask for confirmation
            const panel = vscode.window.createWebviewPanel(
                'featurePreview',
                `Feature Preview: ${featureDescription}`,
                vscode.ViewColumn.Beside,
                { enableScripts: true }
            );

            panel.webview.html = getFeaturePreviewHtml(code, newCode, featureDescription, language);

            panel.webview.onDidReceiveMessage(async message => {
                if (message.command === 'apply') {
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(code.length)
                    );
                    await editor.edit(editBuilder => {
                        editBuilder.replace(fullRange, newCode);
                    });
                    vscode.window.showInformationMessage('Feature added successfully!');
                    panel.dispose();
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
    });
}

/**
 * Generate HTML for feature preview
 */
function getFeaturePreviewHtml(originalCode, newCode, featureDescription, language) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Feature Preview</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: #1e1e1e;
            color: #d4d4d4;
        }
        .header {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #404040;
        }
        .header h1 { margin: 0 0 10px 0; }
        .feature-desc {
            background: #2ea04333;
            padding: 10px 15px;
            border-radius: 4px;
            border-left: 4px solid #2ea043;
        }
        .code-container {
            display: flex;
            gap: 20px;
            margin-top: 20px;
        }
        .code-panel {
            flex: 1;
            background: #252526;
            border-radius: 8px;
            overflow: hidden;
        }
        .code-panel h2 {
            margin: 0;
            padding: 15px;
            background: #333;
            font-size: 14px;
        }
        .code-panel.original h2 { background: #f14c4c33; }
        .code-panel.new h2 { background: #2ea04333; }
        .code-panel pre {
            margin: 0;
            padding: 15px;
            overflow: auto;
            max-height: 500px;
        }
        .code-panel code {
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            white-space: pre;
        }
        .actions {
            margin-top: 20px;
            text-align: center;
        }
        .apply-btn {
            background: #2ea043;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            margin-right: 10px;
        }
        .apply-btn:hover { background: #3fb950; }
        .cancel-btn {
            background: #6e7681;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
        }
        .cancel-btn:hover { background: #8b949e; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Feature Preview</h1>
        <div class="feature-desc">${escapeHtml(featureDescription)}</div>
    </div>
    
    <div class="code-container">
        <div class="code-panel original">
            <h2>Original Code</h2>
            <pre><code>${escapeHtml(originalCode)}</code></pre>
        </div>
        <div class="code-panel new">
            <h2>With New Feature</h2>
            <pre><code>${escapeHtml(newCode)}</code></pre>
        </div>
    </div>
    
    <div class="actions">
        <button class="apply-btn" onclick="apply()">Apply Feature</button>
        <button class="cancel-btn" onclick="window.close()">Cancel</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function apply() {
            vscode.postMessage({ command: 'apply' });
        }
    </script>
</body>
</html>`;
}

/**
 * Quick fix for selected code
 */
async function quickFixSelection() {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
        vscode.window.showErrorMessage('No active editor.');
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showErrorMessage('Please select some code to fix.');
        return;
    }

    const selectedCode = editor.document.getText(selection);
    const language = editor.document.languageId;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Fixing selected code...',
        cancellable: false
    }, async (progress) => {
        try {
            const client = getMistralClient();
            const config = vscode.workspace.getConfiguration('code-review-extension');
            const model = config.get('model') || 'mistral-large-latest';

            const prompt = `Fix any issues in this ${language} code and improve it:

\`\`\`${language}
${selectedCode}
\`\`\`

Return ONLY the fixed code, no explanations or markdown.`;

            progress.report({ message: 'AI is fixing code...' });
            
            const response = await client.chat({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert code fixer. Return only the fixed code, nothing else.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.2,
                max_tokens: 2000
            });

            let fixedCode = response.choices[0]?.message?.content || selectedCode;
            fixedCode = fixedCode.replace(/```[\w]*\n?/g, '').replace(/```\n?/g, '').trim();

            // Show confirmation
            const confirm = await vscode.window.showInformationMessage(
                'Apply the fix to selected code?',
                'Yes, Apply', 'Preview', 'Cancel'
            );

            if (confirm === 'Yes, Apply') {
                await editor.edit(editBuilder => {
                    editBuilder.replace(selection, fixedCode);
                });
                vscode.window.showInformationMessage('Code fixed successfully!');
            } else if (confirm === 'Preview') {
                // Show diff preview
                const panel = vscode.window.createWebviewPanel(
                    'quickFixPreview',
                    'Quick Fix Preview',
                    vscode.ViewColumn.Beside,
                    { enableScripts: true }
                );
                panel.webview.html = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
        .panel { display: flex; gap: 20px; }
        .code { flex: 1; background: #252526; padding: 15px; border-radius: 8px; }
        .code h3 { margin-top: 0; color: #888; }
        pre { white-space: pre-wrap; }
        button { background: #2ea043; color: white; border: none; padding: 10px 20px; cursor: pointer; margin-top: 20px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="panel">
        <div class="code"><h3>Original</h3><pre>${escapeHtml(selectedCode)}</pre></div>
        <div class="code"><h3>Fixed</h3><pre>${escapeHtml(fixedCode)}</pre></div>
    </div>
    <button onclick="vscode.postMessage({command:'apply'})">Apply Fix</button>
    <script>const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
                panel.webview.onDidReceiveMessage(async message => {
                    if (message.command === 'apply') {
                        await editor.edit(editBuilder => {
                            editBuilder.replace(selection, fixedCode);
                        });
                        panel.dispose();
                        vscode.window.showInformationMessage('Code fixed!');
                    }
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
    });
}

module.exports = {
    reviewAndFix,
    addFeature,
    quickFixSelection,
    analyzeAndGetFixes,
    SuggestedFix
};

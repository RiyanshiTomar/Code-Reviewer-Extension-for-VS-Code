const vscode = require('vscode');
const MistralClient = require('@mistralai/mistralai').default;  // we are using mistral api key
const fs = require('fs');   // for system
const path = require('path');
const chokidar = require('chokidar');   //ye file changes ko dekhne k liye h 
const os = require('os');

// Import autofix module
const autofix = require('./autofix');

// Global variables to maintain state
let ai = null;
let apiKey = null;
let diagnosticCollection = null;
let realTimeReviewTimer = null;
let currentDocument = null;
let isRealTimeReviewEnabled = false;
let reviewPanel = null;

// Define diagnostic severity levels 
const severityMap = { // they are use to represent a problem found in code...
    'error': vscode.DiagnosticSeverity.Error,  //means more serious....red is-underline
    'warning': vscode.DiagnosticSeverity.Warning,  //yellow underline
    'info': vscode.DiagnosticSeverity.Information,    //helpful info
    'hint': vscode.DiagnosticSeverity.Hint   //suggestions
};

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Code Review Extension is now active!');
    
    // Show welcome message if API key is not configured
    const config = vscode.workspace.getConfiguration('code-review-extension');
    const apiKey = config.get('apiKey');
    
    if (!apiKey) {
        vscode.window.showInformationMessage(
            'Welcome to Code Review Extension! Please configure your Mistral API key to get started.',
            'Configure Now', 'Later'
        ).then(selection => {
            if (selection === 'Configure Now') {
                vscode.commands.executeCommand('code-review-extension.configureAPIKey');
            }
        });
    }

    // Register commands
    // we will do all these via Command Palette
      //for review current file
    let disposable = vscode.commands.registerCommand('code-review-extension.reviewCurrentFile', async function () {
        await reviewCurrentFile();
    });


   //register command to review entire project
    let projectReviewDisposable = vscode.commands.registerCommand('code-review-extension.reviewProject', async function () {
        await reviewProject();
    });
    
    // add API Key configuration command
    let configureAPIKeyDisposable = vscode.commands.registerCommand('code-review-extension.configureAPIKey', async function () {
        await configureAPIKey();
    });
    
     // command to display a quality metrices report for open file
    let showQualityReportDisposable = vscode.commands.registerCommand('code-review-extension.showQualityReport', async function () {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            showCodeQualityReport(editor.document);
        } else {
            vscode.window.showErrorMessage('No active editor found');
        }
    });

    //command for backup API key
    let configureFallbackAPIKeyDisposable = vscode.commands.registerCommand('code-review-extension.configureFallbackAPIKey', async function () {
        await configureFallbackAPIKey();
    });
    
    //open web UI panel
    let openReviewPanelDisposable = vscode.commands.registerCommand('code-review-extension.openReviewPanel', async function () {
        const panel = createReviewWebview(context);
        
        // Send a welcome message to the webview
        panel.webview.postMessage({
            command: 'showReport',
            data: {
                metrics: {
                    totalLines: 0,
                    totalCharacters: 0,
                    totalWords: 0,
                    emptyLines: 0,
                    commentLines: 0,
                    complexityScore: 0,
                    issuesCount: 0
                },
                summary: {
                    message: "Welcome to Code Review Extension! Open a file to start reviewing."
                }
            }
        });
    });

    // Register autofix commands
    // runs AI review + autofix
    // Smart review and fix: shows code changes in green (added) and red (removed) before applying
    let reviewAndFixDisposable = vscode.commands.registerCommand('code-review-extension.reviewAndFix', async function () {
        // This will now show a diff preview with highlights before applying changes
        await autofix.reviewAndFix();
    });

    let addFeatureDisposable = vscode.commands.registerCommand('code-review-extension.addFeature', async function () {
        await autofix.addFeature();
    });

    let quickFixSelectionDisposable = vscode.commands.registerCommand('code-review-extension.quickFixSelection', async function () {
        await autofix.quickFixSelection();
    });

    // Register the disposables
    //save disposables
    // here we are ensuring cleanup when extensions unloads..
    context.subscriptions.push(disposable);
    context.subscriptions.push(projectReviewDisposable);
    context.subscriptions.push(configureAPIKeyDisposable);
    context.subscriptions.push(showQualityReportDisposable);
    context.subscriptions.push(configureFallbackAPIKeyDisposable);
    context.subscriptions.push(openReviewPanelDisposable);
    context.subscriptions.push(reviewAndFixDisposable);
    context.subscriptions.push(addFeatureDisposable);
    context.subscriptions.push(quickFixSelectionDisposable);

    // Initialize diagnostic collection 
    // creates shared "Problems" collection
    diagnosticCollection = vscode.languages.createDiagnosticCollection('code-review-extension');
    context.subscriptions.push(diagnosticCollection);
    
    // Initialize the AI client if API key is available
    initializeAIClient();  //also create Mistral Client..
    
    // Watch for configuration changes
    //Re-initilaise AI when API key
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('code-review-extension.apiKey')) {
            initializeAIClient();
        }
        if (event.affectsConfiguration('code-review-extension.enableRealTimeReview')) {
            isRealTimeReviewEnabled = vscode.workspace.getConfiguration('code-review-extension').get('enableRealTimeReview');
        }
    });
    
    // Set up real-time review if enabled
    isRealTimeReviewEnabled = vscode.workspace.getConfiguration('code-review-extension').get('enableRealTimeReview');
    
    if (isRealTimeReviewEnabled) {
        // Listen for text document changes
        vscode.workspace.onDidChangeTextDocument(event => {
            if (isRealTimeReviewEnabled) {
                // Clear any existing timer
                if (realTimeReviewTimer) {
                    clearTimeout(realTimeReviewTimer);
                }
                
                // Set a new timer to delay the review
                const reviewDelay = vscode.workspace.getConfiguration('code-review-extension').get('reviewDelay');
                realTimeReviewTimer = setTimeout(() => {
                    performRealTimeReview(event.document);
                }, reviewDelay); // Configurable delay after typing stops
            }
        });
        
        // Also listen for document saves
        vscode.workspace.onDidSaveTextDocument(document => {
            const reviewOnSave = vscode.workspace.getConfiguration('code-review-extension').get('reviewOnSave');
            if (isRealTimeReviewEnabled && reviewOnSave) {
                performRealTimeReview(document);
            }
        });
    }
    
    // Listen for active text editor changes
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document) {
            currentDocument = editor.document;
            if (isRealTimeReviewEnabled) {
                performRealTimeReview(editor.document);
            }
        }
    });
    
    // Initialize current document if there's an active editor
    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
        currentDocument = vscode.window.activeTextEditor.document;
    }
    
    // Set up file watcher for project-wide analysis
    setupFileWatcher(context);
}

function initializeAIClient() {
    const config = vscode.workspace.getConfiguration('code-review-extension');
    let newApiKey = config.get('apiKey');
    
    // If no primary API key, try the fallback key
    if (!newApiKey) {
        newApiKey = config.get('fallbackApiKey');
        if (newApiKey) {
            console.log('Using fallback API key');
        }
    }
    
    if (newApiKey) {
        apiKey = newApiKey;
        ai = new MistralClient(apiKey);
        console.log('Mistral AI client initialized');
    } else {
        console.log('Mistral API key not configured. Please configure your API key.');
    }
}

async function configureAPIKey() {
    const config = vscode.workspace.getConfiguration('code-review-extension');
    const currentKey = config.get('apiKey');
    
    const newApiKey = await vscode.window.showInputBox({
        prompt: 'Enter your Mistral API key',
        password: true,
        value: currentKey || '',
        validateInput: (value) => {
            if (!value) {
                return 'API key is required';
            }
            return null;
        }
    });
    
    if (newApiKey) {
        await config.update('apiKey', newApiKey, vscode.ConfigurationTarget.Global);
        initializeAIClient();
        vscode.window.showInformationMessage('Mistral API key configured successfully!');
    }
}

async function reviewCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    const document = editor.document;
    const filePath = document.fileName;
    const content = document.getText();

    if (!ai) {
        const userChoice = await vscode.window.showInformationMessage(
            'Mistral API key not configured. Would you like to configure it now?',
            'Yes', 'No'
        );
        
        if (userChoice === 'Yes') {
            await configureAPIKey();
            // Re-check if API key is now configured
            if (!ai) {
                vscode.window.showErrorMessage('API key configuration failed. Please try again.');
                return;
            }
        } else {
            vscode.window.showInformationMessage('Code review requires an API key. Please configure it later using the command palette.');
            return;
        }
    }

    // Show progress notification
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Reviewing your code...",
        cancellable: true
    }, async (progress, token) => {
        try {
            progress.report({ increment: 0, message: "Analyzing code..." });

            const model = vscode.workspace.getConfiguration('code-review-extension').get('model');
            const response = await ai.chat({
                model: model,
                messages: [
                    { 
                        role: 'system', 
                        content: `You are an expert code reviewer. Analyze the following code for potential issues, bugs, security vulnerabilities, and code quality improvements. Provide specific suggestions with line numbers where applicable. Focus on:
                        - Security vulnerabilities
                        - Performance issues
                        - Code style and best practices
                        - Potential bugs
                        - Maintainability
                        - Documentation`
                    },
                    { 
                        role: 'user', 
                        content: `Please review this code file (${filePath}):\n\n${content}` 
                    }
                ],
                temperature: 0.3,
                max_tokens: 1000
            });

            progress.report({ increment: 100, message: "Generating report..." });

            const reviewResult = response.choices[0].message.content;
            
            // Prepare review data for webview
            const reviewData = {
                file: filePath,
                review: reviewResult,
                timestamp: new Date().toISOString()
            };
            
            // Send to webview panel if it exists
            if (reviewPanel) {
                reviewPanel.webview.postMessage({
                    command: 'showReview',
                    data: reviewData
                });
            }
            
            // Show the review in an output channel
            const outputChannel = vscode.window.createOutputChannel("Code Review");
            outputChannel.appendLine(`Code Review for: ${filePath}`);
            outputChannel.appendLine("=".repeat(50));
            outputChannel.appendLine(reviewResult);
            outputChannel.appendLine("=".repeat(50));
            outputChannel.show();
            
            // Show success notification
            vscode.window.showInformationMessage(`Code review completed for: ${path.basename(filePath)}`);
        } catch (error) {
            console.error('Error during code review:', error);
            
            // Check if it's an API key error
            if (error.message.includes('API') || error.message.includes('401') || error.message.includes('unauthorized')) {
                vscode.window.showErrorMessage(
                    `API error: ${error.message}. Please check your Mistral API key configuration.`
                );
            } else {
                vscode.window.showErrorMessage(`Error during code review: ${error.message}`);
            }
        }
    });
}

async function reviewProject() {
    if (!ai) {
        const userChoice = await vscode.window.showInformationMessage(
            'Mistral API key not configured. Would you like to configure it now?',
            'Yes', 'No'
        );
        
        if (userChoice === 'Yes') {
            await configureAPIKey();
            // Re-check if API key is now configured
            if (!ai) {
                vscode.window.showErrorMessage('API key configuration failed. Please try again.');
                return;
            }
        } else {
            vscode.window.showInformationMessage('Project review requires an API key. Please configure it later using the command palette.');
            return;
        }
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    
    // Show progress notification
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Reviewing your project...",
        cancellable: true
    }, async (progress, token) => {
        try {
            progress.report({ increment: 0, message: "Scanning project files..." });

            // Get file extensions from configuration
            const config = vscode.workspace.getConfiguration('code-review-extension');
            const fileExtensions = config.get('fileExtensions');
            
            // Find all relevant files
            const files = [];
            const scanDir = (dir) => {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    
                    // Skip noisy build artifacts and hidden files
                    if (
                        fullPath.includes('node_modules') ||
                        fullPath.includes('dist') ||
                        fullPath.includes('build') ||
                        fullPath.includes('.git') ||
                        item.startsWith('.')
                    ) {
                        continue;
                    }

                    const stat = fs.statSync(fullPath);

                    if (stat.isDirectory()) {
                        scanDir(fullPath);
                    } else if (stat.isFile()) {
                        const ext = path.extname(item);
                        if (fileExtensions.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            };

            scanDir(rootPath);
            progress.report({ increment: 20, message: `Found ${files.length} files to review...` });

            if (files.length === 0) {
                vscode.window.showInformationMessage('No files found to review');
                return;
            }

            // Process each file
            let reviewResults = [];
            for (let i = 0; i < files.length; i++) {
                const filePath = files[i];
                const content = fs.readFileSync(filePath, 'utf-8');
                
                progress.report({ 
                    increment: 60 * (i + 1) / files.length, 
                    message: `Reviewing ${path.basename(filePath)}... (${i + 1}/${files.length})` 
                });

                // Skip large files
                if (content.length > 50000) { // 50KB limit
                    reviewResults.push({
                        file: filePath,
                        review: `File too large to review: ${path.basename(filePath)}`
                    });
                    continue;
                }

                try {
                    const model = vscode.workspace.getConfiguration('code-review-extension').get('model');
                    const response = await ai.chat({
                        model: model,
                        messages: [
                            { 
                                role: 'system', 
                                content: `You are an expert code reviewer. Analyze the following code for potential issues, bugs, security vulnerabilities, and code quality improvements. Provide specific suggestions with line numbers where applicable. Focus on:
                                - Security vulnerabilities
                                - Performance issues
                                - Code style and best practices
                                - Potential bugs
                                - Maintainability
                                - Documentation`
                            },
                            { 
                                role: 'user', 
                                content: `Please review this code file (${filePath}):\n\n${content}` 
                            }
                        ],
                        temperature: 0.3,
                        max_tokens: 1000
                    });

                    reviewResults.push({
                        file: filePath,
                        review: response.choices[0].message.content
                    });
                } catch (error) {
                    console.error(`Error reviewing file ${filePath}:`, error);
                    reviewResults.push({
                        file: filePath,
                        review: `Error reviewing file: ${error.message}`
                    });
                }
            }

            progress.report({ increment: 100, message: "Generating final report..." });

            // Generate a summary report
            const summaryReport = generateSummaryReport(reviewResults);
            
            // Prepare project review data for webview
            const projectReviewData = {
                files: reviewResults,
                summary: summaryReport,
                timestamp: new Date().toISOString(),
                totalFiles: files.length
            };
            
            // Send to webview panel if it exists
            if (reviewPanel) {
                reviewPanel.webview.postMessage({
                    command: 'showReview',
                    data: projectReviewData
                });
            }
            
            // Show the review in an output channel
            const outputChannel = vscode.window.createOutputChannel("Code Review");
            outputChannel.appendLine("Project Code Review Summary");
            outputChannel.appendLine("=".repeat(50));
            outputChannel.appendLine(summaryReport);
            outputChannel.appendLine("\nDetailed Reviews:");
            outputChannel.appendLine("=".repeat(50));
            
            for (const result of reviewResults) {
                outputChannel.appendLine(`\nFile: ${result.file}`);
                outputChannel.appendLine("-".repeat(30));
                outputChannel.appendLine(result.review);
            }
            
            outputChannel.show();
            
            // Show success notification
            vscode.window.showInformationMessage(`Project review completed for ${files.length} files!`);
        } catch (error) {
            console.error('Error during project review:', error);
            
            // Check if it's an API key error
            if (error.message.includes('API') || error.message.includes('401') || error.message.includes('unauthorized')) {
                vscode.window.showErrorMessage(
                    `API error: ${error.message}. Please check your Mistral API key configuration.`
                );
            } else {
                vscode.window.showErrorMessage(`Error during project review: ${error.message}`);
            }
        }
    });
}

function generateSummaryReport(reviewResults) {
    let summary = `📊 PROJECT CODE REVIEW COMPLETE\n\n`;
    summary += `Total Files Analyzed: ${reviewResults.length}\n\n`;
    
    // Count different types of issues
    let securityIssues = 0;
    let bugs = 0;
    let performanceIssues = 0;
    let styleIssues = 0;
    
    for (const result of reviewResults) {
        const reviewText = result.review.toLowerCase();
        
        if (reviewText.includes('security') || reviewText.includes('vulnerability') || reviewText.includes('injection')) {
            securityIssues++;
        }
        if (reviewText.includes('bug') || reviewText.includes('error') || reviewText.includes('issue') || reviewText.includes('null')) {
            bugs++;
        }
        if (reviewText.includes('performance') || reviewText.includes('memory') || reviewText.includes('leak')) {
            performanceIssues++;
        }
        if (reviewText.includes('style') || reviewText.includes('naming') || reviewText.includes('format')) {
            styleIssues++;
        }
    }
    
    summary += `🔴 Security Issues: ${securityIssues}\n`;
    summary += `🟠 Bugs: ${bugs}\n`;
    summary += `🟡 Performance Issues: ${performanceIssues}\n`;
    summary += `🟢 Style Issues: ${styleIssues}\n\n`;
    
    summary += `For detailed reviews of each file, see the detailed reviews section above.`;
    
    return summary;
}

async function performRealTimeReview(document) {
    if (!document) {
        return;
    }
    
    // If AI is not configured, try to initialize it
    if (!ai) {
        initializeAIClient();
        // If still not initialized, skip real-time review
        if (!ai) {
            console.log('Mistral API not configured for real-time review');
            return;
        }
    }
    
    // Skip if document is too large
    const maxFileSize = vscode.workspace.getConfiguration('code-review-extension').get('maxFileSize');
    if (document.getText().length > maxFileSize) { // Configurable max file size limit
        return;
    }
    
    try {
        const config = vscode.workspace.getConfiguration('code-review-extension');
        const model = config.get('model');
        const response = await ai.chat({
            model: model,
            messages: [
                { 
                    role: 'system', 
                    content: `You are an expert code reviewer. Analyze the following code for potential issues, bugs, security vulnerabilities, and code quality improvements. Provide specific suggestions with line numbers where applicable. Focus on:
                    ${config.get('securityFocus') ? '- Security vulnerabilities' : ''}
                    ${config.get('performanceFocus') ? '- Performance issues' : ''}
                    ${config.get('styleFocus') ? '- Code style and best practices' : ''}
                    - Potential bugs
                    - Maintainability
                    - Documentation
                                
                    Format your response as JSON with the following structure:
                    {
                        "issues": [
                            {
                                "line": 1,
                                "severity": "warning",
                                "message": "Issue description",
                                "code": "relevant code snippet"
                            }
                        ]
                    }`
                },
                { 
                    role: 'user', 
                    content: `Please review this code file (${document.fileName}):

${document.getText()}` 
                }
            ],
            temperature: 0.3,
            max_tokens: 1000
        });
        
        const reviewResult = response.choices[0].message.content;
        
        // Parse the JSON response and create diagnostics
        try {
            const parsedResult = JSON.parse(reviewResult);
            if (parsedResult.issues && Array.isArray(parsedResult.issues)) {
                const diagnostics = [];
                
                for (const issue of parsedResult.issues) {
                    if (issue.line && issue.message) {
                        const line = issue.line - 1; // Convert to 0-based index
                        const range = new vscode.Range(line, 0, line, 1000); // Full line
                        const severity = severityMap[issue.severity] || vscode.DiagnosticSeverity.Warning;
                        
                        const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
                        diagnostic.source = 'Code Review Extension';
                        diagnostics.push(diagnostic);
                    }
                }
                
                // Update diagnostics for the document
                diagnosticCollection.set(document.uri, diagnostics);
            }
        } catch (parseError) {
            // If JSON parsing fails, clear diagnostics for this document
            diagnosticCollection.set(document.uri, []);
        }
    } catch (error) {
        console.error('Error during real-time review:', error);
        
        // For real-time review, don't show error messages to avoid disrupting the user
        // Just clear the diagnostics
        diagnosticCollection.set(document.uri, []);
    }
}

function setupFileWatcher(context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    
    const rootPath = workspaceFolders[0].uri.fsPath;
    
    // Get file extensions from configuration
    const config = vscode.workspace.getConfiguration('code-review-extension');
    const fileExtensions = config.get('fileExtensions');
    
    // Create a pattern for the file extensions
    const patterns = fileExtensions.map(ext => `**/*${ext}`);
    
    // Set up chokidar file watcher
    const watcher = chokidar.watch(patterns, {
        cwd: rootPath,
        ignoreInitial: true,
        ignored: [
            /node_modules/, 
            /dist/, 
            /build/, 
            /\.git/, 
            /\.vscode/, 
            /\.github/
        ]
    });
    
    // Watch for file changes
    watcher.on('change', (filePath) => {
        if (isRealTimeReviewEnabled) {
            // Check if this file is currently open in the editor
            const fullPath = path.join(rootPath, filePath);
            const activeEditor = vscode.window.activeTextEditor;
            
            if (activeEditor && activeEditor.document.fileName === fullPath) {
                // If it's the active document, let the document change event handle it
                return;
            }
            
            // Otherwise, perform a review of the changed file
            const document = vscode.workspace.textDocuments.find(doc => doc.fileName === fullPath);
            if (document) {
                performRealTimeReview(document);
            }
        }
    });
    
    // Watch for new files
    watcher.on('add', (filePath) => {
        if (isRealTimeReviewEnabled) {
            console.log(`New file detected: ${filePath}`);
        }
    });
    
    // Add the watcher to context subscriptions so it gets cleaned up
    context.subscriptions.push({
        dispose: () => {
            watcher.close();
        }
    });
}

function calculateCodeQualityMetrics(document) {
    const content = document.getText();
    const lines = content.split('\n');
    
    const metrics = {
        totalLines: lines.length,
        totalCharacters: content.length,
        totalWords: content.trim().split(/\s+/).filter(word => word.length > 0).length,
        emptyLines: lines.filter(line => line.trim() === '').length,
        commentLines: lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*') || line.trim().startsWith('*/') || line.trim().startsWith('<!--') || line.trim().startsWith('-->')).length,
        complexityScore: calculateComplexityScore(content),
        issuesCount: diagnosticCollection.get(document.uri)?.length || 0
    };
    
    return metrics;
}

function calculateComplexityScore(content) {
    // Simple complexity calculation based on function/method declarations, loops, conditionals, etc.
    const functionRegex = /function\s+|=>|def\s+|class\s+/g;
    const loopRegex = /for\s*\(|while\s*\(|do\s*\{/g;
    const conditionalRegex = /if\s*\(|else\s+if|switch\s*\(/g;
    
    const functions = (content.match(functionRegex) || []).length;
    const loops = (content.match(loopRegex) || []).length;
    const conditionals = (content.match(conditionalRegex) || []).length;
    
    // Weighted complexity score
    return functions * 2 + loops * 1.5 + conditionals * 1;
}

function showCodeQualityReport(document) {
    const metrics = calculateCodeQualityMetrics(document);
    
    // Prepare quality report data
    const reportData = {
        metrics: metrics,
        summary: {
            qualityRating: getQualityRating(metrics),
            fileName: document.fileName
        },
        timestamp: new Date().toISOString()
    };
    
    // Send to webview panel if it exists
    if (reviewPanel) {
        reviewPanel.webview.postMessage({
            command: 'showReport',
            data: reportData
        });
    }
    
    const report = `
📊 CODE QUALITY REPORT
=====================
File: ${document.fileName}

📈 METRICS:
- Total Lines: ${metrics.totalLines}
- Total Characters: ${metrics.totalCharacters}
- Total Words: ${metrics.totalWords}
- Empty Lines: ${metrics.emptyLines}
- Comment Lines: ${metrics.commentLines}
- Complexity Score: ${metrics.complexityScore.toFixed(2)}
- Issues Found: ${metrics.issuesCount}

💡 QUALITY RATING:
${getQualityRating(metrics)}
    `;
    
    // Show the report in an output channel
    const outputChannel = vscode.window.createOutputChannel("Code Quality Report");
    outputChannel.appendLine(report);
    outputChannel.show();
}

function getQualityRating(metrics) {
    // Calculate a simple quality score based on various factors
    const emptyLineRatio = metrics.emptyLines / metrics.totalLines;
    const commentRatio = metrics.commentLines / metrics.totalLines;
    
    let score = 100; // Start with a perfect score
    
    // Penalize for too many issues
    score -= metrics.issuesCount * 5;
    
    // Reward good comment ratio
    if (commentRatio >= 0.1) { // 10% comments
        score += 10;
    } else if (commentRatio < 0.02) { // Less than 2% comments
        score -= 10;
    }
    
    // Penalize for too many empty lines
    if (emptyLineRatio > 0.3) { // More than 30% empty lines
        score -= 15;
    }
    
    // Adjust based on complexity
    if (metrics.complexityScore / metrics.totalLines > 0.5) { // High complexity per line
        score -= 20;
    }
    
    // Ensure score is between 0 and 100
    score = Math.max(0, Math.min(100, score));
    
    if (score >= 80) return "Excellent - High quality code!";
    if (score >= 60) return "Good - Decent quality with minor issues";
    if (score >= 40) return "Fair - Some improvements needed";
    return "Poor - Significant improvements required";
}

async function configureFallbackAPIKey() {
    const config = vscode.workspace.getConfiguration('code-review-extension');
    const currentKey = config.get('fallbackApiKey');
    
    const newApiKey = await vscode.window.showInputBox({
        prompt: 'Enter the fallback Mistral API key (for development purposes only)',
        password: true,
        value: currentKey || '',
        validateInput: (value) => {
            if (!value) {
                return 'API key is required';
            }
            return null;
        }
    });
    
    if (newApiKey) {
        await config.update('fallbackApiKey', newApiKey, vscode.ConfigurationTarget.Global);
        initializeAIClient();
        vscode.window.showInformationMessage('Fallback API key configured successfully!');
    }
}

function createReviewWebview(context) {
    // Create and show a new webview panel
    const panel = vscode.window.createWebviewPanel(
        'codeReview',
        'Code Review',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'media'))
            ]
        }
    );

    // Get the local path for the HTML file
    const indexPath = vscode.Uri.file(
        path.join(context.extensionPath, 'media', 'index.html')
    );
    
    // Read the HTML file
    const htmlContent = fs.readFileSync(indexPath.fsPath, 'utf8');
    
    // Update the HTML to include the webview-specific URIs
    const updatedHtml = getWebviewContent(context, htmlContent);
    
    // Set the HTML content
    panel.webview.html = updatedHtml;
    
    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'refreshReview':
                    // Trigger a refresh of the current review
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        performRealTimeReview(editor.document);
                    }
                    break;
                case 'exportResults':
                    // Export results functionality
                    exportResults(panel);
                    break;
                case 'showSettings':
                    // Open settings
                    vscode.commands.executeCommand('workbench.action.openSettings', 'code-review-extension');
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
    
    // Set the global panel reference
    reviewPanel = panel;
    
    // Handle panel disposal
    panel.onDidDispose(() => {
        reviewPanel = null;
    });
    
    return panel;
}

function getWebviewContent(context, htmlContent) {
    // Get the local path for the JS and CSS files
    const scriptUri = context.asAbsolutePath('media/main.js');
    const styleUri = context.asAbsolutePath('media/style.css');
    
    // Convert to webview URI
    const scriptPath = vscode.Uri.file(scriptUri);
    const stylePath = vscode.Uri.file(styleUri);
    
    const scriptUriString = scriptPath.with({ scheme: 'vscode-resource' });
    const styleUriString = stylePath.with({ scheme: 'vscode-resource' });
    
    // Replace the links in the HTML with the webview URIs
    return htmlContent
        .replace('./style.css', styleUriString.toString())
        .replace('./main.js', scriptUriString.toString());
}

async function exportResults(panel) {
    // Create a file save dialog
    const filters = {
        'JSON': ['json'],
        'Text': ['txt'],
        'All Files': ['*']
    };
    
    const uri = await vscode.window.showSaveDialog({
        filters: filters,
        defaultUri: vscode.Uri.file(os.homedir()).with({ path: os.homedir() + '/code-review-results.json' })
    });
    
    if (uri) {
        try {
            // For now, just save a placeholder - in a real implementation, 
            // this would save the actual review results
            const content = JSON.stringify({
                timestamp: new Date().toISOString(),
                message: "Code review results would be exported here in a full implementation"
            }, null, 2);
            
            fs.writeFileSync(uri.fsPath, content);
            vscode.window.showInformationMessage('Results exported successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Error exporting results: ${error.message}`);
        }
    }
}

function deactivate() {
    console.log('Code Review Extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
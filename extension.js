const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function activate(context) {
    // Stack tracking files that have had their first and last lines swapped
    const swapHistoryStack = [];

    let disposable = vscode.commands.registerCommand('gitGolf.play', () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        // Terminal instance targeting the active workspace
        const terminal = vscode.window.createTerminal({
            name: 'Git Golf Terminal',
            cwd: workspaceRoot
        });
        terminal.show();

        // Side-by-side Webview
        const panel = vscode.window.createWebviewPanel(
            'gitGolfView',
            'Git Golf ⛳',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        const htmlPath = path.join(context.extensionPath, 'media', 'index.html');
        panel.webview.html = fs.readFileSync(htmlPath, 'utf8');

        // Reliable helper to target the open source file tab
        function getTargetCodeEditor() {
            return vscode.window.visibleTextEditors.find(
                editor => editor.document.uri.scheme === 'file'
            );
        }

        panel.webview.onDidReceiveMessage(async (message) => {
            // 1. SINK IN HOLE: Run command & REVERSE SWAP back to original
            if (message.type === 'EXECUTE_COMMAND') {
                let finalCmd = message.cmd;

                if (finalCmd.includes('NEED_GITHUB_URL')) {
                    const repoUrl = await vscode.window.showInputBox({
                        prompt: 'Enter your GitHub Remote Repository HTTPS/SSH URL',
                        placeHolder: 'https://github.com/username/repository.git',
                        ignoreFocusOut: true
                    });

                    if (!repoUrl) {
                        vscode.window.showErrorMessage('Remote URL was canceled. Golf stroke aborted.');
                        return;
                    }

                    terminal.sendText('git remote remove origin 2>/dev/null || true');
                    finalCmd = `git remote add origin ${repoUrl}`;
                }

                terminal.sendText(finalCmd);

                // RESTORE: Swap line 1 and the last line back to their original positions
                if (swapHistoryStack.length > 0) {
                    const activeEditor = getTargetCodeEditor();

                    if (activeEditor) {
                        const savedState = swapHistoryStack.pop();
                        const doc = activeEditor.document;
                        const lastLineIdx = doc.lineCount - 1;

                        if (doc.fileName === savedState.fileName && lastLineIdx >= 1) {
                            const firstLineRange = doc.lineAt(0).range;
                            const lastLineRange = doc.lineAt(lastLineIdx).range;

                            // Swap them back using their original content
                            await activeEditor.edit(editBuilder => {
                                editBuilder.replace(firstLineRange, savedState.originalFirstLine);
                                editBuilder.replace(lastLineRange, savedState.originalLastLine);
                            });

                            await doc.save();

                            vscode.window.showInformationMessage(
                                `⛳ Clean Shot! Line 1 and last line swapped back to original in ${path.basename(doc.fileName)}!`
                            );
                        }
                    }
                }
            }

            // 2. MISS PENALTY: Swap Line 1 and the last line
            if (message.type === 'CODE_SHUFFLE_PENALTY') {
                const activeEditor = getTargetCodeEditor();

                if (!activeEditor) {
                    vscode.window.showWarningMessage(
                        `🏌️ Penalty registered, but keep a saved code file open side-by-side to apply the penalty!`
                    );
                    return;
                }

                const doc = activeEditor.document;
                const totalLines = doc.lineCount;

                // Need at least 2 lines to perform a swap
                if (totalLines >= 2) {
                    const lastLineIdx = totalLines - 1;

                    const currentFirstLine = doc.lineAt(0).text;
                    const currentLastLine = doc.lineAt(lastLineIdx).text;

                    // Save the original lines so we can restore them exactly
                    swapHistoryStack.push({
                        fileName: doc.fileName,
                        originalFirstLine: currentFirstLine,
                        originalLastLine: currentLastLine
                    });

                    const firstLineRange = doc.lineAt(0).range;
                    const lastLineRange = doc.lineAt(lastLineIdx).range;

                    // Swap: Line 1 gets the last line's content, and the last line gets Line 1's content
                    await activeEditor.edit(editBuilder => {
                        editBuilder.replace(firstLineRange, currentLastLine);
                        editBuilder.replace(lastLineRange, currentFirstLine);
                    });

                    // Save so the swap updates immediately on screen
                    await doc.save();

                    vscode.window.showErrorMessage(
                        `🚨 MISS PENALTY! Swapped Line 1 and Line ${totalLines} in ${path.basename(doc.fileName)}!`
                    );
                }
            }
        });
    });

    context.subscriptions.push(disposable);
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
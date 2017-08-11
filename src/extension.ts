// The module 'vscode' contains the VS Code extensibility API
// Import the necessary extensibility types to use in your code below
import {
    window,
    commands,
    workspace,
    Disposable,
    ExtensionContext,
    StatusBarAlignment,
    StatusBarItem,
    TextDocument,
    Range,
    languages as langs,
    DecorationOptions,
    OverviewRulerLane,
    DiagnosticCollection,
    DiagnosticSeverity,
    Diagnostic,
} from 'vscode';

const exec = require('child_process').exec;
const findParentDir = require('find-parent-dir');

const {
    errorBackgroundColor,
    warningBackgroundColor,
    languages,
    statusBarText,
    showHighlights,
    configDir,
} = workspace.getConfiguration('scssLint');

const errorDecorationType = window.createTextEditorDecorationType({
    backgroundColor: errorBackgroundColor,
    overviewRulerColor: errorBackgroundColor,
    overviewRulerLane: 2,
});

const warningDecorationType = window.createTextEditorDecorationType({
    backgroundColor: warningBackgroundColor,
    overviewRulerColor: warningBackgroundColor,
    overviewRulerLane: 2,
});

// This method is called when your extension is activated. Activation is
// controlled by the activation events defined in package.json.
export function activate(context: ExtensionContext) {
    // create a new error finder
    let errorFinder = new ErrorFinder();
    let controller = new ErrorFinderController(errorFinder);

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(controller);
    context.subscriptions.push(errorFinder);
}

class ErrorFinder {

    private _statusBarItem: StatusBarItem;

    private _diagnosticCollection: DiagnosticCollection;

    constructor() {
        this._diagnosticCollection = langs.createDiagnosticCollection();
        this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
    }

    public finderErrors() {

        // Create as needed
        if (!this._statusBarItem) return;

        // Get the current text editor
        const editor = window.activeTextEditor;
        if (!editor) {
            this._statusBarItem.hide();
            return;
        }

        let doc = editor.document;

        // Only find errors if doc languageId is in languages array
        if (~languages.indexOf(doc.languageId)) {
            const dir = (workspace.rootPath || '') + '/'; // workspace.rootPath is null
            const fileName = doc.fileName.replace(dir, '');
            let cmd = `cd ${dir} && scss-lint -c ${configDir + '.scss-lint.yml'} --no-color ${fileName}`;

            if (!configDir) {
                // Find and set nearest config file
                try {
                    const startingDir = doc.fileName.substring(0, doc.fileName.lastIndexOf('\\')); // opposite slash on windows
                    const configFileDir = findParentDir.sync(startingDir, '.scss-lint.yml');
                    cmd = `scss-lint -c ${configFileDir + '\\.scss-lint.yml'}} --no-color ${doc.fileName}`; // slash missing on widows
                } catch(err) {
                    console.error('error', err);
                }
            }

            exec(cmd, (err, stdout) => {
                const lines = stdout.toString().split('\n');

                const {
                    errors,
                    warnings,
                    diagnostics,
                } = lines.reduce((a, line) => {
                    let info,
                        severity;
                    
                    line = line.replace(/^\s\s*/, '').replace(/\s\s*$/, ''); // trim whitespace string 

                    if(~line.indexOf('[E]')) {
                        info = line.match(/[^:]*:(\d+):(\d+) \[E\] (.*)$/);
                        severity = DiagnosticSeverity.Error;
                    } else if(~line.indexOf('[W]')) {
                        info = line.match(/[^:]*:(\d+):(\d+) \[W\] (.*)$/);
                        severity = DiagnosticSeverity.Warning;
                    } else {
                        return a;
                    }

                    const lineNum = parseInt(info[1], 10) - 1;
                    const startPos = parseInt(info[2], 10) - 1;
                    const message = info[3];
                    const range = new Range(lineNum, startPos, lineNum + 1, 0);

                    if(severity === DiagnosticSeverity.Error) {
                        a.errors.push({ range, message });
                    } else if(severity === DiagnosticSeverity.Warning) {
                        a.warnings.push({ range, message });
                    }

                    a.diagnostics.push(new Diagnostic(range, message, severity));

                    return a;
                }, {
                    errors: [],
                    warnings: [],
                    diagnostics: [],
                });

                if (editor === window.activeTextEditor) {
                    if (showHighlights) {
                        editor.setDecorations(errorDecorationType, errors);
                        editor.setDecorations(warningDecorationType, warnings);
                    }

                    this._diagnosticCollection.set(doc.uri, diagnostics);

                    // Update the status bar
                    this._statusBarItem.text = eval(statusBarText);
                    this._statusBarItem.show();
                }
            });
        } else {
            this._statusBarItem.hide();
        }
    }

    dispose() {
        this._statusBarItem.dispose();
    }
}

class ErrorFinderController {

    private _errorFinder: ErrorFinder;
    private _disposable: Disposable;

    constructor(errorFinder: ErrorFinder) {
        this._errorFinder = errorFinder;

        // subscribe to selection change and editor activation events
        let subscriptions: Disposable[] = [];
        workspace.onDidSaveTextDocument(this._onEvent, this, subscriptions);
        window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

        // update the error finder for the current file
        this._errorFinder.finderErrors();

        // create a combined disposable from both event subscriptions
        this._disposable = Disposable.from(...subscriptions);
    }

    dispose() {
        this._disposable.dispose();
    }

    private _onEvent() {
        this._errorFinder.finderErrors();
    }
}
